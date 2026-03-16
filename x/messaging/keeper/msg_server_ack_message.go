package keeper

import (
	"context"
	"errors"

	"clawchain/x/messaging/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) AckMessage(ctx context.Context, msg *types.MsgAckMessage) (*types.MsgAckMessageResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Look up the message.
	record, err := k.Messages.Get(ctx, msg.MessageId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrapf(types.ErrMessageNotFound, "message %d not found", msg.MessageId)
		}
		return nil, errorsmod.Wrap(err, "failed to look up message")
	}

	// Only the recipient can acknowledge.
	if record.Recipient != msg.Creator {
		return nil, errorsmod.Wrap(types.ErrNotRecipient, "only the recipient can acknowledge a message")
	}

	// Check if already acknowledged.
	if record.Acknowledged {
		return nil, errorsmod.Wrapf(types.ErrAlreadyAcked, "message %d already acknowledged", msg.MessageId)
	}

	// Mark as acknowledged.
	record.Acknowledged = true
	if err := k.Messages.Set(ctx, msg.MessageId, record); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update message")
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ack_message",
			sdk.NewAttribute("creator", msg.Creator),
		),
	)

	return &types.MsgAckMessageResponse{}, nil
}
