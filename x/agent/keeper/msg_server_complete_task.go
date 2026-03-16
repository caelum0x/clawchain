package keeper

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) CompleteTask(ctx context.Context, msg *types.MsgCompleteTask) (*types.MsgCompleteTaskResponse, error) {
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

	// Only the assignee can complete.
	if task.AssigneeAddress != msg.Creator {
		return nil, errorsmod.Wrapf(types.ErrNotAssignee, "only %s can complete task %d", task.AssigneeAddress, msg.TaskId)
	}

	// Enforce per-agent per-block anti-spam limits.
	if err := k.enforceActionRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Enforce payload size limit on result.
	if err := k.enforcePayloadSize(ctx, msg.Result); err != nil {
		return nil, err
	}

	// Must be accepted.
	if task.Status != "accepted" {
		return nil, errorsmod.Wrapf(types.ErrTaskNotAccepted, "task %d has status %q", msg.TaskId, task.Status)
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Update task status and result.
	task.Status = "completed"
	task.Result = msg.Result
	task.CompletedAt = sdkCtx.BlockHeight()
	if err := k.Tasks.Set(ctx, msg.TaskId, task); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update task")
	}

	// Release escrowed budget from module to the assignee.
	budgetAmt, ok := math.NewIntFromString(strings.TrimSpace(task.Budget))
	if ok && budgetAmt.IsPositive() && !strings.HasPrefix(task.DelegatorAddress, "ibc:") {
		assigneeAddr, _ := k.addressCodec.StringToBytes(task.AssigneeAddress)
		releaseCoins := sdk.NewCoins(sdk.NewCoin("uclaw", budgetAmt))
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, sdk.AccAddress(assigneeAddr), releaseCoins); err != nil {
			return nil, errorsmod.Wrap(err, "failed to release escrowed budget to assignee")
		}

		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"task_budget_released",
				sdk.NewAttribute("task_id", fmt.Sprintf("%d", msg.TaskId)),
				sdk.NewAttribute("assignee", task.AssigneeAddress),
				sdk.NewAttribute("amount", budgetAmt.String()),
			),
		)
	}

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
		ActionType:   "complete_task",
		Payload:      fmt.Sprintf(`{"task_id":%d}`, msg.TaskId),
		BlockHeight:  sdkCtx.BlockHeight(),
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"complete_task",
			sdk.NewAttribute("assignee", msg.Creator),
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", msg.TaskId)),
		),
	)
	// If this was a skill-execution task, emit a skill_execution_completed event.
	if task.SkillId > 0 {
		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"skill_execution_completed",
				sdk.NewAttribute("task_id", fmt.Sprintf("%d", msg.TaskId)),
				sdk.NewAttribute("skill_id", fmt.Sprintf("%d", task.SkillId)),
				sdk.NewAttribute("buyer", task.DelegatorAddress),
				sdk.NewAttribute("seller", task.AssigneeAddress),
			),
		)
	}

	if task.DeadlineBlocks > 0 {
		deadlineHeight := task.CreatedAt + task.DeadlineBlocks
		lateness := sdkCtx.BlockHeight() - deadlineHeight
		if lateness < 0 {
			lateness = 0
		}
		onTime := sdkCtx.BlockHeight() <= deadlineHeight
		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"agent_sla_signal",
				sdk.NewAttribute("assignee", msg.Creator),
				sdk.NewAttribute("task_id", fmt.Sprintf("%d", msg.TaskId)),
				sdk.NewAttribute("on_time", fmt.Sprintf("%t", onTime)),
				sdk.NewAttribute("lateness_blocks", fmt.Sprintf("%d", lateness)),
			),
		)
	}

	return &types.MsgCompleteTaskResponse{}, nil
}
