package metering

import (
	"sync"
	"testing"
	"time"
)

func TestMeter_StartStop(t *testing.T) {
	m := NewMeter()

	// Inject a controllable clock.
	now := time.Date(2026, 3, 7, 0, 0, 0, 0, time.UTC)
	m.nowFunc = func() time.Time { return now }

	m.StartMeter("job-1", "prov-1", "A100", 2)

	if m.ActiveJobCount() != 1 {
		t.Fatalf("expected 1 active job, got %d", m.ActiveJobCount())
	}

	// Advance clock by 120 seconds.
	now = now.Add(120 * time.Second)

	rec, err := m.StopMeter("job-1")
	if err != nil {
		t.Fatalf("StopMeter: %v", err)
	}

	if rec.DurationSeconds != 120 {
		t.Errorf("expected 120s duration, got %f", rec.DurationSeconds)
	}
	if rec.GPUSeconds != 240 { // 120s * 2 GPUs
		t.Errorf("expected 240 GPU-seconds, got %f", rec.GPUSeconds)
	}
	if rec.GPUType != "A100" {
		t.Errorf("expected GPU type A100, got %s", rec.GPUType)
	}
	if m.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs after stop, got %d", m.ActiveJobCount())
	}
}

func TestMeter_StopUnknownJob(t *testing.T) {
	m := NewMeter()
	_, err := m.StopMeter("nonexistent")
	if err == nil {
		t.Error("expected error for unknown job")
	}
}

func TestMeter_GetUsage(t *testing.T) {
	m := NewMeter()

	now := time.Date(2026, 3, 7, 12, 0, 0, 0, time.UTC)
	m.nowFunc = func() time.Time { return now }

	m.StartMeter("job-2", "prov-1", "RTX4090", 4)

	// Advance 60 seconds.
	now = now.Add(60 * time.Second)

	rec, err := m.GetUsage("job-2")
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}

	if rec.DurationSeconds != 60 {
		t.Errorf("expected 60s, got %f", rec.DurationSeconds)
	}
	if rec.GPUSeconds != 240 { // 60 * 4
		t.Errorf("expected 240 GPU-seconds, got %f", rec.GPUSeconds)
	}

	// Job should still be active.
	if m.ActiveJobCount() != 1 {
		t.Errorf("job should still be active")
	}
}

func TestMeter_ConcurrentAccess(t *testing.T) {
	m := NewMeter()

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			jobID := "concurrent-" + string(rune('A'+n%26))
			m.StartMeter(jobID, "prov", "V100", 1)
			m.StopMeter(jobID)
		}(i)
	}
	wg.Wait()

	if m.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active after concurrent ops, got %d", m.ActiveJobCount())
	}
}

func TestSettlement_BasicCalculation(t *testing.T) {
	usage := UsageRecord{
		JobID:           "job-s1",
		ProviderID:      "prov-1",
		GPUSeconds:      360,
		GPUCount:        3,
		DurationSeconds: 120,
	}

	// 360 GPU-seconds at 100 uclaw per GPU-hour
	// = 360/3600 * 100 = 10 uclaw
	result := CalculateSettlement(usage, 100)

	if result.TotalCostUclaw != 10 {
		t.Errorf("expected 10 uclaw, got %d", result.TotalCostUclaw)
	}
	if result.GPUSeconds != 360 {
		t.Errorf("expected 360 GPU-seconds, got %f", result.GPUSeconds)
	}
}

func TestSettlement_CeilingRounding(t *testing.T) {
	usage := UsageRecord{
		JobID:      "job-s2",
		ProviderID: "prov-1",
		GPUSeconds: 100, // 100 GPU-seconds
	}

	// 100/3600 * 1000 = 27.777... → ceil = 28
	result := CalculateSettlement(usage, 1000)

	if result.TotalCostUclaw != 28 {
		t.Errorf("expected 28 uclaw (ceiling), got %d", result.TotalCostUclaw)
	}
}

func TestSettlement_MinimumCharge(t *testing.T) {
	usage := UsageRecord{
		JobID:      "job-s3",
		ProviderID: "prov-1",
		GPUSeconds: 0.001, // tiny usage
	}

	result := CalculateSettlement(usage, 1)
	if result.TotalCostUclaw != 1 {
		t.Errorf("expected minimum 1 uclaw, got %d", result.TotalCostUclaw)
	}
}

