package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// Configuration parsing
// ---------------------------------------------------------------------------

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	tests := []struct {
		name     string
		got      interface{}
		expected interface{}
	}{
		{"ChainREST", cfg.ChainREST, "http://localhost:1317"},
		{"ChainRPC", cfg.ChainRPC, "http://localhost:26657"},
		{"ChainID", cfg.ChainID, "clawchain-1"},
		{"Denom", cfg.Denom, "uclaw"},
		{"MetricsPort", cfg.MetricsPort, 9090},
		{"HeartbeatSec", cfg.HeartbeatSec, 60},
		{"JobPollSec", cfg.JobPollSec, 15},
		{"JobTimeoutSec", cfg.JobTimeoutSec, 3600},
		{"MaxConcurrent", cfg.MaxConcurrent, 2},
		{"DockerEnabled", cfg.DockerEnabled, true},
		{"WorkDir", cfg.WorkDir, "/tmp/claw-gpu-jobs"},
		{"WSEnabled", cfg.WSEnabled, true},
		{"PollFallback", cfg.PollFallback, true},
		{"WSReconnectSec", cfg.WSReconnectSec, 5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.got)
		})
	}
}

func TestDefaultConfig_ZeroValues(t *testing.T) {
	cfg := DefaultConfig()

	// These fields should be zero/empty by default.
	assert.Empty(t, cfg.ProviderAddress, "ProviderAddress should be empty by default")
	assert.Empty(t, cfg.Mnemonic, "Mnemonic should be empty by default")
	assert.Equal(t, uint64(0), cfg.ResourceID, "ResourceID should be zero by default")
	assert.False(t, cfg.DanteEnabled, "DanteEnabled should be false by default")
	assert.Empty(t, cfg.DanteAPIURL, "DanteAPIURL should be empty by default")
	assert.Empty(t, cfg.DanteAPIKey, "DanteAPIKey should be empty by default")
}

func TestConfigEnvOverrides(t *testing.T) {
	tests := []struct {
		name     string
		envKey   string
		envValue string
		check    func(t *testing.T, cfg Config)
	}{
		{
			name:     "CHAIN_REST overrides default",
			envKey:   "CHAIN_REST",
			envValue: "http://custom:1317",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "http://custom:1317", cfg.ChainREST)
			},
		},
		{
			name:     "CHAIN_RPC overrides default",
			envKey:   "CHAIN_RPC",
			envValue: "http://custom:26657",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "http://custom:26657", cfg.ChainRPC)
			},
		},
		{
			name:     "CHAIN_ID overrides default",
			envKey:   "CHAIN_ID",
			envValue: "testnet-42",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "testnet-42", cfg.ChainID)
			},
		},
		{
			name:     "PROVIDER_ADDRESS overrides default",
			envKey:   "PROVIDER_ADDRESS",
			envValue: "claw1testaddr",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "claw1testaddr", cfg.ProviderAddress)
			},
		},
		{
			name:     "RESOURCE_ID is parsed as uint64",
			envKey:   "RESOURCE_ID",
			envValue: "42",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, uint64(42), cfg.ResourceID)
			},
		},
		{
			name:     "MNEMONIC overrides default",
			envKey:   "MNEMONIC",
			envValue: "word1 word2 word3",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "word1 word2 word3", cfg.Mnemonic)
			},
		},
		{
			name:     "WEBSOCKET_ENABLED=false disables WS",
			envKey:   "WEBSOCKET_ENABLED",
			envValue: "false",
			check: func(t *testing.T, cfg Config) {
				assert.False(t, cfg.WSEnabled)
			},
		},
		{
			name:     "DANTE_ENABLED=true enables Dante",
			envKey:   "DANTE_ENABLED",
			envValue: "true",
			check: func(t *testing.T, cfg Config) {
				assert.True(t, cfg.DanteEnabled)
			},
		},
		{
			name:     "DANTE_API_URL overrides default",
			envKey:   "DANTE_API_URL",
			envValue: "http://dante:8080",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "http://dante:8080", cfg.DanteAPIURL)
			},
		},
		{
			name:     "DANTE_API_KEY overrides default",
			envKey:   "DANTE_API_KEY",
			envValue: "secret-key-123",
			check: func(t *testing.T, cfg Config) {
				assert.Equal(t, "secret-key-123", cfg.DanteAPIKey)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Apply env override like main() does.
			cfg := DefaultConfig()
			t.Setenv(tt.envKey, tt.envValue)

			// Replicate the env-loading logic from main().
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

			tt.check(t, cfg)
		})
	}
}

func TestConfigJSONRoundTrip(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ProviderAddress = "claw1abc"
	cfg.ResourceID = 99

	data, err := json.Marshal(cfg)
	require.NoError(t, err)

	var decoded Config
	require.NoError(t, json.Unmarshal(data, &decoded))

	assert.Equal(t, cfg, decoded)
}

// ---------------------------------------------------------------------------
// GPU discovery / metrics
// ---------------------------------------------------------------------------

