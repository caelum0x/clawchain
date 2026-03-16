package keeper

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// MsgCheckpointTask is the request type for the CheckpointTask handler.
// It allows the assigned agent to persist progress checkpoints for crash recovery.
type MsgCheckpointTask struct {
	Creator        string `json:"creator"`
	TaskId         uint64 `json:"task_id"`
	CheckpointData string `json:"checkpoint_data"`
	PercentComplete uint32 `json:"percent_complete"`
}

// MsgCheckpointTaskResponse is the response type for the CheckpointTask handler.
type MsgCheckpointTaskResponse struct{}

// CheckpointTask persists a progress checkpoint for a task that is in "accepted" status.
// Only the assigned agent can submit a checkpoint.
func (k Keeper) CheckpointTask(ctx context.Context, msg *MsgCheckpointTask) (*MsgCheckpointTaskResponse, error) {
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

	// Only the assignee can submit a checkpoint.
	if task.AssigneeAddress != msg.Creator {
		return nil, errorsmod.Wrapf(types.ErrNotAssignee, "only %s can checkpoint task %d", task.AssigneeAddress, msg.TaskId)
	}

	// Must be in accepted status.
	if task.Status != "accepted" {
		return nil, errorsmod.Wrapf(types.ErrTaskNotAccepted, "task %d has status %q", msg.TaskId, task.Status)
	}

	// Validate checkpoint data is valid JSON.
	if msg.CheckpointData == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidCheckpoint, "checkpoint_data cannot be empty")
	}
	if !json.Valid([]byte(msg.CheckpointData)) {
		return nil, errorsmod.Wrap(types.ErrInvalidCheckpoint, "checkpoint_data must be valid JSON")
	}

	// Validate percent_complete range.
	if msg.PercentComplete > 100 {
		return nil, errorsmod.Wrap(types.ErrInvalidCheckpoint, "percent_complete must be between 0 and 100")
	}

	// Enforce payload size limits on checkpoint data.
	if err := k.enforcePayloadSize(ctx, msg.CheckpointData); err != nil {
		return nil, err
	}

	// Enforce per-agent per-block anti-spam limits.
	if err := k.enforceActionRateLimit(ctx, msg.Creator); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Build the checkpoint JSON blob with metadata.
	checkpoint := fmt.Sprintf(
		`{"checkpoint_data":%s,"percent_complete":%d,"block_height":%d,"timestamp":%d}`,
		msg.CheckpointData, msg.PercentComplete, sdkCtx.BlockHeight(), sdkCtx.BlockTime().Unix(),
	)

	// Store checkpoint keyed by task ID.
	if err := k.TaskCheckpoints.Set(ctx, msg.TaskId, checkpoint); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store task checkpoint")
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
		ActionType:   "checkpoint_task",
		Payload:      fmt.Sprintf(`{"task_id":%d,"percent_complete":%d}`, msg.TaskId, msg.PercentComplete),
		BlockHeight:  sdkCtx.BlockHeight(),
		Timestamp:    sdkCtx.BlockTime().Unix(),
	}); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent action")
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"checkpoint_task",
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", msg.TaskId)),
			sdk.NewAttribute("agent", msg.Creator),
			sdk.NewAttribute("percent_complete", fmt.Sprintf("%d", msg.PercentComplete)),
		),
	)

	return &MsgCheckpointTaskResponse{}, nil
}
