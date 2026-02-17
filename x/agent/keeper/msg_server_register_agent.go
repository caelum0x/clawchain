package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) RegisterAgent(ctx context.Context, msg *types.MsgRegisterAgent) (*types.MsgRegisterAgentResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate required fields.
	if msg.Name == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidAgentName, "agent name cannot be empty")
	}
	if msg.Pubkey == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidPubkey, "agent pubkey cannot be empty")
	}

	// Check if agent is already registered.
	_, err := k.Agents.Get(ctx, msg.Creator)
	if err == nil {
		return nil, errorsmod.Wrap(types.ErrAgentAlreadyExists, msg.Creator)
	}
	if !errors.Is(err, collections.ErrNotFound) {
		return nil, errorsmod.Wrap(err, "failed to check agent existence")
	}

	// Get current block height from the SDK context.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()

	// Create the AgentInfo record.
	agentInfo := types.AgentInfo{
		Address:      msg.Creator,
		Pubkey:       msg.Pubkey,
		Endpoint:     msg.Endpoint,
		Name:         msg.Name,
		RegisteredAt: blockHeight,
		Active:       true,
	}

	// Store in the Agents collection.
	if err := k.Agents.Set(ctx, msg.Creator, agentInfo); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent")
	}

	// Increment agent count.
	if _, err := k.AgentCount.Next(ctx); err != nil {
		return nil, errorsmod.Wrap(err, "failed to increment agent count")
	}

	// Emit event with agent details.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"agent_registered",
			sdk.NewAttribute("address", msg.Creator),
			sdk.NewAttribute("name", msg.Name),
			sdk.NewAttribute("pubkey", msg.Pubkey),
		),
	)

	return &types.MsgRegisterAgentResponse{}, nil
}
