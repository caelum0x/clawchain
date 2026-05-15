package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// TestEnvOr
// ---------------------------------------------------------------------------

func TestEnvOr_Default(t *testing.T) {
	// Ensure the variable is unset so the default applies.
	t.Setenv("_TEST_ENVVAR_SIDECAR_XYZ", "")
	got := envOr("_TEST_ENVVAR_SIDECAR_XYZ", "default-value")
	assert.Equal(t, "default-value", got)
}

func TestEnvOr_Override(t *testing.T) {
	t.Setenv("_TEST_ENVVAR_SIDECAR_XYZ", "custom")
	got := envOr("_TEST_ENVVAR_SIDECAR_XYZ", "default-value")
	assert.Equal(t, "custom", got)
}

// ---------------------------------------------------------------------------
// TestSSEBroadcast
// ---------------------------------------------------------------------------

func newTestSidecar() *Sidecar {
	return &Sidecar{
		cfg:        Config{PollInterval: time.Minute},
		streams:    make(map[uint64][]chan SSEEvent),
		activeJobs: make(map[uint64]*InferenceJob),
	}
}

func TestSSEBroadcast(t *testing.T) {
	s := newTestSidecar()

	// Add two listeners for job 1.
	ch1 := s.addListener(1)
	ch2 := s.addListener(1)

	evt := SSEEvent{Type: "partial", Data: "hello"}
	s.broadcastEvent(1, evt)

	got1 := <-ch1
	got2 := <-ch2
	assert.Equal(t, evt, got1)
	assert.Equal(t, evt, got2)
}

// ---------------------------------------------------------------------------
// TestAddRemoveListener
// ---------------------------------------------------------------------------

func TestAddRemoveListener(t *testing.T) {
	s := newTestSidecar()

	ch := s.addListener(42)
	require.NotNil(t, ch)

	s.mu.RLock()
	assert.Len(t, s.streams[42], 1)
	s.mu.RUnlock()

	s.removeListener(42, ch)

	s.mu.RLock()
	assert.Len(t, s.streams[42], 0)
	s.mu.RUnlock()

	// Verify the channel was closed.
	_, open := <-ch
	assert.False(t, open, "channel should be closed after removeListener")
}

// ---------------------------------------------------------------------------
// TestCleanupJob
// ---------------------------------------------------------------------------

func TestCleanupJob(t *testing.T) {
	s := newTestSidecar()

	s.mu.Lock()
	s.activeJobs[10] = &InferenceJob{JobID: 10}
	s.mu.Unlock()

	ch1 := s.addListener(10)
	ch2 := s.addListener(10)

	s.cleanupJob(10)

	s.mu.RLock()
	_, active := s.activeJobs[10]
	_, hasStreams := s.streams[10]
	s.mu.RUnlock()

	assert.False(t, active, "job should be removed from activeJobs")
	assert.False(t, hasStreams, "streams entry should be deleted")

	// Both channels should be closed.
	_, open1 := <-ch1
	_, open2 := <-ch2
	assert.False(t, open1, "ch1 should be closed")
	assert.False(t, open2, "ch2 should be closed")
}

// ---------------------------------------------------------------------------
// TestHandleStream — validates the SSE format
// ---------------------------------------------------------------------------

func TestHandleStream(t *testing.T) {
	s := newTestSidecar()

	// Pre-register job 99 so the handler can attach a listener.
	s.mu.Lock()
	s.activeJobs[99] = &InferenceJob{JobID: 99}
	s.mu.Unlock()

	// Use a goroutine to send events after the handler attaches a listener.
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Wait until a listener is registered.
		for {
			s.mu.RLock()
			n := len(s.streams[99])
			s.mu.RUnlock()
			if n > 0 {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}

		s.broadcastEvent(99, SSEEvent{Type: "partial", Data: "tok1"})
		s.broadcastEvent(99, SSEEvent{Type: "complete", Data: "full output", TokensUsed: 5})
	}()

	req := httptest.NewRequest("GET", "/stream/99", nil)
	rec := httptest.NewRecorder()
	s.handleStream(rec, req)
	wg.Wait()

	body := rec.Body.String()
	assert.Contains(t, body, "data: ")
	assert.Contains(t, body, `"type":"partial"`)
	assert.Contains(t, body, `"type":"complete"`)

	// Validate SSE format: each event line starts with "data: " and is followed by double newline.
	lines := strings.Split(strings.TrimSpace(body), "\n\n")
	require.GreaterOrEqual(t, len(lines), 1, "should have at least one SSE block")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		assert.True(t, strings.HasPrefix(line, "data: "), "SSE line should start with 'data: ', got: %s", line)
	}
}

// ---------------------------------------------------------------------------
// TestHandleListJobs
// ---------------------------------------------------------------------------

