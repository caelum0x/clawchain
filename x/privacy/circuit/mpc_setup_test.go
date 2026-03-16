package circuit

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMPCCeremonyTransfer3Participants(t *testing.T) {
	participants := []string{"alice", "bob", "charlie"}

	cs, err := CompileTransferCircuit()
	if err != nil {
		t.Fatalf("failed to compile transfer circuit: %v", err)
	}

	ceremony := NewMPCCeremony("transfer", cs)

	// Phase 1
	if err := ceremony.InitPhase1(16); err != nil {
		t.Fatalf("failed to init phase 1: %v", err)
	}

	phase1Hashes := make([]string, len(participants))
	for i, p := range participants {
		hash, err := ceremony.ContributePhase1(p)
		if err != nil {
			t.Fatalf("phase 1 contribution from %s failed: %v", p, err)
		}
		phase1Hashes[i] = hash
		t.Logf("Phase 1 contribution from %s: %s", p, hash)
	}

	// Verify each contribution produced a different hash
	for i := 0; i < len(phase1Hashes); i++ {
		for j := i + 1; j < len(phase1Hashes); j++ {
			if phase1Hashes[i] == phase1Hashes[j] {
				t.Errorf("phase 1 hashes %d and %d are identical", i, j)
			}
		}
	}

	if err := ceremony.FinalizePhase1(); err != nil {
		t.Fatalf("failed to finalize phase 1: %v", err)
	}

	// Phase 2
	phase2Hashes := make([]string, len(participants))
	for i, p := range participants {
		hash, err := ceremony.ContributePhase2(p)
		if err != nil {
			t.Fatalf("phase 2 contribution from %s failed: %v", p, err)
		}
		phase2Hashes[i] = hash
		t.Logf("Phase 2 contribution from %s: %s", p, hash)
	}

	// Finalize
	pk, vk, err := ceremony.Finalize()
	if err != nil {
		t.Fatalf("failed to finalize ceremony: %v", err)
	}

	if pk == nil {
		t.Fatal("proving key is nil")
	}
	if vk == nil {
		t.Fatal("verifying key is nil")
	}

	// Verify transcript
	transcript := ceremony.GetTranscript()
	if transcript.CircuitName != "transfer" {
		t.Errorf("expected circuit name 'transfer', got %s", transcript.CircuitName)
	}
	if len(transcript.Contributions) != 6 { // 3 phase1 + 3 phase2
		t.Errorf("expected 6 contributions, got %d", len(transcript.Contributions))
	}
	if transcript.FinalPKHash == "" {
		t.Error("final PK hash is empty")
	}
	if transcript.FinalVKHash == "" {
		t.Error("final VK hash is empty")
	}
	if transcript.CompletedAt.IsZero() {
		t.Error("completed timestamp is zero")
	}

	// Test saving and loading keys
	tmpDir := t.TempDir()
	if err := SaveCeremonyKeys(tmpDir, "transfer", pk, vk); err != nil {
		t.Fatalf("failed to save keys: %v", err)
	}

	loadedPK, loadedVK, err := LoadCeremonyKeys(tmpDir, "transfer")
	if err != nil {
		t.Fatalf("failed to load keys: %v", err)
	}
	if loadedPK == nil || loadedVK == nil {
		t.Fatal("loaded keys are nil")
	}

	// Verify checksums
	if err := VerifyChecksums(tmpDir); err != nil {
		t.Fatalf("checksum verification failed: %v", err)
	}

	// Save and load transcript
	transcriptPath := filepath.Join(tmpDir, "ceremony-transcript.json")
	if err := ceremony.SaveTranscript(transcriptPath); err != nil {
		t.Fatalf("failed to save transcript: %v", err)
	}
	loadedTranscript, err := LoadTranscript(transcriptPath)
	if err != nil {
		t.Fatalf("failed to load transcript: %v", err)
	}
	if loadedTranscript.CircuitName != "transfer" {
		t.Errorf("loaded transcript circuit name mismatch")
	}
	if len(loadedTranscript.Contributions) != 6 {
		t.Errorf("loaded transcript has %d contributions, expected 6", len(loadedTranscript.Contributions))
	}
}

func TestMPCCeremonyPhase1RequiresInit(t *testing.T) {
	cs, err := CompileViewKeyCircuit()
	if err != nil {
		t.Fatalf("failed to compile circuit: %v", err)
	}

	ceremony := NewMPCCeremony("viewkey", cs)
	_, err = ceremony.ContributePhase1("alice")
	if err == nil {
		t.Error("expected error when contributing before init")
	}
}

