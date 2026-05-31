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
		Long: `Generate the privacy circuits' Groth16 keys in the given directory
(default: <home>/keys): transfer_vk.bin + transfer_pk.bin and unshield_vk.bin +
unshield_pk.bin. The node loads the *_vk.bin to verify proofs at startup; the
matching *_pk.bin let an off-chain prover (clawproof / clawd) GENERATE proofs that
verify against this node — so the shield -> unshield round-trip works out of the box
with no manual key swap.

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

			// writeKey serializes a key to <keysDir>/<name> via the given serializer.
			writeKey := func(name string, serialize func() ([]byte, error)) error {
				b, err := serialize()
				if err != nil {
					return fmt.Errorf("serialize %s: %w", name, err)
				}
				if err := os.WriteFile(filepath.Join(keysDir, name), b, 0o644); err != nil {
					return fmt.Errorf("write %s: %w", name, err)
				}
				return nil
			}

			cmd.Println("Generating transfer circuit keys (this may take a moment)...")
			transferPK, transferVK, _, err := circuit.SetupTransfer()
			if err != nil {
				return fmt.Errorf("setup transfer circuit: %w", err)
			}
			if err := writeKey("transfer_vk.bin", func() ([]byte, error) { return circuit.SerializeVerifyingKey(transferVK) }); err != nil {
				return err
			}
			if err := writeKey("transfer_pk.bin", func() ([]byte, error) { return circuit.SerializeProvingKey(transferPK) }); err != nil {
				return err
			}

			cmd.Println("Generating unshield circuit keys...")
			unshieldPK, unshieldVK, _, err := circuit.SetupUnshield()
			if err != nil {
				return fmt.Errorf("setup unshield circuit: %w", err)
			}
			if err := writeKey("unshield_vk.bin", func() ([]byte, error) { return circuit.SerializeVerifyingKey(unshieldVK) }); err != nil {
				return err
			}
			if err := writeKey("unshield_pk.bin", func() ([]byte, error) { return circuit.SerializeProvingKey(unshieldPK) }); err != nil {
				return err
			}

			cmd.Printf("Wrote dev keys to %s (transfer_{vk,pk}.bin, unshield_{vk,pk}.bin)\n", keysDir)
			cmd.Println("WARNING: development keys only — do NOT use on a network that holds value.")
			return nil
		},
	}
}
