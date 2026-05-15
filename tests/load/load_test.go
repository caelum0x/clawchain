//go:build load

package load

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"
)

// ============================================================================
// Configuration
// ============================================================================

var (
	chainREST  = envOr("CHAIN_REST", "http://localhost:1317")
	chainRPC   = envOr("CHAIN_RPC", "http://localhost:26657")
	numWorkers = envOrInt("LOAD_WORKERS", 10)
	duration   = envOrDuration("LOAD_DURATION", 30*time.Second)
)

func init() {
	// Expose numWorkers to the report formatter in report.go.
	reportWorkers = numWorkers
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return fallback
}

func envOrDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		d, err := time.ParseDuration(v)
		if err == nil {
			return d
		}
	}
	return fallback
}

// ============================================================================
// HTTP helpers
// ============================================================================

var httpClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        200,
		MaxIdleConnsPerHost: 200,
		IdleConnTimeout:     90 * time.Second,
	},
}

// doGet performs an HTTP GET and returns the status code and any error.
// The response body is read and discarded to allow connection reuse.
func doGet(url string) (int, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 400 {
		return resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return resp.StatusCode, nil
}

// ============================================================================
// runLoadTest — generic concurrent load driver
// ============================================================================

// queryFunc is a function that performs a single query operation.
// It returns an error if the operation failed.
type queryFunc func() error

// runLoadTest runs fn concurrently with the specified number of workers for
// the given duration, collecting latency metrics into a LoadResult.
func runLoadTest(workers int, dur time.Duration, fn queryFunc) *LoadResult {
	var (
		mu        sync.Mutex
		latencies []time.Duration
		successes int
		failures  int
	)

	ctx, cancel := context.WithTimeout(context.Background(), dur)
	defer cancel()

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}
				start := time.Now()
				err := fn()
				elapsed := time.Since(start)

				mu.Lock()
				latencies = append(latencies, elapsed)
				if err != nil {
					failures++
				} else {
					successes++
				}
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

	return &LoadResult{
		TotalRequests: successes + failures,
		Successes:     successes,
		Failures:      failures,
		Duration:      dur,
		Latencies:     latencies,
	}
}

// ============================================================================
// Test 1: TestLoadBlockQueries
// ============================================================================

func TestLoadBlockQueries(t *testing.T) {
	url := chainRPC + "/block"

	result := runLoadTest(numWorkers, duration, func() error {
		_, err := doGet(url)
		return err
	})

	t.Log("\n" + result.Report("BlockQueries"))

	if result.ErrorRate() >= 0.05 {
		t.Errorf("error rate %.2f%% exceeds 5%% threshold", result.ErrorRate()*100)
	}
	if result.P99() >= 2*time.Second {
		t.Errorf("p99 latency %s exceeds 2s threshold", result.P99())
	}

	writeTestResult(t, "BlockQueries", result)
}

// ============================================================================
// Test 2: TestLoadTxQueries
// ============================================================================

func TestLoadTxQueries(t *testing.T) {
	url := chainRPC + "/tx_search?query=%22tx.height>0%22&per_page=10"

	result := runLoadTest(numWorkers, duration, func() error {
		_, err := doGet(url)
		return err
	})

	t.Log("\n" + result.Report("TxQueries"))

	if result.ErrorRate() >= 0.05 {
		t.Errorf("error rate %.2f%% exceeds 5%% threshold", result.ErrorRate()*100)
	}

	writeTestResult(t, "TxQueries", result)
}

// ============================================================================
// Test 3: TestLoadAccountQueries
// ============================================================================

func TestLoadAccountQueries(t *testing.T) {
	// Generate a pool of account addresses to query.
	// Some will exist, some won't — that's expected.
	accounts := []string{
		"cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
		"cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a",
		"cosmos1w3jzm7u06lhyj5czmjn5xh4rp9rwpghkxmjrq",
		"cosmos1x8fhpj9nmhqk8n9kx8wdm7l4w9dj5f8z3u9qy",
		"cosmos1y9rf5c7eflmz6lmaa8hkjfq6th2ct9n2g3nft5",
	}

	result := runLoadTest(numWorkers, duration, func() error {
		acc := accounts[rand.Intn(len(accounts))]
		url := chainREST + "/cosmos/auth/v1beta1/accounts/" + acc
		_, err := doGet(url)
		return err
	})

	t.Log("\n" + result.Report("AccountQueries"))

	// Higher threshold: some accounts won't exist.
	if result.ErrorRate() >= 0.10 {
		t.Errorf("error rate %.2f%% exceeds 10%% threshold", result.ErrorRate()*100)
	}

	writeTestResult(t, "AccountQueries", result)
}

// ============================================================================
// Test 4: TestLoadValidatorQueries
// ============================================================================

func TestLoadValidatorQueries(t *testing.T) {
	url := chainREST + "/cosmos/staking/v1beta1/validators"

	result := runLoadTest(numWorkers, duration, func() error {
		_, err := doGet(url)
		return err
	})

	t.Log("\n" + result.Report("ValidatorQueries"))

	if result.P99() >= 3*time.Second {
		t.Errorf("p99 latency %s exceeds 3s threshold", result.P99())
	}

	writeTestResult(t, "ValidatorQueries", result)
}

