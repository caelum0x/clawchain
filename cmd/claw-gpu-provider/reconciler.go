package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// Reconciler compares on-chain job states with local provider state and
// resolves mismatches. It runs periodically to catch:
// 1. Jobs marked "running" on-chain but not tracked locally (crashed mid-execution)
// 2. Jobs completed locally but still "running" on-chain (failed status update)
// 3. Jobs assigned to provider but never started (missed event)
type Reconciler struct {
	provider    *Provider
	chainClient *ChainClient
	interval    time.Duration
	mu          sync.Mutex
	// httpClient is used to fetch jobs from the chain REST API. It can be
	// replaced in tests to point at an httptest server.
	httpClient *http.Client
}

// NewReconciler creates a Reconciler that checks for state drift every
// intervalSec seconds. If intervalSec <= 0 the default of 120 seconds is used.
func NewReconciler(provider *Provider, chainClient *ChainClient, intervalSec int) *Reconciler {
	if intervalSec <= 0 {
		intervalSec = 120
	}
	return &Reconciler{
		provider:    provider,
		chainClient: chainClient,
		interval:    time.Duration(intervalSec) * time.Second,
		httpClient:  http.DefaultClient,
	}
}

// Run starts the reconciliation ticker loop. It blocks until ctx is cancelled.
func (r *Reconciler) Run(ctx context.Context) {
	log.Printf("[Reconciler] Starting — interval=%v", r.interval)

	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Reconciler] Shutting down")
			return
		case <-ticker.C:
			if err := r.reconcile(ctx); err != nil {
				log.Printf("[Reconciler] Error: %v", err)
			}
		}
	}
}

// reconcile performs a single reconciliation pass comparing on-chain and local
// state for this provider's jobs.
func (r *Reconciler) reconcile(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 1. Fetch all on-chain jobs for this provider.
	jobs, err := r.fetchProviderJobs(ctx)
	if err != nil {
		return fmt.Errorf("fetch provider jobs: %w", err)
	}

	now := time.Now().Unix()

	var onChainRunning, onChainPending, orphans int

	// Build a set of on-chain job IDs and their statuses for the local cleanup step.
	onChainStatus := make(map[uint64]string, len(jobs))
	for _, job := range jobs {
		onChainStatus[job.Id] = job.Status
	}

	// 2. Compare on-chain jobs with local state.
	for _, job := range jobs {
		switch job.Status {
		case "running":
			onChainRunning++

			// Check if provider is tracking this job locally.
			if _, ok := r.provider.activeJobs.Load(job.Id); !ok {
				// Orphaned job — running on-chain but not tracked locally.
				orphans++
				log.Printf("[Reconciler] Orphaned job %d — running on-chain but not tracked locally", job.Id)

				if job.SubmittedAt > 0 && (now-job.SubmittedAt) > 30*60 {
					// Submitted more than 30 minutes ago — mark as failed.
					if err := r.provider.updateJobStatus(job.Id, "failed", "provider lost track of job — reconciler cleanup"); err != nil {
						log.Printf("[Reconciler] Failed to mark orphaned job %d as failed: %v", job.Id, err)
					}
				} else {
					// Recent job — re-queue it.
					go r.provider.FetchAndExecuteJobs(ctx)
				}
			}

		case "pending":
			onChainPending++

			if job.SubmittedAt > 0 && (now-job.SubmittedAt) > 10*60 {
				// Stale pending job — been pending for more than 10 minutes.
				if atomic.LoadInt32(&r.provider.jobCount) < int32(r.provider.cfg.MaxConcurrent) {
					log.Printf("[Reconciler] Stale pending job %d — triggering pickup", job.Id)
					go r.provider.FetchAndExecuteJobs(ctx)
				}
			}
		}
	}

	// 3. Check for stuck local jobs.
	var localActive int
	r.provider.activeJobs.Range(func(key, value interface{}) bool {
		localActive++
		jobId, ok := key.(uint64)
		if !ok {
			return true
		}

		status, exists := onChainStatus[jobId]
		if !exists {
			// Job no longer on-chain at all — clean up.
			r.provider.activeJobs.Delete(jobId)
			atomic.AddInt32(&r.provider.jobCount, -1)
			log.Printf("[Reconciler] Cleaned up locally tracked job %d — no longer on-chain", jobId)
			return true
		}

		if status == "completed" || status == "failed" {
			r.provider.activeJobs.Delete(jobId)
			atomic.AddInt32(&r.provider.jobCount, -1)
			log.Printf("[Reconciler] Cleaned up locally tracked job %d — already %s on-chain", jobId, status)
		}

		return true
	})

	// 4. Emit metrics summary.
	log.Printf("[Reconciler] Check complete — on-chain: %d running, %d pending; local: %d active; orphans: %d",
		onChainRunning, onChainPending, localActive, orphans)

	return nil
}

// fetchProviderJobs queries the chain REST API for all jobs assigned to this
// provider (regardless of status).
func (r *Reconciler) fetchProviderJobs(ctx context.Context) ([]ComputeJob, error) {
	url := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/jobs?address=%s",
		r.chainClient.cfg.ChainREST, r.chainClient.address)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		Jobs []ComputeJob `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return result.Jobs, nil
}
