package keeper

import (
	"context"
	"errors"
	"strings"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) DisputeEscrow(ctx context.Context, msg *types.MsgDisputeEscrow) (*types.MsgDisputeEscrowResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}
	reason := strings.TrimSpace(msg.Reason)
	if reason == "" {
		return nil, errorsmod.Wrap(types.ErrEmptyReason, "reason cannot be empty")
	}

	escrow, err := k.Escrows.Get(ctx, msg.EscrowId)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrEscrowNotFound, "escrow not found")
	}
	if msg.Creator != escrow.Buyer && msg.Creator != escrow.Seller {
		return nil, errorsmod.Wrap(types.ErrNotEscrowParty, "creator is not escrow party")
	}
	if escrow.Status != "active" {
		return nil, errorsmod.Wrap(types.ErrEscrowNotActive, "escrow is not active")
	}

	_, err = k.Disputes.Get(ctx, msg.EscrowId)
	if err == nil {
		return nil, errorsmod.Wrap(types.ErrDisputeOpen, "dispute already exists")
	}
	if !errors.Is(err, collections.ErrNotFound) {
		return nil, err
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	dispute := types.EscrowDispute{
		EscrowId:   msg.EscrowId,
		Initiator:  msg.Creator,
		Reason:     reason,
		Status:     "open",
		CreatedAt:  blockHeight,
		ResolvedAt: 0,
	}

	if err := k.Disputes.Set(ctx, msg.EscrowId, dispute); err != nil {
		return nil, err
	}
	escrow.Status = "disputed"
	if err := k.Escrows.Set(ctx, msg.EscrowId, escrow); err != nil {
		return nil, err
	}

	return &types.MsgDisputeEscrowResponse{}, nil
}
