package cmd

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/merkle"

	"github.com/consensys/gnark/frontend"
	"github.com/spf13/cobra"
)

var transferProofCmd = &cobra.Command{
	Use:   "transfer-proof",
	Short: "Generate a Groth16 proof for a private 2-in-2-out transfer",
	Long: `Generates a ZK proof for a private transfer that consumes two existing UTXOs
and creates two new UTXOs, while proving balance conservation and Merkle inclusion.`,
	RunE: runTransferProof,
}

var (
	transferOldAmounts  string
	transferOldBlindings string
	transferOldSecrets  string
	transferNewAmounts  string
	transferNewBlindings string
	transferMerkleTree  string
	transferLeafIndices string
	transferKeysDir     string
)

func init() {
	transferProofCmd.Flags().StringVar(&transferOldAmounts, "old-amounts", "", "Old amounts comma-separated: a1,a2 (required)")
	transferProofCmd.Flags().StringVar(&transferOldBlindings, "old-blindings", "", "Old blindings comma-separated: b1,b2 (required)")
	transferProofCmd.Flags().StringVar(&transferOldSecrets, "old-secrets", "", "Old secrets comma-separated: s1,s2 (required)")
	transferProofCmd.Flags().StringVar(&transferNewAmounts, "new-amounts", "", "New amounts comma-separated: a1,a2 (required)")
	transferProofCmd.Flags().StringVar(&transferNewBlindings, "new-blindings", "", "New blindings comma-separated: b1,b2 (required)")
	transferProofCmd.Flags().StringVar(&transferMerkleTree, "merkle-tree", "", "Path to merkle tree JSON file (required)")
	transferProofCmd.Flags().StringVar(&transferLeafIndices, "leaf-indices", "", "Leaf indices comma-separated: i1,i2 (required)")
	transferProofCmd.Flags().StringVar(&transferKeysDir, "keys-dir", "", "Path to keys directory (required)")
	_ = transferProofCmd.MarkFlagRequired("old-amounts")
	_ = transferProofCmd.MarkFlagRequired("old-blindings")
	_ = transferProofCmd.MarkFlagRequired("old-secrets")
	_ = transferProofCmd.MarkFlagRequired("new-amounts")
	_ = transferProofCmd.MarkFlagRequired("new-blindings")
	_ = transferProofCmd.MarkFlagRequired("merkle-tree")
	_ = transferProofCmd.MarkFlagRequired("leaf-indices")
	_ = transferProofCmd.MarkFlagRequired("keys-dir")
}

// parseUint64Pair parses a comma-separated pair of uint64 values.
func parseUint64Pair(s, name string) ([2]uint64, error) {
	parts := strings.Split(s, ",")
	if len(parts) != 2 {
		return [2]uint64{}, fmt.Errorf("--%s requires exactly 2 comma-separated values, got %d", name, len(parts))
	}
	var result [2]uint64
	for i, p := range parts {
		v, err := strconv.ParseUint(strings.TrimSpace(p), 10, 64)
		if err != nil {
			return [2]uint64{}, fmt.Errorf("invalid value in --%s at position %d: %w", name, i, err)
		}
		result[i] = v
	}
	return result, nil
}

