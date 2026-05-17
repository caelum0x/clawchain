package keeper

import (
	"bytes"
	"context"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) ResolveDispute(ctx context.Context, msg *types.MsgResolveDispute) (*types.MsgResolveDisputeResponse, error) {
	authority, err := k.addressCodec.StringToBytes(msg.Authority)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidSigner, "invalid authority address")
	}
	if !bytes.Equal(authority, k.GetAuthority()) {
		return nil, errorsmod.Wrapf(types.ErrInvalidSigner, "unauthorized: expected %x, got %x", k.GetAuthority(), authority)
	}

	escrow, err := k.Escrows.Get(ctx, msg.EscrowId)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrEscrowNotFound, "escrow not found")
	}
	dispute, err := k.Disputes.Get(ctx, msg.EscrowId)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDisputeNotFound, "dispute not found")
	}
	if msg.InFavorOf != escrow.Buyer && msg.InFavorOf != escrow.Seller {
		return nil, errorsmod.Wrap(types.ErrInvalidResolution, "in_favor_of must be buyer or seller")
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	remaining, err := escrowRemainingCoin(escrow)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "invalid escrow amount state")
	}
	if msg.InFavorOf == escrow.Buyer {
		if remaining.IsPositive() {
			buyer, err := sdk.AccAddressFromBech32(escrow.Buyer)
			if err != nil {
				return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid buyer address")
			}
			if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, buyer, sdk.NewCoins(remaining)); err != nil {
				return nil, errorsmod.Wrap(types.ErrInsufficientFunds, "failed to refund buyer")
			}
		}
		dispute.Status = "resolved_buyer"
		escrow.Status = "refunded"
	} else {
		if remaining.IsPositive() {
			seller, err := sdk.AccAddressFromBech32(escrow.Seller)
			if err != nil {
				return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid seller address")
			}
			if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, seller, sdk.NewCoins(remaining)); err != nil {
				return nil, errorsmod.Wrap(types.ErrInsufficientFunds, "failed to release seller funds")
			}
		}
		dispute.Status = "resolved_seller"
		escrow.Status = "completed"
		escrow.MilestonesComplete = escrow.Milestones
		escrow.CompletedAt = blockHeight
	}
	dispute.ResolvedAt = blockHeight

	if err := k.Disputes.Set(ctx, msg.EscrowId, dispute); err != nil {
		return nil, err
	}
	if err := k.Escrows.Set(ctx, msg.EscrowId, escrow); err != nil {
		return nil, err
	}

	return &types.MsgResolveDisputeResponse{}, nil
}
