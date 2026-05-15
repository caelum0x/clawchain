package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

// ConfigOutput holds a redacted configuration for display or JSON serialization.
type ConfigOutput struct {
	ChainREST          string `json:"chain_rest"`
	ChainRPC           string `json:"chain_rpc"`
	ChainID            string `json:"chain_id"`
	Denom              string `json:"denom"`
	ProviderAddress    string `json:"provider_address"`
	Mnemonic           string `json:"mnemonic"`
	ResourceID         uint64 `json:"resource_id"`
	MetricsPort        int    `json:"metrics_port"`
	HeartbeatSec       int    `json:"heartbeat_interval_sec"`
	JobPollSec         int    `json:"job_poll_interval_sec"`
	MaxConcurrent      int    `json:"max_concurrent_jobs"`
	JobTimeoutSec      int    `json:"job_timeout_sec"`
	DockerEnabled      bool   `json:"docker_enabled"`
	WorkDir            string `json:"work_dir"`
	WSEnabled          bool   `json:"websocket_enabled"`
	PollFallback       bool   `json:"poll_fallback"`
	WSReconnectSec     int    `json:"ws_reconnect_sec"`
	DanteEnabled       bool   `json:"dante_enabled"`
	DanteAPIURL        string `json:"dante_api_url"`
	DanteAPIKey        string `json:"dante_api_key"`
	DanteStorageURL    string `json:"dante_storage_url"`
	DanteRemoteStorage bool   `json:"dante_use_remote_storage"`
}

// RunConfig loads the current configuration from environment variables and
// prints it in a human-readable table or JSON. Sensitive fields are redacted.
func RunConfig(args []string, stdout io.Writer, stderr io.Writer) int {
	fs := flag.NewFlagSet("config", flag.ContinueOnError)
	fs.SetOutput(stderr)

	jsonOut := fs.Bool("json", false, "Output in JSON format")

	if err := fs.Parse(args); err != nil {
		return 2
	}

	cfg := LoadConfigFromEnv()
	output := configToOutput(cfg)

	if *jsonOut {
		enc := json.NewEncoder(stdout)
		enc.SetIndent("", "  ")
		enc.Encode(output)
		return 0
	}

	// Human-readable table output.
	fmt.Fprintln(stdout, "GPU Provider Configuration")
	fmt.Fprintln(stdout, strings.Repeat("-", 50))

	fmt.Fprintln(stdout, "")
	fmt.Fprintln(stdout, "[Chain]")
	printConfigRow(stdout, "REST Endpoint", output.ChainREST)
	printConfigRow(stdout, "RPC Endpoint", output.ChainRPC)
	printConfigRow(stdout, "Chain ID", output.ChainID)
	printConfigRow(stdout, "Denom", output.Denom)
	printConfigRow(stdout, "Provider Address", output.ProviderAddress)
	printConfigRow(stdout, "Mnemonic", output.Mnemonic)
	printConfigRow(stdout, "Resource ID", fmt.Sprintf("%d", output.ResourceID))

	fmt.Fprintln(stdout, "")
	fmt.Fprintln(stdout, "[Provider]")
	printConfigRow(stdout, "Metrics Port", fmt.Sprintf("%d", output.MetricsPort))
	printConfigRow(stdout, "Heartbeat Interval", fmt.Sprintf("%ds", output.HeartbeatSec))
	printConfigRow(stdout, "Job Poll Interval", fmt.Sprintf("%ds", output.JobPollSec))
	printConfigRow(stdout, "Max Concurrent Jobs", fmt.Sprintf("%d", output.MaxConcurrent))
	printConfigRow(stdout, "Job Timeout", fmt.Sprintf("%ds", output.JobTimeoutSec))
	printConfigRow(stdout, "Docker Enabled", fmt.Sprintf("%v", output.DockerEnabled))
	printConfigRow(stdout, "Work Directory", output.WorkDir)

	fmt.Fprintln(stdout, "")
	fmt.Fprintln(stdout, "[WebSocket]")
	printConfigRow(stdout, "WebSocket Enabled", fmt.Sprintf("%v", output.WSEnabled))
	printConfigRow(stdout, "Poll Fallback", fmt.Sprintf("%v", output.PollFallback))
	printConfigRow(stdout, "Reconnect Interval", fmt.Sprintf("%ds", output.WSReconnectSec))

	fmt.Fprintln(stdout, "")
	fmt.Fprintln(stdout, "[DanteGPU]")
	printConfigRow(stdout, "Dante Enabled", fmt.Sprintf("%v", output.DanteEnabled))
	printConfigRow(stdout, "Dante API URL", output.DanteAPIURL)
	printConfigRow(stdout, "Dante API Key", output.DanteAPIKey)
	printConfigRow(stdout, "Dante Storage URL", output.DanteStorageURL)
	printConfigRow(stdout, "Dante Remote Storage", fmt.Sprintf("%v", output.DanteRemoteStorage))

	return 0
}

