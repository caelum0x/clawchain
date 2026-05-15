package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// GPUMetrics represents collected GPU metrics.
type GPUMetrics struct {
	UtilizationGPU uint8  `json:"utilization_gpu"`
	UtilizationMem uint8  `json:"utilization_mem"`
	Temperature    uint8  `json:"temperature"`
	PowerDrawWatts uint32 `json:"power_draw_watts"`
	MemoryUsedMb   uint64 `json:"memory_used_mb"`
	MemoryTotalMb  uint64 `json:"memory_total_mb"`
	IsHealthy      bool   `json:"is_healthy"`
}

// ComputeJob is a job fetched from the chain.
type ComputeJob struct {
	Id            uint64 `json:"id"`
	ResourceId    uint64 `json:"resource_id"`
	LeaseId       uint64 `json:"lease_id"`
	Submitter     string `json:"submitter"`
	Provider      string `json:"provider"`
	Name          string `json:"name"`
	JobType       string `json:"job_type"`
	ExecutionType string `json:"execution_type"`
	DockerImage   string `json:"docker_image"`
	ScriptContent string `json:"script_content"`
	InputDataUri  string `json:"input_data_uri"`
	OutputDataUri string `json:"output_data_uri"`
	GpuType       string `json:"gpu_type"`
	GpuCount      uint32 `json:"gpu_count"`
	Status        string `json:"status"`
	Result        string `json:"result,omitempty"`
	ResultHash    string `json:"result_hash,omitempty"`
	ErrorMessage  string `json:"error_message,omitempty"`
	SubmittedAt   int64  `json:"submitted_at"`
	StartedAt     int64  `json:"started_at,omitempty"`
	CompletedAt   int64  `json:"completed_at,omitempty"`
	Params        string `json:"params"`
}

// Provider orchestrates GPU metric collection, heartbeats, and job execution.
type Provider struct {
	cfg           Config
	metrics       GPUMetrics
	mu            sync.RWMutex
	activeJobs    sync.Map
	jobCount      int32
	chainClient   *ChainClient
	danteAdapter  *DanteGPUAdapter
	eventListener *EventListener
	scheduler     *Scheduler
	// dantePollInterval controls how often Dante task status is polled.
	// Kept configurable for fast integration tests.
	dantePollInterval time.Duration
}

// NewProvider creates a new Provider with the given configuration.
func NewProvider(cfg Config) *Provider {
	return &Provider{
		cfg:               cfg,
		metrics:           GPUMetrics{IsHealthy: true},
		dantePollInterval: 10 * time.Second,
	}
}

// CollectGPUMetrics reads GPU metrics using nvidia-smi.
// When nvidia-smi is unavailable it falls back to basic CPU health.
func (p *Provider) CollectGPUMetrics() GPUMetrics {
	m := GPUMetrics{IsHealthy: true}

	// Try nvidia-smi for NVIDIA GPUs.
	out, err := exec.Command("nvidia-smi",
		"--query-gpu=utilization.gpu,utilization.memory,temperature.gpu,power.draw,memory.used,memory.total",
		"--format=csv,noheader,nounits").Output()
	if err != nil {
		// Fallback: report basic system health.
		m.IsHealthy = runtime.NumCPU() > 0
		p.mu.Lock()
		p.metrics = m
		p.mu.Unlock()
		return m
	}

	line := strings.TrimSpace(string(out))
	parts := strings.Split(line, ", ")
	if len(parts) >= 6 {
		fmt.Sscanf(parts[0], "%d", &m.UtilizationGPU)
		fmt.Sscanf(parts[1], "%d", &m.UtilizationMem)
		fmt.Sscanf(parts[2], "%d", &m.Temperature)
		var powerFloat float64
		fmt.Sscanf(parts[3], "%f", &powerFloat)
		m.PowerDrawWatts = uint32(powerFloat)
		fmt.Sscanf(parts[4], "%d", &m.MemoryUsedMb)
		fmt.Sscanf(parts[5], "%d", &m.MemoryTotalMb)
	}

	p.mu.Lock()
	p.metrics = m
	p.mu.Unlock()
	return m
}