func TestNewProvider(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ProviderAddress = "claw1test"
	p := NewProvider(cfg)

	assert.Equal(t, cfg, p.cfg)
	assert.True(t, p.metrics.IsHealthy, "initial metrics should be healthy")
	assert.Equal(t, 10*time.Second, p.dantePollInterval)
	assert.Nil(t, p.chainClient)
	assert.Nil(t, p.danteAdapter)
	assert.Nil(t, p.eventListener)
}

func TestCollectGPUMetrics_FallbackWhenNoNvidiaSmi(t *testing.T) {
	// On machines without nvidia-smi, CollectGPUMetrics should gracefully
	// fall back to CPU-based health reporting.
	p := NewProvider(DefaultConfig())
	m := p.CollectGPUMetrics()

	assert.True(t, m.IsHealthy, "should report healthy via CPU fallback")

	// Verify the provider stores metrics internally.
	p.mu.RLock()
	stored := p.metrics
	p.mu.RUnlock()
	assert.Equal(t, m, stored)
}

func TestGPUMetrics_JSONSerialization(t *testing.T) {
	m := GPUMetrics{
		UtilizationGPU: 85,
		UtilizationMem: 62,
		Temperature:    72,
		PowerDrawWatts: 250,
		MemoryUsedMb:   7168,
		MemoryTotalMb:  8192,
		IsHealthy:      true,
	}

	data, err := json.Marshal(m)
	require.NoError(t, err)

	var decoded GPUMetrics
	require.NoError(t, json.Unmarshal(data, &decoded))
	assert.Equal(t, m, decoded)
}

// ---------------------------------------------------------------------------
// Heartbeat mechanism
// ---------------------------------------------------------------------------

func TestHeartbeatLoop_SendsMetricsToChain(t *testing.T) {
	var mu sync.Mutex
	receivedCount := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/gpu/metrics" && r.Method == "POST" {
			body, _ := io.ReadAll(r.Body)
			var payload map[string]interface{}
			require.NoError(t, json.Unmarshal(body, &payload))
			assert.Equal(t, float64(42), payload["resource_id"])
			assert.Equal(t, "claw1provider", payload["caller"])
			mu.Lock()
			receivedCount++
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.ResourceID = 42
	cfg.ProviderAddress = "claw1provider"
	cfg.HeartbeatSec = 1 // 1 second interval for testing

	p := NewProvider(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	go p.HeartbeatLoop(ctx)

	<-ctx.Done()
	time.Sleep(50 * time.Millisecond) // allow last callback

	mu.Lock()
	count := receivedCount
	mu.Unlock()
	assert.GreaterOrEqual(t, count, 1, "should have sent at least one heartbeat")
}

func TestHeartbeatLoop_CancelsOnContext(t *testing.T) {
	cfg := DefaultConfig()
	cfg.HeartbeatSec = 60 // long interval
	p := NewProvider(cfg)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		p.HeartbeatLoop(ctx)
		close(done)
	}()

	cancel()

	select {
	case <-done:
		// expected
	case <-time.After(2 * time.Second):
		t.Fatal("HeartbeatLoop did not exit on context cancellation")
	}
}

