package metering

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

// mockNATSSubscriber implements NATSSubscriber for testing. It records
// subscriptions and allows tests to dispatch messages by subject.
type mockNATSSubscriber struct {
	handlers map[string]func(subject string, data []byte)
	closed   bool
}

func newMockNATS() *mockNATSSubscriber {
	return &mockNATSSubscriber{
		handlers: make(map[string]func(subject string, data []byte)),
	}
}

func (m *mockNATSSubscriber) Subscribe(subject string, handler func(subject string, data []byte)) error {
	if m.closed {
		return fmt.Errorf("connection closed")
	}
	m.handlers[subject] = handler
	return nil
}

func (m *mockNATSSubscriber) Close() {
	m.closed = true
}

// dispatch simulates a NATS message arriving on a subject.
// It finds the handler whose registered pattern matches and invokes it.
func (m *mockNATSSubscriber) dispatch(subject string, data []byte) {
	// Try exact match first, then wildcard patterns.
	if h, ok := m.handlers[subject]; ok {
		h(subject, data)
		return
	}
	// Match wildcard subjects like "jobs.status.*.running"
	for pattern, h := range m.handlers {
		if matchWildcard(pattern, subject) {
			h(subject, data)
			return
		}
	}
}

// matchWildcard performs simple NATS-style wildcard matching where "*"
// matches a single token between dots.
func matchWildcard(pattern, subject string) bool {
	pParts := splitDot(pattern)
	sParts := splitDot(subject)
	if len(pParts) != len(sParts) {
		return false
	}
	for i := range pParts {
		if pParts[i] == "*" {
			continue
		}
		if pParts[i] != sParts[i] {
			return false
		}
	}
	return true
}

func splitDot(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

// helper to build a JSON payload.
func mustMarshal(t *testing.T, v interface{}) []byte {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return data
}

// newTestEventSubscriber sets up a full test harness with a controllable clock.
func newTestEventSubscriber(t *testing.T) (*EventSubscriber, *mockNATSSubscriber, *Meter) {
	t.Helper()

	meter := NewMeter()
	store := NewUsageStore("")
	nats := newMockNATS()
	priceMap := map[string]int64{
		"A100":    500_000, // 500k uclaw per GPU-hour
		"RTX4090": 250_000,
		"V100":    100_000,
	}

	es := NewEventSubscriber(meter, store, nats, priceMap)
	return es, nats, meter
}

func TestEventSubscriber_RunningStartsMeter(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	evt := JobStatusEvent{
		JobID:      "job-run-1",
		ProviderID: "prov-1",
		Status:     "running",
		GPUType:    "A100",
		GPUCount:   4,
	}
	nats.dispatch("jobs.status.job-run-1.running", mustMarshal(t, evt))

	if meter.ActiveJobCount() != 1 {
		t.Errorf("expected 1 active job, got %d", meter.ActiveJobCount())
	}

	// Verify the meter is tracking the correct job.
	usage, err := meter.GetUsage("job-run-1")
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}
	if usage.GPUType != "A100" {
		t.Errorf("expected GPU type A100, got %s", usage.GPUType)
	}
	if usage.GPUCount != 4 {
		t.Errorf("expected 4 GPUs, got %d", usage.GPUCount)
	}
	if usage.ProviderID != "prov-1" {
		t.Errorf("expected provider prov-1, got %s", usage.ProviderID)
	}
}

