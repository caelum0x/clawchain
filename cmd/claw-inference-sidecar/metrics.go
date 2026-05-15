package main

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Prometheus metrics for the inference sidecar.
var (
	// jobsTotal counts completed, failed, and timed-out inference jobs.
	jobsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sidecar_jobs_total",
		Help: "Total inference jobs processed, partitioned by outcome.",
	}, []string{"status"})

	// jobDuration tracks how long each inference job takes end-to-end.
	jobDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "sidecar_job_duration_seconds",
		Help:    "Histogram of inference job durations in seconds.",
		Buckets: prometheus.DefBuckets,
	})

	// activeJobs is the number of inference jobs currently in progress.
	activeJobs = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "sidecar_active_jobs",
		Help: "Number of inference jobs currently being processed.",
	})

	// runtimeErrors counts errors returned by the model runtime.
	runtimeErrors = promauto.NewCounter(prometheus.CounterOpts{
		Name: "sidecar_runtime_errors_total",
		Help: "Total errors received from the model runtime.",
	})

	// txBroadcastTotal counts transaction broadcasts partitioned by success/fail.
	txBroadcastTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sidecar_tx_broadcast_total",
		Help: "Total transaction broadcasts to the chain.",
	}, []string{"status"})
)

// observeJobDuration returns a function that, when called, records the elapsed
// time since the returned observer was created.
func observeJobDuration() func() {
	start := time.Now()
	return func() {
		jobDuration.Observe(time.Since(start).Seconds())
	}
}

// serveMetrics starts a Prometheus metrics HTTP server on the given address.
// It blocks until the server returns an error. The caller should run this in
// a goroutine.
func serveMetrics(addr string) error {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	return srv.ListenAndServe()
}