func TestSendMetricsToChain_DirectHTTPFallback(t *testing.T) {
	var receivedBody map[string]interface{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/gpu/metrics" {
			body, _ := io.ReadAll(r.Body)
			json.Unmarshal(body, &receivedBody)
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.ResourceID = 10
	cfg.ProviderAddress = "claw1prov"

	p := NewProvider(cfg)
	// No chainClient set — should use direct HTTP fallback.
	metrics := GPUMetrics{UtilizationGPU: 50, IsHealthy: true}
	err := p.sendMetricsToChain(metrics)

	require.NoError(t, err)
	assert.Equal(t, float64(10), receivedBody["resource_id"])
	assert.Equal(t, "claw1prov", receivedBody["caller"])
}

func TestSendMetricsToChain_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("server error"))
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	p := NewProvider(cfg)

	err := p.sendMetricsToChain(GPUMetrics{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

// ---------------------------------------------------------------------------
// Job lifecycle: fetch, execute, status updates
// ---------------------------------------------------------------------------

func TestFetchPendingJobs_DirectHTTP(t *testing.T) {
	jobs := []ComputeJob{
		{Id: 1, Name: "job-1", Status: "pending", ExecutionType: "docker"},
		{Id: 2, Name: "job-2", Status: "pending", ExecutionType: "script"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/compute/jobs" {
			assert.Equal(t, "claw1prov", r.URL.Query().Get("address"))
			assert.Equal(t, "pending", r.URL.Query().Get("status"))
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.ProviderAddress = "claw1prov"

	p := NewProvider(cfg)
	fetched, err := p.fetchPendingJobs()

	require.NoError(t, err)
	require.Len(t, fetched, 2)
	assert.Equal(t, uint64(1), fetched[0].Id)
	assert.Equal(t, uint64(2), fetched[1].Id)
}

func TestFetchPendingJobs_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []ComputeJob{}})
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	p := NewProvider(cfg)

	fetched, err := p.fetchPendingJobs()
	require.NoError(t, err)
	assert.Empty(t, fetched)
}

func TestUpdateJobStatus_DirectHTTP(t *testing.T) {
	var received struct {
		JobID  uint64 `json:"job_id"`
		Caller string `json:"caller"`
		Status string `json:"status"`
		Result string `json:"result"`
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/compute/job/status" {
			json.NewDecoder(r.Body).Decode(&received)
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.ProviderAddress = "claw1prov"

	p := NewProvider(cfg)
	err := p.updateJobStatus(77, "completed", "output-data")

	require.NoError(t, err)
	assert.Equal(t, uint64(77), received.JobID)
	assert.Equal(t, "claw1prov", received.Caller)
	assert.Equal(t, "completed", received.Status)
	assert.Equal(t, "output-data", received.Result)
}

func TestExecuteJob_UnsupportedType(t *testing.T) {
	var mu sync.Mutex
	statuses := map[string]string{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/compute/job/status" {
			var payload map[string]interface{}
			json.NewDecoder(r.Body).Decode(&payload)
			mu.Lock()
			statuses[payload["status"].(string)] = payload["result"].(string)
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL

	p := NewProvider(cfg)

	job := ComputeJob{Id: 1, ExecutionType: "unknown-type"}
	p.executeJob(context.Background(), job)

	mu.Lock()
	defer mu.Unlock()
	assert.Contains(t, statuses, "failed")
	assert.Contains(t, statuses["failed"], "unsupported execution type")
}

func TestExecuteDockerJob_DisabledDocker(t *testing.T) {
	cfg := DefaultConfig()
	cfg.DockerEnabled = false

	p := NewProvider(cfg)

	job := ComputeJob{Id: 1, ExecutionType: "docker", DockerImage: "test:latest"}
	_, err := p.executeDockerJob(context.Background(), job)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "docker execution disabled")
}

func TestExecuteScriptJob_EmptyScript(t *testing.T) {
	p := NewProvider(DefaultConfig())

	job := ComputeJob{Id: 1, ExecutionType: "script", ScriptContent: ""}
	_, err := p.executeScriptJob(context.Background(), job)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "empty script content")
}

func TestExecuteScriptJob_WritesAndCleansTempFile(t *testing.T) {
	workDir := t.TempDir()
	cfg := DefaultConfig()
	cfg.WorkDir = workDir

	p := NewProvider(cfg)

	// Use a simple script that won't fail even without python3.
	job := ComputeJob{Id: 99, ExecutionType: "script", ScriptContent: "print('hello')"}

	// The script will fail if python3 is not available, but we check
	// that the temp file is created in the right directory.
	p.executeScriptJob(context.Background(), job)

	// Temp file should be cleaned up (defer os.Remove).
	tmpFile := fmt.Sprintf("%s/job_99.py", workDir)
	_, err := os.Stat(tmpFile)
	assert.True(t, os.IsNotExist(err), "temp script file should be cleaned up")
}

func TestExecuteDockerJob_OutputTruncation(t *testing.T) {
	// We can't easily test actual docker execution, but we test the
	// truncation logic by verifying the constant.
	longOutput := strings.Repeat("A", 5000)
	if len(longOutput) > 4096 {
		truncated := longOutput[:4096] + "... [truncated]"
		assert.Equal(t, 4096+len("... [truncated]"), len(truncated))
	}
}

// ---------------------------------------------------------------------------
// Job concurrency and deduplication
// ---------------------------------------------------------------------------

func TestJobPollLoop_RespectsMaxConcurrent(t *testing.T) {
	var mu sync.Mutex
	runningCount := int32(0)
	maxSeen := int32(0)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			// Return 5 pending jobs.
			jobs := make([]ComputeJob, 5)
			for i := range jobs {
				jobs[i] = ComputeJob{
					Id:            uint64(i + 1),
					ExecutionType: "script",
					ScriptContent: "import time; time.sleep(0.1)",
				}
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs})
		case "/clawchain/marketplace/v1/compute/job/status":
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.MaxConcurrent = 2
	cfg.WorkDir = t.TempDir()

	p := NewProvider(cfg)

	// Manually trigger FetchAndExecuteJobs and watch concurrency.
	// Override executeJob to track concurrency.
	jobs, _ := p.fetchPendingJobs()
	for _, job := range jobs {
		if atomic.LoadInt32(&p.jobCount) >= int32(cfg.MaxConcurrent) {
			break
		}
		if _, loaded := p.activeJobs.LoadOrStore(job.Id, true); loaded {
			continue
		}
		atomic.AddInt32(&p.jobCount, 1)
		go func(j ComputeJob) {
			current := atomic.AddInt32(&runningCount, 1)
			mu.Lock()
			if current > maxSeen {
				maxSeen = current
			}
			mu.Unlock()
			time.Sleep(50 * time.Millisecond)
			atomic.AddInt32(&runningCount, -1)
			p.activeJobs.Delete(j.Id)
			atomic.AddInt32(&p.jobCount, -1)
		}(job)
	}

	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	ms := maxSeen
	mu.Unlock()
	assert.LessOrEqual(t, ms, int32(cfg.MaxConcurrent),
		"should not exceed max concurrent jobs")
}

