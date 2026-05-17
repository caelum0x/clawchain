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

func (k msgServer) RespondToIntent(ctx context.Context, msg *types.MsgRespondToIntent) (*types.MsgRespondToIntentResponse, error) {
	// Validate the responder address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate that the responder is a registered active agent.
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

	// Enforce per-agent per-block anti-spam limits.
	if err := k.enforceActionRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Enforce payload size limit.
	if err := k.enforcePayloadSize(ctx, msg.Payload); err != nil {
		return nil, err
	}

	// Verify intent exists.
	intent, err := k.Intents.Get(ctx, msg.IntentId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrapf(types.ErrIntentNotFound, "intent %d", msg.IntentId)
		}
		return nil, errorsmod.Wrap(err, "failed to look up intent")
	}

	// Verify intent is pending.
	if intent.Status != "pending" {
		return nil, errorsmod.Wrapf(types.ErrIntentNotPending, "intent %d has status %q", msg.IntentId, intent.Status)
	}

	// Prevent self-response.
	if intent.CreatorAddress == msg.Creator {
		return nil, errorsmod.Wrap(types.ErrSelfResponse, "creator cannot respond to their own intent")
	}

	// Check expiry.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	if sdkCtx.BlockHeight() > intent.ExpiresAt {
		return nil, errorsmod.Wrapf(types.ErrIntentNotPending, "intent %d has expired", msg.IntentId)
	}

	// Prevent duplicate responses.
	responseKey := fmt.Sprintf("%d:%s", msg.IntentId, msg.Creator)
	_, err = k.IntentResponses.Get(ctx, responseKey)
	if err == nil {
		return nil, errorsmod.Wrapf(types.ErrIntentAlreadyResponded, "agent %s already responded to intent %d", msg.Creator, msg.IntentId)
	}
	if !errors.Is(err, collections.ErrNotFound) {
		return nil, errorsmod.Wrap(err, "failed to check response existence")
	}

	// Store the response.
	response := types.IntentResponse{
		IntentId:      msg.IntentId,
		ResponderAddr: msg.Creator,
		Accepted:      msg.Accepted,
		Payload:       msg.Payload,
		RespondedAt:   sdkCtx.BlockHeight(),
	}

	if err := k.IntentResponses.Set(ctx, responseKey, response); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store intent response")
	}

	// Update aggregate stats for responder.
	stats, err := k.getOrInitAgentStats(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load agent stats")
	}
	stats.IntentsResponded++
	stats.LastActiveHeight = sdkCtx.BlockHeight()
	stats.LastActiveTime = sdkCtx.BlockTime().Unix()
	if err := k.AgentStats.Set(ctx, msg.Creator, stats); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update agent stats")
	}

	// Record response event in global activity feed.
	actionID, err := k.AgentActionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate action ID")
	}
	if err := k.AgentActions.Set(ctx, actionID, types.AgentActionRecord{
		AgentAddress: msg.Creator,
		ActionType:   "respond_intent",
		Payload:      fmt.Sprintf(`{"intent_id":%d,"accepted":%t}`, msg.IntentId, msg.Accepted),
		BlockHeight:  sdkCtx.BlockHeight(),
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"respond_to_intent",
			sdk.NewAttribute("responder", msg.Creator),
			sdk.NewAttribute("intent_id", fmt.Sprintf("%d", msg.IntentId)),
			sdk.NewAttribute("accepted", fmt.Sprintf("%t", msg.Accepted)),
		),
	)

	return &types.MsgRespondToIntentResponse{}, nil
}
