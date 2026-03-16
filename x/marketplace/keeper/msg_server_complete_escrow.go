package keeper

import (
	"context"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) CompleteEscrow(ctx context.Context, msg *types.MsgCompleteEscrow) (*types.MsgCompleteEscrowResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	escrow, err := k.Escrows.Get(ctx, msg.EscrowId)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrEscrowNotFound, "escrow not found")
	}
	if escrow.Buyer != msg.Creator {
		return nil, errorsmod.Wrap(types.ErrNotEscrowParty, "only buyer can complete escrow")
	}
	if escrow.Status != "active" {
		return nil, errorsmod.Wrap(types.ErrEscrowNotActive, "escrow is not active")
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	if blockHeight > escrow.DeadlineBlock {
		return nil, errorsmod.Wrap(types.ErrEscrowExpired, "escrow expired")
	}

	remaining, err := escrowRemainingCoin(escrow)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "invalid escrow amount state")
	}
	if remaining.IsPositive() {
		seller, err := sdk.AccAddressFromBech32(escrow.Seller)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid seller address")
		}
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, seller, sdk.NewCoins(remaining)); err != nil {
			return nil, errorsmod.Wrap(types.ErrInsufficientFunds, "failed to release escrow funds")
		}
	}

	escrow.Status = "completed"
	escrow.MilestonesComplete = escrow.Milestones
	escrow.CompletedAt = blockHeight
	if err := k.Escrows.Set(ctx, msg.EscrowId, escrow); err != nil {
		return nil, err
	}

	return &types.MsgCompleteEscrowResponse{}, nil
}
