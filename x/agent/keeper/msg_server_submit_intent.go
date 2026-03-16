package keeper

import (
	"context"
	"errors"
	"fmt"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) SubmitIntent(ctx context.Context, msg *types.MsgSubmitIntent) (*types.MsgSubmitIntentResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate that the creator is a registered active agent.
	agent, err := k.Agents.Get(ctx, msg.Creator)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(types.ErrAgentNotFound, msg.Creator)
		}
		return nil, errorsmod.Wrap(err, "failed to look up agent")
	}
	if !agent.Active {
		return nil, errorsmod.Wrap(types.ErrAgentNotFound, "agent is deactivated")
	}

	// Enforce per-agent per-block anti-spam limits (general + intent-specific).
	if err := k.enforceActionRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}
	if err := k.enforceIntentRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Enforce payload size limits.
	if err := k.enforcePayloadSize(ctx, msg.Payload, msg.Description); err != nil {
		return nil, err
	}

	// Validate intent type.
	if !types.SupportedIntentTypes[msg.IntentType] {
		return nil, errorsmod.Wrapf(types.ErrUnsupportedIntentType, "intent type %q is not supported", msg.IntentType)
	}

	// Validate description.
	if msg.Description == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidIntentPayload, "description cannot be empty")
	}

	// Get block info.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()

	// Get next intent ID.
	intentID, err := k.IntentCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate intent ID")
	}

	// Create the intent.
	intent := types.CoordinationIntent{
		Id:             intentID,
		CreatorAddress: msg.Creator,
		Description:    msg.Description,
		IntentType:     msg.IntentType,
		Payload:        msg.Payload,
		Status:         "pending",
		MinResponses:   msg.MinResponses,
		CreatedAt:      blockHeight,
		ExpiresAt:      blockHeight + 1000, // Default expiry: 1000 blocks
	}

	// Store the intent.
	if err := k.Intents.Set(ctx, intentID, intent); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store intent")
	}

	// Update aggregate stats for the creator.
	stats, err := k.getOrInitAgentStats(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load agent stats")
	}
	stats.IntentsSubmitted++
	stats.LastActiveHeight = blockHeight
	stats.LastActiveTime = sdkCtx.BlockTime().Unix()
	if err := k.AgentStats.Set(ctx, msg.Creator, stats); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update agent stats")
	}

	// Record this intent event in global activity feed.
	actionID, err := k.AgentActionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate action ID")
	}
	if err := k.AgentActions.Set(ctx, actionID, types.AgentActionRecord{
		AgentAddress: msg.Creator,
		ActionType:   "submit_intent",
		Payload:      fmt.Sprintf(`{"intent_id":%d,"intent_type":"%s"}`, intentID, msg.IntentType),
		BlockHeight:  blockHeight,
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"submit_intent",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("intent_type", msg.IntentType),
		),
	)

	return &types.MsgSubmitIntentResponse{IntentId: intentID}, nil
}