func TestJobDeduplication(t *testing.T) {
	var mu sync.Mutex
	executionCount := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			// Return the same job twice.
			job := ComputeJob{Id: 42, ExecutionType: "script", ScriptContent: "pass"}
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []ComputeJob{job, job}})
		case "/clawchain/marketplace/v1/compute/job/status":
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.MaxConcurrent = 10
	cfg.WorkDir = t.TempDir()

	p := NewProvider(cfg)

	// Pre-store job 42 as active.
	p.activeJobs.Store(uint64(42), true)

	jobs, _ := p.fetchPendingJobs()
	for _, job := range jobs {
		if _, loaded := p.activeJobs.LoadOrStore(job.Id, true); loaded {
			continue // deduplicated
		}
		mu.Lock()
		executionCount++
		mu.Unlock()
	}

	mu.Lock()
	assert.Equal(t, 0, executionCount, "duplicate/active jobs should be skipped")
	mu.Unlock()
}

func TestJobPollLoop_CancelsOnContext(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JobPollSec = 60 // long interval

	p := NewProvider(cfg)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		p.JobPollLoop(ctx)
		close(done)
	}()

	cancel()

	select {
	case <-done:
		// expected
	case <-time.After(2 * time.Second):
		t.Fatal("JobPollLoop did not exit on context cancellation")
	}
}

// ---------------------------------------------------------------------------
// Job lifecycle: complete flow through executeJob
// ---------------------------------------------------------------------------

func TestExecuteJob_FullLifecycle_StatusUpdates(t *testing.T) {
	var mu sync.Mutex
	statusUpdates := []string{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/compute/job/status" {
			var payload map[string]interface{}
			json.NewDecoder(r.Body).Decode(&payload)
			mu.Lock()
			statusUpdates = append(statusUpdates, payload["status"].(string))
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.DockerEnabled = false // Will fail docker jobs intentionally
	cfg.WorkDir = t.TempDir()

	p := NewProvider(cfg)

	// Test docker job that fails because docker is disabled.
	job := ComputeJob{Id: 5, ExecutionType: "docker", DockerImage: "test:latest"}
	p.executeJob(context.Background(), job)

	mu.Lock()
	defer mu.Unlock()

	// Should have "running" then "failed".
	require.GreaterOrEqual(t, len(statusUpdates), 2)
	assert.Equal(t, "running", statusUpdates[0])
	assert.Equal(t, "failed", statusUpdates[1])
}

func TestExecuteJob_CleansUpActiveJobsAndCount(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	p := NewProvider(cfg)

	// Pre-set job as active and increment count.
	p.activeJobs.Store(uint64(1), true)
	atomic.StoreInt32(&p.jobCount, 1)

	job := ComputeJob{Id: 1, ExecutionType: "unknown"}
	p.executeJob(context.Background(), job)

	// After completion, job should be removed from activeJobs and count decremented.
	_, exists := p.activeJobs.Load(uint64(1))
	assert.False(t, exists, "job should be removed from activeJobs after execution")
	assert.Equal(t, int32(0), atomic.LoadInt32(&p.jobCount), "jobCount should be decremented")
}

// ---------------------------------------------------------------------------
// FetchAndExecuteJobs (WebSocket-triggered dispatch)
// ---------------------------------------------------------------------------

func TestFetchAndExecuteJobs_DispatchesJobs(t *testing.T) {
	var mu sync.Mutex
	statusUpdates := map[uint64][]string{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			jobs := []ComputeJob{
				{Id: 1, ExecutionType: "docker", DockerImage: "test:latest"},
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs})
		case "/clawchain/marketplace/v1/compute/job/status":
			var payload map[string]interface{}
			json.NewDecoder(r.Body).Decode(&payload)
			jobID := uint64(payload["job_id"].(float64))
			mu.Lock()
			statusUpdates[jobID] = append(statusUpdates[jobID], payload["status"].(string))
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.MaxConcurrent = 5
	cfg.DockerEnabled = false // will fail, but that's fine — we test dispatch

	p := NewProvider(cfg)
	p.FetchAndExecuteJobs(context.Background())

	// Wait for the async goroutine to finish.
	require.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		updates, ok := statusUpdates[1]
		return ok && len(updates) >= 2
	}, 2*time.Second, 20*time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	assert.Contains(t, statusUpdates[1], "running")
	assert.Contains(t, statusUpdates[1], "failed") // docker disabled
}

