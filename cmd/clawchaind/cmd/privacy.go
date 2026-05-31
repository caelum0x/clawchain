package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"clawchain/app"
	"clawchain/x/privacy/circuit"
)

// privacyCmd groups privacy-module developer utilities.
func privacyCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "privacy",
		Short: "Privacy module developer utilities",
	}
	cmd.AddCommand(privacyGenDevKeysCmd())
	return cmd
}

// privacyGenDevKeysCmd generates the Groth16 verifying keys the privacy module
// loads at startup, for LOCAL DEVELOPMENT ONLY.
func privacyGenDevKeysCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "gen-dev-keys [keys-dir]",
		Short: "Generate INSECURE privacy ZK verifying keys for local development",
		Long: `Generate transfer_vk.bin and unshield_vk.bin in the given directory
(default: <home>/keys) so a local development node can verify privacy proofs.

WARNING: these keys come from a local, untrusted Groth16 setup and are for
development only. A production network MUST use the trusted-setup MPC ceremony
output instead (see artifacts/ceremony-transcript.json).`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			keysDir := filepath.Join(app.DefaultNodeHome, "keys")
			if len(args) == 1 {
				keysDir = args[0]
			}
			if err := os.MkdirAll(keysDir, 0o755); err != nil {
				return fmt.Errorf("create keys dir: %w", err)
			}

			cmd.Println("Generating transfer verifying key (this may take a moment)...")
			_, transferVK, _, err := circuit.SetupTransfer()
			if err != nil {
				return fmt.Errorf("setup transfer circuit: %w", err)
			}
			tvk, err := circuit.SerializeVerifyingKey(transferVK)
			if err != nil {
				return fmt.Errorf("serialize transfer vk: %w", err)
			}
			if err := os.WriteFile(filepath.Join(keysDir, "transfer_vk.bin"), tvk, 0o644); err != nil {
				return fmt.Errorf("write transfer_vk.bin: %w", err)
			}

			cmd.Println("Generating unshield verifying key...")
			_, unshieldVK, _, err := circuit.SetupUnshield()
			if err != nil {
				return fmt.Errorf("setup unshield circuit: %w", err)
			}
			uvk, err := circuit.SerializeVerifyingKey(unshieldVK)
			if err != nil {
				return fmt.Errorf("serialize unshield vk: %w", err)
			}
			if err := os.WriteFile(filepath.Join(keysDir, "unshield_vk.bin"), uvk, 0o644); err != nil {
				return fmt.Errorf("write unshield_vk.bin: %w", err)
			}

			cmd.Printf("Wrote dev verifying keys to %s (transfer_vk.bin, unshield_vk.bin)\n", keysDir)
			cmd.Println("WARNING: development keys only — do NOT use on a network that holds value.")
			return nil
		},
	}
}
