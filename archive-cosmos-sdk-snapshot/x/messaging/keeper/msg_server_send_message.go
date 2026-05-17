package keeper

import (
	"context"
	"strings"

	"clawchain/x/messaging/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) SendMessage(ctx context.Context, msg *types.MsgSendMessage) (*types.MsgSendMessageResponse, error) {
	// Validate the sender address.
	if _, err := k.addressCodec.StringToBytes(msg.Sender); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid sender address")
	}

	// Validate the recipient address.
	if _, err := k.addressCodec.StringToBytes(msg.Recipient); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid recipient address")
	}

	// Sender cannot message themselves.
	if msg.Sender == msg.Recipient {
		return nil, errorsmod.Wrap(types.ErrSelfMessage, "sender and recipient are the same")
	}

	// Validate ciphertext.
	if msg.Ciphertext == "" {
		return nil, errorsmod.Wrap(types.ErrEmptyCiphertext, "ciphertext cannot be empty")
	}

	nonce := strings.TrimSpace(msg.Nonce)
	if nonce == "" {
		return nil, errorsmod.Wrap(types.ErrEmptyNonce, "nonce cannot be empty")
	}

	nonceKey := msg.Sender + "|" + nonce
	nonceExists, err := k.MessageNonceIndex.Has(ctx, nonceKey)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to check nonce index")
	}
	if nonceExists {
		return nil, errorsmod.Wrap(types.ErrDuplicateNonce, "duplicate nonce for sender")
	}

	// Check max message size from params.
	params, err := k.Params.Get(ctx)
	if err == nil && params.MaxMessageSize > 0 {
		if uint64(len(msg.Ciphertext)) > params.MaxMessageSize {
			return nil, errorsmod.Wrapf(types.ErrMessageTooLarge, "ciphertext size %d exceeds max %d", len(msg.Ciphertext), params.MaxMessageSize)
		}
	}

	// Get block info.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()
	blockTime := sdkCtx.BlockTime().Unix()

	// Get next message ID.
	messageID, err := k.MessageCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate message ID")
	}

	// Create the message record.
	record := types.MessageEntry{
		Id:           messageID,
		Sender:       msg.Sender,
		Recipient:    msg.Recipient,
		Ciphertext:   msg.Ciphertext,
		Nonce:        nonce,
		BlockHeight:  blockHeight,
		Timestamp:    blockTime,
		Acknowledged: false,
	}

	// Store the message.
	if err := k.Messages.Set(ctx, messageID, record); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store message")
	}
	if err := k.MessageNonceIndex.Set(ctx, nonceKey, messageID); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store nonce index")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"send_message",
			sdk.NewAttribute("sender", msg.Sender),
			sdk.NewAttribute("recipient", msg.Recipient),
			sdk.NewAttribute("nonce", nonce),
		),
	)

	return &types.MsgSendMessageResponse{MessageId: messageID}, nil
}
