package keeper

import (
	"fmt"

	sdkmath "cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func escrowTotalCoin(escrow types.EscrowAgreement) (sdk.Coin, error) {
	amount, ok := sdkmath.NewIntFromString(escrow.Amount)
	if !ok || !amount.IsPositive() {
		return sdk.Coin{}, fmt.Errorf("invalid escrow amount: %s", escrow.Amount)
	}
	return sdk.NewCoin(escrow.Denom, amount), nil
}

func escrowReleasedAmount(escrow types.EscrowAgreement) (sdkmath.Int, error) {
	total, err := escrowTotalCoin(escrow)
	if err != nil {
		return sdkmath.Int{}, err
	}

	if escrow.Milestones == 0 {
		return sdkmath.Int{}, fmt.Errorf("invalid milestones: 0")
	}

	base := total.Amount.QuoRaw(int64(escrow.Milestones))
	if escrow.MilestonesComplete == 0 {
		return sdkmath.ZeroInt(), nil
	}

	if escrow.MilestonesComplete >= escrow.Milestones {
		return total.Amount, nil
	}

	return base.MulRaw(int64(escrow.MilestonesComplete)), nil
}

func escrowRemainingCoin(escrow types.EscrowAgreement) (sdk.Coin, error) {
	total, err := escrowTotalCoin(escrow)
	if err != nil {
		return sdk.Coin{}, err
	}
	released, err := escrowReleasedAmount(escrow)
	if err != nil {
		return sdk.Coin{}, err
	}
	remaining := total.Amount.Sub(released)
	if remaining.IsNegative() {
		return sdk.Coin{}, fmt.Errorf("negative remaining amount")
	}
	return sdk.NewCoin(escrow.Denom, remaining), nil
}

func nextMilestonePayout(escrow types.EscrowAgreement) (sdk.Coin, error) {
	total, err := escrowTotalCoin(escrow)
	if err != nil {
		return sdk.Coin{}, err
	}
	if escrow.Milestones == 0 {
		return sdk.Coin{}, fmt.Errorf("invalid milestones: 0")
	}
	if escrow.MilestonesComplete >= escrow.Milestones {
		return sdk.Coin{}, fmt.Errorf("all milestones already complete")
	}

	base := total.Amount.QuoRaw(int64(escrow.Milestones))
	if escrow.MilestonesComplete+1 == escrow.Milestones {
		releasedBefore, err := escrowReleasedAmount(escrow)
		if err != nil {
			return sdk.Coin{}, err
		}
		return sdk.NewCoin(escrow.Denom, total.Amount.Sub(releasedBefore)), nil
	}

	return sdk.NewCoin(escrow.Denom, base), nil
}