func TestEventSubscriber_CompletedStopsAndSettles(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	// Use a controllable clock so we can compute expected settlement.
	now := time.Date(2026, 3, 7, 10, 0, 0, 0, time.UTC)
	meter.nowFunc = func() time.Time { return now }

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Send running event.
	runEvt := JobStatusEvent{
		JobID:      "job-settle-1",
		ProviderID: "prov-A",
		Status:     "running",
		GPUType:    "A100",
		GPUCount:   2,
	}
	nats.dispatch("jobs.status.job-settle-1.running", mustMarshal(t, runEvt))

	// Advance clock by 1 hour (3600 seconds).
	now = now.Add(1 * time.Hour)

	// Send completed event.
	compEvt := JobStatusEvent{
		JobID:      "job-settle-1",
		ProviderID: "prov-A",
		Status:     "completed",
		GPUType:    "A100",
		GPUCount:   2,
	}
	nats.dispatch("jobs.status.job-settle-1.completed", mustMarshal(t, compEvt))

	// Meter should no longer be active.
	if meter.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs after completion, got %d", meter.ActiveJobCount())
	}

	// Usage should be persisted in the store.
	stored, err := es.store.GetUsageByJob("job-settle-1")
	if err != nil {
		t.Fatalf("GetUsageByJob: %v", err)
	}

	// 3600 seconds * 2 GPUs = 7200 GPU-seconds
	if stored.GPUSeconds != 7200 {
		t.Errorf("expected 7200 GPU-seconds, got %f", stored.GPUSeconds)
	}
	if stored.DurationSeconds != 3600 {
		t.Errorf("expected 3600s duration, got %f", stored.DurationSeconds)
	}

	// Verify settlement calculation: 7200 GPU-seconds / 3600 * 500000 = 1,000,000 uclaw
	settlement := CalculateSettlement(stored, 500_000)
	if settlement.TotalCostUclaw != 1_000_000 {
		t.Errorf("expected 1000000 uclaw settlement, got %d", settlement.TotalCostUclaw)
	}
}

func TestEventSubscriber_FailedStopsWithoutSettlement(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	now := time.Date(2026, 3, 7, 10, 0, 0, 0, time.UTC)
	meter.nowFunc = func() time.Time { return now }

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Start a job.
	runEvt := JobStatusEvent{
		JobID:      "job-fail-1",
		ProviderID: "prov-B",
		Status:     "running",
		GPUType:    "RTX4090",
		GPUCount:   1,
	}
	nats.dispatch("jobs.status.job-fail-1.running", mustMarshal(t, runEvt))

	now = now.Add(30 * time.Second)

	// Fail the job.
	failEvt := JobStatusEvent{
		JobID:      "job-fail-1",
		ProviderID: "prov-B",
		Status:     "failed",
		GPUType:    "RTX4090",
		GPUCount:   1,
	}
	nats.dispatch("jobs.status.job-fail-1.failed", mustMarshal(t, failEvt))

	// Meter should be stopped.
	if meter.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs after failure, got %d", meter.ActiveJobCount())
	}

	// No usage record should be saved for failed jobs.
	_, err := es.store.GetUsageByJob("job-fail-1")
	if err == nil {
		t.Error("expected no usage record for failed job, but found one")
	}
}

func TestEventSubscriber_CancelledStopsWithoutSettlement(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	now := time.Date(2026, 3, 7, 10, 0, 0, 0, time.UTC)
	meter.nowFunc = func() time.Time { return now }

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Start a job.
	runEvt := JobStatusEvent{
		JobID:      "job-cancel-1",
		ProviderID: "prov-C",
		Status:     "running",
		GPUType:    "V100",
		GPUCount:   8,
	}
	nats.dispatch("jobs.status.job-cancel-1.running", mustMarshal(t, runEvt))

	now = now.Add(45 * time.Second)

	// Cancel the job.
	cancelEvt := JobStatusEvent{
		JobID:      "job-cancel-1",
		ProviderID: "prov-C",
		Status:     "cancelled",
		GPUType:    "V100",
		GPUCount:   8,
	}
	nats.dispatch("jobs.status.job-cancel-1.cancelled", mustMarshal(t, cancelEvt))

	// Meter should be stopped.
	if meter.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs after cancellation, got %d", meter.ActiveJobCount())
	}

	// No usage record should be saved for cancelled jobs.
	_, err := es.store.GetUsageByJob("job-cancel-1")
	if err == nil {
		t.Error("expected no usage record for cancelled job, but found one")
	}
}

func TestEventSubscriber_UnknownJobCompletion(t *testing.T) {
	es, nats, _ := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Send a completed event for a job that was never started.
	// This should log a warning but not panic.
	compEvt := JobStatusEvent{
		JobID:      "job-unknown-1",
		ProviderID: "prov-X",
		Status:     "completed",
		GPUType:    "A100",
		GPUCount:   1,
	}
	nats.dispatch("jobs.status.job-unknown-1.completed", mustMarshal(t, compEvt))

	// No usage should be saved.
	_, err := es.store.GetUsageByJob("job-unknown-1")
	if err == nil {
		t.Error("expected no usage record for unknown job, but found one")
	}
}