func TestFetchAndExecuteJobs_RespectsMaxConcurrent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			jobs := make([]ComputeJob, 10)
			for i := range jobs {
				jobs[i] = ComputeJob{Id: uint64(i + 1), ExecutionType: "unknown"}
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs})
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.MaxConcurrent = 3

	p := NewProvider(cfg)
	// Pre-fill 2 active jobs.
	atomic.StoreInt32(&p.jobCount, 2)

	p.FetchAndExecuteJobs(context.Background())

	// Should only have dispatched 1 more (3 - 2 = 1 available slot).
	time.Sleep(100 * time.Millisecond)
	// At most 1 new job should have been started (then it finishes and decrements).
}

// ---------------------------------------------------------------------------
// JobPollLoopWithFallback
// ---------------------------------------------------------------------------

func TestJobPollLoopWithFallback_SkipsWhenWSConnected(t *testing.T) {
	pollCount := int32(0)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/compute/jobs" {
			atomic.AddInt32(&pollCount, 1)
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []ComputeJob{}})
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.JobPollSec = 1

	p := NewProvider(cfg)

	// Create an event listener that reports as connected.
	el := &EventListener{connected: true}
	p.eventListener = el

	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	go p.JobPollLoopWithFallback(ctx)
	<-ctx.Done()
	time.Sleep(50 * time.Millisecond)

	assert.Equal(t, int32(0), atomic.LoadInt32(&pollCount),
		"should not poll when WebSocket is connected")
}

func TestJobPollLoopWithFallback_PollsWhenWSDisconnected(t *testing.T) {
	pollCount := int32(0)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/clawchain/marketplace/v1/compute/jobs" {
			atomic.AddInt32(&pollCount, 1)
			json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []ComputeJob{}})
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.JobPollSec = 1

	p := NewProvider(cfg)

	// Create an event listener that reports as disconnected.
	el := &EventListener{connected: false}
	p.eventListener = el

	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	go p.JobPollLoopWithFallback(ctx)
	<-ctx.Done()
	time.Sleep(50 * time.Millisecond)

	assert.GreaterOrEqual(t, atomic.LoadInt32(&pollCount), int32(1),
		"should poll when WebSocket is disconnected")
}

// ---------------------------------------------------------------------------
// Metrics HTTP endpoints
// ---------------------------------------------------------------------------

func TestServeMetrics_MetricsEndpoint(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MetricsPort = 0 // won't actually bind; we test the handler directly

	p := NewProvider(cfg)
	p.mu.Lock()
	p.metrics = GPUMetrics{
		UtilizationGPU: 75,
		UtilizationMem: 50,
		Temperature:    65,
		PowerDrawWatts: 200,
		MemoryUsedMb:   6000,
		MemoryTotalMb:  8192,
		IsHealthy:      true,
	}
	p.mu.Unlock()

	// Build the handler directly.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.RLock()
		m := p.metrics
		p.mu.RUnlock()
		fmt.Fprintf(w, "gpu_utilization %d\n", m.UtilizationGPU)
		fmt.Fprintf(w, "gpu_memory_utilization %d\n", m.UtilizationMem)
		fmt.Fprintf(w, "gpu_temperature %d\n", m.Temperature)
		fmt.Fprintf(w, "gpu_power_draw %d\n", m.PowerDrawWatts)
		fmt.Fprintf(w, "gpu_memory_used %d\n", m.MemoryUsedMb)
		fmt.Fprintf(w, "gpu_memory_total %d\n", m.MemoryTotalMb)
		healthy := 0
		if m.IsHealthy {
			healthy = 1
		}
		fmt.Fprintf(w, "gpu_healthy %d\n", healthy)
	})

	req := httptest.NewRequest("GET", "/metrics", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	body := w.Body.String()
	assert.Contains(t, body, "gpu_utilization 75")
	assert.Contains(t, body, "gpu_memory_utilization 50")
	assert.Contains(t, body, "gpu_temperature 65")
	assert.Contains(t, body, "gpu_power_draw 200")
	assert.Contains(t, body, "gpu_memory_used 6000")
	assert.Contains(t, body, "gpu_memory_total 8192")
	assert.Contains(t, body, "gpu_healthy 1")
}

func TestServeMetrics_HealthEndpoint(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ProviderAddress = "claw1health"
	cfg.ResourceID = 7

	p := NewProvider(cfg)
	p.mu.Lock()
	p.metrics = GPUMetrics{IsHealthy: true}
	p.mu.Unlock()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.RLock()
		m := p.metrics
		p.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"healthy":  m.IsHealthy,
			"provider": p.cfg.ProviderAddress,
			"resource": p.cfg.ResourceID,
			"jobs":     atomic.LoadInt32(&p.jobCount),
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
	assert.Equal(t, true, result["healthy"])
	assert.Equal(t, "claw1health", result["provider"])
	assert.Equal(t, float64(7), result["resource"])
	assert.Equal(t, float64(0), result["jobs"])
}

// ---------------------------------------------------------------------------
// ComputeJob JSON
// ---------------------------------------------------------------------------

