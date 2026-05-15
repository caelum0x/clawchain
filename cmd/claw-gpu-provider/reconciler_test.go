package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestReconciler creates a Reconciler backed by a mock chain REST server.
// The handler function is called for every request the reconciler makes.
func newTestReconciler(t *testing.T, handler http.HandlerFunc) (*Reconciler, *Provider, *httptest.Server) {
	t.Helper()

	server := httptest.NewServer(handler)

	cfg := DefaultConfig()
	cfg.ChainREST = server.URL
	cfg.ProviderAddress = "claw1testprovider"
	cfg.MaxConcurrent = 4

	provider := NewProvider(cfg)

	chainClient := &ChainClient{
		cfg:     cfg,
		address: cfg.ProviderAddress,
	}
	provider.chainClient = chainClient

	reconciler := NewReconciler(provider, chainClient, 120)
	reconciler.httpClient = server.Client()

	return reconciler, provider, server
}

// ---------------------------------------------------------------------------
// NewReconciler
// ---------------------------------------------------------------------------

func TestNewReconciler_DefaultInterval(t *testing.T) {
	cfg := DefaultConfig()
	provider := NewProvider(cfg)
	cc := &ChainClient{cfg: cfg, address: "claw1addr"}

	r := NewReconciler(provider, cc, 0)
	assert.Equal(t, 120*time.Second, r.interval, "interval should default to 120s when <= 0")

	r2 := NewReconciler(provider, cc, -5)
	assert.Equal(t, 120*time.Second, r2.interval, "interval should default to 120s when negative")
}

func TestNewReconciler_CustomInterval(t *testing.T) {
	cfg := DefaultConfig()
	provider := NewProvider(cfg)
	cc := &ChainClient{cfg: cfg, address: "claw1addr"}

	r := NewReconciler(provider, cc, 60)
	assert.Equal(t, 60*time.Second, r.interval)
}

// ---------------------------------------------------------------------------
// Orphan detection
// ---------------------------------------------------------------------------

func TestReconcilerOrphanDetection(t *testing.T) {
	// Simulate a job that is "running" on-chain but NOT tracked locally.
	// SubmittedAt is more than 30 minutes ago so it should be marked failed.
	submittedAt := time.Now().Unix() - 31*60

	var statusUpdateReceived bool
	var updatedStatus string
	var updatedResult string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			// Return a single running job that the provider does not track.
			resp := map[string]interface{}{
				"jobs": []map[string]interface{}{
					{
						"id":           42,
						"resource_id":  1,
						"status":       "running",
						"submitted_at": submittedAt,
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)

		case "/clawchain/marketplace/v1/compute/job/status":
			// Capture the status update.
			var body map[string]interface{}
			json.NewDecoder(r.Body).Decode(&body)
			updatedStatus, _ = body["status"].(string)
			updatedResult, _ = body["result"].(string)
			statusUpdateReceived = true
			w.WriteHeader(http.StatusOK)

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	reconciler, _, server := newTestReconciler(t, handler)
	defer server.Close()

	ctx := context.Background()
	err := reconciler.reconcile(ctx)
	require.NoError(t, err)

	// The reconciler should have detected the orphan and marked it failed.
	assert.True(t, statusUpdateReceived, "expected status update for orphaned job")
	assert.Equal(t, "failed", updatedStatus)
	assert.Contains(t, updatedResult, "reconciler cleanup")
}

func TestReconcilerOrphanDetection_RecentJob(t *testing.T) {
	// A job submitted only 5 minutes ago should be re-queued, not marked failed.
	submittedAt := time.Now().Unix() - 5*60

	var fetchTriggered bool

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			query := r.URL.Query()
			// If the request includes status=pending, it's a FetchAndExecuteJobs
			// call (re-queue path).
			if query.Get("status") == "pending" {
				fetchTriggered = true
				resp := map[string]interface{}{"jobs": []interface{}{}}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(resp)
				return
			}

			resp := map[string]interface{}{
				"jobs": []map[string]interface{}{
					{
						"id":           99,
						"resource_id":  1,
						"status":       "running",
						"submitted_at": submittedAt,
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)

		default:
			w.WriteHeader(http.StatusOK)
		}
	})

	reconciler, _, server := newTestReconciler(t, handler)
	defer server.Close()

	ctx := context.Background()
	err := reconciler.reconcile(ctx)
	require.NoError(t, err)

	// Give the goroutine a moment to fire.
	time.Sleep(100 * time.Millisecond)

	assert.True(t, fetchTriggered, "expected FetchAndExecuteJobs to be called for recent orphan")
}

// ---------------------------------------------------------------------------
// Stale cleanup: local job already completed on-chain
// ---------------------------------------------------------------------------

func TestReconcilerStaleCleanup(t *testing.T) {
	// Provider is tracking job 10 locally, but on-chain it's "completed".
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/clawchain/marketplace/v1/compute/jobs":
			resp := map[string]interface{}{
				"jobs": []map[string]interface{}{
					{
						"id":           10,
						"resource_id":  1,
						"status":       "completed",
						"submitted_at": time.Now().Unix() - 600,
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)

		default:
			w.WriteHeader(http.StatusOK)
		}
	})

	reconciler, provider, server := newTestReconciler(t, handler)
	defer server.Close()

	// Simulate the provider tracking this job locally.
	provider.activeJobs.Store(uint64(10), true)
	atomic.StoreInt32(&provider.jobCount, 1)

	ctx := context.Background()
	err := reconciler.reconcile(ctx)
	require.NoError(t, err)

	// The locally tracked job should have been cleaned up.
	_, exists := provider.activeJobs.Load(uint64(10))
	assert.False(t, exists, "job 10 should be removed from activeJobs")
	assert.Equal(t, int32(0), atomic.LoadInt32(&provider.jobCount), "jobCount should be decremented")
}

