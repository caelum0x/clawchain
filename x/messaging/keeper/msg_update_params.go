package keeper

import (
	"context"

	"clawchain/x/messaging/types"

	errorsmod "cosmossdk.io/errors"
)

func (k msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Authority); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidSigner, "invalid authority address")
	}

	authorityAddr, err := k.addressCodec.BytesToString(k.GetAuthority())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidSigner, "invalid module authority")
	}

	if msg.Authority != authorityAddr {
		return nil, errorsmod.Wrapf(types.ErrInvalidSigner, "unauthorized: expected %s, got %s", authorityAddr, msg.Authority)
	}

	if err := msg.Params.Validate(); err != nil {
		return nil, err
	}

	if err := k.Params.Set(ctx, msg.Params); err != nil {
		return nil, err
	}

	return &types.MsgUpdateParamsResponse{}, nil
}
