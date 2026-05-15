package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChainJobToDanteTaskDocker(t *testing.T) {
	adapter := NewDanteGPUAdapter("http://fake", "key", "http://storage")

	job := ComputeJob{
		Id:            42,
		ResourceId:    1,
		LeaseId:       5,
		Submitter:     "cosmos1abc",
		Name:          "training-job",
		JobType:       "gpu",
		ExecutionType: "docker",
		DockerImage:   "nvidia/cuda:latest",
		InputDataUri:  "s3://bucket/input.tar",
		OutputDataUri: "s3://bucket/output/",
	}

	task := adapter.ChainJobToDanteTask(job)

	if task.ID != "claw-42" {
		t.Errorf("expected ID claw-42, got %s", task.ID)
	}
	if task.Type != "container" {
		t.Errorf("expected type container, got %s", task.Type)
	}
	if task.Image != "nvidia/cuda:latest" {
		t.Errorf("expected image nvidia/cuda:latest, got %s", task.Image)
	}
	if task.InputURI != "s3://bucket/input.tar" {
		t.Errorf("expected input URI, got %s", task.InputURI)
	}
	if task.OutputURI != "s3://bucket/output/" {
		t.Errorf("expected output URI, got %s", task.OutputURI)
	}
	if task.Env["INPUT_DATA"] != "s3://bucket/input.tar" {
		t.Errorf("expected INPUT_DATA env, got %s", task.Env["INPUT_DATA"])
	}
	if task.Metadata["chain_job_id"] != "42" {
		t.Errorf("expected chain_job_id=42, got %s", task.Metadata["chain_job_id"])
	}
	if task.Metadata["source"] != "clawchain" {
		t.Errorf("expected source=clawchain, got %s", task.Metadata["source"])
	}
	if task.GPUCount != 1 {
		t.Errorf("expected gpu_count=1, got %d", task.GPUCount)
	}
}

func TestChainJobToDanteTaskScript(t *testing.T) {
	adapter := NewDanteGPUAdapter("http://fake", "key", "http://storage")

	job := ComputeJob{
		Id:            10,
		Name:          "script-job",
		ExecutionType: "script",
		ScriptContent: "import torch; print(torch.cuda.is_available())",
	}

	task := adapter.ChainJobToDanteTask(job)

	if task.Type != "script" {
		t.Errorf("expected type script, got %s", task.Type)
	}
	if task.Script != job.ScriptContent {
		t.Errorf("expected script content to match")
	}
	if task.Image != "" {
		t.Errorf("expected empty image for script job, got %s", task.Image)
	}
}

func TestChainJobToDanteTaskWithParams(t *testing.T) {
	adapter := NewDanteGPUAdapter("http://fake", "key", "http://storage")

	params, _ := json.Marshal(map[string]interface{}{
		"gpu_count":       4,
		"gpu_model":       "A100",
		"memory_limit_mb": 32768,
		"timeout_sec":     7200,
	})

	job := ComputeJob{
		Id:            1,
		Name:          "multi-gpu",
		ExecutionType: "docker",
		DockerImage:   "pytorch:latest",
		Params:        string(params),
	}

	task := adapter.ChainJobToDanteTask(job)

	if task.GPUCount != 4 {
		t.Errorf("expected gpu_count=4, got %d", task.GPUCount)
	}
	if task.GPUModel != "A100" {
		t.Errorf("expected gpu_model=A100, got %s", task.GPUModel)
	}
	if task.MemoryLimitMB != 32768 {
		t.Errorf("expected memory_limit_mb=32768, got %d", task.MemoryLimitMB)
	}
	if task.TimeoutSec != 7200 {
		t.Errorf("expected timeout_sec=7200, got %d", task.TimeoutSec)
	}
}

