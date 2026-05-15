package cmd

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"

	"clawchain/x/privacy/merkle"

	"github.com/spf13/cobra"
)

var nullifierCmd = &cobra.Command{
	Use:   "nullifier",
	Short: "Compute a nullifier = MiMC(secret, commitment)",
	RunE:  runNullifier,
}

var (
	nullSecret     uint64
	nullCommitment string
)

func init() {
	nullifierCmd.Flags().Uint64Var(&nullSecret, "secret", 0, "Secret value (required)")
	nullifierCmd.Flags().StringVar(&nullCommitment, "commitment", "", "Commitment hex string (required)")
	_ = nullifierCmd.MarkFlagRequired("secret")
	_ = nullifierCmd.MarkFlagRequired("commitment")
}

func runNullifier(cmd *cobra.Command, args []string) error {
	commitBytes, err := hex.DecodeString(nullCommitment)
	if err != nil {
		return fmt.Errorf("invalid commitment hex: %w", err)
	}
	commitBig := new(big.Int).SetBytes(commitBytes)
	secretBig := new(big.Int).SetUint64(nullSecret)

	nullifierVal := merkle.MiMCHashPair(secretBig, commitBig)
	nullifierHex := hex.EncodeToString(nullifierVal.Bytes())

	result := map[string]interface{}{
		"nullifier":  nullifierHex,
		"secret":     nullSecret,
		"commitment": nullCommitment,
	}
	out, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal output: %w", err)
	}
	fmt.Println(string(out))
	return nil
}
