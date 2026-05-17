package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) AgentHeartbeat(ctx context.Context, msg *types.MsgAgentHeartbeat) (*types.MsgAgentHeartbeatResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Verify the creator is a registered agent.
	agent, err := k.Agents.Get(ctx, msg.Creator)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(types.ErrAgentNotFound, msg.Creator)
		}
		return nil, errorsmod.Wrap(err, "failed to look up agent")
	}

	// Enforce minimum heartbeat interval (spam protection).
	if err := k.enforceHeartbeatInterval(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Enforce payload size limit on metadata.
	if err := k.enforcePayloadSize(ctx, msg.Metadata); err != nil {
		return nil, err
	}

	// Re-activate agent if it was deactivated due to stale heartbeat.
	if !agent.Active {
		agent.Active = true
		if err := k.Agents.Set(ctx, msg.Creator, agent); err != nil {
			return nil, errorsmod.Wrap(err, "failed to reactivate agent")
		}
		sdkCtx := sdk.UnwrapSDKContext(ctx)
		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"agent_reactivated",
				sdk.NewAttribute("agent_address", msg.Creator),
			),
		)
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()
	blockTime := sdkCtx.BlockTime().Unix()

	// Load or initialize liveness record.
	liveness, err := k.AgentLiveness.Get(ctx, msg.Creator)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(err, "failed to load agent liveness")
		}
		liveness = types.AgentLiveness{
			AgentAddress: msg.Creator,
		}
	}

	// Update liveness fields.
	liveness.LastHeartbeatHeight = blockHeight
	liveness.LastHeartbeatTime = blockTime
	liveness.ReportedNodeHeight = msg.NodeHeight
	liveness.Endpoint = msg.Endpoint
	liveness.Metadata = msg.Metadata
	liveness.HeartbeatCount++

	if err := k.AgentLiveness.Set(ctx, msg.Creator, liveness); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent liveness")
	}

	// Update agent endpoint if provided and different.
	if msg.Endpoint != "" && agent.Endpoint != msg.Endpoint {
		agent.Endpoint = msg.Endpoint
		if err := k.Agents.Set(ctx, msg.Creator, agent); err != nil {
			return nil, errorsmod.Wrap(err, "failed to update agent endpoint")
		}
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"agent_heartbeat",
			sdk.NewAttribute("agent_address", msg.Creator),
			sdk.NewAttribute("endpoint", msg.Endpoint),
		),
	)

	return &types.MsgAgentHeartbeatResponse{}, nil
}
