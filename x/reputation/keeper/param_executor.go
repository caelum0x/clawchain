package keeper

import (
	"context"
	"fmt"
	"strconv"
)

// UpdateParam applies a governance parameter change to the reputation module.
func (k Keeper) UpdateParam(ctx context.Context, paramKey string, newValue string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to get reputation params: %w", err)
	}

	switch paramKey {
	case "max_comment_length":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxCommentLength = v
	case "heartbeat_penalty_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.HeartbeatPenaltyBps = v
	case "heartbeat_recovery_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.HeartbeatRecoveryBps = v
	case "task_sla_on_time_reward_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.TaskSlaOnTimeRewardBps = v
	case "task_sla_late_penalty_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.TaskSlaLatePenaltyBps = v
	case "task_sla_lateness_step_blocks":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.TaskSlaLatenessStepBlocks = v
	case "decay_rate_bps":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.DecayRateBps = v
	case "decay_interval_blocks":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.DecayIntervalBlocks = v
	default:
		return fmt.Errorf("unknown reputation param key: %s", paramKey)
	}

	if err := params.Validate(); err != nil {
		return fmt.Errorf("invalid params after update: %w", err)
	}

	return k.Params.Set(ctx, params)
}
