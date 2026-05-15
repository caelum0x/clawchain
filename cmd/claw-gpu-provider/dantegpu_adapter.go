package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// DanteGPUAdapter translates between ClawChain ComputeJob format and
// DanteGPU task format, enabling providers to use DanteGPU's infrastructure
// for job scheduling, output storage, and GPU orchestration.
type DanteGPUAdapter struct {
	apiURL     string
	apiKey     string
	storageURL string
	httpClient *http.Client
}

// DanteTask is the DanteGPU task submission format.
type DanteTask struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Priority      int               `json:"priority"`
	Image         string            `json:"image,omitempty"`
	Script        string            `json:"script,omitempty"`
	InputURI      string            `json:"input_uri,omitempty"`
	OutputURI     string            `json:"output_uri,omitempty"`
	GPUCount      int               `json:"gpu_count"`
	GPUModel      string            `json:"gpu_model,omitempty"`
	MemoryLimitMB int               `json:"memory_limit_mb"`
	TimeoutSec    int               `json:"timeout_sec"`
	Env           map[string]string `json:"env,omitempty"`
	Metadata      map[string]string `json:"metadata,omitempty"`
}

// DanteTaskStatus is the DanteGPU task status response.
type DanteTaskStatus struct {
	ID        string `json:"id"`
	Status    string `json:"status"` // queued, running, completed, failed, cancelled
	Progress  int    `json:"progress"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
	EndedAt   string `json:"ended_at,omitempty"`
}

// NewDanteGPUAdapter creates a new adapter for DanteGPU integration.
func NewDanteGPUAdapter(apiURL, apiKey, storageURL string) *DanteGPUAdapter {
	return &DanteGPUAdapter{
		apiURL:     apiURL,
		apiKey:     apiKey,
		storageURL: storageURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// ChainJobToDanteTask converts a ClawChain ComputeJob to a DanteGPU task.
func (a *DanteGPUAdapter) ChainJobToDanteTask(job ComputeJob) DanteTask {
	task := DanteTask{
		ID:            fmt.Sprintf("claw-%d", job.Id),
		Name:          job.Name,
		GPUCount:      1,
		MemoryLimitMB: 8192,
		TimeoutSec:    3600,
		Env:           make(map[string]string),
		Metadata: map[string]string{
			"chain_job_id":   fmt.Sprintf("%d", job.Id),
			"chain_lease_id": fmt.Sprintf("%d", job.LeaseId),
			"submitter":      job.Submitter,
			"source":         "clawchain",
		},
	}

	switch job.ExecutionType {
	case "docker":
		task.Type = "container"
		task.Image = job.DockerImage
		if job.InputDataUri != "" {
			task.InputURI = job.InputDataUri
			task.Env["INPUT_DATA"] = job.InputDataUri
		}
	case "script":
		task.Type = "script"
		task.Script = job.ScriptContent
	default:
		task.Type = "generic"
	}

	if job.OutputDataUri != "" {
		task.OutputURI = job.OutputDataUri
	}

	// Parse extra params if present.
	if job.Params != "" {
		var params map[string]interface{}
		if err := json.Unmarshal([]byte(job.Params), &params); err == nil {
			if gpuCount, ok := params["gpu_count"].(float64); ok {
				task.GPUCount = int(gpuCount)
			}
			if gpuModel, ok := params["gpu_model"].(string); ok {
				task.GPUModel = gpuModel
			}
			if memLimit, ok := params["memory_limit_mb"].(float64); ok {
				task.MemoryLimitMB = int(memLimit)
			}
			if timeout, ok := params["timeout_sec"].(float64); ok {
				task.TimeoutSec = int(timeout)
			}
		}
	}

	return task
}

// DanteStatusToChainStatus converts a DanteGPU task status to a chain job status.
func (a *DanteGPUAdapter) DanteStatusToChainStatus(status DanteTaskStatus) (chainStatus string, result string) {
	switch status.Status {
	case "queued":
		return "pending", ""
	case "running":
		return "running", fmt.Sprintf("progress: %d%%", status.Progress)
	case "completed":
		output := status.Output
		if len(output) > 4096 {
			output = output[:4096] + "... [truncated]"
		}
		return "completed", output
	case "failed":
		return "failed", status.Error
	case "cancelled":
		return "failed", "cancelled by DanteGPU scheduler"
	default:
		return "pending", ""
	}
}

// SubmitTask submits a task to the DanteGPU scheduler.
func (a *DanteGPUAdapter) SubmitTask(ctx context.Context, task DanteTask) error {
	body, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("marshal task: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/tasks", a.apiURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.apiKey))

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("submit task: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DanteGPU submit HTTP %d: %s", resp.StatusCode, string(b))
	}

	log.Printf("[DanteGPU] Task %s submitted", task.ID)
	return nil
}

// GetTaskStatus queries the status of a DanteGPU task.
func (a *DanteGPUAdapter) GetTaskStatus(ctx context.Context, taskID string) (DanteTaskStatus, error) {
	url := fmt.Sprintf("%s/api/v1/tasks/%s/status", a.apiURL, taskID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return DanteTaskStatus{}, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.apiKey))

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return DanteTaskStatus{}, fmt.Errorf("get task status: %w", err)
	}
	defer resp.Body.Close()

	var status DanteTaskStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return DanteTaskStatus{}, fmt.Errorf("decode status: %w", err)
	}
	return status, nil
}

// CancelTask cancels a running DanteGPU task.
func (a *DanteGPUAdapter) CancelTask(ctx context.Context, taskID string) error {
	url := fmt.Sprintf("%s/api/v1/tasks/%s/cancel", a.apiURL, taskID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.apiKey))

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("cancel task: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DanteGPU cancel HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}
