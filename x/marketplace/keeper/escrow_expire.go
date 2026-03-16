package keeper

import (
	"context"

	"clawchain/x/marketplace/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// ExpireEscrows marks active escrows past deadline as expired.
func (k Keeper) ExpireEscrows(ctx context.Context) error {
	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	return k.Escrows.Walk(ctx, nil, func(key uint64, escrow types.EscrowAgreement) (bool, error) {
		if escrow.Status != "active" {
			return false, nil
		}
		if blockHeight <= escrow.DeadlineBlock {
			return false, nil
		}

		remaining, err := escrowRemainingCoin(escrow)
		if err != nil {
			return false, err
		}
		if remaining.IsPositive() {
			buyer, err := sdk.AccAddressFromBech32(escrow.Buyer)
			if err != nil {
				return false, err
			}
			if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, buyer, sdk.NewCoins(remaining)); err != nil {
				return false, err
			}
		}

		escrow.Status = "expired"
		escrow.CompletedAt = blockHeight
		if err := k.Escrows.Set(ctx, key, escrow); err != nil {
			return false, err
		}
		return false, nil
	})
}
