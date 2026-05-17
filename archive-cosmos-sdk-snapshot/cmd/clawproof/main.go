// Package main provides the clawproof CLI tool for generating ZK proofs
// off-chain before submitting transactions to ClawChain.
//
// This tool is invoked by AI agents (or users) to generate Groth16 proofs
// for private transfers and unshielding operations.
package main

import (
	"os"

	"clawchain/cmd/clawproof/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
