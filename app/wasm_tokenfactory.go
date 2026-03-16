package app

import (
	"fmt"

	wasmkeeper "github.com/CosmWasm/wasmd/x/wasm/keeper"
	wasmvmtypes "github.com/CosmWasm/wasmvm/v3/types"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	tokenfactorykeeper "clawchain/x/tokenfactory/keeper"
	tokenfactorytypes "clawchain/x/tokenfactory/types"
)

const (
	typeURLCreateDenom      = "/osmosis.tokenfactory.v1beta1.MsgCreateDenom"
	typeURLMint             = "/osmosis.tokenfactory.v1beta1.MsgMint"
	typeURLBurn             = "/osmosis.tokenfactory.v1beta1.MsgBurn"
	typeURLSetBeforeSendHook = "/osmosis.tokenfactory.v1beta1.MsgSetBeforeSendHook"
)

// tokenFactoryMessageDecorator intercepts Osmosis tokenfactory messages from
// CosmWasm contracts and routes them directly to the tokenfactory keeper.
// This bypasses the default Stargate proto descriptor lookup that fails with
// our hand-written (non-protoc-generated) message types.
type tokenFactoryMessageDecorator struct {
	wrapped wasmkeeper.Messenger
	keeper  *tokenfactorykeeper.Keeper
}

// newTokenFactoryMessageDecorator returns a wasmd WithMessageHandlerDecorator
// option that wraps the default message handler with tokenfactory interception.
func newTokenFactoryMessageDecorator(keeper *tokenfactorykeeper.Keeper) func(old wasmkeeper.Messenger) wasmkeeper.Messenger {
	return func(old wasmkeeper.Messenger) wasmkeeper.Messenger {
		return &tokenFactoryMessageDecorator{
			wrapped: old,
			keeper:  keeper,
		}
	}
}

func (d *tokenFactoryMessageDecorator) DispatchMsg(
	ctx sdk.Context,
	contractAddr sdk.AccAddress,
	contractIBCPortID string,
	msg wasmvmtypes.CosmosMsg,
) ([]sdk.Event, [][]byte, [][]*codectypes.Any, error) {
	// Extract type URL from Any field (Stargate is aliased to Any in wasmd v3)
	if msg.Any == nil {
		return d.wrapped.DispatchMsg(ctx, contractAddr, contractIBCPortID, msg)
	}

	switch msg.Any.TypeURL {
	case typeURLCreateDenom:
		return d.handleCreateDenom(ctx, contractAddr, msg.Any.Value)
	case typeURLMint:
		return d.handleMint(ctx, contractAddr, msg.Any.Value)
	case typeURLBurn:
		return d.handleBurn(ctx, contractAddr, msg.Any.Value)
	case typeURLSetBeforeSendHook:
		return d.handleSetBeforeSendHook(ctx, contractAddr, msg.Any.Value)
	default:
		return d.wrapped.DispatchMsg(ctx, contractAddr, contractIBCPortID, msg)
	}
}

func (d *tokenFactoryMessageDecorator) handleCreateDenom(
	ctx sdk.Context,
	contractAddr sdk.AccAddress,
	value []byte,
) ([]sdk.Event, [][]byte, [][]*codectypes.Any, error) {
	var msg tokenfactorytypes.MsgCreateDenom
	if err := msg.Unmarshal(value); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to unmarshal MsgCreateDenom: %w", err)
	}

	// Sender must be the contract address (contracts act on their own behalf)
	senderStr := contractAddr.String()
	msg.Sender = senderStr

	ms := tokenfactorykeeper.NewMsgServerImpl(*d.keeper)
	cacheCtx, write := ctx.CacheContext()
	resp, err := ms.CreateDenom(cacheCtx, &msg)
	if err != nil {
		return nil, nil, nil, err
	}
	write()

	events := cacheCtx.EventManager().Events()
	data, _ := resp.Marshal()

	return events, [][]byte{data}, nil, nil
}

func (d *tokenFactoryMessageDecorator) handleMint(
	ctx sdk.Context,
	contractAddr sdk.AccAddress,
	value []byte,
) ([]sdk.Event, [][]byte, [][]*codectypes.Any, error) {
	var msg tokenfactorytypes.MsgMint
	if err := msg.Unmarshal(value); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to unmarshal MsgMint: %w", err)
	}

	msg.Sender = contractAddr.String()

	ms := tokenfactorykeeper.NewMsgServerImpl(*d.keeper)
	cacheCtx, write := ctx.CacheContext()
	resp, err := ms.Mint(cacheCtx, &msg)
	if err != nil {
		return nil, nil, nil, err
	}
	write()

	events := cacheCtx.EventManager().Events()
	data, _ := resp.Marshal()

	return events, [][]byte{data}, nil, nil
}

func (d *tokenFactoryMessageDecorator) handleBurn(
	ctx sdk.Context,
	contractAddr sdk.AccAddress,
	value []byte,
) ([]sdk.Event, [][]byte, [][]*codectypes.Any, error) {
	var msg tokenfactorytypes.MsgBurn
	if err := msg.Unmarshal(value); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to unmarshal MsgBurn: %w", err)
	}

	msg.Sender = contractAddr.String()

	ms := tokenfactorykeeper.NewMsgServerImpl(*d.keeper)
	cacheCtx, write := ctx.CacheContext()
	resp, err := ms.Burn(cacheCtx, &msg)
	if err != nil {
		return nil, nil, nil, err
	}
	write()

	events := cacheCtx.EventManager().Events()
	data, _ := resp.Marshal()

	return events, [][]byte{data}, nil, nil
}

func (d *tokenFactoryMessageDecorator) handleSetBeforeSendHook(
	ctx sdk.Context,
	contractAddr sdk.AccAddress,
	value []byte,
) ([]sdk.Event, [][]byte, [][]*codectypes.Any, error) {
	var msg tokenfactorytypes.MsgSetBeforeSendHook
	if err := msg.Unmarshal(value); err != nil {
		return nil, nil, nil, fmt.Errorf("failed to unmarshal MsgSetBeforeSendHook: %w", err)
	}

	msg.Sender = contractAddr.String()

	ms := tokenfactorykeeper.NewMsgServerImpl(*d.keeper)
	cacheCtx, write := ctx.CacheContext()
	resp, err := ms.SetBeforeSendHook(cacheCtx, &msg)
	if err != nil {
		return nil, nil, nil, err
	}
	write()

	events := cacheCtx.EventManager().Events()
	data, _ := resp.Marshal()

	return events, [][]byte{data}, nil, nil
}