func TestSettlement_ZeroUsage(t *testing.T) {
	usage := UsageRecord{
		JobID:      "job-s4",
		ProviderID: "prov-1",
		GPUSeconds: 0,
	}

	result := CalculateSettlement(usage, 100)
	if result.TotalCostUclaw != 0 {
		t.Errorf("expected 0 for zero usage, got %d", result.TotalCostUclaw)
	}
}

func TestSettlement_ZeroPrice(t *testing.T) {
	usage := UsageRecord{
		JobID:      "job-s5",
		ProviderID: "prov-1",
		GPUSeconds: 3600,
	}

	result := CalculateSettlement(usage, 0)
	if result.TotalCostUclaw != 0 {
		t.Errorf("expected 0 for zero price, got %d", result.TotalCostUclaw)
	}
}

func TestSettlement_OneHourOneGPU(t *testing.T) {
	usage := UsageRecord{
		JobID:      "job-s6",
		ProviderID: "prov-1",
		GPUSeconds: 3600, // exactly 1 GPU-hour
	}

	// 3600/3600 * 500_000 = 500_000 uclaw = 0.5 CLAW
	result := CalculateSettlement(usage, 500_000)
	if result.TotalCostUclaw != 500_000 {
		t.Errorf("expected 500000 uclaw, got %d", result.TotalCostUclaw)
	}
}

func TestStore_SaveAndRetrieve(t *testing.T) {
	store := NewUsageStore("")

	rec := UsageRecord{
		JobID:           "job-store-1",
		ProviderID:      "prov-A",
		GPUType:         "A100",
		GPUCount:        2,
		DurationSeconds: 300,
		GPUSeconds:      600,
	}

	if err := store.SaveUsage(rec); err != nil {
		t.Fatalf("SaveUsage: %v", err)
	}

	got, err := store.GetUsageByJob("job-store-1")
	if err != nil {
		t.Fatalf("GetUsageByJob: %v", err)
	}
	if got.GPUSeconds != 600 {
		t.Errorf("expected 600 GPU-seconds, got %f", got.GPUSeconds)
	}

	provRecs, err := store.GetUsageByProvider("prov-A")
	if err != nil {
		t.Fatalf("GetUsageByProvider: %v", err)
	}
	if len(provRecs) != 1 {
		t.Errorf("expected 1 record for provider, got %d", len(provRecs))
	}

	total, err := store.GetTotalGPUSeconds("prov-A")
	if err != nil {
		t.Fatalf("GetTotalGPUSeconds: %v", err)
	}
	if total != 600 {
		t.Errorf("expected 600 total GPU-seconds, got %f", total)
	}
}

func TestStore_OverwriteJob(t *testing.T) {
	store := NewUsageStore("")

	rec1 := UsageRecord{JobID: "job-ow", ProviderID: "prov-1", GPUSeconds: 100}
	rec2 := UsageRecord{JobID: "job-ow", ProviderID: "prov-1", GPUSeconds: 200}

	store.SaveUsage(rec1)
	store.SaveUsage(rec2)

	got, _ := store.GetUsageByJob("job-ow")
	if got.GPUSeconds != 200 {
		t.Errorf("expected overwritten value 200, got %f", got.GPUSeconds)
	}

	if store.RecordCount() != 1 {
		t.Errorf("expected 1 record after overwrite, got %d", store.RecordCount())
	}
}

func TestStore_FilePersistence(t *testing.T) {
	tmpFile := t.TempDir() + "/usage.json"

	store1 := NewUsageStore(tmpFile)
	store1.SaveUsage(UsageRecord{JobID: "persist-1", ProviderID: "prov-1", GPUSeconds: 500})
	store1.SaveUsage(UsageRecord{JobID: "persist-2", ProviderID: "prov-1", GPUSeconds: 300})

	// Create new store from same file — should load records.
	store2 := NewUsageStore(tmpFile)
	if store2.RecordCount() != 2 {
		t.Errorf("expected 2 records loaded from file, got %d", store2.RecordCount())
	}

	total, _ := store2.GetTotalGPUSeconds("prov-1")
	if total != 800 {
		t.Errorf("expected 800 total GPU-seconds, got %f", total)
	}
}