func TestMPCCeremonyPhase2RequiresPhase1(t *testing.T) {
	cs, err := CompileViewKeyCircuit()
	if err != nil {
		t.Fatalf("failed to compile circuit: %v", err)
	}

	ceremony := NewMPCCeremony("viewkey", cs)
	_, err = ceremony.ContributePhase2("alice")
	if err == nil {
		t.Error("expected error when contributing phase 2 before phase 1 finalized")
	}
}

func TestMPCCeremonyCannotFinalizeEmpty(t *testing.T) {
	cs, err := CompileViewKeyCircuit()
	if err != nil {
		t.Fatalf("failed to compile circuit: %v", err)
	}

	ceremony := NewMPCCeremony("viewkey", cs)
	if err := ceremony.InitPhase1(12); err != nil {
		t.Fatalf("failed to init: %v", err)
	}
	err = ceremony.FinalizePhase1()
	if err == nil {
		t.Error("expected error when finalizing phase 1 with no contributions")
	}
}

func TestRunFullCeremony(t *testing.T) {
	cs, err := CompileViewKeyCircuit()
	if err != nil {
		t.Fatalf("failed to compile circuit: %v", err)
	}

	pk, vk, transcript, err := RunFullCeremony("viewkey", cs, []string{"alice", "bob", "charlie"}, 12)
	if err != nil {
		t.Fatalf("full ceremony failed: %v", err)
	}
	if pk == nil || vk == nil {
		t.Fatal("keys are nil")
	}
	if transcript == nil {
		t.Fatal("transcript is nil")
	}
	if len(transcript.Contributions) != 6 {
		t.Errorf("expected 6 contributions, got %d", len(transcript.Contributions))
	}
}

func TestSaveCeremonyKeysAndVerifyChecksums(t *testing.T) {
	cs, err := CompileViewKeyCircuit()
	if err != nil {
		t.Fatalf("failed to compile circuit: %v", err)
	}

	pk, vk, _, err := RunFullCeremony("viewkey", cs, []string{"alice"}, 12)
	if err != nil {
		t.Fatalf("ceremony failed: %v", err)
	}

	tmpDir := t.TempDir()
	if err := SaveCeremonyKeys(tmpDir, "viewkey", pk, vk); err != nil {
		t.Fatalf("failed to save keys: %v", err)
	}

	// Verify files exist
	if _, err := os.Stat(filepath.Join(tmpDir, "viewkey_pk.bin")); err != nil {
		t.Error("proving key file not found")
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "viewkey_vk.bin")); err != nil {
		t.Error("verifying key file not found")
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "checksums.sha256")); err != nil {
		t.Error("checksums file not found")
	}

	// Verify checksums
	if err := VerifyChecksums(tmpDir); err != nil {
		t.Fatalf("checksum verification failed: %v", err)
	}

	// Tamper with a file and verify checksums fail
	vkPath := filepath.Join(tmpDir, "viewkey_vk.bin")
	data, _ := os.ReadFile(vkPath)
	data[0] ^= 0xFF
	os.WriteFile(vkPath, data, 0o644)
	if err := VerifyChecksums(tmpDir); err == nil {
		t.Error("expected checksum verification to fail after tampering")
	}
}

func TestSetupFromMPCOrFallback(t *testing.T) {
	// Test fallback to single-party setup when artifacts don't exist
	pk, vk, cs, err := SetupFromMPCOrFallback("/nonexistent", "viewkey", CompileViewKeyCircuit)
	if err != nil {
		t.Fatalf("fallback setup failed: %v", err)
	}
	if pk == nil || vk == nil || cs == nil {
		t.Fatal("fallback returned nil")
	}

	// Test loading from artifacts
	tmpDir := t.TempDir()
	if err := SaveCeremonyKeys(tmpDir, "viewkey", pk, vk); err != nil {
		t.Fatalf("failed to save keys: %v", err)
	}
	pk2, vk2, cs2, err := SetupFromMPCOrFallback(tmpDir, "viewkey", CompileViewKeyCircuit)
	if err != nil {
		t.Fatalf("artifact-based setup failed: %v", err)
	}
	if pk2 == nil || vk2 == nil || cs2 == nil {
		t.Fatal("artifact-based setup returned nil")
	}
}
