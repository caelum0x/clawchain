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

func (k msgServer) FinalizeIntent(ctx context.Context, msg *types.MsgFinalizeIntent) (*types.MsgFinalizeIntentResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Verify intent exists.
	intent, err := k.Intents.Get(ctx, msg.IntentId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrapf(types.ErrIntentNotFound, "intent %d", msg.IntentId)
		}
		return nil, errorsmod.Wrap(err, "failed to look up intent")
	}

	// Only the creator can finalize/cancel.
	if intent.CreatorAddress != msg.Creator {
		return nil, errorsmod.Wrapf(types.ErrNotIntentCreator, "only %s can finalize intent %d", intent.CreatorAddress, msg.IntentId)
	}

	// Enforce per-agent per-block anti-spam limits.
	if err := k.enforceActionRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Must be pending.
	if intent.Status != "pending" {
		return nil, errorsmod.Wrapf(types.ErrIntentNotPending, "intent %d has status %q", msg.IntentId, intent.Status)
	}

	// Set status.
	if msg.Cancel {
		intent.Status = "cancelled"
	} else {
		intent.Status = "finalized"
	}

	// Update the intent.
	if err := k.Intents.Set(ctx, msg.IntentId, intent); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update intent")
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Update aggregate stats for creator.
	stats, err := k.getOrInitAgentStats(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load agent stats")
	}
	if msg.Cancel {
		stats.IntentsCancelled++
	} else {
		stats.IntentsFinalized++
	}
	stats.LastActiveHeight = sdkCtx.BlockHeight()
	stats.LastActiveTime = sdkCtx.BlockTime().Unix()
	if err := k.AgentStats.Set(ctx, msg.Creator, stats); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update agent stats")
	}

	// Record finalize/cancel event in global activity feed.
	actionID, err := k.AgentActionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate action ID")
	}
	if err := k.AgentActions.Set(ctx, actionID, types.AgentActionRecord{
		AgentAddress: msg.Creator,
		ActionType:   "finalize_intent",
		Payload:      fmt.Sprintf(`{"intent_id":%d,"status":"%s"}`, msg.IntentId, intent.Status),
		BlockHeight:  sdkCtx.BlockHeight(),
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"finalize_intent",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("intent_id", fmt.Sprintf("%d", msg.IntentId)),
			sdk.NewAttribute("status", intent.Status),
		),
	)

	return &types.MsgFinalizeIntentResponse{}, nil
}
