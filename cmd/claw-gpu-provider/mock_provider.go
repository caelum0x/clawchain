package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// MockProviderConfig holds configuration for the mock GPU provider.
type MockProviderConfig struct {
	ListenAddr    string  // HTTP listen address (default: :9095)
	ProviderName  string  // Mock provider name
	VRAM          int     // Simulated VRAM in GB (default: 80)
	GPUModel      string  // GPU model name (default: "A100")
	GPUCount      int     // Number of GPUs (default: 1)
	FailureRate   float64 // Probability of job failure (0.0 - 1.0)
	JobLatencySec int     // Simulated job execution time in seconds (default: 2)
	MaxConcurrent int     // Max concurrent jobs (default: 4)
}

// MockProvider simulates a GPU compute provider for E2E testing.
// It does not require a real chain connection or GPU hardware.
type MockProvider struct {
	cfg        MockProviderConfig
	mu         sync.RWMutex
	jobs       map[string]*MockGPUJob
	jobCount   int32
	startTime  time.Time
	totalDone  int64
	totalFails int64
}

// MockGPUJob represents a simulated compute job.
type MockGPUJob struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Status     string            `json:"status"` // queued, running, completed, failed
	ExecType   string            `json:"execution_type"`
	Params     map[string]string `json:"params,omitempty"`
	Result     string            `json:"result,omitempty"`
	ResultHash string            `json:"result_hash,omitempty"`
	Error      string            `json:"error,omitempty"`
	CreatedAt  int64             `json:"created_at"`
	StartedAt  int64             `json:"started_at,omitempty"`
	DoneAt     int64             `json:"completed_at,omitempty"`
}

// NewMockProvider creates a new mock GPU provider.
func NewMockProvider(cfg MockProviderConfig) *MockProvider {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":9095"
	}
	if cfg.ProviderName == "" {
		cfg.ProviderName = "mock-gpu-provider"
	}
	if cfg.VRAM <= 0 {
		cfg.VRAM = 80
	}
	if cfg.GPUModel == "" {
		cfg.GPUModel = "A100"
	}
	if cfg.GPUCount <= 0 {
		cfg.GPUCount = 1
	}
	if cfg.JobLatencySec <= 0 {
		cfg.JobLatencySec = 2
	}
	if cfg.MaxConcurrent <= 0 {
		cfg.MaxConcurrent = 4
	}

	return &MockProvider{
		cfg:       cfg,
		jobs:      make(map[string]*MockGPUJob),
		startTime: time.Now(),
	}
}

// Handler returns the HTTP handler for the mock provider.
func (p *MockProvider) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", p.handleHealth)
	mux.HandleFunc("/v1/submit", p.handleSubmit)
	mux.HandleFunc("/v1/cancel/", p.handleCancel)
	mux.HandleFunc("/v1/status/", p.handleStatus)
	mux.HandleFunc("/v1/jobs", p.handleListJobs)
	mux.HandleFunc("/v1/metrics", p.handleMetrics)
	mux.HandleFunc("/v1/provider", p.handleProviderInfo)
	return mux
}

// Serve starts the mock provider HTTP server.
func (p *MockProvider) Serve() error {
	handler := p.Handler()
	server := &http.Server{
		Addr:         p.cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	log.Printf("[MockProvider] Listening on %s (gpu=%s vram=%dGB count=%d failure_rate=%.2f)",
		p.cfg.ListenAddr, p.cfg.GPUModel, p.cfg.VRAM, p.cfg.GPUCount, p.cfg.FailureRate)
	return server.ListenAndServe()
}

// handleHealth returns mock provider health status.
func (p *MockProvider) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"healthy":       true,
		"mode":          "mock",
		"provider":      p.cfg.ProviderName,
		"gpu_model":     p.cfg.GPUModel,
		"vram_gb":       p.cfg.VRAM,
		"gpu_count":     p.cfg.GPUCount,
		"active_jobs":   atomic.LoadInt32(&p.jobCount),
		"uptime_sec":    int(time.Since(p.startTime).Seconds()),
		"total_done":    atomic.LoadInt64(&p.totalDone),
		"total_failed":  atomic.LoadInt64(&p.totalFails),
	})
}

// handleProviderInfo returns provider registration info.
func (p *MockProvider) handleProviderInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"name":                 p.cfg.ProviderName,
		"gpu_model":            p.cfg.GPUModel,
		"vram_gb":              p.cfg.VRAM,
		"gpu_count":            p.cfg.GPUCount,
		"price_per_hour_uclaw": "1000000",
		"active":               true,
		"max_concurrent":       p.cfg.MaxConcurrent,
		"mode":                 "mock",
	})
}

