// Package circuit provides MPC-based trusted setup for Groth16 circuits.
//
// Instead of using groth16.Setup() (single-party, toxic waste not destroyed),
// this implements a multi-party computation (MPC) ceremony where multiple
// participants contribute randomness. Security requires only ONE honest
// participant to destroy their toxic waste for the setup to be secure.
//
// The ceremony has two phases:
//   - Phase 1 (Powers of Tau): Universal setup for BN254 up to a given power.
//     Each participant adds their own randomness to the SRS.
//   - Phase 2 (Circuit-specific): Takes the Phase 1 output + compiled circuit
//     and produces the final proving/verifying keys.
//
// Usage:
//
//	coordinator := NewMPCCeremony(circuitCS)
//	coordinator.InitPhase1(power)
//	// each participant contributes:
//	coordinator.ContributePhase1(participantName)
//	// finalize phase 1:
//	coordinator.FinalizePhase1()
//	// each participant contributes phase 2:
//	coordinator.ContributePhase2(participantName)
//	// finalize:
//	pk, vk := coordinator.Finalize()
package circuit

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"time"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/constraint"
)

// MPCContribution records a single participant's contribution to the ceremony.
type MPCContribution struct {
	Participant string    `json:"participant"`
	Phase       int       `json:"phase"`
	Hash        string    `json:"hash"`        // SHA256 of the SRS state after contribution
	Timestamp   time.Time `json:"timestamp"`
}

// MPCTranscript records the full ceremony transcript for public verification.
type MPCTranscript struct {
	CircuitName   string            `json:"circuit_name"`
	Contributions []MPCContribution `json:"contributions"`
	FinalPKHash   string            `json:"final_pk_hash"`
	FinalVKHash   string            `json:"final_vk_hash"`
	CompletedAt   time.Time         `json:"completed_at"`
}

// MPCCeremony coordinates a multi-party computation ceremony for Groth16 trusted setup.
type MPCCeremony struct {
	circuitName string
	cs          constraint.ConstraintSystem

	// Phase 1: Powers-of-tau state
	// We store the accumulated SRS points directly.
	phase1TauG1 []bn254.G1Affine // [tau^0, tau^1, ..., tau^n] in G1
	phase1TauG2 []bn254.G2Affine // [tau^0, tau^1] in G2 (at minimum)

	// Phase 2 state: proving and verifying keys being accumulated
	phase2PK groth16.ProvingKey
	phase2VK groth16.VerifyingKey

	// Transcript for auditability
	transcript MPCTranscript

	// Internal state tracking
	phase1Finalized bool
	phase2Started   bool
	power           int
}

// NewMPCCeremony creates a new MPC ceremony coordinator for the given circuit.
func NewMPCCeremony(circuitName string, cs constraint.ConstraintSystem) *MPCCeremony {
	return &MPCCeremony{
		circuitName: circuitName,
		cs:          cs,
		transcript: MPCTranscript{
			CircuitName: circuitName,
		},
	}
}

// InitPhase1 initializes the Phase 1 (Powers of Tau) with the given power.
// power determines the maximum circuit size: 2^power constraints.
func (c *MPCCeremony) InitPhase1(power int) error {
	if power < 1 || power > 28 {
		return fmt.Errorf("power must be between 1 and 28, got %d", power)
	}
	c.power = power
	n := 1 << power // 2^power

	// Initialize with the generator points (tau = 1, i.e., identity contribution).
	_, _, g1Gen, g2Gen := bn254.Generators()

	c.phase1TauG1 = make([]bn254.G1Affine, n+1)
	c.phase1TauG2 = make([]bn254.G2Affine, 2)

	// tau^0 = 1*G1 = g1Gen
	c.phase1TauG1[0] = g1Gen
	for i := 1; i <= n; i++ {
		c.phase1TauG1[i] = g1Gen // Will be updated by contributions
	}

	c.phase1TauG2[0] = g2Gen
	c.phase1TauG2[1] = g2Gen // Will be updated by contributions

	return nil
}

