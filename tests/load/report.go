package load

import (
	"fmt"
	"sort"
	"time"
)

// ============================================================================
// LoadResult — metrics collector
// ============================================================================

// LoadResult captures metrics from a load test run.
type LoadResult struct {
	TotalRequests int
	Successes     int
	Failures      int
	Duration      time.Duration
	Latencies     []time.Duration
}

// RequestsPerSec returns the throughput in requests per second.
func (r *LoadResult) RequestsPerSec() float64 {
	if r.Duration <= 0 {
		return 0
	}
	return float64(r.TotalRequests) / r.Duration.Seconds()
}

// ErrorRate returns the fraction of requests that failed (0.0 to 1.0).
func (r *LoadResult) ErrorRate() float64 {
	if r.TotalRequests == 0 {
		return 0
	}
	return float64(r.Failures) / float64(r.TotalRequests)
}

// P50 returns the median latency.
func (r *LoadResult) P50() time.Duration {
	return r.percentile(50)
}

// P95 returns the 95th percentile latency.
func (r *LoadResult) P95() time.Duration {
	return r.percentile(95)
}

// P99 returns the 99th percentile latency.
func (r *LoadResult) P99() time.Duration {
	return r.percentile(99)
}

// percentile computes the p-th percentile from the latency distribution.
// Uses nearest-rank method.
func (r *LoadResult) percentile(p int) time.Duration {
	if len(r.Latencies) == 0 {
		return 0
	}
	sorted := make([]time.Duration, len(r.Latencies))
	copy(sorted, r.Latencies)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	// nearest-rank: index = ceil(p/100 * N) - 1
	rank := (p*len(sorted) + 99) / 100 // ceiling division
	if rank < 1 {
		rank = 1
	}
	if rank > len(sorted) {
		rank = len(sorted)
	}
	return sorted[rank-1]
}

// Report formats a human-readable load test report.
func (r *LoadResult) Report(name string) string {
	return fmt.Sprintf(`=== Load Test: %s ===
Workers:     %d
Duration:    %.1fs
Requests:    %d
RPS:         %.1f
Errors:      %d (%.2f%%)
Latency p50: %s
Latency p95: %s
Latency p99: %s`,
		name,
		reportWorkers,
		r.Duration.Seconds(),
		r.TotalRequests,
		r.RequestsPerSec(),
		r.Failures,
		r.ErrorRate()*100,
		formatLatency(r.P50()),
		formatLatency(r.P95()),
		formatLatency(r.P99()),
	)
}

func formatLatency(d time.Duration) string {
	if d < time.Millisecond {
		return fmt.Sprintf("%dus", d.Microseconds())
	}
	return fmt.Sprintf("%dms", d.Milliseconds())
}

// reportWorkers is set by the load test configuration at init time.
// For unit tests it defaults to 0.
var reportWorkers = 0

// ============================================================================
// Report — JSON output structures
// ============================================================================

// Report is the top-level JSON load test report written to load-test-report.json.
type Report struct {
	Timestamp string       `json:"timestamp"`
	Tests     []TestResult `json:"tests"`
}

// TestResult captures the outcome of a single load test.
type TestResult struct {
	Name     string  `json:"name"`
	Workers  int     `json:"workers"`
	Duration string  `json:"duration"`
	RPS      float64 `json:"rps"`
	P50ms    float64 `json:"p50_ms"`
	P95ms    float64 `json:"p95_ms"`
	P99ms    float64 `json:"p99_ms"`
	ErrorPct float64 `json:"error_pct"`
	Pass     bool    `json:"pass"`
}
