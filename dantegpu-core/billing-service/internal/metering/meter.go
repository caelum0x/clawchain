package metering

import (
	"fmt"
	"sync"
	"time"
)

// UsageRecord represents a completed or in-progress GPU usage measurement.
type UsageRecord struct {
	JobID           string    `json:"job_id"`
	ProviderID      string    `json:"provider_id"`
	GPUType         string    `json:"gpu_type"`
	GPUCount        int       `json:"gpu_count"`
	StartTime       time.Time `json:"start_time"`
	EndTime         time.Time `json:"end_time,omitempty"`
	DurationSeconds float64   `json:"duration_seconds"`
	GPUSeconds      float64   `json:"gpu_seconds"` // duration_seconds * gpu_count
}

// activeMeter tracks a currently running GPU usage session.
type activeMeter struct {
	jobID      string
	providerID string
	gpuType    string
	gpuCount   int
	startTime  time.Time
}

// Meter tracks GPU usage per job with thread-safe start/stop semantics.
type Meter struct {
	mu      sync.Mutex
	active  map[string]*activeMeter
	nowFunc func() time.Time // injectable clock for testing
}

// NewMeter creates a new Meter instance.
func NewMeter() *Meter {
	return &Meter{
		active:  make(map[string]*activeMeter),
		nowFunc: time.Now,
	}
}

// StartMeter begins tracking GPU usage for the given job.
// It is safe to call concurrently.
func (m *Meter) StartMeter(jobID, providerID, gpuType string, gpuCount int) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.active[jobID] = &activeMeter{
		jobID:      jobID,
		providerID: providerID,
		gpuType:    gpuType,
		gpuCount:   gpuCount,
		startTime:  m.nowFunc(),
	}
}

// StopMeter stops tracking GPU usage for the given job and returns the
// final UsageRecord. Returns an error if the job is not being tracked.
func (m *Meter) StopMeter(jobID string) (UsageRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	am, ok := m.active[jobID]
	if !ok {
		return UsageRecord{}, fmt.Errorf("no active meter for job %s", jobID)
	}

	now := m.nowFunc()
	duration := now.Sub(am.startTime).Seconds()

	record := UsageRecord{
		JobID:           am.jobID,
		ProviderID:      am.providerID,
		GPUType:         am.gpuType,
		GPUCount:        am.gpuCount,
		StartTime:       am.startTime,
		EndTime:         now,
		DurationSeconds: duration,
		GPUSeconds:      duration * float64(am.gpuCount),
	}

	delete(m.active, jobID)
	return record, nil
}

// GetUsage returns the current usage snapshot for a running job.
// Returns an error if the job is not being tracked.
func (m *Meter) GetUsage(jobID string) (UsageRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	am, ok := m.active[jobID]
	if !ok {
		return UsageRecord{}, fmt.Errorf("no active meter for job %s", jobID)
	}

	now := m.nowFunc()
	duration := now.Sub(am.startTime).Seconds()

	return UsageRecord{
		JobID:           am.jobID,
		ProviderID:      am.providerID,
		GPUType:         am.gpuType,
		GPUCount:        am.gpuCount,
		StartTime:       am.startTime,
		DurationSeconds: duration,
		GPUSeconds:      duration * float64(am.gpuCount),
	}, nil
}

// ActiveJobCount returns the number of jobs currently being metered.
func (m *Meter) ActiveJobCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.active)
}

// ListActiveUsage returns a snapshot of usage for all currently metered jobs.
func (m *Meter) ListActiveUsage() []UsageRecord {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.nowFunc()
	records := make([]UsageRecord, 0, len(m.active))
	for _, am := range m.active {
		duration := now.Sub(am.startTime).Seconds()
		records = append(records, UsageRecord{
			JobID:           am.jobID,
			ProviderID:      am.providerID,
			GPUType:         am.gpuType,
			GPUCount:        am.gpuCount,
			StartTime:       am.startTime,
			DurationSeconds: duration,
			GPUSeconds:      duration * float64(am.gpuCount),
		})
	}
	return records
}
