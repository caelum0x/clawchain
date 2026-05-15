package load

import (
	"math"
	"strings"
	"testing"
	"time"
)

// ============================================================================
// Unit tests for LoadResult utility functions.
// These run without a chain: go test ./tests/load/...
// ============================================================================

func makeResult(latenciesMs []int, failures int) *LoadResult {
	lats := make([]time.Duration, len(latenciesMs))
	for i, ms := range latenciesMs {
		lats[i] = time.Duration(ms) * time.Millisecond
	}
	total := len(latenciesMs)
	return &LoadResult{
		TotalRequests: total,
		Successes:     total - failures,
		Failures:      failures,
		Duration:      10 * time.Second,
		Latencies:     lats,
	}
}

func TestP50Calculation(t *testing.T) {
	tests := []struct {
		name        string
		latenciesMs []int
		wantMs      int
	}{
		{
			name:        "odd count",
			latenciesMs: []int{10, 20, 30, 40, 50},
			wantMs:      30,
		},
		{
			name:        "even count",
			latenciesMs: []int{10, 20, 30, 40, 50, 60},
			wantMs:      30,
		},
		{
			name:        "single element",
			latenciesMs: []int{100},
			wantMs:      100,
		},
		{
			name:        "two elements",
			latenciesMs: []int{10, 90},
			wantMs:      10,
		},
		{
			name:        "unsorted input",
			latenciesMs: []int{50, 10, 40, 20, 30},
			wantMs:      30,
		},
		{
			name:        "empty",
			latenciesMs: []int{},
			wantMs:      0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := makeResult(tc.latenciesMs, 0)
			got := r.P50()
			want := time.Duration(tc.wantMs) * time.Millisecond
			if got != want {
				t.Errorf("P50() = %v, want %v", got, want)
			}
		})
	}
}

func TestP95Calculation(t *testing.T) {
	tests := []struct {
		name        string
		latenciesMs []int
		wantMs      int
	}{
		{
			name:        "100 elements",
			latenciesMs: seq(1, 100),
			wantMs:      95,
		},
		{
			name:        "20 elements",
			latenciesMs: seq(10, 20), // 10,20,...,200 — rank=ceil(0.95*20)=19 → 190
			wantMs:      190,
		},
		{
			name:        "5 elements",
			latenciesMs: []int{10, 20, 30, 40, 50},
			wantMs:      50,
		},
		{
			name:        "single element",
			latenciesMs: []int{42},
			wantMs:      42,
		},
		{
			name:        "empty",
			latenciesMs: []int{},
			wantMs:      0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := makeResult(tc.latenciesMs, 0)
			got := r.P95()
			want := time.Duration(tc.wantMs) * time.Millisecond
			if got != want {
				t.Errorf("P95() = %v, want %v", got, want)
			}
		})
	}
}

func TestP99Calculation(t *testing.T) {
	tests := []struct {
		name        string
		latenciesMs []int
		wantMs      int
	}{
		{
			name:        "100 elements",
			latenciesMs: seq(1, 100),
			wantMs:      99,
		},
		{
			name:        "200 elements",
			latenciesMs: seq(1, 200),
			wantMs:      198,
		},
		{
			name:        "10 elements",
			latenciesMs: []int{10, 20, 30, 40, 50, 60, 70, 80, 90, 100},
			wantMs:      100,
		},
		{
			name:        "single element",
			latenciesMs: []int{77},
			wantMs:      77,
		},
		{
			name:        "empty",
			latenciesMs: []int{},
			wantMs:      0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := makeResult(tc.latenciesMs, 0)
			got := r.P99()
			want := time.Duration(tc.wantMs) * time.Millisecond
			if got != want {
				t.Errorf("P99() = %v, want %v", got, want)
			}
		})
	}
}

