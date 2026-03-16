package keeper

import (
	"context"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) CompleteMilestone(ctx context.Context, msg *types.MsgCompleteMilestone) (*types.MsgCompleteMilestoneResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	escrow, err := k.Escrows.Get(ctx, msg.EscrowId)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrEscrowNotFound, "escrow not found")
	}
	if escrow.Buyer != msg.Creator {
		return nil, errorsmod.Wrap(types.ErrNotEscrowParty, "only buyer can complete milestone")
	}
	if escrow.Status != "active" {
		return nil, errorsmod.Wrap(types.ErrEscrowNotActive, "escrow is not active")
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	if blockHeight > escrow.DeadlineBlock {
		return nil, errorsmod.Wrap(types.ErrEscrowExpired, "escrow expired")
	}
	if escrow.MilestonesComplete >= escrow.Milestones {
		return nil, errorsmod.Wrap(types.ErrMilestoneComplete, "all milestones already completed")
	}

	payout, err := nextMilestonePayout(escrow)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "invalid escrow payout state")
	}
	if payout.IsPositive() {
		seller, err := sdk.AccAddressFromBech32(escrow.Seller)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid seller address")
		}
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, seller, sdk.NewCoins(payout)); err != nil {
			return nil, errorsmod.Wrap(types.ErrInsufficientFunds, "failed to release milestone payout")
		}
	}

	escrow.MilestonesComplete++
	if escrow.MilestonesComplete == escrow.Milestones {
		escrow.Status = "completed"
		escrow.CompletedAt = blockHeight
	}

	if err := k.Escrows.Set(ctx, msg.EscrowId, escrow); err != nil {
		return nil, err
	}

	return &types.MsgCompleteMilestoneResponse{}, nil
}
