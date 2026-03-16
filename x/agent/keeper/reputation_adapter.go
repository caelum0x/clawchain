package keeper

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// IsAgentRegistered is used by x/reputation to validate endorsement eligibility.
func (k Keeper) IsAgentRegistered(ctx context.Context, address string) (bool, error) {
	_, err := k.Agents.Get(ctx, address)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, collections.ErrNotFound) {
		return false, nil
	}
	return false, err
}

// GetMaxHeartbeatGapBlocks exposes the agent heartbeat SLA window so
// x/reputation can apply uptime-based score deltas.
func (k Keeper) GetMaxHeartbeatGapBlocks(ctx context.Context) (int64, error) {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return 0, err
	}
	return params.MaxHeartbeatGapBlocks, nil
}

// WalkHeartbeatStatuses iterates agent heartbeat records and returns each
// agent's last heartbeat height.
func (k Keeper) WalkHeartbeatStatuses(
	ctx context.Context,
	walkFn func(address string, lastHeartbeatHeight int64) (stop bool, err error),
) error {
	iter, err := k.AgentLiveness.Iterate(ctx, nil)
	if err != nil {
		return err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			return err
		}
		stop, err := walkFn(kv.Value.AgentAddress, kv.Value.LastHeartbeatHeight)
		if err != nil {
			return err
		}
		if stop {
			return nil
		}
	}
	return nil
}

// GetDepositSlashBps exposes the deposit slash basis points parameter so
// x/reputation can apply economic penalties alongside reputation penalties.
func (k Keeper) GetDepositSlashBps(ctx context.Context) (uint64, error) {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return 0, err
	}
	bps := params.DepositSlashPerPenaltyBps
	if bps == 0 {
		bps = types.DefaultDepositSlashPerPenaltyBps
	}
	return bps, nil
}

// SlashAgentDeposit burns a portion of the agent's locked deposit. The slash
// amount is calculated as deposit * bps / 10000. This is called by x/reputation
// when an SLA penalty is applied.
func (k Keeper) SlashAgentDeposit(ctx context.Context, address string, bps uint64) error {
	agent, err := k.Agents.Get(ctx, address)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil // no agent, nothing to slash
		}
		return err
	}

	deposit, _ := strconv.ParseInt(agent.DepositAmount, 10, 64)
	if deposit <= 0 {
		return nil // no deposit to slash
	}

	slashAmount := deposit * int64(bps) / 10000
	if slashAmount <= 0 {
		return nil
	}
	if slashAmount > deposit {
		slashAmount = deposit
	}

	// Burn the slashed amount from the module account.
	slashCoins := sdk.NewCoins(sdk.NewInt64Coin("uclaw", slashAmount))
	if err := k.bankKeeper.BurnCoins(ctx, types.ModuleName, slashCoins); err != nil {
		return fmt.Errorf("failed to burn slashed deposit: %w", err)
	}

	// Update stored deposit.
	agent.DepositAmount = fmt.Sprintf("%d", deposit-slashAmount)
	return k.Agents.Set(ctx, address, agent)
}

// WalkCompletedTaskSLAEvents iterates completed tasks with deadlines and emits
// SLA outcomes for tasks with ID greater than afterTaskID.
func (k Keeper) WalkCompletedTaskSLAEvents(
	ctx context.Context,
	afterTaskID uint64,
	walkFn func(taskID uint64, assignee string, onTime bool, latenessBlocks int64) (stop bool, err error),
) error {
	iter, err := k.Tasks.Iterate(ctx, nil)
	if err != nil {
		return err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			return err
		}
		taskID := kv.Key
		task := kv.Value

		if taskID <= afterTaskID {
			continue
		}
		if task.Status != "completed" {
			continue
		}
		if task.DeadlineBlocks <= 0 {
			continue
		}
		if task.CompletedAt <= 0 {
			continue
		}

		deadlineHeight := task.CreatedAt + task.DeadlineBlocks
		lateness := task.CompletedAt - deadlineHeight
		if lateness < 0 {
			lateness = 0
		}
		onTime := task.CompletedAt <= deadlineHeight

		stop, err := walkFn(taskID, task.AssigneeAddress, onTime, lateness)
		if err != nil {
			return err
		}
		if stop {
			return nil
		}
	}
	return nil
}
