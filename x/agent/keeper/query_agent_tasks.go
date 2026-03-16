package keeper

import (
	"context"

	"clawchain/x/agent/types"
)

// QueryAgentTasks returns all tasks currently assigned to a specific agent address.
// This is used by the crash-recovery system to check on-chain task state after a restart.
func (k Keeper) QueryAgentTasks(ctx context.Context, agentAddr string) ([]types.TaskRecord, error) {
	if agentAddr == "" {
		return nil, nil
	}

	var tasks []types.TaskRecord
	err := k.Tasks.Walk(ctx, nil, func(_ uint64, task types.TaskRecord) (bool, error) {
		if task.AssigneeAddress == agentAddr {
			tasks = append(tasks, task)
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	return tasks, nil
}

// QueryAgentActiveTasks returns only active (pending or accepted) tasks assigned
// to the given agent address. This is the primary entry point for recovery: it
// tells the runtime which tasks are still live on-chain.
func (k Keeper) QueryAgentActiveTasks(ctx context.Context, agentAddr string) ([]types.TaskRecord, error) {
	if agentAddr == "" {
		return nil, nil
	}

	var tasks []types.TaskRecord
	err := k.Tasks.Walk(ctx, nil, func(_ uint64, task types.TaskRecord) (bool, error) {
		if task.AssigneeAddress == agentAddr && (task.Status == "pending" || task.Status == "accepted") {
			tasks = append(tasks, task)
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	return tasks, nil
}