// handleSubmit accepts a compute job submission.
func (p *MockProvider) handleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Check concurrency limit.
	if int(atomic.LoadInt32(&p.jobCount)) >= p.cfg.MaxConcurrent {
		http.Error(w, `{"error":"max concurrent jobs reached"}`, http.StatusTooManyRequests)
		return
	}

	var req struct {
		JobID         string            `json:"job_id"`
		Name          string            `json:"name"`
		ExecutionType string            `json:"execution_type"`
		Params        map[string]string `json:"params"`
		DurationSecs  int64             `json:"estimated_duration_secs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.JobID == "" {
		req.JobID = fmt.Sprintf("mock-job-%d", time.Now().UnixNano())
	}
	if req.Name == "" {
		req.Name = req.JobID
	}

	job := &MockGPUJob{
		ID:        req.JobID,
		Name:      req.Name,
		Status:    "queued",
		ExecType:  req.ExecutionType,
		Params:    req.Params,
		CreatedAt: time.Now().Unix(),
	}

	p.mu.Lock()
	p.jobs[req.JobID] = job
	p.mu.Unlock()

	atomic.AddInt32(&p.jobCount, 1)
	go p.executeJob(job, req.DurationSecs)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"job_id": req.JobID,
		"status": "queued",
	})
}

// executeJob simulates job processing.
func (p *MockProvider) executeJob(job *MockGPUJob, durationSecs int64) {
	defer atomic.AddInt32(&p.jobCount, -1)

	p.mu.Lock()
	job.Status = "running"
	job.StartedAt = time.Now().Unix()
	p.mu.Unlock()

	latency := time.Duration(p.cfg.JobLatencySec) * time.Second
	if durationSecs > 0 {
		latency = time.Duration(durationSecs) * time.Second
	}
	time.Sleep(latency)

	p.mu.Lock()
	defer p.mu.Unlock()

	// Simulate failure.
	if p.cfg.FailureRate > 0 && rand.Float64() < p.cfg.FailureRate {
		job.Status = "failed"
		job.Error = "simulated GPU job failure"
		job.DoneAt = time.Now().Unix()
		atomic.AddInt64(&p.totalFails, 1)
		return
	}

	output := fmt.Sprintf("gpu_output_%s_%d", job.ID, time.Now().UnixNano())
	hash := sha256.Sum256([]byte(output))
	job.Status = "completed"
	job.Result = output
	job.ResultHash = fmt.Sprintf("%x", hash)
	job.DoneAt = time.Now().Unix()
	atomic.AddInt64(&p.totalDone, 1)
}

// handleCancel cancels a running job.
func (p *MockProvider) handleCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	jobID := r.URL.Path[len("/v1/cancel/"):]
	if jobID == "" {
		http.Error(w, `{"error":"job_id required"}`, http.StatusBadRequest)
		return
	}

	p.mu.Lock()
	job, exists := p.jobs[jobID]
	if exists && (job.Status == "queued" || job.Status == "running") {
		job.Status = "cancelled"
		job.DoneAt = time.Now().Unix()
	}
	p.mu.Unlock()

	if !exists {
		http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"job_id":    jobID,
		"cancelled": true,
	})
}

// handleStatus returns the status of a single job.
func (p *MockProvider) handleStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Path[len("/v1/status/"):]
	if jobID == "" {
		http.Error(w, `{"error":"job_id required"}`, http.StatusBadRequest)
		return
	}

	p.mu.RLock()
	job, exists := p.jobs[jobID]
	p.mu.RUnlock()

	if !exists {
		http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// handleListJobs returns all tracked jobs.
func (p *MockProvider) handleListJobs(w http.ResponseWriter, r *http.Request) {
	p.mu.RLock()
	jobs := make([]*MockGPUJob, 0, len(p.jobs))
	for _, j := range p.jobs {
		jobs = append(jobs, j)
	}
	p.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"jobs":  jobs,
		"total": len(jobs),
	})
}

// handleMetrics returns mock GPU metrics.
func (p *MockProvider) handleMetrics(w http.ResponseWriter, r *http.Request) {
	active := atomic.LoadInt32(&p.jobCount)
	// Simulate GPU utilization proportional to active jobs.
	utilization := int(float64(active) / float64(p.cfg.MaxConcurrent) * 100)
	if utilization > 100 {
		utilization = 100
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gpu_utilization":    utilization,
		"memory_utilization": utilization / 2,
		"temperature":        35 + utilization/3,
		"power_draw_watts":   100 + utilization*2,
		"memory_used_mb":     uint64(float64(p.cfg.VRAM*1024) * float64(utilization) / 100),
		"memory_total_mb":    p.cfg.VRAM * 1024,
		"is_healthy":         true,
	})
}

// RunMockProviderMode starts the GPU provider in mock mode.
func RunMockProviderMode() {
	cfg := MockProviderConfig{
		ListenAddr:    envOrDefault("LISTEN_ADDR", ":9095"),
		ProviderName:  envOrDefault("PROVIDER_NAME", "mock-gpu-provider"),
		GPUModel:      envOrDefault("GPU_MODEL", "A100"),
		MaxConcurrent: 4,
		JobLatencySec: 2,
	}

	// Parse numeric env vars.
	fmt.Sscanf(envOrDefault("VRAM_GB", "80"), "%d", &cfg.VRAM)
	fmt.Sscanf(envOrDefault("GPU_COUNT", "1"), "%d", &cfg.GPUCount)
	fmt.Sscanf(envOrDefault("MOCK_FAILURE_RATE", "0.0"), "%f", &cfg.FailureRate)
	fmt.Sscanf(envOrDefault("JOB_LATENCY_SEC", "2"), "%d", &cfg.JobLatencySec)
	fmt.Sscanf(envOrDefault("MAX_CONCURRENT", "4"), "%d", &cfg.MaxConcurrent)

	provider := NewMockProvider(cfg)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("[MockProvider] Shutting down...")
		cancel()
		os.Exit(0)
	}()

	_ = ctx // keep for graceful shutdown extension
	if err := provider.Serve(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[MockProvider] Server error: %v", err)
	}
}
