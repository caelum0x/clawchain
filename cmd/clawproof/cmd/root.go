package cmd

import (
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "clawproof",
	Short: "ClawChain ZK proof generator",
	Long: `clawproof generates zero-knowledge proofs off-chain for ClawChain privacy transactions.

It supports trusted setup, commitment/nullifier computation, and Groth16 proof
generation for both private transfers (2-in-2-out) and unshield (withdrawal) operations.

All output is JSON to stdout for easy parsing by AI agents and scripts.`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(setupCmd)
	rootCmd.AddCommand(commitmentCmd)
	rootCmd.AddCommand(nullifierCmd)
	rootCmd.AddCommand(shieldCmd)
	rootCmd.AddCommand(unshieldProofCmd)
	rootCmd.AddCommand(transferProofCmd)
	rootCmd.AddCommand(ceremonyCmd)
}