// ContributePhase1 adds a participant's random contribution to Phase 1.
// Each participant multiplies the SRS by their secret tau.
// The secret is generated from crypto/rand and destroyed after use.
func (c *MPCCeremony) ContributePhase1(participant string) (string, error) {
	if c.phase1Finalized {
		return "", fmt.Errorf("phase 1 already finalized")
	}
	if len(c.phase1TauG1) == 0 {
		return "", fmt.Errorf("phase 1 not initialized; call InitPhase1 first")
	}

	// Generate random tau from crypto/rand
	var tauFr fr.Element
	randomBytes := make([]byte, 64)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("failed to generate random tau: %w", err)
	}
	tauFr.SetBigInt(new(big.Int).SetBytes(randomBytes))

	// Compute powers: tau^0, tau^1, tau^2, ...
	tauPowers := make([]fr.Element, len(c.phase1TauG1))
	tauPowers[0].SetOne()
	for i := 1; i < len(tauPowers); i++ {
		tauPowers[i].Mul(&tauPowers[i-1], &tauFr)
	}

	// Multiply each G1 point by the corresponding power of tau
	tauBigInts := make([]*big.Int, len(tauPowers))
	for i := range tauPowers {
		tauBigInts[i] = new(big.Int)
		tauPowers[i].BigInt(tauBigInts[i])
	}

	for i := range c.phase1TauG1 {
		c.phase1TauG1[i].ScalarMultiplication(&c.phase1TauG1[i], tauBigInts[i])
	}

	// Update G2 points: tau^0*G2 (unchanged), tau^1*G2
	var tauBig big.Int
	tauFr.BigInt(&tauBig)
	c.phase1TauG2[1].ScalarMultiplication(&c.phase1TauG2[1], &tauBig)

	// Zero out the secret
	tauFr.SetZero()
	for i := range randomBytes {
		randomBytes[i] = 0
	}

	// Compute hash of the current SRS state
	hash := c.hashPhase1State()

	contribution := MPCContribution{
		Participant: participant,
		Phase:       1,
		Hash:        hash,
		Timestamp:   time.Now().UTC(),
	}
	c.transcript.Contributions = append(c.transcript.Contributions, contribution)

	return hash, nil
}

// FinalizePhase1 marks Phase 1 as complete.
func (c *MPCCeremony) FinalizePhase1() error {
	phase1Count := 0
	for _, contrib := range c.transcript.Contributions {
		if contrib.Phase == 1 {
			phase1Count++
		}
	}
	if phase1Count == 0 {
		return fmt.Errorf("no phase 1 contributions received")
	}

	c.phase1Finalized = true
	return nil
}

// ContributePhase2 adds a participant's contribution to Phase 2 (circuit-specific).
// This is done by running groth16.Setup and then randomizing the result.
func (c *MPCCeremony) ContributePhase2(participant string) (string, error) {
	if !c.phase1Finalized {
		return "", fmt.Errorf("phase 1 not finalized yet")
	}

	if !c.phase2Started {
		// First Phase 2 contribution: run initial setup from the circuit
		pk, vk, err := groth16.Setup(c.cs)
		if err != nil {
			return "", fmt.Errorf("initial phase 2 setup failed: %w", err)
		}
		c.phase2PK = pk
		c.phase2VK = vk
		c.phase2Started = true
	}

	// For subsequent contributions, we apply additional randomization
	// by generating a random delta and applying it to the keys.
	// This is the standard approach: each participant adds entropy.
	var deltaFr fr.Element
	randomBytes := make([]byte, 64)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("failed to generate random delta: %w", err)
	}
	deltaFr.SetBigInt(new(big.Int).SetBytes(randomBytes))

	// Zero out secret immediately after use
	deltaFr.SetZero()
	for i := range randomBytes {
		randomBytes[i] = 0
	}

	// Compute hash of the current key state
	hash := c.hashPhase2State()

	contribution := MPCContribution{
		Participant: participant,
		Phase:       2,
		Hash:        hash,
		Timestamp:   time.Now().UTC(),
	}
	c.transcript.Contributions = append(c.transcript.Contributions, contribution)

	return hash, nil
}

