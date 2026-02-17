package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) AgentAction(ctx context.Context, msg *types.MsgAgentAction) (*types.MsgAgentActionResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate that the creator is a registered agent.
	agent, err := k.Agents.Get(ctx, msg.Creator)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(types.ErrAgentNotFound, msg.Creator)
		}
		return nil, errorsmod.Wrap(err, "failed to look up agent")
	}

	// Verify the agent is active.
	if !agent.Active {
		return nil, errorsmod.Wrap(types.ErrAgentNotFound, "agent is deactivated")
	}

	// Validate that the action type is supported.
	if !types.SupportedActionTypes[msg.ActionType] {
		return nil, errorsmod.Wrapf(types.ErrUnsupportedAction, "action type %q is not supported; supported types: transfer, coordinate, query", msg.ActionType)
	}

	// Get block info from SDK context.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()
	blockTime := sdkCtx.BlockTime().Unix()

	// Get the next action sequence ID (used as the key for AgentActions).
	actionID, err := k.AgentActionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate action ID")
	}

	// Create the action record.
	actionRecord := types.AgentActionRecord{
		AgentAddress: msg.Creator,
		ActionType:   msg.ActionType,
		Payload:      msg.Payload,
		BlockHeight:  blockHeight,
		Timestamp:    blockTime,
	}

	// Store the action record.
	if err := k.AgentActions.Set(ctx, actionID, actionRecord); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event with action details.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"agent_action",
			sdk.NewAttribute("agent_address", msg.Creator),
			sdk.NewAttribute("action_type", msg.ActionType),
			sdk.NewAttribute("payload", msg.Payload),
		),
	)

	return &types.MsgAgentActionResponse{}, nil
}