func TestHandleListJobs(t *testing.T) {
	s := newTestSidecar()

	s.mu.Lock()
	s.activeJobs[1] = &InferenceJob{JobID: 1}
	s.activeJobs[2] = &InferenceJob{JobID: 2}
	s.mu.Unlock()

	req := httptest.NewRequest("GET", "/jobs", nil)
	rec := httptest.NewRecorder()
	s.handleListJobs(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var result struct {
		ActiveJobs []uint64 `json:"active_jobs"`
	}
	err := json.Unmarshal(rec.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.ActiveJobs, 2)
}

// ---------------------------------------------------------------------------
// TestHealthEndpoint
// ---------------------------------------------------------------------------

func TestHealthEndpoint(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprintf(w, `{"status":"ok"}`)
	})

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var body map[string]string
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "ok", body["status"])
}

// ---------------------------------------------------------------------------
// TestWithCORS
// ---------------------------------------------------------------------------

func TestWithCORS(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})

	handler := withCORS(inner)

	// Test regular request gets CORS headers.
	req := httptest.NewRequest("GET", "/anything", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Contains(t, rec.Header().Get("Access-Control-Allow-Methods"), "GET")
	assert.Contains(t, rec.Header().Get("Access-Control-Allow-Headers"), "Content-Type")

	// Test OPTIONS pre-flight returns 204.
	req2 := httptest.NewRequest("OPTIONS", "/anything", nil)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	assert.Equal(t, 204, rec2.Code)
}

// ---------------------------------------------------------------------------
// TestAuthMiddleware
// ---------------------------------------------------------------------------

func TestAuthMiddleware_ValidToken(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, "ok")
	})

	handler := authMiddleware("secret123", inner)

	req := httptest.NewRequest("GET", "/jobs", nil)
	req.Header.Set("Authorization", "Bearer secret123")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})

	handler := authMiddleware("secret123", inner)

	req := httptest.NewRequest("GET", "/jobs", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthMiddleware_NoAuth(t *testing.T) {
	// When AUTH_TOKEN is empty, auth should be disabled and all requests pass.
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, "open")
	})

	handler := authMiddleware("", inner)

	req := httptest.NewRequest("GET", "/jobs", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "open", rec.Body.String())
}

func TestAuthMiddleware_HealthSkipsAuth(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, "healthy")
	})

	handler := authMiddleware("secret123", inner)

	// No Authorization header, but /health should still pass.
	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "healthy", rec.Body.String())
}

func TestAuthMiddleware_MissingHeader(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})

	handler := authMiddleware("secret123", inner)

	req := httptest.NewRequest("GET", "/stream/1", nil)
	// No Authorization header.
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// ---------------------------------------------------------------------------
// TestRetryWithBackoff
// ---------------------------------------------------------------------------

func TestRetryWithBackoff_Success(t *testing.T) {
	callCount := 0
	err := retryWithBackoff(context.Background(), 3, 1*time.Millisecond, func() error {
		callCount++
		return nil
	})
	assert.NoError(t, err)
	assert.Equal(t, 1, callCount, "should succeed on first attempt")
}

func TestRetryWithBackoff_EventualSuccess(t *testing.T) {
	callCount := 0
	err := retryWithBackoff(context.Background(), 3, 1*time.Millisecond, func() error {
		callCount++
		if callCount < 3 {
			return errors.New("transient error")
		}
		return nil
	})
	assert.NoError(t, err)
	assert.Equal(t, 3, callCount, "should succeed on third attempt")
}

func TestRetryWithBackoff_MaxRetries(t *testing.T) {
	callCount := 0
	err := retryWithBackoff(context.Background(), 2, 1*time.Millisecond, func() error {
		callCount++
		return errors.New("permanent error")
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed after 3 retries")
	assert.Equal(t, 3, callCount, "should try initial + 2 retries = 3")
}

func TestRetryWithBackoff_ContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately.

	callCount := 0
	err := retryWithBackoff(ctx, 5, 1*time.Millisecond, func() error {
		callCount++
		return errors.New("will not retry")
	})
	// Should fail quickly because context is already done.
	assert.Error(t, err)
	assert.LessOrEqual(t, callCount, 2, "should stop early due to cancelled context")
}

// ---------------------------------------------------------------------------
// TestRequestLogging middleware
// ---------------------------------------------------------------------------

func TestRequestLoggingMiddleware(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		fmt.Fprint(w, "brewed")
	})

	handler := requestLogging(inner)

	req := httptest.NewRequest("GET", "/jobs", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	// The middleware should not alter the response.
	assert.Equal(t, http.StatusTeapot, rec.Code)
	assert.Equal(t, "brewed", rec.Body.String())
}