func TestRequestsPerSec(t *testing.T) {
	tests := []struct {
		name     string
		total    int
		duration time.Duration
		wantRPS  float64
	}{
		{
			name:     "basic",
			total:    100,
			duration: 10 * time.Second,
			wantRPS:  10.0,
		},
		{
			name:     "high throughput",
			total:    5000,
			duration: 5 * time.Second,
			wantRPS:  1000.0,
		},
		{
			name:     "zero duration",
			total:    100,
			duration: 0,
			wantRPS:  0,
		},
		{
			name:     "zero requests",
			total:    0,
			duration: 10 * time.Second,
			wantRPS:  0,
		},
		{
			name:     "fractional second",
			total:    50,
			duration: 500 * time.Millisecond,
			wantRPS:  100.0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := &LoadResult{
				TotalRequests: tc.total,
				Successes:     tc.total,
				Duration:      tc.duration,
			}
			got := r.RequestsPerSec()
			if math.Abs(got-tc.wantRPS) > 0.01 {
				t.Errorf("RequestsPerSec() = %.2f, want %.2f", got, tc.wantRPS)
			}
		})
	}
}

func TestErrorRate(t *testing.T) {
	tests := []struct {
		name     string
		total    int
		failures int
		wantRate float64
	}{
		{
			name:     "no errors",
			total:    100,
			failures: 0,
			wantRate: 0.0,
		},
		{
			name:     "5 percent",
			total:    100,
			failures: 5,
			wantRate: 0.05,
		},
		{
			name:     "all failures",
			total:    50,
			failures: 50,
			wantRate: 1.0,
		},
		{
			name:     "zero requests",
			total:    0,
			failures: 0,
			wantRate: 0.0,
		},
		{
			name:     "one failure of one",
			total:    1,
			failures: 1,
			wantRate: 1.0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := &LoadResult{
				TotalRequests: tc.total,
				Successes:     tc.total - tc.failures,
				Failures:      tc.failures,
				Duration:      10 * time.Second,
			}
			got := r.ErrorRate()
			if math.Abs(got-tc.wantRate) > 0.0001 {
				t.Errorf("ErrorRate() = %.4f, want %.4f", got, tc.wantRate)
			}
		})
	}
}

func TestReportFormat(t *testing.T) {
	r := &LoadResult{
		TotalRequests: 4523,
		Successes:     4521,
		Failures:      2,
		Duration:      30 * time.Second,
		Latencies:     generateLatencies(4523),
	}

	report := r.Report("BlockQueries")

	// Verify the report contains key sections.
	requiredParts := []string{
		"=== Load Test: BlockQueries ===",
		"Workers:",
		"Duration:",
		"Requests:    4523",
		"RPS:",
		"Errors:",
		"Latency p50:",
		"Latency p95:",
		"Latency p99:",
	}

	for _, part := range requiredParts {
		if !strings.Contains(report, part) {
			t.Errorf("Report() missing expected part: %q\nGot:\n%s", part, report)
		}
	}

	// Verify the error count line shows "2".
	if !strings.Contains(report, "2 (0.04%)") {
		t.Errorf("Report() should show error count as '2 (0.04%%)'\nGot:\n%s", report)
	}
}

// ============================================================================
// Helpers
// ============================================================================

// seq generates a slice [start, start+step, start+2*step, ...] with n elements.
func seq(step, n int) []int {
	s := make([]int, n)
	for i := 0; i < n; i++ {
		s[i] = step * (i + 1)
	}
	return s
}

// generateLatencies creates a deterministic set of latencies for testing.
func generateLatencies(n int) []time.Duration {
	lats := make([]time.Duration, n)
	for i := 0; i < n; i++ {
		// Simulate a roughly normal-ish distribution: most fast, some slow.
		base := 30 + (i % 50)       // 30-79ms for most
		if i%100 == 0 {
			base = 200 + (i % 300)   // occasional slow ones
		}
		lats[i] = time.Duration(base) * time.Millisecond
	}
	return lats
}
