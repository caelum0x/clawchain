package main

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Prometheus metrics for the GPU provider daemon.
var (
	// ActiveJobs tracks the number of currently active jobs.
	ActiveJobs = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "claw_gpu_provider_active_jobs",
		Help: "Number of currently active jobs",
	})

	// JobsTotal counts the total number of jobs by status.
	JobsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "claw_gpu_provider_jobs_total",
		Help: "Total number of jobs by final status",
	}, []string{"status"})

	// JobDurationSeconds observes job execution duration.
	JobDurationSeconds = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "claw_gpu_provider_job_duration_seconds",
		Help:    "Duration of job execution in seconds",
		Buckets: []float64{1, 5, 15, 30, 60, 300, 600, 1800, 3600},
	})

	// ReconcilerRunsTotal counts reconciler execution cycles.
	ReconcilerRunsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "claw_gpu_provider_reconciler_runs_total",
		Help: "Total number of reconciler runs",
	})

	// ReconcilerMismatchesTotal counts state mismatches detected by the reconciler.
	ReconcilerMismatchesTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "claw_gpu_provider_reconciler_mismatches_total",
		Help: "Total number of state mismatches found by the reconciler",
	})

	// EventCursorHeight tracks the latest processed block height.
	EventCursorHeight = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "claw_gpu_provider_event_cursor_height",
		Help: "Latest processed block height from the event cursor",
	})

	// SchedulerQueueSize tracks the number of jobs in the scheduler queue.
	SchedulerQueueSize = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "claw_gpu_provider_scheduler_queue_size",
		Help: "Number of jobs currently in the scheduler queue",
	})

	// GPUAvailable tracks available GPUs by model.
	GPUAvailable = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "claw_gpu_provider_gpu_available",
		Help: "Number of available GPUs by model",
	}, []string{"gpu_model"})
)

// StartMetricsServer launches an HTTP server exposing Prometheus metrics at
// /metrics and a health check at /health. It runs in a background goroutine
// and listens on the given addr (e.g. ":9090").
func StartMetricsServer(addr string) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	go http.ListenAndServe(addr, mux)
}
