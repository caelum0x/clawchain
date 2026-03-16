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
// TestMockServerHealth
// ---------------------------------------------------------------------------

func TestMockServerHealth(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 10})
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var body map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "ok", body["status"])
	assert.Equal(t, "mock", body["mode"])
}

// ---------------------------------------------------------------------------
// TestMockServerInference — non-streaming
// ---------------------------------------------------------------------------

func TestMockServerInferenceNonStreaming(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 10})
	handler := srv.Handler()

	reqBody := `{"model_id": 1, "input": "hello world", "max_tokens": 5, "stream": false}`
	req := httptest.NewRequest("POST", "/v1/inference", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var body map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.NotEmpty(t, body["output"])
	assert.NotZero(t, body["tokens_used"])
}

// ---------------------------------------------------------------------------
// TestMockServerInference — streaming
// ---------------------------------------------------------------------------

func TestMockServerInferenceStreaming(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 50})
	handler := srv.Handler()

	reqBody := `{"model_id": 1, "input": "hello", "max_tokens": 3, "stream": true}`
	req := httptest.NewRequest("POST", "/v1/inference", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()

	// Should contain SSE data lines.
	assert.Contains(t, body, "data: ")
	// Should end with [DONE].
	assert.Contains(t, body, "data: [DONE]")
}

// ---------------------------------------------------------------------------
// TestMockServerSubmitJob
// ---------------------------------------------------------------------------

func TestMockServerSubmitJob(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 10})
	handler := srv.Handler()

	reqBody := `{"job_id": "test-1", "execution_type": "docker", "estimated_duration_secs": 1}`
	req := httptest.NewRequest("POST", "/v1/submit", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusAccepted, rec.Code)

	var body map[string]interface{}
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "test-1", body["job_id"])
	assert.Equal(t, "queued", body["status"])

	// Wait for job completion.
	time.Sleep(2 * time.Second)

	// Check job status.
	statusReq := httptest.NewRequest("GET", "/v1/job/test-1", nil)
	statusRec := httptest.NewRecorder()
	handler.ServeHTTP(statusRec, statusReq)

	assert.Equal(t, http.StatusOK, statusRec.Code)

	var job MockJob
	err = json.Unmarshal(statusRec.Body.Bytes(), &job)
	require.NoError(t, err)
	assert.Equal(t, "completed", job.Status)
	assert.NotEmpty(t, job.OutputHash)
}

// ---------------------------------------------------------------------------
// TestMockServerJobNotFound
// ---------------------------------------------------------------------------

func TestMockServerJobNotFound(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 10})
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/v1/job/nonexistent", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

// ---------------------------------------------------------------------------
// TestMockServerListJobs
// ---------------------------------------------------------------------------

func TestMockServerListJobs(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 10})
	handler := srv.Handler()

	// Submit two jobs.
	for _, id := range []string{"job-a", "job-b"} {
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
		Jobs  []*MockJob `json:"jobs"`
		Total int        `json:"total"`
	}
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, 2, body.Total)
	assert.Len(t, body.Jobs, 2)
}

// ---------------------------------------------------------------------------
// TestGenerateMockTokens
// ---------------------------------------------------------------------------

func TestGenerateMockTokens(t *testing.T) {
	tokens := generateMockTokens("test input", 5)
	assert.Len(t, tokens, 5)

	// Cap at 50.
	tokens = generateMockTokens("big", 100)
	assert.LessOrEqual(t, len(tokens), 50)

	// Default when 0.
	tokens = generateMockTokens("none", 0)
	assert.Len(t, tokens, 10)
}

// ---------------------------------------------------------------------------
// TestMockServerInferenceMethodNotAllowed
// ---------------------------------------------------------------------------

func TestMockServerInferenceMethodNotAllowed(t *testing.T) {
	srv := NewMockServer(MockConfig{FailureRate: 0, LatencyMs: 10})
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/v1/inference", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}
