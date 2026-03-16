package keeper

import (
	"context"

	errorsmod "cosmossdk.io/errors"

	"clawchain/x/tokenfactory/types"
)

// MsgServer implements the tokenfactory message handling.
type MsgServer struct {
	keeper Keeper
}

// NewMsgServerImpl returns an implementation of the tokenfactory MsgServer.
func NewMsgServerImpl(keeper Keeper) *MsgServer {
	return &MsgServer{keeper: keeper}
}

// CreateDenom handles MsgCreateDenom.
func (ms *MsgServer) CreateDenom(ctx context.Context, msg *types.MsgCreateDenom) (*types.MsgCreateDenomResponse, error) {
	if msg.Sender == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "sender cannot be empty")
	}

	if !types.IsValidSubdenom(msg.Subdenom) {
		return nil, errorsmod.Wrapf(types.ErrInvalidSubdenom, "subdenom: %s", msg.Subdenom)
	}

	denom, err := ms.keeper.CreateDenom(ctx, msg.Sender, msg.Subdenom)
	if err != nil {
		return nil, err
	}

	return &types.MsgCreateDenomResponse{NewTokenDenom: denom}, nil
}

// Mint handles MsgMint.
func (ms *MsgServer) Mint(ctx context.Context, msg *types.MsgMint) (*types.MsgMintResponse, error) {
	if msg.Sender == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "sender cannot be empty")
	}

	coin, err := ParseCoinFromProto(msg.Amount)
	if err != nil {
		return nil, err
	}

	if err := ms.keeper.MintTo(ctx, msg.Sender, coin, msg.MintToAddress); err != nil {
		return nil, err
	}

	return &types.MsgMintResponse{}, nil
}

// Burn handles MsgBurn.
func (ms *MsgServer) Burn(ctx context.Context, msg *types.MsgBurn) (*types.MsgBurnResponse, error) {
	if msg.Sender == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "sender cannot be empty")
	}

	coin, err := ParseCoinFromProto(msg.Amount)
	if err != nil {
		return nil, err
	}

	if err := ms.keeper.BurnFrom(ctx, msg.Sender, coin, msg.BurnFromAddress); err != nil {
		return nil, err
	}

	return &types.MsgBurnResponse{}, nil
}

// SetBeforeSendHook handles MsgSetBeforeSendHook.
func (ms *MsgServer) SetBeforeSendHook(ctx context.Context, msg *types.MsgSetBeforeSendHook) (*types.MsgSetBeforeSendHookResponse, error) {
	if msg.Sender == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "sender cannot be empty")
	}

	if err := ms.keeper.SetBeforeSendHook(ctx, msg.Sender, msg.Denom, msg.CosmwasmAddress); err != nil {
		return nil, err
	}

	return &types.MsgSetBeforeSendHookResponse{}, nil
}