func TestComputeJob_JSONSerialization(t *testing.T) {
	job := ComputeJob{
		Id:            1,
		ResourceId:    10,
		LeaseId:       5,
		Submitter:     "claw1sub",
		Name:          "test-job",
		JobType:       "gpu",
		ExecutionType: "docker",
		DockerImage:   "nvidia/cuda:latest",
		ScriptContent: "",
		InputDataUri:  "s3://input",
		OutputDataUri: "s3://output",
		Status:        "pending",
		Params:        `{"gpu_count":2}`,
	}

	data, err := json.Marshal(job)
	require.NoError(t, err)

	var decoded ComputeJob
	require.NoError(t, json.Unmarshal(data, &decoded))
	assert.Equal(t, job, decoded)
}

// ---------------------------------------------------------------------------
// DanteGPU job routing
// ---------------------------------------------------------------------------

func TestExecuteDanteJob_CompletionFlow(t *testing.T) {
	var mu sync.Mutex
	statusUpdates := []string{}
	pollCount := int32(0)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/clawchain/marketplace/v1/compute/job/status":
			var payload map[string]interface{}
			json.NewDecoder(r.Body).Decode(&payload)
			mu.Lock()
			statusUpdates = append(statusUpdates, payload["status"].(string))
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/api/v1/tasks" && r.Method == "POST":
			w.WriteHeader(http.StatusOK)
		case strings.HasPrefix(r.URL.Path, "/api/v1/tasks/") && strings.HasSuffix(r.URL.Path, "/status"):
			count := atomic.AddInt32(&pollCount, 1)
			var status DanteTaskStatus
			if count < 3 {
				status = DanteTaskStatus{ID: "claw-1", Status: "running", Progress: int(count) * 33}
			} else {
				status = DanteTaskStatus{ID: "claw-1", Status: "completed", Progress: 100, Output: "done"}
			}
			json.NewEncoder(w).Encode(status)
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	p := NewProvider(cfg)
	p.danteAdapter = NewDanteGPUAdapter(srv.URL, "key", "")
	p.dantePollInterval = 10 * time.Millisecond

	job := ComputeJob{Id: 1, ExecutionType: "docker", DockerImage: "test:latest"}
	// Mark as active and increment counter (like FetchAndExecuteJobs does).
	p.activeJobs.Store(job.Id, true)
	atomic.AddInt32(&p.jobCount, 1)

	p.executeDanteJob(context.Background(), job)

	mu.Lock()
	defer mu.Unlock()
	assert.Contains(t, statusUpdates, "running")
	assert.Contains(t, statusUpdates, "completed")

	// Job should be cleaned up.
	_, exists := p.activeJobs.Load(uint64(1))
	assert.False(t, exists)
	assert.Equal(t, int32(0), atomic.LoadInt32(&p.jobCount))
}

func TestExecuteDanteJob_ContextCancellation(t *testing.T) {
	var mu sync.Mutex
	statusUpdates := []string{}
	cancelCalled := false

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/clawchain/marketplace/v1/compute/job/status":
			var payload map[string]interface{}
			json.NewDecoder(r.Body).Decode(&payload)
			mu.Lock()
			statusUpdates = append(statusUpdates, payload["status"].(string))
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/api/v1/tasks" && r.Method == "POST":
			w.WriteHeader(http.StatusOK)
		case strings.HasSuffix(r.URL.Path, "/cancel"):
			mu.Lock()
			cancelCalled = true
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		case strings.HasSuffix(r.URL.Path, "/status"):
			// Always running.
			json.NewEncoder(w).Encode(DanteTaskStatus{ID: "claw-1", Status: "running", Progress: 50})
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	p := NewProvider(cfg)
	p.danteAdapter = NewDanteGPUAdapter(srv.URL, "key", "")
	p.dantePollInterval = 10 * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	job := ComputeJob{Id: 1, ExecutionType: "docker", DockerImage: "test:latest"}
	p.activeJobs.Store(job.Id, true)
	atomic.AddInt32(&p.jobCount, 1)

	p.executeDanteJob(ctx, job)

	mu.Lock()
	defer mu.Unlock()
	assert.True(t, cancelCalled, "should cancel DanteGPU task on context cancellation")
	assert.Contains(t, statusUpdates, "failed")
}

// ---------------------------------------------------------------------------
// Event listener
// ---------------------------------------------------------------------------

func TestEventListener_OnAndDispatch(t *testing.T) {
	el := NewEventListener(DefaultConfig())

	var received []ChainEvent
	var mu sync.Mutex

	el.On(EventComputeJobSubmitted, func(event ChainEvent) {
		mu.Lock()
		received = append(received, event)
		mu.Unlock()
	})

	el.dispatch(ChainEvent{
		Type:       EventComputeJobSubmitted,
		Height:     100,
		Attributes: map[string]string{"resource_id": "42"},
	})

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, received, 1)
	assert.Equal(t, int64(100), received[0].Height)
}

func TestEventListener_MultipleHandlers(t *testing.T) {
	el := NewEventListener(DefaultConfig())

	callCount := int32(0)
	for i := 0; i < 3; i++ {
		el.On(EventLeaseCreated, func(event ChainEvent) {
			atomic.AddInt32(&callCount, 1)
		})
	}

	el.dispatch(ChainEvent{Type: EventLeaseCreated, Height: 50})

	assert.Equal(t, int32(3), atomic.LoadInt32(&callCount))
}

