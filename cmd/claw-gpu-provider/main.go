package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

// Config holds the provider daemon configuration.
type Config struct {
	ChainREST       string `json:"chain_rest"`
	ChainRPC        string `json:"chain_rpc"`
	ChainID         string `json:"chain_id"`
	Denom           string `json:"denom"`
	ProviderAddress string `json:"provider_address"`
	Mnemonic        string `json:"mnemonic"`
	ResourceID      uint64 `json:"resource_id"`
	MetricsPort     int    `json:"metrics_port"`
	HeartbeatSec    int    `json:"heartbeat_interval_sec"`
	JobPollSec      int    `json:"job_poll_interval_sec"`
	MaxConcurrent   int    `json:"max_concurrent_jobs"`
	JobTimeoutSec   int    `json:"job_timeout_sec"`
	DockerEnabled   bool   `json:"docker_enabled"`
	WorkDir         string `json:"work_dir"`

	// WebSocket event subscription.
	WSEnabled      bool `json:"websocket_enabled"`
	PollFallback   bool `json:"poll_fallback"`
	WSReconnectSec int  `json:"ws_reconnect_sec"`

	// DanteGPU integration.
	DanteEnabled       bool   `json:"dante_enabled"`
	DanteAPIURL        string `json:"dante_api_url"`
	DanteAPIKey        string `json:"dante_api_key"`
	DanteStorageURL    string `json:"dante_storage_url"`
	DanteRemoteStorage bool   `json:"dante_use_remote_storage"`
}

// DefaultConfig returns a Config populated with sensible defaults.
func DefaultConfig() Config {
	return Config{
		ChainREST:      "http://localhost:1317",
		ChainRPC:       "http://localhost:26657",
		ChainID:        "clawchain-1",
		Denom:          "uclaw",
		MetricsPort:    9090,
		HeartbeatSec:   60,
		JobPollSec:     15,
		JobTimeoutSec:  3600,
		MaxConcurrent:  2,
		DockerEnabled:  true,
		WorkDir:        "/tmp/claw-gpu-jobs",
		WSEnabled:      true,
		PollFallback:   true,
		WSReconnectSec: 5,
	}
}

func main() {
	// Check for mock mode via environment variable.
	if os.Getenv("MOCK_MODE") == "true" {
		RunMockProviderMode()
		return
	}

	// Parse CLI subcommand. Default to "start" for backward compatibility.
	cmd := ParseCommand(os.Args)

	// Dispatch non-start commands via the CLI handler.
	if cmd.Name != "start" {
		code := RunCLI(cmd, os.Stdout, os.Stderr)
		os.Exit(code)
	}

	// Start the provider daemon.
	cfg := LoadConfigFromEnv()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("[Provider] Shutting down...")
		cancel()
	}()

	// Initialize chain client for authenticated interactions.
	chainClient, err := NewChainClient(cfg)
	if err != nil {
		log.Fatalf("[Provider] Failed to initialize chain client: %v", err)
	}

	// Initialize DanteGPU adapter if enabled.
	var danteAdapter *DanteGPUAdapter
	if cfg.DanteEnabled {
		danteAdapter = NewDanteGPUAdapter(cfg.DanteAPIURL, cfg.DanteAPIKey, cfg.DanteStorageURL)
		log.Printf("[Provider] DanteGPU integration enabled — api=%s", cfg.DanteAPIURL)
	}

	provider := NewProvider(cfg)
	provider.chainClient = chainClient
	provider.danteAdapter = danteAdapter
	provider.scheduler = NewScheduler(cfg, "")

	// Start metrics HTTP server.
	go provider.ServeMetrics()

	// Start heartbeat loop.
	go provider.HeartbeatLoop(ctx)

	// Initialize event cursor for restart-safe event tracking.
	cursor := NewEventCursor(cfg.WorkDir)
	if err := cursor.Load(); err != nil {
		log.Printf("[Provider] Warning: failed to load event cursor: %v", err)
	}

	// Start WebSocket event listener if enabled.
	if cfg.WSEnabled {
		eventListener := NewEventListener(cfg)
		eventListener.SetCursor(cursor)

		// Register handler for new compute job submissions.
		eventListener.On(EventComputeJobSubmitted, func(event ChainEvent) {
			log.Printf("[Events] New compute job submitted at height %d", event.Height)
			// Trigger immediate job fetch instead of waiting for poll.
			go provider.FetchAndExecuteJobs(ctx)
		})

		// Register handler for new leases.
		eventListener.On(EventLeaseCreated, func(event ChainEvent) {
			log.Printf("[Events] New lease created for resource at height %d", event.Height)
		})

		// Replay missed events from last checkpoint.
		if cursor.GetLastHeight() > 0 {
			log.Printf("[Provider] Replaying events from height %d", cursor.GetLastHeight())
			if err := eventListener.ReplayMissedEvents(ctx, chainClient); err != nil {
				log.Printf("[Provider] Event replay warning: %v", err)
			}
		}

		go eventListener.Listen(ctx)
		provider.eventListener = eventListener

		// Only start polling as fallback if configured.
		if cfg.PollFallback {
			go provider.JobPollLoopWithFallback(ctx)
		}
	} else {
		// No WebSocket — use HTTP polling only.
		go provider.JobPollLoop(ctx)
	}

	// Start reconciliation worker.
	reconciler := NewReconciler(provider, chainClient, 120)
	go reconciler.Run(ctx)

	log.Printf("[Provider] Started — address=%s resource=%d metrics=:%d ws=%v dante=%v",
		cfg.ProviderAddress, cfg.ResourceID, cfg.MetricsPort, cfg.WSEnabled, cfg.DanteEnabled)
	<-ctx.Done()
	log.Println("[Provider] Stopped")
}