func TestEventSubscriber_UnknownJobFailure(t *testing.T) {
	es, nats, _ := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Fail a job that was never started — should not panic.
	failEvt := JobStatusEvent{
		JobID:      "job-unknown-2",
		ProviderID: "prov-X",
		Status:     "failed",
		GPUType:    "A100",
		GPUCount:   1,
	}
	nats.dispatch("jobs.status.job-unknown-2.failed", mustMarshal(t, failEvt))

	// Should not panic, and no record stored.
	if es.store.RecordCount() != 0 {
		t.Errorf("expected 0 records, got %d", es.store.RecordCount())
	}
}

func TestEventSubscriber_InvalidJSON(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Dispatch garbage — should not panic.
	nats.dispatch("jobs.status.bad.running", []byte(`{invalid json`))

	if meter.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs after invalid JSON, got %d", meter.ActiveJobCount())
	}
}

func TestEventSubscriber_EmptyJobID(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Event with empty job_id should be rejected.
	evt := JobStatusEvent{
		JobID:      "",
		ProviderID: "prov-1",
		Status:     "running",
		GPUType:    "A100",
		GPUCount:   1,
	}
	nats.dispatch("jobs.status..running", mustMarshal(t, evt))

	if meter.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs for empty job_id, got %d", meter.ActiveJobCount())
	}
}

func TestEventSubscriber_DefaultGPUCount(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Send a running event with gpu_count=0 — should default to 1.
	evt := JobStatusEvent{
		JobID:      "job-default-gpu",
		ProviderID: "prov-1",
		Status:     "running",
		GPUType:    "V100",
		GPUCount:   0,
	}
	nats.dispatch("jobs.status.job-default-gpu.running", mustMarshal(t, evt))

	usage, err := meter.GetUsage("job-default-gpu")
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}
	if usage.GPUCount != 1 {
		t.Errorf("expected default GPU count of 1, got %d", usage.GPUCount)
	}
}

func TestEventSubscriber_DoubleStartReturnsError(t *testing.T) {
	es, _, _ := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("first Start: %v", err)
	}

	err := es.Start()
	if err == nil {
		t.Error("expected error on double Start")
	}
}

func TestEventSubscriber_Close(t *testing.T) {
	es, nats, _ := newTestEventSubscriber(t)

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	es.Close()

	if !nats.closed {
		t.Error("expected NATS connection to be closed")
	}

	// Close again should be safe (idempotent).
	es.Close()
}

func TestEventSubscriber_MultipleJobs(t *testing.T) {
	es, nats, meter := newTestEventSubscriber(t)

	now := time.Date(2026, 3, 7, 10, 0, 0, 0, time.UTC)
	meter.nowFunc = func() time.Time { return now }

	if err := es.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Start three jobs.
	for _, job := range []string{"multi-1", "multi-2", "multi-3"} {
		evt := JobStatusEvent{
			JobID:      job,
			ProviderID: "prov-multi",
			Status:     "running",
			GPUType:    "A100",
			GPUCount:   1,
		}
		nats.dispatch("jobs.status."+job+".running", mustMarshal(t, evt))
	}

	if meter.ActiveJobCount() != 3 {
		t.Fatalf("expected 3 active jobs, got %d", meter.ActiveJobCount())
	}

	// Advance clock, complete two, fail one.
	now = now.Add(60 * time.Second)

	for _, job := range []string{"multi-1", "multi-2"} {
		evt := JobStatusEvent{
			JobID:  job,
			Status: "completed",
		}
		nats.dispatch("jobs.status."+job+".completed", mustMarshal(t, evt))
	}

	failEvt := JobStatusEvent{
		JobID:  "multi-3",
		Status: "failed",
	}
	nats.dispatch("jobs.status.multi-3.failed", mustMarshal(t, failEvt))

	if meter.ActiveJobCount() != 0 {
		t.Errorf("expected 0 active jobs, got %d", meter.ActiveJobCount())
	}

	// Only the two completed jobs should be in the store.
	if es.store.RecordCount() != 2 {
		t.Errorf("expected 2 records in store, got %d", es.store.RecordCount())
	}
}
