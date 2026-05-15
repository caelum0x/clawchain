package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// EventCursor tracks the last processed block height for restart-safe event handling.
type EventCursor struct {
	mu       sync.Mutex
	filePath string
	state    CursorState
}

// CursorState is the persisted cursor data.
type CursorState struct {
	LastProcessedHeight int64  `json:"last_processed_height"`
	LastProcessedTxHash string `json:"last_processed_tx_hash,omitempty"`
}

// NewEventCursor creates a cursor that persists to dataDir/event_cursor.json.
func NewEventCursor(dataDir string) *EventCursor {
	return &EventCursor{
		filePath: filepath.Join(dataDir, "event_cursor.json"),
	}
}

// Load reads cursor state from disk. If the file does not exist, state is
// initialised with height 0. The data directory is created if necessary.
func (c *EventCursor) Load() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	dir := filepath.Dir(c.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create cursor dir: %w", err)
	}

	data, err := os.ReadFile(c.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			c.state = CursorState{LastProcessedHeight: 0}
			return nil
		}
		return fmt.Errorf("read cursor file: %w", err)
	}

	var st CursorState
	if err := json.Unmarshal(data, &st); err != nil {
		return fmt.Errorf("decode cursor file: %w", err)
	}
	c.state = st
	return nil
}

// Update atomically persists the new height and tx hash to disk.
func (c *EventCursor) Update(height int64, txHash string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.state.LastProcessedHeight = height
	c.state.LastProcessedTxHash = txHash

	data, err := json.Marshal(c.state)
	if err != nil {
		return fmt.Errorf("marshal cursor state: %w", err)
	}

	// Write to a temp file then rename for atomic persistence.
	tmpPath := c.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("write cursor tmp: %w", err)
	}
	if err := os.Rename(tmpPath, c.filePath); err != nil {
		return fmt.Errorf("rename cursor tmp: %w", err)
	}
	return nil
}

// GetLastHeight returns the last processed block height (thread-safe).
func (c *EventCursor) GetLastHeight() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state.LastProcessedHeight
}
