package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"clawchain/x/privacy/circuit"

	"github.com/spf13/cobra"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Generate trusted setup (proving key + verifying key) for both circuits",
	Long: `Runs the Groth16 trusted setup for both the TransferCircuit and UnshieldCircuit.
Saves proving keys and verifying keys to ~/.clawchain/keys/.`,
	RunE: runSetup,
}

func runSetup(cmd *cobra.Command, args []string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}
	keysDir := filepath.Join(homeDir, ".clawchain", "keys")
	if err := os.MkdirAll(keysDir, 0o755); err != nil {
		return fmt.Errorf("failed to create keys directory: %w", err)
	}

	// Setup transfer circuit
	fmt.Fprintln(os.Stderr, "Compiling and setting up transfer circuit...")
	transferPK, transferVK, transferCS, err := circuit.SetupTransfer()
	if err != nil {
		return fmt.Errorf("transfer setup failed: %w", err)
	}
	transferConstraints := transferCS.GetNbConstraints()

	// Serialize and save transfer keys
	transferPKBytes, err := circuit.SerializeProvingKey(transferPK)
	if err != nil {
		return fmt.Errorf("failed to serialize transfer proving key: %w", err)
	}
	if err := os.WriteFile(filepath.Join(keysDir, "transfer_pk.bin"), transferPKBytes, 0o644); err != nil {
		return fmt.Errorf("failed to write transfer proving key: %w", err)
	}

	transferVKBytes, err := circuit.SerializeVerifyingKey(transferVK)
	if err != nil {
		return fmt.Errorf("failed to serialize transfer verifying key: %w", err)
	}
	if err := os.WriteFile(filepath.Join(keysDir, "transfer_vk.bin"), transferVKBytes, 0o644); err != nil {
		return fmt.Errorf("failed to write transfer verifying key: %w", err)
	}

	// Setup unshield circuit
	fmt.Fprintln(os.Stderr, "Compiling and setting up unshield circuit...")
	unshieldPK, unshieldVK, unshieldCS, err := circuit.SetupUnshield()
	if err != nil {
		return fmt.Errorf("unshield setup failed: %w", err)
	}
	unshieldConstraints := unshieldCS.GetNbConstraints()

	// Serialize and save unshield keys
	unshieldPKBytes, err := circuit.SerializeProvingKey(unshieldPK)
	if err != nil {
		return fmt.Errorf("failed to serialize unshield proving key: %w", err)
	}
	if err := os.WriteFile(filepath.Join(keysDir, "unshield_pk.bin"), unshieldPKBytes, 0o644); err != nil {
		return fmt.Errorf("failed to write unshield proving key: %w", err)
	}

	unshieldVKBytes, err := circuit.SerializeVerifyingKey(unshieldVK)
	if err != nil {
		return fmt.Errorf("failed to serialize unshield verifying key: %w", err)
	}
	if err := os.WriteFile(filepath.Join(keysDir, "unshield_vk.bin"), unshieldVKBytes, 0o644); err != nil {
		return fmt.Errorf("failed to write unshield verifying key: %w", err)
	}

	// Output JSON summary
	result := map[string]interface{}{
		"transfer_constraints": transferConstraints,
		"unshield_constraints": unshieldConstraints,
		"keys_dir":             keysDir,
	}
	out, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal output: %w", err)
	}
	fmt.Println(string(out))
	return nil
}
