package keeper

import (
	"context"
	"fmt"
	"strconv"
)

// UpdateParam applies a governance parameter change to the agent module.
func (k Keeper) UpdateParam(ctx context.Context, paramKey string, newValue string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to get agent params: %w", err)
	}

	switch paramKey {
	case "max_heartbeat_gap_blocks":
		v, err := strconv.ParseInt(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxHeartbeatGapBlocks = v
	case "max_actions_per_block":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxActionsPerBlock = v
	case "min_heartbeat_interval_blocks":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MinHeartbeatIntervalBlocks = v
	case "max_intents_per_block":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxIntentsPerBlock = v
	case "max_tasks_per_block":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxTasksPerBlock = v
	case "max_payload_bytes":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxPayloadBytes = v
	case "min_agent_deposit_uclaw":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MinAgentDepositUclaw = v
	case "deposit_slash_per_penalty_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.DepositSlashPerPenaltyBps = v
	case "min_task_budget_uclaw":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MinTaskBudgetUclaw = v
	case "high_impact_min_deposit_uclaw":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.HighImpactMinDepositUclaw = v
	case "standard_task_min_budget_uclaw":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.StandardTaskMinBudgetUclaw = v
	case "expedited_task_min_budget_uclaw":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.ExpeditedTaskMinBudgetUclaw = v
	case "expedited_task_max_deadline_blocks":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.ExpeditedTaskMaxDeadlineBlocks = v
	case "agent_reward_pool_fraction_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.AgentRewardPoolFractionBps = v
	case "min_reputation_for_reward_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MinReputationForRewardBps = v
	case "reward_distribution_interval_blocks":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.RewardDistributionIntervalBlocks = v
	default:
		return fmt.Errorf("unknown agent param key: %s", paramKey)
	}

	if err := params.Validate(); err != nil {
		return fmt.Errorf("invalid params after update: %w", err)
	}

	return k.Params.Set(ctx, params)
}