// HeartbeatLoop sends GPU metrics to the chain periodically.
func (p *Provider) HeartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(p.cfg.HeartbeatSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			metrics := p.CollectGPUMetrics()
			if err := p.sendMetricsToChain(metrics); err != nil {
				log.Printf("[Heartbeat] Failed to send metrics: %v", err)
			} else {
				log.Printf("[Heartbeat] Sent — GPU:%d%% Mem:%d%% Temp:%d°C Power:%dW",
					metrics.UtilizationGPU, metrics.UtilizationMem,
					metrics.Temperature, metrics.PowerDrawWatts)
			}
		}
	}
}

func (p *Provider) sendMetricsToChain(metrics GPUMetrics) error {
	// Use chain client if available for authenticated requests.
	if p.chainClient != nil {
		return p.chainClient.UpdateGPUMetrics(context.Background(), p.cfg.ResourceID, metrics)
	}

	// Fallback to direct HTTP POST.
	body, _ := json.Marshal(map[string]interface{}{
		"resource_id": p.cfg.ResourceID,
		"caller":      p.cfg.ProviderAddress,
		"metrics":     metrics,
	})
	resp, err := http.Post(
		fmt.Sprintf("%s/clawchain/marketplace/v1/gpu/metrics", p.cfg.ChainREST),
		"application/json",
		strings.NewReader(string(body)),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// JobPollLoop polls the chain for pending jobs assigned to this provider.
func (p *Provider) JobPollLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(p.cfg.JobPollSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			jobs, err := p.fetchPendingJobs()
			if err != nil {
				log.Printf("[Jobs] Poll error: %v", err)
				continue
			}
			for _, job := range jobs {
				if atomic.LoadInt32(&p.jobCount) >= int32(p.cfg.MaxConcurrent) {
					break
				}
				if _, loaded := p.activeJobs.LoadOrStore(job.Id, true); loaded {
					continue // already running
				}
				atomic.AddInt32(&p.jobCount, 1)
				go p.executeJob(ctx, job)
			}
		}
	}
}