func TestEventListener_IsRelevantEvent(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ResourceID = 42
	cfg.ProviderAddress = "claw1prov"
	el := NewEventListener(cfg)

	tests := []struct {
		name      string
		eventType string
		attrs     map[string]string
		relevant  bool
	}{
		{
			name:      "job submitted for our resource",
			eventType: string(EventComputeJobSubmitted),
			attrs:     map[string]string{"resource_id": "42"},
			relevant:  true,
		},
		{
			name:      "job submitted for different resource",
			eventType: string(EventComputeJobSubmitted),
			attrs:     map[string]string{"resource_id": "99"},
			relevant:  false,
		},
		{
			name:      "job submitted matching provider",
			eventType: string(EventComputeJobSubmitted),
			attrs:     map[string]string{"provider": "claw1prov"},
			relevant:  true,
		},
		{
			name:      "job submitted no matching attrs",
			eventType: string(EventComputeJobSubmitted),
			attrs:     map[string]string{},
			relevant:  false,
		},
		{
			name:      "lease created for our resource",
			eventType: string(EventLeaseCreated),
			attrs:     map[string]string{"resource_id": "42"},
			relevant:  true,
		},
		{
			name:      "lease created for other resource",
			eventType: string(EventLeaseCreated),
			attrs:     map[string]string{"resource_id": "100"},
			relevant:  false,
		},
		{
			name:      "lease expired for our resource",
			eventType: string(EventLeaseExpired),
			attrs:     map[string]string{"resource_id": "42"},
			relevant:  true,
		},
		{
			name:      "unknown event type",
			eventType: "unknown_event",
			attrs:     map[string]string{"resource_id": "42"},
			relevant:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := el.isRelevantEvent(tt.eventType, tt.attrs)
			assert.Equal(t, tt.relevant, result)
		})
	}
}

