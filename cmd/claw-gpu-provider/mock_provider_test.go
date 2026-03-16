package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// TestMockProviderHealth
// ---------------------------------------------------------------------------

func TestMockProviderHealth(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{FailureRate: 0, JobLatencySec: 1})
	handler := p.Handler()

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var body map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, true, body["healthy"])
	assert.Equal(t, "mock", body["mode"])
	assert.Equal(t, "mock-gpu-provider", body["provider"])
}

// ---------------------------------------------------------------------------
// TestMockProviderSubmitAndStatus
// ---------------------------------------------------------------------------

func TestMockProviderSubmitAndStatus(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{FailureRate: 0, JobLatencySec: 1})
	handler := p.Handler()

	// Submit a job.
	reqBody := `{"job_id": "test-gpu-1", "name": "test-training", "execution_type": "docker", "estimated_duration_secs": 1}`
	req := httptest.NewRequest("POST", "/v1/submit", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusAccepted, rec.Code)

	var submitResp map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &submitResp)
	require.NoError(t, err)
	assert.Equal(t, "test-gpu-1", submitResp["job_id"])
	assert.Equal(t, "queued", submitResp["status"])

	// Wait for completion.
	time.Sleep(2 * time.Second)

	// Check status.
	statusReq := httptest.NewRequest("GET", "/v1/status/test-gpu-1", nil)
	statusRec := httptest.NewRecorder()
	handler.ServeHTTP(statusRec, statusReq)

	assert.Equal(t, http.StatusOK, statusRec.Code)

	var job MockGPUJob
	err = json.Unmarshal(statusRec.Body.Bytes(), &job)
	require.NoError(t, err)
	assert.Equal(t, "completed", job.Status)
	assert.NotEmpty(t, job.ResultHash)
	assert.Equal(t, "test-training", job.Name)
}

// ---------------------------------------------------------------------------
// TestMockProviderCancel
// ---------------------------------------------------------------------------

func TestMockProviderCancel(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{FailureRate: 0, JobLatencySec: 10})
	handler := p.Handler()

	// Submit a job with long latency.
	reqBody := `{"job_id": "cancel-me", "execution_type": "docker", "estimated_duration_secs": 10}`
	req := httptest.NewRequest("POST", "/v1/submit", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusAccepted, rec.Code)

	// Wait briefly for it to start running.
	time.Sleep(100 * time.Millisecond)

	// Cancel it.
	cancelReq := httptest.NewRequest("POST", "/v1/cancel/cancel-me", nil)
	cancelRec := httptest.NewRecorder()
	handler.ServeHTTP(cancelRec, cancelReq)

	assert.Equal(t, http.StatusOK, cancelRec.Code)

	var cancelResp map[string]interface{}
	err := json.Unmarshal(cancelRec.Body.Bytes(), &cancelResp)
	require.NoError(t, err)
	assert.Equal(t, true, cancelResp["cancelled"])
}

// ---------------------------------------------------------------------------
// TestMockProviderListJobs
// ---------------------------------------------------------------------------

func TestMockProviderListJobs(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{FailureRate: 0, JobLatencySec: 1})
	handler := p.Handler()

	// Submit two jobs.
	for _, id := range []string{"list-1", "list-2"} {
		reqBody := `{"job_id": "` + id + `", "execution_type": "script", "estimated_duration_secs": 1}`
		req := httptest.NewRequest("POST", "/v1/submit", strings.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusAccepted, rec.Code)
	}

	// List jobs.
	req := httptest.NewRequest("GET", "/v1/jobs", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var body struct {
		Jobs  []*MockGPUJob `json:"jobs"`
		Total int           `json:"total"`
	}
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, 2, body.Total)
}

// ---------------------------------------------------------------------------
// TestMockProviderMetrics
// ---------------------------------------------------------------------------

func TestMockProviderMetrics(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{FailureRate: 0, JobLatencySec: 1, VRAM: 80})
	handler := p.Handler()

	req := httptest.NewRequest("GET", "/v1/metrics", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var metrics map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &metrics)
	require.NoError(t, err)
	assert.Equal(t, true, metrics["is_healthy"])
	assert.NotNil(t, metrics["memory_total_mb"])
}

// ---------------------------------------------------------------------------
// TestMockProviderInfo
// ---------------------------------------------------------------------------

func TestMockProviderInfo(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{
		ProviderName: "test-provider",
		GPUModel:     "H100",
		VRAM:         80,
		GPUCount:     4,
	})
	handler := p.Handler()

	req := httptest.NewRequest("GET", "/v1/provider", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var info map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &info)
	require.NoError(t, err)
	assert.Equal(t, "test-provider", info["name"])
	assert.Equal(t, "H100", info["gpu_model"])
	assert.Equal(t, float64(80), info["vram_gb"])
	assert.Equal(t, float64(4), info["gpu_count"])
	assert.Equal(t, "mock", info["mode"])
}

// ---------------------------------------------------------------------------
// TestMockProviderNotFound
// ---------------------------------------------------------------------------

func TestMockProviderStatusNotFound(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{FailureRate: 0})
	handler := p.Handler()

	req := httptest.NewRequest("GET", "/v1/status/nonexistent", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}
