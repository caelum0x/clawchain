package keeper

import (
	"context"
	"errors"

	"clawchain/x/privacy/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) RegisterViewKey(ctx context.Context, msg *types.MsgRegisterViewKey) (*types.MsgRegisterViewKeyResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate required fields.
	if msg.CommitmentHex == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "commitment_hex cannot be empty")
	}
	if msg.EncryptedNote == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "encrypted_note cannot be empty")
	}

	// Check for existing view key.
	_, err := k.ViewKeys.Get(ctx, msg.CommitmentHex)
	if err == nil {
		return nil, errorsmod.Wrap(types.ErrViewKeyAlreadyExists, msg.CommitmentHex)
	}
	if !errors.Is(err, collections.ErrNotFound) {
		return nil, errorsmod.Wrap(err, "failed to check view key existence")
	}

	// Store encrypted note.
	if err := k.ViewKeys.Set(ctx, msg.CommitmentHex, []byte(msg.EncryptedNote)); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store view key")
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"register_view_key",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("commitment_hex", msg.CommitmentHex),
		),
	)

	return &types.MsgRegisterViewKeyResponse{}, nil
}