func TestDanteStatusToChainStatus(t *testing.T) {
	adapter := NewDanteGPUAdapter("http://fake", "key", "http://storage")

	tests := []struct {
		name           string
		danteStatus    DanteTaskStatus
		expectedStatus string
		hasResult      bool
	}{
		{
			name:           "queued maps to pending",
			danteStatus:    DanteTaskStatus{Status: "queued"},
			expectedStatus: "pending",
		},
		{
			name:           "running maps to running",
			danteStatus:    DanteTaskStatus{Status: "running", Progress: 50},
			expectedStatus: "running",
			hasResult:      true,
		},
		{
			name:           "completed maps to completed",
			danteStatus:    DanteTaskStatus{Status: "completed", Output: "result data"},
			expectedStatus: "completed",
			hasResult:      true,
		},
		{
			name:           "failed maps to failed",
			danteStatus:    DanteTaskStatus{Status: "failed", Error: "OOM"},
			expectedStatus: "failed",
			hasResult:      true,
		},
		{
			name:           "cancelled maps to failed",
			danteStatus:    DanteTaskStatus{Status: "cancelled"},
			expectedStatus: "failed",
			hasResult:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, result := adapter.DanteStatusToChainStatus(tt.danteStatus)
			if status != tt.expectedStatus {
				t.Errorf("expected status %q, got %q", tt.expectedStatus, status)
			}
			if tt.hasResult && result == "" {
				t.Errorf("expected non-empty result")
			}
			if !tt.hasResult && result != "" {
				t.Errorf("expected empty result, got %q", result)
			}
		})
	}
}

func TestDanteStatusOutputTruncation(t *testing.T) {
	adapter := NewDanteGPUAdapter("http://fake", "key", "http://storage")

	longOutput := make([]byte, 5000)
	for i := range longOutput {
		longOutput[i] = 'A'
	}

	status := DanteTaskStatus{Status: "completed", Output: string(longOutput)}
	_, result := adapter.DanteStatusToChainStatus(status)

	if len(result) > 4200 { // 4096 + truncation message
		t.Errorf("expected output to be truncated, got length %d", len(result))
	}
}

func TestSubmitTaskHTTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/tasks" {
			t.Errorf("expected path /api/v1/tasks, got %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("expected auth header, got %s", r.Header.Get("Authorization"))
		}

		var task DanteTask
		json.NewDecoder(r.Body).Decode(&task)
		if task.ID != "claw-1" {
			t.Errorf("expected task ID claw-1, got %s", task.ID)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "accepted"})
	}))
	defer server.Close()

	adapter := NewDanteGPUAdapter(server.URL, "test-key", "http://storage")

	task := DanteTask{
		ID:   "claw-1",
		Name: "test-task",
		Type: "container",
	}

	err := adapter.SubmitTask(context.Background(), task)
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestGetTaskStatusHTTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/tasks/claw-1/status" {
			t.Errorf("expected path /api/v1/tasks/claw-1/status, got %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(DanteTaskStatus{
			ID:       "claw-1",
			Status:   "running",
			Progress: 75,
		})
	}))
	defer server.Close()

	adapter := NewDanteGPUAdapter(server.URL, "test-key", "http://storage")

	status, err := adapter.GetTaskStatus(context.Background(), "claw-1")
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if status.Status != "running" {
		t.Errorf("expected status running, got %s", status.Status)
	}
	if status.Progress != 75 {
		t.Errorf("expected progress 75, got %d", status.Progress)
	}
}

func TestCancelTaskHTTP(t *testing.T) {
	cancelled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/tasks/claw-1/cancel" && r.Method == "POST" {
			cancelled = true
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	adapter := NewDanteGPUAdapter(server.URL, "test-key", "http://storage")

	err := adapter.CancelTask(context.Background(), "claw-1")
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if !cancelled {
		t.Error("expected cancel endpoint to be called")
	}
}

func TestSubmitTaskHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	adapter := NewDanteGPUAdapter(server.URL, "test-key", "http://storage")

	err := adapter.SubmitTask(context.Background(), DanteTask{ID: "test"})
	if err == nil {
		t.Error("expected error for 500 response")
	}
}
