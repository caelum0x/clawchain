package cmd

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"

	"clawchain/x/privacy/merkle"

	"github.com/spf13/cobra"
)

var shieldCmd = &cobra.Command{
	Use:   "shield",
	Short: "Generate shield commitment data (no proof needed)",
	Long:  `Computes a commitment for shielding coins. No ZK proof is required for shielding.`,
	RunE:  runShield,
}

var (
	shieldAmount   uint64
	shieldBlinding uint64
)

func init() {
	shieldCmd.Flags().Uint64Var(&shieldAmount, "amount", 0, "Amount to shield (required)")
	shieldCmd.Flags().Uint64Var(&shieldBlinding, "blinding", 0, "Blinding factor (required)")
	_ = shieldCmd.MarkFlagRequired("amount")
	_ = shieldCmd.MarkFlagRequired("blinding")
}

func runShield(cmd *cobra.Command, args []string) error {
	amountBig := new(big.Int).SetUint64(shieldAmount)
	blindingBig := new(big.Int).SetUint64(shieldBlinding)

	commitment := merkle.MiMCHashPair(amountBig, blindingBig)
	commitHex := hex.EncodeToString(commitment.Bytes())

	result := map[string]interface{}{
		"commitment": commitHex,
		"amount":     shieldAmount,
		"blinding":   shieldBlinding,
		"msg": map[string]interface{}{
			"amount": shieldAmount,
			"coins":  "uclaw",
		},
	}
	out, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal output: %w", err)
	}
	fmt.Println(string(out))
	return nil
}
