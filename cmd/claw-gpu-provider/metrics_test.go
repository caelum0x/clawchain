package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	dto "github.com/prometheus/client_model/go"
)

// TestMetricsRegistered verifies that all expected metrics are registered in
// the default Prometheus registry.
func TestMetricsRegistered(t *testing.T) {
	// Gather all metrics from the default registry.
	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("failed to gather metrics: %v", err)
	}

	nameSet := make(map[string]bool, len(families))
	for _, fam := range families {
		nameSet[fam.GetName()] = true
	}

	expected := []string{
		"claw_gpu_provider_active_jobs",
		"claw_gpu_provider_jobs_total",
		"claw_gpu_provider_job_duration_seconds",
		"claw_gpu_provider_reconciler_runs_total",
		"claw_gpu_provider_reconciler_mismatches_total",
		"claw_gpu_provider_event_cursor_height",
		"claw_gpu_provider_scheduler_queue_size",
		"claw_gpu_provider_gpu_available",
	}

	for _, name := range expected {
		if !nameSet[name] {
			// Some metrics (counter vecs, gauge vecs) only appear after
			// first use. Touch them so they show up.
			switch name {
			case "claw_gpu_provider_jobs_total":
				JobsTotal.WithLabelValues("completed")
			case "claw_gpu_provider_gpu_available":
				GPUAvailable.WithLabelValues("test-gpu")
			}
		}
	}

	// Re-gather after touching lazy metrics.
	families, err = prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("failed to re-gather metrics: %v", err)
	}

	nameSet = make(map[string]bool, len(families))
	for _, fam := range families {
		nameSet[fam.GetName()] = true
	}

	for _, name := range expected {
		if !nameSet[name] {
			t.Errorf("expected metric %q not found in registry", name)
		}
	}
}

// TestCounterIncrements verifies that incrementing counters is reflected in
// the gathered metric values.
func TestCounterIncrements(t *testing.T) {
	// Increment job counters.
	JobsTotal.WithLabelValues("completed").Add(3)
	JobsTotal.WithLabelValues("failed").Add(1)
	JobsTotal.WithLabelValues("cancelled").Add(2)

	// Increment reconciler counters.
	ReconcilerRunsTotal.Add(5)
	ReconcilerMismatchesTotal.Add(2)

	// Set gauges.
	ActiveJobs.Set(4)
	EventCursorHeight.Set(12345)
	SchedulerQueueSize.Set(7)
	GPUAvailable.WithLabelValues("A100").Set(3)

	// Observe a histogram value.
	JobDurationSeconds.Observe(42.5)

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("failed to gather metrics: %v", err)
	}

	familyMap := make(map[string]*dto.MetricFamily, len(families))
	for _, fam := range families {
		familyMap[fam.GetName()] = fam
	}

	// Verify active jobs gauge.
	if fam, ok := familyMap["claw_gpu_provider_active_jobs"]; ok {
		val := fam.GetMetric()[0].GetGauge().GetValue()
		if val != 4 {
			t.Errorf("active_jobs: got %v, want 4", val)
		}
	} else {
		t.Error("claw_gpu_provider_active_jobs not found")
	}

	// Verify event cursor height gauge.
	if fam, ok := familyMap["claw_gpu_provider_event_cursor_height"]; ok {
		val := fam.GetMetric()[0].GetGauge().GetValue()
		if val != 12345 {
			t.Errorf("event_cursor_height: got %v, want 12345", val)
		}
	} else {
		t.Error("claw_gpu_provider_event_cursor_height not found")
	}

	// Verify scheduler queue size gauge.
	if fam, ok := familyMap["claw_gpu_provider_scheduler_queue_size"]; ok {
		val := fam.GetMetric()[0].GetGauge().GetValue()
		if val != 7 {
			t.Errorf("scheduler_queue_size: got %v, want 7", val)
		}
	} else {
		t.Error("claw_gpu_provider_scheduler_queue_size not found")
	}

	// Verify reconciler runs counter (additive — may include prior test state).
	if fam, ok := familyMap["claw_gpu_provider_reconciler_runs_total"]; ok {
		val := fam.GetMetric()[0].GetCounter().GetValue()
		if val < 5 {
			t.Errorf("reconciler_runs_total: got %v, want >= 5", val)
		}
	} else {
		t.Error("claw_gpu_provider_reconciler_runs_total not found")
	}

	// Verify reconciler mismatches counter.
	if fam, ok := familyMap["claw_gpu_provider_reconciler_mismatches_total"]; ok {
		val := fam.GetMetric()[0].GetCounter().GetValue()
		if val < 2 {
			t.Errorf("reconciler_mismatches_total: got %v, want >= 2", val)
		}
	} else {
		t.Error("claw_gpu_provider_reconciler_mismatches_total not found")
	}

	// Verify histogram has at least one observation.
	if fam, ok := familyMap["claw_gpu_provider_job_duration_seconds"]; ok {
		count := fam.GetMetric()[0].GetHistogram().GetSampleCount()
		if count < 1 {
			t.Errorf("job_duration_seconds sample count: got %v, want >= 1", count)
		}
	} else {
		t.Error("claw_gpu_provider_job_duration_seconds not found")
	}

	// Verify GPU available gauge vec.
	if fam, ok := familyMap["claw_gpu_provider_gpu_available"]; ok {
		found := false
		for _, m := range fam.GetMetric() {
			for _, lp := range m.GetLabel() {
				if lp.GetName() == "gpu_model" && lp.GetValue() == "A100" {
					found = true
					val := m.GetGauge().GetValue()
					if val != 3 {
						t.Errorf("gpu_available{gpu_model=A100}: got %v, want 3", val)
					}
				}
			}
		}
		if !found {
			t.Error("gpu_available metric with label gpu_model=A100 not found")
		}
	} else {
		t.Error("claw_gpu_provider_gpu_available not found")
	}
}

// TestHealthEndpoint verifies the /health endpoint returns HTTP 200 with "ok".
func TestHealthEndpoint(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	ts := httptest.NewServer(mux)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("health status: got %d, want %d", resp.StatusCode, http.StatusOK)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read health body: %v", err)
	}
	if string(body) != "ok" {
		t.Errorf("health body: got %q, want %q", string(body), "ok")
	}
}

// TestMetricsEndpointContent verifies that the /metrics endpoint returns
// Prometheus-formatted output containing our custom metrics.
func TestMetricsEndpointContent(t *testing.T) {
	// Ensure at least one value is set so the metric appears in output.
	ActiveJobs.Set(1)

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	ts := httptest.NewServer(mux)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/metrics")
	if err != nil {
		t.Fatalf("metrics request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("metrics status: got %d, want %d", resp.StatusCode, http.StatusOK)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read metrics body: %v", err)
	}

	content := string(body)
	expectedSubstrings := []string{
		"claw_gpu_provider_active_jobs",
		"claw_gpu_provider_jobs_total",
		"claw_gpu_provider_job_duration_seconds",
		"claw_gpu_provider_reconciler_runs_total",
		"claw_gpu_provider_reconciler_mismatches_total",
		"claw_gpu_provider_event_cursor_height",
		"claw_gpu_provider_scheduler_queue_size",
	}

	for _, sub := range expectedSubstrings {
		if !strings.Contains(content, sub) {
			t.Errorf("metrics output missing %q", sub)
		}
	}
}