func runTransferProof(cmd *cobra.Command, args []string) error {
	// Parse all comma-separated pairs
	oldAmounts, err := parseUint64Pair(transferOldAmounts, "old-amounts")
	if err != nil {
		return err
	}
	oldBlindings, err := parseUint64Pair(transferOldBlindings, "old-blindings")
	if err != nil {
		return err
	}
	oldSecrets, err := parseUint64Pair(transferOldSecrets, "old-secrets")
	if err != nil {
		return err
	}
	newAmounts, err := parseUint64Pair(transferNewAmounts, "new-amounts")
	if err != nil {
		return err
	}
	newBlindings, err := parseUint64Pair(transferNewBlindings, "new-blindings")
	if err != nil {
		return err
	}
	leafIndices, err := parseUint64Pair(transferLeafIndices, "leaf-indices")
	if err != nil {
		return err
	}

	// Load proving key
	pkPath := filepath.Join(transferKeysDir, "transfer_pk.bin")
	pkData, err := os.ReadFile(pkPath)
	if err != nil {
		return fmt.Errorf("failed to read proving key from %s: %w", pkPath, err)
	}
	pk, err := circuit.DeserializeProvingKey(pkData)
	if err != nil {
		return fmt.Errorf("failed to deserialize proving key: %w", err)
	}

	// Compile the constraint system
	cs, err := circuit.CompileTransferCircuit()
	if err != nil {
		return fmt.Errorf("failed to compile transfer circuit: %w", err)
	}

	// Load and build merkle tree
	leaves, err := loadMerkleLeaves(transferMerkleTree)
	if err != nil {
		return err
	}

	tree, err := buildMerkleTree(leaves)
	if err != nil {
		return err
	}

	root := tree.Root()

	// Compute old commitments, nullifiers, and merkle proofs
	var oldNullifiers [2]*big.Int
	var oldCommitments [2]*big.Int
	var merkleProofs [2]*merkle.Proof

	for i := 0; i < 2; i++ {
		oldAmountBig := new(big.Int).SetUint64(oldAmounts[i])
		oldBlindingBig := new(big.Int).SetUint64(oldBlindings[i])
		oldSecretBig := new(big.Int).SetUint64(oldSecrets[i])

		oldCommitments[i] = merkle.MiMCHashPair(oldAmountBig, oldBlindingBig)
		oldNullifiers[i] = merkle.MiMCHashPair(oldSecretBig, oldCommitments[i])

		mProof, err := tree.GetProof(leafIndices[i])
		if err != nil {
			return fmt.Errorf("failed to get merkle proof for leaf index %d: %w", leafIndices[i], err)
		}
		merkleProofs[i] = mProof
	}

	// Compute new commitments
	var newCommitments [2]*big.Int
	for i := 0; i < 2; i++ {
		newAmountBig := new(big.Int).SetUint64(newAmounts[i])
		newBlindingBig := new(big.Int).SetUint64(newBlindings[i])
		newCommitments[i] = merkle.MiMCHashPair(newAmountBig, newBlindingBig)
	}

	// Build circuit assignment
	var assignMerklePaths [2][circuit.MerkleTreeDepth]frontend.Variable
	var assignMerkleIndices [2][circuit.MerkleTreeDepth]frontend.Variable
	for i := 0; i < 2; i++ {
		for level := 0; level < circuit.MerkleTreeDepth; level++ {
			assignMerklePaths[i][level] = merkleProofs[i].Path[level]
			assignMerkleIndices[i][level] = merkleProofs[i].Indices[level]
		}
	}

	assignment := &circuit.TransferCircuit{
		// Public inputs
		OldNullifiers:  [2]frontend.Variable{oldNullifiers[0], oldNullifiers[1]},
		NewCommitments: [2]frontend.Variable{newCommitments[0], newCommitments[1]},
		MerkleRoot:     root,
		// Private inputs - old UTXOs
		OldAmounts:   [2]frontend.Variable{new(big.Int).SetUint64(oldAmounts[0]), new(big.Int).SetUint64(oldAmounts[1])},
		OldBlindings: [2]frontend.Variable{new(big.Int).SetUint64(oldBlindings[0]), new(big.Int).SetUint64(oldBlindings[1])},
		OldSecrets:   [2]frontend.Variable{new(big.Int).SetUint64(oldSecrets[0]), new(big.Int).SetUint64(oldSecrets[1])},
		// Private inputs - new UTXOs
		NewAmounts:   [2]frontend.Variable{new(big.Int).SetUint64(newAmounts[0]), new(big.Int).SetUint64(newAmounts[1])},
		NewBlindings: [2]frontend.Variable{new(big.Int).SetUint64(newBlindings[0]), new(big.Int).SetUint64(newBlindings[1])},
		// Private inputs - Merkle proofs
		MerklePaths:   assignMerklePaths,
		MerkleIndices: assignMerkleIndices,
	}

	// Generate proof
	fmt.Fprintln(os.Stderr, "Generating transfer proof...")
	groth16Proof, err := circuit.GenerateTransferProof(cs, pk, assignment)
	if err != nil {
		return fmt.Errorf("failed to generate proof: %w", err)
	}

	proofBytes, err := circuit.SerializeProof(groth16Proof)
	if err != nil {
		return fmt.Errorf("failed to serialize proof: %w", err)
	}

	// Build output JSON with all data needed for MsgPrivateTransfer
	result := map[string]interface{}{
		"proof":             hex.EncodeToString(proofBytes),
		"old_nullifiers":    [2]string{hex.EncodeToString(oldNullifiers[0].Bytes()), hex.EncodeToString(oldNullifiers[1].Bytes())},
		"new_commitments":   [2]string{hex.EncodeToString(newCommitments[0].Bytes()), hex.EncodeToString(newCommitments[1].Bytes())},
		"merkle_root":       hex.EncodeToString(root.Bytes()),
		"old_amounts":       oldAmounts,
		"new_amounts":       newAmounts,
	}
	out, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal output: %w", err)
	}
	fmt.Println(string(out))
	return nil
}
