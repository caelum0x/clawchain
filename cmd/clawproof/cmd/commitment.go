package cmd

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"

	"clawchain/x/privacy/merkle"

	"github.com/spf13/cobra"
)

var commitmentCmd = &cobra.Command{
	Use:   "commitment",
	Short: "Compute a commitment = MiMC(amount, blinding)",
	RunE:  runCommitment,
}

var (
	commitAmount   uint64
	commitBlinding uint64
)

func init() {
	commitmentCmd.Flags().Uint64Var(&commitAmount, "amount", 0, "Amount value (required)")
	commitmentCmd.Flags().Uint64Var(&commitBlinding, "blinding", 0, "Blinding factor (required)")
	_ = commitmentCmd.MarkFlagRequired("amount")
	_ = commitmentCmd.MarkFlagRequired("blinding")
}

func runCommitment(cmd *cobra.Command, args []string) error {
	amountBig := new(big.Int).SetUint64(commitAmount)
	blindingBig := new(big.Int).SetUint64(commitBlinding)

	commitment := merkle.MiMCHashPair(amountBig, blindingBig)
	commitHex := hex.EncodeToString(commitment.Bytes())

	result := map[string]interface{}{
		"commitment": commitHex,
		"amount":     commitAmount,
		"blinding":   commitBlinding,
	}
	out, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal output: %w", err)
	}
	fmt.Println(string(out))
	return nil
}