func (p *Provider) fetchPendingJobs() ([]ComputeJob, error) {
	// Use chain client if available.
	if p.chainClient != nil {
		return p.chainClient.FetchPendingJobs(context.Background())
	}

	// Fallback to direct HTTP GET.
	url := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/jobs?address=%s&status=pending",
		p.cfg.ChainREST, p.cfg.ProviderAddress)
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Jobs []ComputeJob `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Jobs, nil
}

func (p *Provider) executeJob(ctx context.Context, job ComputeJob) {
	defer func() {
		p.activeJobs.Delete(job.Id)
		atomic.AddInt32(&p.jobCount, -1)
	}()

	log.Printf("[Job %d] Starting — type=%s exec=%s", job.Id, job.JobType, job.ExecutionType)

	// Update status to running.
	_ = p.updateJobStatus(job.Id, "running", "")

	var result string
	var jobErr error

	switch job.ExecutionType {
	case "docker":
		result, jobErr = p.executeDockerJob(ctx, job)
	case "script":
		result, jobErr = p.executeScriptJob(ctx, job)
	default:
		jobErr = fmt.Errorf("unsupported execution type: %s", job.ExecutionType)
	}

	if jobErr != nil {
		log.Printf("[Job %d] Failed: %v", job.Id, jobErr)
		_ = p.updateJobStatus(job.Id, "failed", jobErr.Error())
		return
	}

	log.Printf("[Job %d] Completed", job.Id)
	_ = p.updateJobStatus(job.Id, "completed", result)
}

func (p *Provider) executeDockerJob(ctx context.Context, job ComputeJob) (string, error) {
	if !p.cfg.DockerEnabled {
		return "", fmt.Errorf("docker execution disabled")
	}

	args := []string{
		"run", "--rm",
		"--gpus", "all",
		"--memory", "8g",
		"--cpus", "4",
	}

	// Add input data mount if provided.
	if job.InputDataUri != "" {
		args = append(args, "-e", fmt.Sprintf("INPUT_DATA=%s", job.InputDataUri))
	}

	args = append(args, job.DockerImage)

	cmd := exec.CommandContext(ctx, "docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker exec failed: %v — output: %s", err, string(out))
	}

	// Truncate output to 4KB for on-chain storage.
	output := string(out)
	if len(output) > 4096 {
		output = output[:4096] + "... [truncated]"
	}
	return output, nil
}

func (p *Provider) executeScriptJob(ctx context.Context, job ComputeJob) (string, error) {
	if job.ScriptContent == "" {
		return "", fmt.Errorf("empty script content")
	}

	// Write script to temp file.
	tmpFile := fmt.Sprintf("%s/job_%d.py", p.cfg.WorkDir, job.Id)
	if err := os.MkdirAll(p.cfg.WorkDir, 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(tmpFile, []byte(job.ScriptContent), 0644); err != nil {
		return "", err
	}
	defer os.Remove(tmpFile)

	cmd := exec.CommandContext(ctx, "python3", tmpFile)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("script exec failed: %v — output: %s", err, string(out))
	}

	output := string(out)
	if len(output) > 4096 {
		output = output[:4096] + "... [truncated]"
	}
	return output, nil
}

func (p *Provider) updateJobStatus(jobId uint64, status, result string) error {
	// Use chain client if available.
	if p.chainClient != nil {
		return p.chainClient.UpdateJobStatus(context.Background(), jobId, status, result)
	}

	// Fallback to direct HTTP POST.
	body, _ := json.Marshal(map[string]interface{}{
		"job_id": jobId,
		"caller": p.cfg.ProviderAddress,
		"status": status,
		"result": result,
	})
	resp, err := http.Post(
		fmt.Sprintf("%s/clawchain/marketplace/v1/compute/job/status", p.cfg.ChainREST),
		"application/json",
		strings.NewReader(string(body)),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// FetchAndExecuteJobs is triggered by WebSocket events for immediate job dispatch.
func (p *Provider) FetchAndExecuteJobs(ctx context.Context) {
	var jobs []ComputeJob
	var err error

	// Use scheduler for ranked job selection when available.
	if p.scheduler != nil {
		jobs, err = p.scheduler.FetchAndRankJobs()
	} else {
		jobs, err = p.fetchPendingJobs()
	}
	if err != nil {
		log.Printf("[Jobs] Event-triggered fetch error: %v", err)
		return
	}
	for _, job := range jobs {
		if atomic.LoadInt32(&p.jobCount) >= int32(p.cfg.MaxConcurrent) {
			break
		}
		if _, loaded := p.activeJobs.LoadOrStore(job.Id, true); loaded {
			continue
		}
		atomic.AddInt32(&p.jobCount, 1)

		// Use DanteGPU adapter if enabled.
		if p.danteAdapter != nil {
			go p.executeDanteJob(ctx, job)
		} else {
			go p.executeJob(ctx, job)
		}
	}
}

// JobPollLoopWithFallback polls for jobs only when WebSocket is disconnected.
func (p *Provider) JobPollLoopWithFallback(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(p.cfg.JobPollSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Only poll if WebSocket is not connected.
			if p.eventListener != nil && p.eventListener.IsConnected() {
				continue
			}
			log.Printf("[Jobs] WebSocket disconnected — falling back to polling")
			p.FetchAndExecuteJobs(ctx)
		}
	}
}

// executeDanteJob routes a compute job through the DanteGPU adapter for
// advanced scheduling and GPU orchestration.
func (p *Provider) executeDanteJob(ctx context.Context, job ComputeJob) {
	defer func() {
		p.activeJobs.Delete(job.Id)
		atomic.AddInt32(&p.jobCount, -1)
	}()

	log.Printf("[Job %d] Routing to DanteGPU — type=%s", job.Id, job.ExecutionType)

	// Update chain status to running.
	_ = p.updateJobStatus(job.Id, "running", "")

	// Convert to DanteGPU task format and submit.
	task := p.danteAdapter.ChainJobToDanteTask(job)
	if err := p.danteAdapter.SubmitTask(ctx, task); err != nil {
		log.Printf("[Job %d] DanteGPU submit failed: %v — falling back to local", job.Id, err)
		p.executeJob(ctx, job)
		return
	}

	// Poll DanteGPU for task completion.
	pollInterval := p.dantePollInterval
	if pollInterval <= 0 {
		pollInterval = 10 * time.Second
	}
	pollTicker := time.NewTicker(pollInterval)
	defer pollTicker.Stop()
	lastPublishedStatus := "running"
	lastPublishedResult := ""

	for {
		select {
		case <-ctx.Done():
			_ = p.danteAdapter.CancelTask(context.Background(), task.ID)
			_ = p.updateJobStatus(job.Id, "failed", "provider shutdown")
			return
		case <-pollTicker.C:
			status, err := p.danteAdapter.GetTaskStatus(ctx, task.ID)
			if err != nil {
				log.Printf("[Job %d] DanteGPU status check failed: %v", job.Id, err)
				continue
			}

			chainStatus, result := p.danteAdapter.DanteStatusToChainStatus(status)
			// Publish state transitions (and progress payload changes) to chain for live UX.
			shouldPublish := chainStatus != lastPublishedStatus || result != lastPublishedResult
			if shouldPublish {
				_ = p.updateJobStatus(job.Id, chainStatus, result)
				lastPublishedStatus = chainStatus
				lastPublishedResult = result
			}
			if chainStatus == "completed" || chainStatus == "failed" {
				log.Printf("[Job %d] DanteGPU finished — status=%s", job.Id, chainStatus)
				return
			}
		}
	}
}

// ServeMetrics exposes a Prometheus-compatible metrics endpoint and a JSON
// health endpoint on the configured metrics port.
func (p *Provider) ServeMetrics() {
	mux := http.NewServeMux()

	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		p.mu.RLock()
		m := p.metrics
		p.mu.RUnlock()

		fmt.Fprintf(w, "# HELP gpu_utilization GPU utilization percentage\n")
		fmt.Fprintf(w, "# TYPE gpu_utilization gauge\n")
		fmt.Fprintf(w, "gpu_utilization %d\n", m.UtilizationGPU)
		fmt.Fprintf(w, "# HELP gpu_memory_utilization GPU memory utilization percentage\n")
		fmt.Fprintf(w, "# TYPE gpu_memory_utilization gauge\n")
		fmt.Fprintf(w, "gpu_memory_utilization %d\n", m.UtilizationMem)
		fmt.Fprintf(w, "# HELP gpu_temperature GPU temperature in Celsius\n")
		fmt.Fprintf(w, "# TYPE gpu_temperature gauge\n")
		fmt.Fprintf(w, "gpu_temperature %d\n", m.Temperature)
		fmt.Fprintf(w, "# HELP gpu_power_draw GPU power draw in watts\n")
		fmt.Fprintf(w, "# TYPE gpu_power_draw gauge\n")
		fmt.Fprintf(w, "gpu_power_draw %d\n", m.PowerDrawWatts)
		fmt.Fprintf(w, "# HELP gpu_memory_used GPU memory used in MB\n")
		fmt.Fprintf(w, "# TYPE gpu_memory_used gauge\n")
		fmt.Fprintf(w, "gpu_memory_used %d\n", m.MemoryUsedMb)
		fmt.Fprintf(w, "# HELP gpu_memory_total GPU memory total in MB\n")
		fmt.Fprintf(w, "# TYPE gpu_memory_total gauge\n")
		fmt.Fprintf(w, "gpu_memory_total %d\n", m.MemoryTotalMb)
		fmt.Fprintf(w, "# HELP gpu_healthy GPU health status (1=healthy, 0=unhealthy)\n")
		fmt.Fprintf(w, "# TYPE gpu_healthy gauge\n")
		healthy := 0
		if m.IsHealthy {
			healthy = 1
		}
		fmt.Fprintf(w, "gpu_healthy %d\n", healthy)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
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

	addr := fmt.Sprintf(":%d", p.cfg.MetricsPort)
	log.Printf("[Metrics] Serving on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Printf("[Metrics] Server error: %v", err)
	}
}