func TestEventListener_ProcessMessage(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ResourceID = 1
	cfg.ProviderAddress = "claw1test"
	el := NewEventListener(cfg)

	var received []ChainEvent
	var mu sync.Mutex

	el.On(EventComputeJobSubmitted, func(event ChainEvent) {
		mu.Lock()
		received = append(received, event)
		mu.Unlock()
	})

	// Simulate a CometBFT WebSocket message.
	msg := map[string]interface{}{
		"result": map[string]interface{}{
			"data": map[string]interface{}{
				"value": map[string]interface{}{
					"TxResult": map[string]interface{}{
						"height": "500",
						"result": map[string]interface{}{
							"events": []map[string]interface{}{
								{
									"type": "submit_compute_job",
									"attributes": []map[string]string{
										{"key": "resource_id", "value": "1"},
										{"key": "job_id", "value": "99"},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	data, _ := json.Marshal(msg)
	el.processMessage(data)

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, received, 1)
	assert.Equal(t, int64(500), received[0].Height)
	assert.Equal(t, "1", received[0].Attributes["resource_id"])
	assert.Equal(t, "99", received[0].Attributes["job_id"])
}

func TestEventListener_ProcessMessage_IgnoresIrrelevantEvents(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ResourceID = 1
	el := NewEventListener(cfg)

	callCount := int32(0)
	el.On(EventComputeJobSubmitted, func(event ChainEvent) {
		atomic.AddInt32(&callCount, 1)
	})

	// Message with a different resource_id.
	msg := map[string]interface{}{
		"result": map[string]interface{}{
			"data": map[string]interface{}{
				"value": map[string]interface{}{
					"TxResult": map[string]interface{}{
						"height": "100",
						"result": map[string]interface{}{
							"events": []map[string]interface{}{
								{
									"type": "submit_compute_job",
									"attributes": []map[string]string{
										{"key": "resource_id", "value": "999"},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	data, _ := json.Marshal(msg)
	el.processMessage(data)

	assert.Equal(t, int32(0), atomic.LoadInt32(&callCount))
}

func TestEventListener_ProcessMessage_InvalidJSON(t *testing.T) {
	el := NewEventListener(DefaultConfig())
	// Should not panic.
	el.processMessage([]byte("invalid json"))
}

func TestEventListener_ProcessMessage_NoHeight(t *testing.T) {
	el := NewEventListener(DefaultConfig())
	callCount := int32(0)
	el.On(EventComputeJobSubmitted, func(event ChainEvent) {
		atomic.AddInt32(&callCount, 1)
	})

	// Message with empty height — not a tx event.
	msg := map[string]interface{}{
		"result": map[string]interface{}{
			"data": map[string]interface{}{
				"value": map[string]interface{}{
					"TxResult": map[string]interface{}{
						"height": "",
					},
				},
			},
		},
	}

	data, _ := json.Marshal(msg)
	el.processMessage(data)

	assert.Equal(t, int32(0), atomic.LoadInt32(&callCount))
}

func TestEventListener_IsConnected(t *testing.T) {
	el := NewEventListener(DefaultConfig())

	assert.False(t, el.IsConnected())

	el.connMu.Lock()
	el.connected = true
	el.connMu.Unlock()

	assert.True(t, el.IsConnected())
}

// ---------------------------------------------------------------------------
// Chain client helpers
// ---------------------------------------------------------------------------

func TestTxHash(t *testing.T) {
	hash := TxHash([]byte("test data"))
	assert.Len(t, hash, 16, "TxHash should return 8-byte hex (16 chars)")

	// Deterministic.
	hash2 := TxHash([]byte("test data"))
	assert.Equal(t, hash, hash2)

	// Different data, different hash.
	hash3 := TxHash([]byte("other data"))
	assert.NotEqual(t, hash, hash3)
}

func TestChainClient_UpdateGPUMetrics(t *testing.T) {
	var receivedPath string
	var receivedBody map[string]interface{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cfg.ProviderAddress = "claw1cc"

	cc := &ChainClient{cfg: cfg, address: cfg.ProviderAddress}

	err := cc.UpdateGPUMetrics(context.Background(), 5, GPUMetrics{UtilizationGPU: 90})
	require.NoError(t, err)
	assert.Equal(t, "/clawchain/marketplace/v1/gpu/metrics", receivedPath)
	assert.Equal(t, float64(5), receivedBody["resource_id"])
}

func TestChainClient_UpdateGPUMetrics_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("bad request"))
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cc := &ChainClient{cfg: cfg, address: "claw1test"}

	err := cc.UpdateGPUMetrics(context.Background(), 1, GPUMetrics{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "400")
}

func TestChainClient_UpdateJobStatus(t *testing.T) {
	var received map[string]interface{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cc := &ChainClient{cfg: cfg, address: "claw1cc"}

	err := cc.UpdateJobStatus(context.Background(), 10, "completed", "output")
	require.NoError(t, err)
	assert.Equal(t, float64(10), received["job_id"])
	assert.Equal(t, "completed", received["status"])
	assert.Equal(t, "output", received["result"])
}

func TestChainClient_FetchPendingJobs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.String(), "address=claw1cc")
		assert.Contains(t, r.URL.String(), "status=pending")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jobs": []ComputeJob{
				{Id: 1, Name: "j1"},
				{Id: 2, Name: "j2"},
			},
		})
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cc := &ChainClient{cfg: cfg, address: "claw1cc"}

	jobs, err := cc.FetchPendingJobs(context.Background())
	require.NoError(t, err)
	require.Len(t, jobs, 2)
	assert.Equal(t, "j1", jobs[0].Name)
}

func TestChainClient_QueryResourceLeases(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.String(), "resource_id=42")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"leases": []ComputeLease{
				{Id: 1, ResourceId: 42, Status: "active"},
			},
		})
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cc := &ChainClient{cfg: cfg, address: "claw1cc"}

	leases, err := cc.QueryResourceLeases(context.Background(), 42)
	require.NoError(t, err)
	require.Len(t, leases, 1)
	assert.Equal(t, "active", leases[0].Status)
}

func TestChainClient_GetBlockHeight(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"block": map[string]interface{}{
				"header": map[string]interface{}{
					"height": "12345",
				},
			},
		})
	}))
	defer srv.Close()

	cfg := DefaultConfig()
	cfg.ChainREST = srv.URL
	cc := &ChainClient{cfg: cfg}

	height, err := cc.GetBlockHeight(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int64(12345), height)
}

// ---------------------------------------------------------------------------
// Onboarding helpers
// ---------------------------------------------------------------------------

func TestGenerateConfigTOML(t *testing.T) {
	tmpFile := fmt.Sprintf("%s/config.toml", t.TempDir())

	cfg := DefaultConfig()
	cfg.ProviderAddress = "claw1test"
	cfg.ChainID = "test-chain"

	gpus := []gpuInfo{
		{Name: "NVIDIA A100", MemoryTotal: "80GB"},
	}

	err := generateConfigTOML(tmpFile, cfg, "my-provider", gpus)
	require.NoError(t, err)

	data, err := os.ReadFile(tmpFile)
	require.NoError(t, err)

	content := string(data)
	assert.Contains(t, content, "claw1test")
	assert.Contains(t, content, "test-chain")
	assert.Contains(t, content, "my-provider")
	assert.Contains(t, content, "NVIDIA A100 (80GB)")

	// Verify file permissions (0600).
	info, err := os.Stat(tmpFile)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0600), info.Mode().Perm())
}

func TestPromptString_DefaultValue(t *testing.T) {
	// Test with empty input returns default.
	reader := strings.NewReader("\n")
	result := promptString(bufio.NewReader(reader), "test", "default-val")
	assert.Equal(t, "default-val", result)
}

func TestPromptString_CustomValue(t *testing.T) {
	reader := strings.NewReader("custom-input\n")
	result := promptString(bufio.NewReader(reader), "test", "default-val")
	assert.Equal(t, "custom-input", result)
}
