package main

import (
	"testing"
	"time"
)

func TestSchedulerRankJobs(t *testing.T) {
	s := &Scheduler{providerGPU: "NVIDIA A100"}
	now := time.Now().Unix()

	jobs := []ComputeJob{
		{Id: 1, GpuType: "RTX 4090", JobType: "general", ExecutionType: "script", GpuCount: 1, SubmittedAt: now},
		{Id: 2, GpuType: "NVIDIA A100", JobType: "ai-training", ExecutionType: "docker", GpuCount: 1, SubmittedAt: now - 600},
		{Id: 3, GpuType: "NVIDIA A100", JobType: "inference", ExecutionType: "docker", GpuCount: 2, SubmittedAt: now - 300},
	}

	ranked := s.RankJobs(jobs)

	if len(ranked) != 3 {
		t.Fatalf("expected 3 ranked jobs, got %d", len(ranked))
	}

	// Job 2 should rank first: GPU match (+20), ai-training (+15), docker (+5),
	// 10 min wait (+10), single GPU (+5) = 55
	if ranked[0].Id != 2 {
		t.Errorf("expected job 2 first (highest score), got job %d", ranked[0].Id)
	}

	// Job 3 should rank second: GPU match (+20), inference (+10), docker (+5),
	// 5 min wait (+5), 2 GPUs (+3) = 43
	if ranked[1].Id != 3 {
		t.Errorf("expected job 3 second, got job %d", ranked[1].Id)
	}

	// Job 1 should rank last: no GPU match, general (+3), script, 0 wait, single GPU (+5) = 8
	if ranked[2].Id != 1 {
		t.Errorf("expected job 1 last (lowest score), got job %d", ranked[2].Id)
	}
}

func TestSchedulerSingleJob(t *testing.T) {
	s := &Scheduler{providerGPU: "RTX 4090"}
	jobs := []ComputeJob{{Id: 42, GpuType: "RTX 4090", JobType: "inference", GpuCount: 1}}

	ranked := s.RankJobs(jobs)
	if len(ranked) != 1 || ranked[0].Id != 42 {
		t.Errorf("single job should pass through unchanged")
	}
}

func TestSchedulerEmptyJobs(t *testing.T) {
	s := &Scheduler{providerGPU: "RTX 4090"}
	ranked := s.RankJobs(nil)
	if len(ranked) != 0 {
		t.Errorf("expected empty result for nil input")
	}
}

func TestSchedulerWaitTimeStarvationPrevention(t *testing.T) {
	s := &Scheduler{providerGPU: "NVIDIA A100"}
	now := time.Now().Unix()

	// Old low-priority job vs new high-priority job.
	jobs := []ComputeJob{
		{Id: 1, GpuType: "RTX 4090", JobType: "general", ExecutionType: "script", GpuCount: 4, SubmittedAt: now - 3600}, // 60 min old
		{Id: 2, GpuType: "NVIDIA A100", JobType: "ai-training", ExecutionType: "docker", GpuCount: 1, SubmittedAt: now}, // brand new
	}

	ranked := s.RankJobs(jobs)

	// The old job has 60 min wait bonus (+60) + general (+3) = 63
	// The new job has GPU match (+20) + ai-training (+15) + docker (+5) + single GPU (+5) = 45
	// Old job should win due to starvation prevention.
	if ranked[0].Id != 1 {
		t.Errorf("expected old job to rank first due to wait time, got job %d", ranked[0].Id)
	}
}
