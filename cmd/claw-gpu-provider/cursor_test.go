package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEventCursorDefaultZero(t *testing.T) {
	dir := t.TempDir()
	c := NewEventCursor(dir)
	if err := c.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := c.GetLastHeight(); got != 0 {
		t.Fatalf("expected default height 0, got %d", got)
	}
}

func TestEventCursorLoadSave(t *testing.T) {
	dir := t.TempDir()

	// Create and save cursor with a height.
	c1 := NewEventCursor(dir)
	if err := c1.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := c1.Update(42, "abc123"); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got := c1.GetLastHeight(); got != 42 {
		t.Fatalf("expected height 42, got %d", got)
	}

	// Load a new cursor from the same directory and verify state was persisted.
	c2 := NewEventCursor(dir)
	if err := c2.Load(); err != nil {
		t.Fatalf("Load c2: %v", err)
	}
	if got := c2.GetLastHeight(); got != 42 {
		t.Fatalf("expected reloaded height 42, got %d", got)
	}
}

func TestEventCursorAtomicUpdate(t *testing.T) {
	dir := t.TempDir()
	c := NewEventCursor(dir)
	if err := c.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	if err := c.Update(100, "tx_hash_100"); err != nil {
		t.Fatalf("Update: %v", err)
	}

	// Verify the file exists and the temp file was cleaned up.
	cursorPath := filepath.Join(dir, "event_cursor.json")
	tmpPath := cursorPath + ".tmp"

	if _, err := os.Stat(cursorPath); os.IsNotExist(err) {
		t.Fatal("cursor file does not exist after update")
	}
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Fatal("temp file should not exist after successful rename")
	}

	// Verify contents by loading into a fresh cursor.
	c2 := NewEventCursor(dir)
	if err := c2.Load(); err != nil {
		t.Fatalf("Load c2: %v", err)
	}
	if got := c2.GetLastHeight(); got != 100 {
		t.Fatalf("expected height 100, got %d", got)
	}
}
