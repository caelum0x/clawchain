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

func (k msgServer) DelegateTask(ctx context.Context, msg *types.MsgDelegateTask) (*types.MsgDelegateTaskResponse, error) {
	// Validate the creator (delegator) address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate the assignee address.
	if _, err := k.addressCodec.StringToBytes(msg.Assignee); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid assignee address")
	}

	// Reject self-delegation.
	if msg.Creator == msg.Assignee {
		return nil, errorsmod.Wrap(types.ErrSelfDelegation, "cannot delegate task to yourself")
	}

	// Validate description is not empty.
	if msg.Description == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidIntentPayload, "description cannot be empty")
	}

	// Check creator is a registered active agent.
	delegator, err := k.Agents.Get(ctx, msg.Creator)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(types.ErrAgentNotFound, msg.Creator)
		}
		return nil, errorsmod.Wrap(err, "failed to look up delegator agent")
	}
	if !delegator.Active {
		return nil, errorsmod.Wrap(types.ErrAgentInactive, "delegator agent is inactive")
	}

	// Check assignee is a registered active agent.
	assignee, err := k.Agents.Get(ctx, msg.Assignee)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(types.ErrAgentNotFound, msg.Assignee)
		}
		return nil, errorsmod.Wrap(err, "failed to look up assignee agent")
	}
	if !assignee.Active {
		return nil, errorsmod.Wrap(types.ErrAgentInactive, "assignee agent is inactive")
	}

	// Reputation gating for high-value tasks.
	if k.reputationKeeper != nil {
		repParams, pErr := k.Params.Get(ctx)
		if pErr == nil && repParams.HighImpactMinDepositUclaw > 0 {
			budgetAmt, ok := math.NewIntFromString(msg.Budget)
			if ok && budgetAmt.GTE(math.NewIntFromUint64(repParams.HighImpactMinDepositUclaw)) {
				uptimeScore, found, rErr := k.reputationKeeper.GetReputation(ctx, msg.Assignee)
				if rErr == nil && found && uptimeScore < uint64(repParams.MinReputationForRewardBps) {
					return nil, errorsmod.Wrap(types.ErrInsufficientReputation, "assignee reputation below minimum for high-value task")
				}
			}
		}
	}

	// Enforce per-agent per-block anti-spam limits (in-memory rate limiter).
	if err := k.IncrementActionCount(ctx, msg.Creator); err != nil {
		return nil, err
	}
	if err := k.IncrementTaskCount(ctx, msg.Creator); err != nil {
		return nil, err
	}

	// Enforce payload size limits.
	if err := k.enforcePayloadSize(ctx, msg.Description, msg.Requirements); err != nil {
		return nil, err
	}

	params, err := k.Params.Get(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load params for task budget policy")
	}
	minTaskBudget := params.MinTaskBudgetUclaw
	if minTaskBudget == 0 {
		minTaskBudget = types.DefaultMinTaskBudgetUClaw
	}

	// Economic policy hook: enforce task quality tier budget thresholds.
	// StandardTask/ExpeditedTask params use policy.go defaults when 0.
	tier, requiredBudget, err := validateTaskBudget(
		msg.Budget,
		msg.DeadlineBlocks,
		minTaskBudget,
		params.StandardTaskMinBudgetUclaw,
		params.ExpeditedTaskMinBudgetUclaw,
		params.ExpeditedTaskMaxDeadlineBlocks,
	)
	if err != nil {
		return nil, err
	}

	// Escrow budget from delegator into the agent module account.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	budgetAmt, _ := math.NewIntFromString(strings.TrimSpace(msg.Budget))
	if budgetAmt.IsPositive() {
		delegatorAddr, _ := k.addressCodec.StringToBytes(msg.Creator)
		escrowCoins := sdk.NewCoins(sdk.NewCoin("uclaw", budgetAmt))
		if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, sdk.AccAddress(delegatorAddr), types.ModuleName, escrowCoins); err != nil {
			return nil, errorsmod.Wrap(err, "failed to escrow task budget")
		}
	}

	blockHeight := sdkCtx.BlockHeight()

	// Get next task ID.
	taskID, err := k.TaskCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate task ID")
	}

	// Create the task record.
	task := types.TaskRecord{
		TaskId:           taskID,
		DelegatorAddress: msg.Creator,
		AssigneeAddress:  msg.Assignee,
		Description:      msg.Description,
		Requirements:     msg.Requirements,
		SkillId:          msg.SkillId,
		Budget:           msg.Budget,
		DeadlineBlocks:   msg.DeadlineBlocks,
		CreatedAt:        blockHeight,
		Status:           "pending",
	}

	// Store the task.
	if err := k.Tasks.Set(ctx, taskID, task); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store task")
	}

	// Update aggregate stats for the delegator.
	stats, err := k.getOrInitAgentStats(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load agent stats")
	}
	stats.LastActiveHeight = blockHeight
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
		ActionType:   "delegate_task",
		Payload:      fmt.Sprintf(`{"task_id":%d,"assignee":"%s"}`, taskID, msg.Assignee),
		BlockHeight:  blockHeight,
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"delegate_task",
			sdk.NewAttribute("delegator", msg.Creator),
			sdk.NewAttribute("assignee", msg.Assignee),
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
		),
	)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"task_budget_policy_applied",
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
			sdk.NewAttribute("budget", msg.Budget),
			sdk.NewAttribute("quality_tier", tier),
			sdk.NewAttribute("min_budget_uclaw", fmt.Sprintf("%d", requiredBudget)),
		),
	)

	return &types.MsgDelegateTaskResponse{TaskId: taskID}, nil
}
