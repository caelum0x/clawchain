package metering

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

// UsageStore persists completed UsageRecords in memory with optional
// JSON file backup for durability across restarts.
type UsageStore struct {
	mu       sync.RWMutex
	byJob    map[string]UsageRecord   // jobID -> record
	byProv   map[string][]UsageRecord // providerID -> records
	filePath string                   // empty string disables file persistence
}

// NewUsageStore creates a new in-memory usage store.
// If filePath is non-empty, the store will persist records to disk as JSON.
func NewUsageStore(filePath string) *UsageStore {
	s := &UsageStore{
		byJob:    make(map[string]UsageRecord),
		byProv:   make(map[string][]UsageRecord),
		filePath: filePath,
	}
	if filePath != "" {
		_ = s.loadFromFile()
	}
	return s
}

// SaveUsage stores a completed usage record. If a record for the same
// jobID already exists it is overwritten.
func (s *UsageStore) SaveUsage(record UsageRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove previous entry from provider index if overwriting.
	if old, exists := s.byJob[record.JobID]; exists {
		s.removeFromProviderIndex(old.ProviderID, old.JobID)
	}

	s.byJob[record.JobID] = record
	s.byProv[record.ProviderID] = append(s.byProv[record.ProviderID], record)

	if s.filePath != "" {
		return s.flushToFile()
	}
	return nil
}

// GetUsageByJob returns the usage record for a specific job.
func (s *UsageStore) GetUsageByJob(jobID string) (UsageRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, ok := s.byJob[jobID]
	if !ok {
		return UsageRecord{}, fmt.Errorf("no usage record for job %s", jobID)
	}
	return rec, nil
}

// GetUsageByProvider returns all usage records for a provider.
func (s *UsageStore) GetUsageByProvider(providerID string) ([]UsageRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := s.byProv[providerID]
	if len(records) == 0 {
		return nil, fmt.Errorf("no usage records for provider %s", providerID)
	}
	// Return a copy to prevent callers from mutating internal state.
	out := make([]UsageRecord, len(records))
	copy(out, records)
	return out, nil
}

// GetTotalGPUSeconds returns the sum of GPUSeconds across all records
// for the given provider.
func (s *UsageStore) GetTotalGPUSeconds(providerID string) (float64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records, ok := s.byProv[providerID]
	if !ok || len(records) == 0 {
		return 0, fmt.Errorf("no usage records for provider %s", providerID)
	}

	var total float64
	for _, r := range records {
		total += r.GPUSeconds
	}
	return total, nil
}

// RecordCount returns the total number of stored records.
func (s *UsageStore) RecordCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.byJob)
}

// --- internal helpers ---

func (s *UsageStore) removeFromProviderIndex(providerID, jobID string) {
	recs := s.byProv[providerID]
	for i, r := range recs {
		if r.JobID == jobID {
			s.byProv[providerID] = append(recs[:i], recs[i+1:]...)
			return
		}
	}
}

// flushToFile writes all records to the configured file path as JSON.
// Caller must hold s.mu.
func (s *UsageStore) flushToFile() error {
	records := make([]UsageRecord, 0, len(s.byJob))
	for _, r := range s.byJob {
		records = append(records, r)
	}

	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal usage records: %w", err)
	}

	if err := os.WriteFile(s.filePath, data, 0644); err != nil {
		return fmt.Errorf("write usage file: %w", err)
	}
	return nil
}

// loadFromFile restores records from the JSON file on disk.
func (s *UsageStore) loadFromFile() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // file doesn't exist yet; nothing to load
		}
		return fmt.Errorf("read usage file: %w", err)
	}

	var records []UsageRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return fmt.Errorf("unmarshal usage file: %w", err)
	}

	for _, r := range records {
		s.byJob[r.JobID] = r
		s.byProv[r.ProviderID] = append(s.byProv[r.ProviderID], r)
	}
	return nil
}
