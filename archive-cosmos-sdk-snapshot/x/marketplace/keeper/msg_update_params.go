package keeper

import (
	"bytes"
	"context"

	errorsmod "cosmossdk.io/errors"

	"clawchain/x/marketplace/types"
)

func (k msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
	authority, err := k.addressCodec.StringToBytes(msg.Authority)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidSigner, "invalid authority address")
	}
	if !bytes.Equal(authority, k.GetAuthority()) {
		return nil, errorsmod.Wrapf(types.ErrInvalidSigner, "unauthorized: expected %x, got %x", k.GetAuthority(), authority)
	}
	if err := msg.Params.Validate(); err != nil {
		return nil, err
	}
	if err := k.Params.Set(ctx, msg.Params); err != nil {
		return nil, err
	}
	return &types.MsgUpdateParamsResponse{}, nil
}