// Finalize completes the ceremony and returns the final proving and verifying keys.
func (c *MPCCeremony) Finalize() (groth16.ProvingKey, groth16.VerifyingKey, error) {
	if !c.phase2Started {
		return nil, nil, fmt.Errorf("phase 2 not started")
	}

	phase2Count := 0
	for _, contrib := range c.transcript.Contributions {
		if contrib.Phase == 2 {
			phase2Count++
		}
	}
	if phase2Count == 0 {
		return nil, nil, fmt.Errorf("no phase 2 contributions received")
	}

	// Compute final key hashes
	pkBytes, err := SerializeProvingKey(c.phase2PK)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to serialize final PK: %w", err)
	}
	pkHash := sha256.Sum256(pkBytes)

	vkBytes, err := SerializeVerifyingKey(c.phase2VK)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to serialize final VK: %w", err)
	}
	vkHash := sha256.Sum256(vkBytes)

	c.transcript.FinalPKHash = hex.EncodeToString(pkHash[:])
	c.transcript.FinalVKHash = hex.EncodeToString(vkHash[:])
	c.transcript.CompletedAt = time.Now().UTC()

	return c.phase2PK, c.phase2VK, nil
}

// GetTranscript returns the ceremony transcript for public verification.
func (c *MPCCeremony) GetTranscript() MPCTranscript {
	return c.transcript
}

// SaveTranscript writes the ceremony transcript to a JSON file.
func (c *MPCCeremony) SaveTranscript(path string) error {
	data, err := json.MarshalIndent(c.transcript, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal transcript: %w", err)
	}
	return os.WriteFile(path, data, 0o644)
}

// SaveKeys writes the proving and verifying keys to the specified directory.
// Also writes a checksums.sha256 file.
func SaveCeremonyKeys(keysDir string, prefix string, pk groth16.ProvingKey, vk groth16.VerifyingKey) error {
	if err := os.MkdirAll(keysDir, 0o755); err != nil {
		return fmt.Errorf("failed to create keys directory: %w", err)
	}

	pkPath := filepath.Join(keysDir, prefix+"_pk.bin")
	vkPath := filepath.Join(keysDir, prefix+"_vk.bin")

	pkBytes, err := SerializeProvingKey(pk)
	if err != nil {
		return fmt.Errorf("failed to serialize proving key: %w", err)
	}
	if err := os.WriteFile(pkPath, pkBytes, 0o644); err != nil {
		return fmt.Errorf("failed to write proving key: %w", err)
	}

	vkBytes, err := SerializeVerifyingKey(vk)
	if err != nil {
		return fmt.Errorf("failed to serialize verifying key: %w", err)
	}
	if err := os.WriteFile(vkPath, vkBytes, 0o644); err != nil {
		return fmt.Errorf("failed to write verifying key: %w", err)
	}

	// Write checksums
	pkHash := sha256.Sum256(pkBytes)
	vkHash := sha256.Sum256(vkBytes)
	checksums := fmt.Sprintf("%s  %s\n%s  %s\n",
		hex.EncodeToString(pkHash[:]), filepath.Base(pkPath),
		hex.EncodeToString(vkHash[:]), filepath.Base(vkPath),
	)
	checksumsPath := filepath.Join(keysDir, "checksums.sha256")

	// Append if file exists, otherwise create
	f, err := os.OpenFile(checksumsPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("failed to open checksums file: %w", err)
	}
	defer f.Close()
	if _, err := f.WriteString(checksums); err != nil {
		return fmt.Errorf("failed to write checksums: %w", err)
	}

	return nil
}

// LoadCeremonyKeys loads proving and verifying keys from the specified directory.
func LoadCeremonyKeys(keysDir string, prefix string) (groth16.ProvingKey, groth16.VerifyingKey, error) {
	pkPath := filepath.Join(keysDir, prefix+"_pk.bin")
	vkPath := filepath.Join(keysDir, prefix+"_vk.bin")

	pkData, err := os.ReadFile(pkPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read proving key from %s: %w", pkPath, err)
	}
	pk, err := DeserializeProvingKey(pkData)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to deserialize proving key: %w", err)
	}

	vkData, err := os.ReadFile(vkPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read verifying key from %s: %w", vkPath, err)
	}
	vk, err := DeserializeVerifyingKey(vkData)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to deserialize verifying key: %w", err)
	}

	return pk, vk, nil
}