func printConfigRow(w io.Writer, label, value string) {
	if value == "" {
		value = "(not set)"
	}
	fmt.Fprintf(w, "  %-24s %s\n", label, value)
}

// LoadConfigFromEnv builds a Config from environment variables using the same
// logic as main.go. This is extracted so both the daemon and config command
// share the same loading path.
func LoadConfigFromEnv() Config {
	cfg := DefaultConfig()

	if v := os.Getenv("CHAIN_REST"); v != "" {
		cfg.ChainREST = v
	}
	if v := os.Getenv("CHAIN_RPC"); v != "" {
		cfg.ChainRPC = v
	}
	if v := os.Getenv("CHAIN_ID"); v != "" {
		cfg.ChainID = v
	}
	if v := os.Getenv("PROVIDER_ADDRESS"); v != "" {
		cfg.ProviderAddress = v
	}
	if v := os.Getenv("RESOURCE_ID"); v != "" {
		fmt.Sscanf(v, "%d", &cfg.ResourceID)
	}
	if v := os.Getenv("MNEMONIC"); v != "" {
		cfg.Mnemonic = v
	}
	if v := os.Getenv("WEBSOCKET_ENABLED"); v == "false" {
		cfg.WSEnabled = false
	}
	if v := os.Getenv("DANTE_ENABLED"); v == "true" {
		cfg.DanteEnabled = true
	}
	if v := os.Getenv("DANTE_API_URL"); v != "" {
		cfg.DanteAPIURL = v
	}
	if v := os.Getenv("DANTE_API_KEY"); v != "" {
		cfg.DanteAPIKey = v
	}

	return cfg
}

// configToOutput converts a Config to a redacted ConfigOutput suitable for
// display. Mnemonics and API keys are redacted.
func configToOutput(cfg Config) ConfigOutput {
	return ConfigOutput{
		ChainREST:          cfg.ChainREST,
		ChainRPC:           cfg.ChainRPC,
		ChainID:            cfg.ChainID,
		Denom:              cfg.Denom,
		ProviderAddress:    cfg.ProviderAddress,
		Mnemonic:           redactSecret(cfg.Mnemonic),
		ResourceID:         cfg.ResourceID,
		MetricsPort:        cfg.MetricsPort,
		HeartbeatSec:       cfg.HeartbeatSec,
		JobPollSec:         cfg.JobPollSec,
		MaxConcurrent:      cfg.MaxConcurrent,
		JobTimeoutSec:      cfg.JobTimeoutSec,
		DockerEnabled:      cfg.DockerEnabled,
		WorkDir:            cfg.WorkDir,
		WSEnabled:          cfg.WSEnabled,
		PollFallback:       cfg.PollFallback,
		WSReconnectSec:     cfg.WSReconnectSec,
		DanteEnabled:       cfg.DanteEnabled,
		DanteAPIURL:        cfg.DanteAPIURL,
		DanteAPIKey:        redactSecret(cfg.DanteAPIKey),
		DanteStorageURL:    cfg.DanteStorageURL,
		DanteRemoteStorage: cfg.DanteRemoteStorage,
	}
}

// redactSecret masks a secret string, showing only the first 4 characters
// followed by "...". Empty strings remain empty.
func redactSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return s[:len(s)] + "..."
	}
	return s[:4] + "..."
}

// envOrDefault returns the environment variable value or a default.
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
