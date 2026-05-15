package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"time"
)

// JobScore holds a compute job and its calculated priority score.
type JobScore struct {
	Job   ComputeJob
	Score float64
}

// Scheduler scores and ranks pending jobs so the provider picks the highest-value
// work first instead of FIFO. Scoring considers:
//   - Wait time (older jobs score higher to prevent starvation)
//   - GPU utilization match (jobs matching our GPU type score higher)
//   - Lease value (higher-value leases score higher)
type Scheduler struct {
	providerGPU string // GPU model this provider offers
	chainREST   string
	providerAddr string
}

// NewScheduler creates a job scheduler for the given provider config.
func NewScheduler(cfg Config, gpuModel string) *Scheduler {
	return &Scheduler{
		providerGPU:  gpuModel,
		chainREST:    cfg.ChainREST,
		providerAddr: cfg.ProviderAddress,
	}
}

// RankJobs scores and sorts pending jobs by priority (highest first).
func (s *Scheduler) RankJobs(jobs []ComputeJob) []ComputeJob {
	if len(jobs) <= 1 {
		return jobs
	}

	now := time.Now().Unix()
	scored := make([]JobScore, 0, len(jobs))

	for _, job := range jobs {
		score := s.scoreJob(job, now)
		scored = append(scored, JobScore{Job: job, Score: score})
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})

	ranked := make([]ComputeJob, len(scored))
	for i, s := range scored {
		ranked[i] = s.Job
	}

	if len(ranked) > 1 {
		log.Printf("[Scheduler] Ranked %d jobs — top: job_%d (score=%.1f), bottom: job_%d (score=%.1f)",
			len(ranked), ranked[0].Id, scored[0].Score, ranked[len(ranked)-1].Id, scored[len(scored)-1].Score)
	}

	return ranked
}

// scoreJob calculates a priority score for a single job.
// Higher score = higher priority.
func (s *Scheduler) scoreJob(job ComputeJob, nowUnix int64) float64 {
	var score float64

	// 1. Wait time bonus: +1 point per minute waiting, capped at 60.
	// Prevents starvation of old jobs.
	if job.SubmittedAt > 0 {
		waitSec := nowUnix - job.SubmittedAt
		if waitSec < 0 {
			waitSec = 0
		}
		waitMin := float64(waitSec) / 60.0
		score += math.Min(waitMin, 60.0)
	}

	// 2. GPU type match bonus: +20 if the job's requested GPU matches ours.
	if s.providerGPU != "" && job.GpuType != "" && job.GpuType == s.providerGPU {
		score += 20.0
	}

	// 3. Execution type preference: docker jobs are sandboxed and safer.
	if job.ExecutionType == "docker" {
		score += 5.0
	}

	// 4. Job type weights: AI training and inference are higher value.
	switch job.JobType {
	case "ai-training":
		score += 15.0
	case "inference":
		score += 10.0
	case "rendering":
		score += 8.0
	default:
		score += 3.0
	}

	// 5. Small GPU count preference: jobs that use fewer GPUs are faster to
	// complete, increasing throughput. +5 for single-GPU, decreasing.
	if job.GpuCount > 0 {
		gpuPenalty := float64(job.GpuCount-1) * 2.0
		score += math.Max(0, 5.0-gpuPenalty)
	}

	return score
}

// FetchAndRankJobs fetches pending jobs from the chain and returns them ranked
// by priority score. This replaces the simple fetchPendingJobs for scheduling.
func (s *Scheduler) FetchAndRankJobs() ([]ComputeJob, error) {
	url := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/jobs?address=%s&status=pending",
		s.chainREST, s.providerAddr)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch pending jobs: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Jobs []ComputeJob `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode jobs response: %w", err)
	}

	return s.RankJobs(result.Jobs), nil
}
