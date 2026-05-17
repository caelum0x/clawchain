package cmd

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/merkle"

	"github.com/consensys/gnark/frontend"
	"github.com/spf13/cobra"
)

var unshieldProofCmd = &cobra.Command{
	Use:   "unshield-proof",
	Short: "Generate a Groth16 proof for unshielding (withdrawal)",
	Long: `Generates a ZK proof that you own a UTXO commitment in the Merkle tree,
allowing you to withdraw the funds back to a public address.`,
	RunE: runUnshieldProof,
}

var (
	unshieldAmount     uint64
	unshieldBlinding   uint64
	unshieldSecret     uint64
	unshieldMerkleTree string
	unshieldKeysDir    string
)

func init() {
	unshieldProofCmd.Flags().Uint64Var(&unshieldAmount, "amount", 0, "Amount in the UTXO (required)")
	unshieldProofCmd.Flags().Uint64Var(&unshieldBlinding, "blinding", 0, "Blinding factor (required)")
	unshieldProofCmd.Flags().Uint64Var(&unshieldSecret, "secret", 0, "Secret for nullifier derivation (required)")
	unshieldProofCmd.Flags().StringVar(&unshieldMerkleTree, "merkle-tree", "", "Path to merkle tree JSON file (required)")
	unshieldProofCmd.Flags().StringVar(&unshieldKeysDir, "keys-dir", "", "Path to keys directory (required)")
	_ = unshieldProofCmd.MarkFlagRequired("amount")
	_ = unshieldProofCmd.MarkFlagRequired("blinding")
	_ = unshieldProofCmd.MarkFlagRequired("secret")
	_ = unshieldProofCmd.MarkFlagRequired("merkle-tree")
	_ = unshieldProofCmd.MarkFlagRequired("keys-dir")
}

// merkleTreeFile represents the JSON format for the merkle tree leaves file.
type merkleTreeFile struct {
	Leaves []string `json:"leaves"`
}

// loadMerkleLeaves reads the merkle tree JSON file and returns the leaves as big.Int values.
func loadMerkleLeaves(path string) ([]*big.Int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read merkle tree file: %w", err)
	}

	var mtf merkleTreeFile
	if err := json.Unmarshal(data, &mtf); err != nil {
		return nil, fmt.Errorf("failed to parse merkle tree JSON: %w", err)
	}

	leaves := make([]*big.Int, len(mtf.Leaves))
	for i, leafHex := range mtf.Leaves {
		leafBytes, err := hex.DecodeString(leafHex)
		if err != nil {
			return nil, fmt.Errorf("invalid hex for leaf %d: %w", i, err)
		}
		leaves[i] = new(big.Int).SetBytes(leafBytes)
	}
	return leaves, nil
}

// buildMerkleTree constructs a merkle.Tree from a slice of leaf values.
func buildMerkleTree(leaves []*big.Int) (*merkle.Tree, error) {
	tree := merkle.NewTree()
	for i, leaf := range leaves {
		if _, err := tree.Insert(leaf); err != nil {
			return nil, fmt.Errorf("failed to insert leaf %d: %w", i, err)
		}
	}
	return tree, nil
}

// findLeafIndex returns the index of the target leaf in the leaves slice, or -1 if not found.
func findLeafIndex(leaves []*big.Int, target *big.Int) int {
	for i, leaf := range leaves {
		if leaf.Cmp(target) == 0 {
			return i
		}
	}
	return -1
}

func runUnshieldProof(cmd *cobra.Command, args []string) error {
	// Load proving key
	pkPath := filepath.Join(unshieldKeysDir, "unshield_pk.bin")
	pkData, err := os.ReadFile(pkPath)
	if err != nil {
		return fmt.Errorf("failed to read proving key from %s: %w", pkPath, err)
	}
	pk, err := circuit.DeserializeProvingKey(pkData)
	if err != nil {
		return fmt.Errorf("failed to deserialize proving key: %w", err)
	}

	// Compile the constraint system (needed for proof generation)
	cs, err := circuit.CompileUnshieldCircuit()
	if err != nil {
		return fmt.Errorf("failed to compile unshield circuit: %w", err)
	}

	// Compute commitment and nullifier off-chain
	amountBig := new(big.Int).SetUint64(unshieldAmount)
	blindingBig := new(big.Int).SetUint64(unshieldBlinding)
	secretBig := new(big.Int).SetUint64(unshieldSecret)

	commitment := merkle.MiMCHashPair(amountBig, blindingBig)
	nullifier := merkle.MiMCHashPair(secretBig, commitment)

	// Load and build merkle tree
	leaves, err := loadMerkleLeaves(unshieldMerkleTree)
	if err != nil {
		return err
	}

	tree, err := buildMerkleTree(leaves)
	if err != nil {
		return err
	}

	// Find the leaf index for our commitment
	leafIdx := findLeafIndex(leaves, commitment)
	if leafIdx < 0 {
		return fmt.Errorf("commitment not found in merkle tree leaves")
	}

	// Get merkle proof
	proof, err := tree.GetProof(uint64(leafIdx))
	if err != nil {
		return fmt.Errorf("failed to get merkle proof: %w", err)
	}

	root := tree.Root()

	// Build the circuit assignment
	var merklePath [circuit.MerkleTreeDepth]frontend.Variable
	var merkleIndices [circuit.MerkleTreeDepth]frontend.Variable
	for i := 0; i < circuit.MerkleTreeDepth; i++ {
		merklePath[i] = proof.Path[i]
		merkleIndices[i] = proof.Indices[i]
	}

	assignment := &circuit.UnshieldCircuit{
		// Public inputs
		Nullifier:  nullifier,
		Commitment: commitment,
		Amount:     amountBig,
		MerkleRoot: root,
		// Private inputs
		Blinding:      blindingBig,
		Secret:        secretBig,
		MerklePath:    merklePath,
		MerkleIndices: merkleIndices,
	}

	// Generate proof
	fmt.Fprintln(os.Stderr, "Generating unshield proof...")
	groth16Proof, err := circuit.GenerateUnshieldProof(cs, pk, assignment)
	if err != nil {
		return fmt.Errorf("failed to generate proof: %w", err)
	}

	proofBytes, err := circuit.SerializeProof(groth16Proof)
	if err != nil {
		return fmt.Errorf("failed to serialize proof: %w", err)
	}

	result := map[string]interface{}{
		"proof":       hex.EncodeToString(proofBytes),
		"nullifier":   hex.EncodeToString(nullifier.Bytes()),
		"commitment":  hex.EncodeToString(commitment.Bytes()),
		"amount":      unshieldAmount,
		"merkle_root": hex.EncodeToString(root.Bytes()),
	}
	out, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal output: %w", err)
	}
	fmt.Println(string(out))
	return nil
}
