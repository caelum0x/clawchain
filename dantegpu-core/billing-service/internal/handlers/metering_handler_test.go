package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dante-gpu/dante-backend/billing-service/internal/metering"
)

// newTestMeteringHandler creates a MeteringHandler with an in-memory store and
// a fresh Meter for testing.
func newTestMeteringHandler() (*MeteringHandler, *metering.Meter, *metering.UsageStore) {
	meter := metering.NewMeter()
	store := metering.NewUsageStore("") // in-memory only
	priceMap := map[string]int64{
		"A100": 500_000, // 500 000 uclaw per GPU-hour
		"H100": 800_000,
	}
	h := NewMeteringHandler(meter, store, priceMap)
	return h, meter, store
}

func setupServer(h *MeteringHandler) *httptest.Server {
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	return httptest.NewServer(mux)
}

// ---------- GET /api/v1/usage/{jobId} ----------

func TestGetJobUsage_NotFound(t *testing.T) {
	h, _, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/usage/unknown-job-123")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}

	var body map[string]string
	json.NewDecoder(resp.Body).Decode(&body)
	if body["error"] == "" {
		t.Fatal("expected error message in response body")
	}
}

func TestGetJobUsage_Active(t *testing.T) {
	h, meter, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	meter.StartMeter("job-active-1", "prov-1", "A100", 2)

	resp, err := http.Get(srv.URL + "/api/v1/usage/job-active-1")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var rec metering.UsageRecord
	json.NewDecoder(resp.Body).Decode(&rec)

	if rec.JobID != "job-active-1" {
		t.Fatalf("expected job_id=job-active-1, got %s", rec.JobID)
	}
	if rec.ProviderID != "prov-1" {
		t.Fatalf("expected provider_id=prov-1, got %s", rec.ProviderID)
	}
	if rec.GPUCount != 2 {
		t.Fatalf("expected gpu_count=2, got %d", rec.GPUCount)
	}
}

func TestGetJobUsage_Completed(t *testing.T) {
	h, meter, store := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	// Start and stop a meter so a completed record exists.
	meter.StartMeter("job-done-1", "prov-2", "H100", 4)
	record, err := meter.StopMeter("job-done-1")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SaveUsage(record); err != nil {
		t.Fatal(err)
	}

	resp, err := http.Get(srv.URL + "/api/v1/usage/job-done-1")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var rec metering.UsageRecord
	json.NewDecoder(resp.Body).Decode(&rec)
	if rec.JobID != "job-done-1" {
		t.Fatalf("expected job_id=job-done-1, got %s", rec.JobID)
	}
	if rec.GPUCount != 4 {
		t.Fatalf("expected gpu_count=4, got %d", rec.GPUCount)
	}
}

// ---------- GET /api/v1/usage/provider/{providerId} ----------

func TestGetProviderUsage_NotFound(t *testing.T) {
	h, _, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/usage/provider/no-such-prov")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestGetProviderUsage_Success(t *testing.T) {
	h, meter, store := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	// Create two completed records for the same provider.
	for _, jid := range []string{"j1", "j2"} {
		meter.StartMeter(jid, "prov-A", "A100", 1)
		rec, _ := meter.StopMeter(jid)
		store.SaveUsage(rec)
	}

	resp, err := http.Get(srv.URL + "/api/v1/usage/provider/prov-A")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		ProviderID string                 `json:"provider_id"`
		Records    []metering.UsageRecord `json:"records"`
		Count      int                    `json:"count"`
	}
	json.NewDecoder(resp.Body).Decode(&body)

	if body.Count != 2 {
		t.Fatalf("expected count=2, got %d", body.Count)
	}
	if body.ProviderID != "prov-A" {
		t.Fatalf("expected provider_id=prov-A, got %s", body.ProviderID)
	}
}

// ---------- GET /api/v1/usage/provider/{providerId}/summary ----------

func TestGetProviderSummary_NotFound(t *testing.T) {
	h, _, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/usage/provider/ghost/summary")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestGetProviderSummary_Calculation(t *testing.T) {
	h, _, store := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	// Manually save records with known GPU-seconds so we can verify the math.
	// 3600 GPU-seconds of A100 at 500000 uclaw/GPU-hour = 500000 uclaw
	store.SaveUsage(metering.UsageRecord{
		JobID:           "sum-j1",
		ProviderID:      "prov-S",
		GPUType:         "A100",
		GPUCount:        1,
		DurationSeconds: 3600,
		GPUSeconds:      3600,
	})
	// 1800 GPU-seconds of A100 at 500000 uclaw/GPU-hour = 250000 uclaw
	store.SaveUsage(metering.UsageRecord{
		JobID:           "sum-j2",
		ProviderID:      "prov-S",
		GPUType:         "A100",
		GPUCount:        2,
		DurationSeconds: 900,
		GPUSeconds:      1800,
	})

	resp, err := http.Get(srv.URL + "/api/v1/usage/provider/prov-S/summary")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var summary providerSummaryResponse
	json.NewDecoder(resp.Body).Decode(&summary)

	if summary.ProviderID != "prov-S" {
		t.Fatalf("expected provider_id=prov-S, got %s", summary.ProviderID)
	}
	if summary.RecordCount != 2 {
		t.Fatalf("expected record_count=2, got %d", summary.RecordCount)
	}
	expectedGPUSec := 5400.0
	if summary.TotalGPUSeconds != expectedGPUSec {
		t.Fatalf("expected total_gpu_seconds=%.1f, got %.1f", expectedGPUSec, summary.TotalGPUSeconds)
	}
	// 3600 GPU-sec -> 1 GPU-hour * 500000 = 500000
	// 1800 GPU-sec -> 0.5 GPU-hour * 500000 = 250000
	expectedCost := int64(750000)
	if summary.EstimatedCostUclaw != expectedCost {
		t.Fatalf("expected estimated_cost_uclaw=%d, got %d", expectedCost, summary.EstimatedCostUclaw)
	}
}

// ---------- GET /api/v1/usage/active ----------

func TestGetActiveUsage_Empty(t *testing.T) {
	h, _, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/usage/active")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		ActiveJobs []metering.UsageRecord `json:"active_jobs"`
		Count      int                    `json:"count"`
	}
	json.NewDecoder(resp.Body).Decode(&body)

	if body.Count != 0 {
		t.Fatalf("expected count=0, got %d", body.Count)
	}
}

func TestGetActiveUsage_WithJobs(t *testing.T) {
	h, meter, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	meter.StartMeter("active-1", "prov-X", "A100", 1)
	meter.StartMeter("active-2", "prov-Y", "H100", 8)

	resp, err := http.Get(srv.URL + "/api/v1/usage/active")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		ActiveJobs []metering.UsageRecord `json:"active_jobs"`
		Count      int                    `json:"count"`
	}
	json.NewDecoder(resp.Body).Decode(&body)

	if body.Count != 2 {
		t.Fatalf("expected count=2, got %d", body.Count)
	}

	// Build a lookup to verify both jobs are present regardless of order.
	seen := make(map[string]bool)
	for _, rec := range body.ActiveJobs {
		seen[rec.JobID] = true
	}
	if !seen["active-1"] || !seen["active-2"] {
		t.Fatalf("expected both active-1 and active-2 in response, got %v", seen)
	}
}

// ---------- Method not allowed ----------

func TestMethodNotAllowed(t *testing.T) {
	h, _, _ := newTestMeteringHandler()
	srv := setupServer(h)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/api/v1/usage/active", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", resp.StatusCode)
	}
}