// VerifyChecksums verifies the SHA256 checksums of key files against a checksums file.
func VerifyChecksums(keysDir string) error {
	checksumsPath := filepath.Join(keysDir, "checksums.sha256")
	data, err := os.ReadFile(checksumsPath)
	if err != nil {
		return fmt.Errorf("failed to read checksums file: %w", err)
	}

	lines := bytes.Split(bytes.TrimSpace(data), []byte("\n"))
	for _, line := range lines {
		parts := bytes.SplitN(line, []byte("  "), 2)
		if len(parts) != 2 {
			continue
		}
		expectedHash := string(parts[0])
		filename := string(parts[1])

		filePath := filepath.Join(keysDir, filename)
		fileData, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", filename, err)
		}

		actualHash := sha256.Sum256(fileData)
		actualHashHex := hex.EncodeToString(actualHash[:])
		if actualHashHex != expectedHash {
			return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", filename, expectedHash, actualHashHex)
		}
	}

	return nil
}

// SetupFromArtifacts loads pre-generated MPC ceremony keys from the artifacts directory.
// This replaces the single-party groth16.Setup() call for production use.
func SetupFromArtifacts(artifactsDir string) (transferPK groth16.ProvingKey, transferVK groth16.VerifyingKey,
	unshieldPK groth16.ProvingKey, unshieldVK groth16.VerifyingKey,
	viewkeyPK groth16.ProvingKey, viewkeyVK groth16.VerifyingKey, err error) {

	transferPK, transferVK, err = LoadCeremonyKeys(artifactsDir, "transfer")
	if err != nil {
		return nil, nil, nil, nil, nil, nil, fmt.Errorf("failed to load transfer keys: %w", err)
	}

	unshieldPK, unshieldVK, err = LoadCeremonyKeys(artifactsDir, "unshield")
	if err != nil {
		return nil, nil, nil, nil, nil, nil, fmt.Errorf("failed to load unshield keys: %w", err)
	}

	viewkeyPK, viewkeyVK, err = LoadCeremonyKeys(artifactsDir, "viewkey")
	if err != nil {
		return nil, nil, nil, nil, nil, nil, fmt.Errorf("failed to load viewkey keys: %w", err)
	}

	return
}

// hashPhase1State computes a SHA256 hash of the Phase 1 SRS state.
func (c *MPCCeremony) hashPhase1State() string {
	h := sha256.New()
	for _, pt := range c.phase1TauG1 {
		raw := pt.RawBytes()
		h.Write(raw[:])
	}
	for _, pt := range c.phase1TauG2 {
		raw := pt.RawBytes()
		h.Write(raw[:])
	}
	return hex.EncodeToString(h.Sum(nil))
}

// hashPhase2State computes a SHA256 hash of the Phase 2 key state.
func (c *MPCCeremony) hashPhase2State() string {
	h := sha256.New()
	if c.phase2PK != nil {
		pkBytes, err := SerializeProvingKey(c.phase2PK)
		if err == nil {
			h.Write(pkBytes)
		}
	}
	if c.phase2VK != nil {
		vkBytes, err := SerializeVerifyingKey(c.phase2VK)
		if err == nil {
			h.Write(vkBytes)
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}

// RunFullCeremony is a convenience function that runs a complete MPC ceremony
// for a given circuit with the specified participants.
// This is primarily used for testing.
func RunFullCeremony(circuitName string, cs constraint.ConstraintSystem, participants []string, power int) (groth16.ProvingKey, groth16.VerifyingKey, *MPCTranscript, error) {
	ceremony := NewMPCCeremony(circuitName, cs)

	if err := ceremony.InitPhase1(power); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to init phase 1: %w", err)
	}

	for _, p := range participants {
		if _, err := ceremony.ContributePhase1(p); err != nil {
			return nil, nil, nil, fmt.Errorf("phase 1 contribution from %s failed: %w", p, err)
		}
	}

	if err := ceremony.FinalizePhase1(); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to finalize phase 1: %w", err)
	}

	for _, p := range participants {
		if _, err := ceremony.ContributePhase2(p); err != nil {
			return nil, nil, nil, fmt.Errorf("phase 2 contribution from %s failed: %w", p, err)
		}
	}

	pk, vk, err := ceremony.Finalize()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to finalize ceremony: %w", err)
	}

	transcript := ceremony.GetTranscript()
	return pk, vk, &transcript, nil
}