// ============================================================================
// Test 5: TestLoadAgentQueries
// ============================================================================

func TestLoadAgentQueries(t *testing.T) {
	url := chainREST + "/clawchain/agent/v1/agents"

	result := runLoadTest(numWorkers, duration, func() error {
		_, err := doGet(url)
		return err
	})

	t.Log("\n" + result.Report("AgentQueries"))

	writeTestResult(t, "AgentQueries", result)
}

// ============================================================================
// Test 6: TestLoadMixedWorkload
// ============================================================================

func TestLoadMixedWorkload(t *testing.T) {
	type weightedQuery struct {
		name   string
		weight int // cumulative weight out of 100
		fn     queryFunc
	}

	accounts := []string{
		"cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
		"cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a",
	}

	queries := []weightedQuery{
		{
			name:   "block",
			weight: 40,
			fn: func() error {
				_, err := doGet(chainRPC + "/block")
				return err
			},
		},
		{
			name:   "tx",
			weight: 70, // 40 + 30
			fn: func() error {
				_, err := doGet(chainRPC + "/tx_search?query=%22tx.height>0%22&per_page=10")
				return err
			},
		},
		{
			name:   "account",
			weight: 90, // 70 + 20
			fn: func() error {
				acc := accounts[rand.Intn(len(accounts))]
				_, err := doGet(chainREST + "/cosmos/auth/v1beta1/accounts/" + acc)
				return err
			},
		},
		{
			name:   "validator",
			weight: 100, // 90 + 10
			fn: func() error {
				_, err := doGet(chainREST + "/cosmos/staking/v1beta1/validators")
				return err
			},
		},
	}

	result := runLoadTest(numWorkers, duration, func() error {
		roll := rand.Intn(100) + 1
		for _, q := range queries {
			if roll <= q.weight {
				return q.fn()
			}
		}
		// Should not reach here, but fallback to block query.
		_, err := doGet(chainRPC + "/block")
		return err
	})

	t.Log("\n" + result.Report("MixedWorkload"))

	writeTestResult(t, "MixedWorkload", result)
}

// ============================================================================
// Test 7: TestLoadBurstTraffic
// ============================================================================

func TestLoadBurstTraffic(t *testing.T) {
	const burstSize = 100
	url := chainRPC + "/block"

	var (
		mu        sync.Mutex
		latencies []time.Duration
		successes int
		failures  int
	)

	start := time.Now()
	var wg sync.WaitGroup

	for i := 0; i < burstSize; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reqStart := time.Now()
			_, err := doGet(url)
			elapsed := time.Since(reqStart)

			mu.Lock()
			latencies = append(latencies, elapsed)
			if err != nil {
				failures++
			} else {
				successes++
			}
			mu.Unlock()
		}()
	}

	wg.Wait()
	totalDuration := time.Since(start)

	result := &LoadResult{
		TotalRequests: successes + failures,
		Successes:     successes,
		Failures:      failures,
		Duration:      totalDuration,
		Latencies:     latencies,
	}

	t.Log("\n" + result.Report("BurstTraffic"))

	// The chain should handle a burst of 100 without rate-limiting errors.
	if result.Failures > 0 {
		t.Errorf("burst traffic produced %d errors out of %d requests; chain should handle 100 concurrent requests",
			result.Failures, result.TotalRequests)
	}

	// Burst should complete reasonably quickly.
	if totalDuration > 10*time.Second {
		t.Errorf("burst took %s, expected to complete within 10s", totalDuration)
	}

	writeTestResult(t, "BurstTraffic", result)
}

// ============================================================================
// writeTestResult — persist individual test results for the aggregate report
// ============================================================================

// testResults collects results across all tests for the final JSON report.
var (
	testResultsMu sync.Mutex
	testResults   []TestResult
)

func writeTestResult(t *testing.T, name string, r *LoadResult) {
	t.Helper()

	tr := TestResult{
		Name:     name,
		Workers:  numWorkers,
		Duration: r.Duration.String(),
		RPS:      r.RequestsPerSec(),
		P50ms:    float64(r.P50().Microseconds()) / 1000.0,
		P95ms:    float64(r.P95().Microseconds()) / 1000.0,
		P99ms:    float64(r.P99().Microseconds()) / 1000.0,
		ErrorPct: r.ErrorRate() * 100,
		Pass:     !t.Failed(),
	}

	testResultsMu.Lock()
	testResults = append(testResults, tr)
	testResultsMu.Unlock()
}

// TestMain runs after all tests and writes the aggregate JSON report.
func TestMain(m *testing.M) {
	code := m.Run()

	// Write the aggregate report.
	testResultsMu.Lock()
	results := make([]TestResult, len(testResults))
	copy(results, testResults)
	testResultsMu.Unlock()

	if len(results) > 0 {
		report := Report{
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Tests:     results,
		}
		data, err := json.MarshalIndent(report, "", "  ")
		if err == nil {
			_ = os.WriteFile("load-test-report.json", data, 0644)
		}
	}

	os.Exit(code)
}