func TestReconcilerStaleCleanup_FailedOnChain(t *testing.T) {
	// Same as above but on-chain status is "failed".
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"jobs": []map[string]interface{}{
				{
					"id":           20,
					"resource_id":  1,
					"status":       "failed",
					"submitted_at": time.Now().Unix() - 300,
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	reconciler, provider, server := newTestReconciler(t, handler)
	defer server.Close()

	provider.activeJobs.Store(uint64(20), true)
	atomic.StoreInt32(&provider.jobCount, 1)

	err := reconciler.reconcile(context.Background())
	require.NoError(t, err)

	_, exists := provider.activeJobs.Load(uint64(20))
	assert.False(t, exists, "job 20 should be removed from activeJobs")
	assert.Equal(t, int32(0), atomic.LoadInt32(&provider.jobCount))
}

// ---------------------------------------------------------------------------
// Stale pending job detection
// ---------------------------------------------------------------------------

func TestReconcilerStalePendingJob(t *testing.T) {
	// A job that has been pending for over 10 minutes should trigger pickup.
	submittedAt := time.Now().Unix() - 11*60

	var fetchTriggered bool

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		if query.Get("status") == "pending" {
			fetchTriggered = true
			resp := map[string]interface{}{"jobs": []interface{}{}}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}

		resp := map[string]interface{}{
			"jobs": []map[string]interface{}{
				{
					"id":           55,
					"resource_id":  1,
					"status":       "pending",
					"submitted_at": submittedAt,
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	reconciler, _, server := newTestReconciler(t, handler)
	defer server.Close()

	err := reconciler.reconcile(context.Background())
	require.NoError(t, err)

	time.Sleep(100 * time.Millisecond)
	assert.True(t, fetchTriggered, "expected FetchAndExecuteJobs for stale pending job")
}

// ---------------------------------------------------------------------------
// No-op when everything is in sync
// ---------------------------------------------------------------------------

func TestReconcilerInSync(t *testing.T) {
	// On-chain shows job 7 running, and provider is tracking it locally. No
	// cleanup or orphan detection should occur.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"jobs": []map[string]interface{}{
				{
					"id":           7,
					"resource_id":  1,
					"status":       "running",
					"submitted_at": time.Now().Unix() - 60,
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	reconciler, provider, server := newTestReconciler(t, handler)
	defer server.Close()

	provider.activeJobs.Store(uint64(7), true)
	atomic.StoreInt32(&provider.jobCount, 1)

	err := reconciler.reconcile(context.Background())
	require.NoError(t, err)

	// Job should still be tracked.
	_, exists := provider.activeJobs.Load(uint64(7))
	assert.True(t, exists, "job 7 should still be tracked")
	assert.Equal(t, int32(1), atomic.LoadInt32(&provider.jobCount))
}

// ---------------------------------------------------------------------------
// HTTP error handling
// ---------------------------------------------------------------------------

func TestReconcilerFetchError(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	})

	reconciler, _, server := newTestReconciler(t, handler)
	defer server.Close()

	err := reconciler.reconcile(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "HTTP 500")
}

// ---------------------------------------------------------------------------
// Run loop respects context cancellation
// ---------------------------------------------------------------------------

func TestReconcilerRunShutdown(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{"jobs": []interface{}{}}
		json.NewEncoder(w).Encode(resp)
	})

	reconciler, _, server := newTestReconciler(t, handler)
	defer server.Close()

	// Use a very short interval so we can test the loop.
	reconciler.interval = 50 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		reconciler.Run(ctx)
		close(done)
	}()

	// Let it tick at least once.
	time.Sleep(150 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// Good — Run returned.
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not shut down within 2 seconds")
	}
}

// ---------------------------------------------------------------------------
// Cleanup of locally tracked job that no longer exists on-chain
// ---------------------------------------------------------------------------

func TestReconcilerLocalJobNotOnChain(t *testing.T) {
	// Provider tracks job 30 locally, but chain returns no jobs at all.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{"jobs": []interface{}{}}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	reconciler, provider, server := newTestReconciler(t, handler)
	defer server.Close()

	provider.activeJobs.Store(uint64(30), true)
	atomic.StoreInt32(&provider.jobCount, 1)

	err := reconciler.reconcile(context.Background())
	require.NoError(t, err)

	_, exists := provider.activeJobs.Load(uint64(30))
	assert.False(t, exists, "job 30 should be cleaned up — not on-chain")
	assert.Equal(t, int32(0), atomic.LoadInt32(&provider.jobCount))
}