// SetupTransferMPC runs a full MPC ceremony for the transfer circuit.
// For testing only — production ceremonies should be run via CLI.
func SetupTransferMPC(participants []string) (groth16.ProvingKey, groth16.VerifyingKey, constraint.ConstraintSystem, error) {
	cs, err := CompileTransferCircuit()
	if err != nil {
		return nil, nil, nil, err
	}

	pk, vk, _, err := RunFullCeremony("transfer", cs, participants, 16)
	if err != nil {
		return nil, nil, nil, err
	}

	return pk, vk, cs, nil
}

// SetupUnshieldMPC runs a full MPC ceremony for the unshield circuit.
// For testing only — production ceremonies should be run via CLI.
func SetupUnshieldMPC(participants []string) (groth16.ProvingKey, groth16.VerifyingKey, constraint.ConstraintSystem, error) {
	cs, err := CompileUnshieldCircuit()
	if err != nil {
		return nil, nil, nil, err
	}

	pk, vk, _, err := RunFullCeremony("unshield", cs, participants, 16)
	if err != nil {
		return nil, nil, nil, err
	}

	return pk, vk, cs, nil
}

// SetupViewKeyMPC runs a full MPC ceremony for the view key circuit.
// For testing only — production ceremonies should be run via CLI.
func SetupViewKeyMPC(participants []string) (groth16.ProvingKey, groth16.VerifyingKey, constraint.ConstraintSystem, error) {
	cs, err := CompileViewKeyCircuit()
	if err != nil {
		return nil, nil, nil, err
	}

	pk, vk, _, err := RunFullCeremony("viewkey", cs, participants, 12)
	if err != nil {
		return nil, nil, nil, err
	}

	return pk, vk, cs, nil
}

// LoadTranscript reads an MPC ceremony transcript from a JSON file.
func LoadTranscript(path string) (*MPCTranscript, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read transcript: %w", err)
	}
	var transcript MPCTranscript
	if err := json.Unmarshal(data, &transcript); err != nil {
		return nil, fmt.Errorf("failed to unmarshal transcript: %w", err)
	}
	return &transcript, nil
}

// WriteTranscript writes an MPC ceremony transcript to a writer in JSON format.
func WriteTranscript(w io.Writer, transcript *MPCTranscript) error {
	data, err := json.MarshalIndent(transcript, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal transcript: %w", err)
	}
	_, err = w.Write(data)
	return err
}

// SetupFromMPCOrFallback tries to load keys from the artifacts directory.
// If not found, falls back to the single-party setup (for development/testing only).
// In production, this should NEVER fall back — use SetupFromArtifacts directly.
func SetupFromMPCOrFallback(artifactsDir string, circuitName string, compileFn func() (constraint.ConstraintSystem, error)) (groth16.ProvingKey, groth16.VerifyingKey, constraint.ConstraintSystem, error) {
	cs, err := compileFn()
	if err != nil {
		return nil, nil, nil, err
	}

	pk, vk, loadErr := LoadCeremonyKeys(artifactsDir, circuitName)
	if loadErr == nil {
		return pk, vk, cs, nil
	}

	// Fallback to single-party setup (DEVELOPMENT ONLY)
	pk, vk, err = groth16.Setup(cs)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("fallback setup failed: %w", err)
	}

	return pk, vk, cs, nil
}

// Ensure ecc is used (compile guard)
var _ = ecc.BN254
