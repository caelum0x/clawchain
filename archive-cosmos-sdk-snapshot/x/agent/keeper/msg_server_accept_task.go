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

func (k msgServer) AcceptTask(ctx context.Context, msg *types.MsgAcceptTask) (*types.MsgAcceptTaskResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Look up the task.
	task, err := k.Tasks.Get(ctx, msg.TaskId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrapf(types.ErrTaskNotFound, "task %d", msg.TaskId)
		}
		return nil, errorsmod.Wrap(err, "failed to look up task")
	}

	// Only the assignee can accept.
	if task.AssigneeAddress != msg.Creator {
		return nil, errorsmod.Wrapf(types.ErrNotAssignee, "only %s can accept task %d", task.AssigneeAddress, msg.TaskId)
	}

	// Enforce per-agent per-block anti-spam limits.
	if err := k.enforceActionRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Must be pending.
	if task.Status != "pending" {
		return nil, errorsmod.Wrapf(types.ErrTaskNotPending, "task %d has status %q", msg.TaskId, task.Status)
	}

	// Update status.
	task.Status = "accepted"
	if err := k.Tasks.Set(ctx, msg.TaskId, task); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update task")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Update aggregate stats for assignee.
	stats, err := k.getOrInitAgentStats(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load agent stats")
	}
	stats.LastActiveHeight = sdkCtx.BlockHeight()
	stats.LastActiveTime = sdkCtx.BlockTime().Unix()
	if err := k.AgentStats.Set(ctx, msg.Creator, stats); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update agent stats")
	}

	// Record activity event.
	actionID, err := k.AgentActionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate action ID")
	}
	if err := k.AgentActions.Set(ctx, actionID, types.AgentActionRecord{
		AgentAddress: msg.Creator,
		ActionType:   "accept_task",
		Payload:      fmt.Sprintf(`{"task_id":%d}`, msg.TaskId),
		BlockHeight:  sdkCtx.BlockHeight(),
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"accept_task",
			sdk.NewAttribute("assignee", msg.Creator),
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", msg.TaskId)),
		),
	)

	return &types.MsgAcceptTaskResponse{}, nil
}
