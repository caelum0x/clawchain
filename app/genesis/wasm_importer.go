package genesis

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// wasmGenesisState mirrors the minimal structure of the wasm module's genesis
// state needed for importing pre-compiled contracts. We avoid importing the
// full wasmd types to keep this package lightweight and testable.
type wasmGenesisState struct {
	Params    json.RawMessage   `json:"params"`
	Codes     []wasmCode        `json:"codes"`
	Contracts []json.RawMessage `json:"contracts,omitempty"`
	Sequences []json.RawMessage `json:"sequences,omitempty"`
	GenMsgs   []json.RawMessage `json:"gen_msgs,omitempty"`
}

// wasmCode represents a single WASM code entry in genesis.
type wasmCode struct {
	CodeID    uint64       `json:"code_id,string"`
	CodeInfo  wasmCodeInfo `json:"code_info"`
	CodeBytes string       `json:"code_bytes"`
	Pinned    bool         `json:"pinned"`
}

// wasmCodeInfo holds metadata about a WASM code entry.
type wasmCodeInfo struct {
	CodeHash              string          `json:"code_hash"`
	Creator               string          `json:"creator"`
	InstantiatePermission json.RawMessage `json:"instantiate_permission,omitempty"`
}

// ImportWasmContracts imports pre-deployed WASM contracts into the genesis
// state. It scans contractsDir for .wasm files, assigns sequential code IDs
// starting from 1, and updates the wasm module's genesis entry.
//
// The contractsDir should contain compiled .wasm files. Each file becomes a
// separate code entry. The creator address is set to the provided genesisAdmin
// address (typically the governance module address or the chain deployer).
//
// If the wasm module key does not exist in genState, it will be created with
// default parameters. Existing wasm genesis entries are preserved and new
// codes are appended.
//
// This function is idempotent: calling it twice with the same contracts will
// result in duplicate code entries, so it should only be called once during
// genesis preparation.
func ImportWasmContracts(genState map[string]json.RawMessage, contractsDir string, genesisAdmin string) error {
	if contractsDir == "" {
		return fmt.Errorf("contractsDir must not be empty")
	}
	if genesisAdmin == "" {
		return fmt.Errorf("genesisAdmin address must not be empty")
	}

	// Find all .wasm files in the contracts directory.
	entries, err := os.ReadDir(contractsDir)
	if err != nil {
		return fmt.Errorf("failed to read contracts directory %s: %w", contractsDir, err)
	}

	var wasmFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".wasm") {
			wasmFiles = append(wasmFiles, filepath.Join(contractsDir, entry.Name()))
		}
	}

	if len(wasmFiles) == 0 {
		return nil // No contracts to import; this is not an error.
	}

	// Parse existing wasm genesis state or create a new one.
	var wasmGenesis wasmGenesisState
	if raw, ok := genState["wasm"]; ok {
		if err := json.Unmarshal(raw, &wasmGenesis); err != nil {
			return fmt.Errorf("failed to unmarshal existing wasm genesis: %w", err)
		}
	} else {
		// Initialize with minimal defaults.
		wasmGenesis = wasmGenesisState{
			Params: json.RawMessage(`{}`),
		}
	}

	// Determine the next code ID.
	nextCodeID := uint64(1)
	for _, code := range wasmGenesis.Codes {
		if code.CodeID >= nextCodeID {
			nextCodeID = code.CodeID + 1
		}
	}

	// Import each .wasm file.
	for _, wasmPath := range wasmFiles {
		codeBytes, err := os.ReadFile(wasmPath)
		if err != nil {
			return fmt.Errorf("failed to read wasm file %s: %w", wasmPath, err)
		}

		if len(codeBytes) == 0 {
			return fmt.Errorf("wasm file %s is empty", wasmPath)
		}

		// Compute SHA256 hash for code_hash.
		hash := sha256.Sum256(codeBytes)
		codeHashHex := hex.EncodeToString(hash[:])

		// Encode wasm bytes as base64 for JSON embedding.
		codeBytesB64 := base64.StdEncoding.EncodeToString(codeBytes)

		code := wasmCode{
			CodeID: nextCodeID,
			CodeInfo: wasmCodeInfo{
				CodeHash: codeHashHex,
				Creator:  genesisAdmin,
			},
			CodeBytes: codeBytesB64,
			Pinned:    true, // Pin system contracts for better performance.
		}

		wasmGenesis.Codes = append(wasmGenesis.Codes, code)
		nextCodeID++
	}

	// Marshal and write back to genesis state.
	bz, err := json.Marshal(wasmGenesis)
	if err != nil {
		return fmt.Errorf("failed to marshal wasm genesis: %w", err)
	}
	genState["wasm"] = bz

	return nil
}
