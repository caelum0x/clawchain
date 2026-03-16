package keeper

import (
	"context"
	"errors"
	"strconv"

	"clawchain/x/reputation/types"

	"cosmossdk.io/collections"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	uptimeScoreMaxBps = uint64(10000)
)

// EndBlock applies heartbeat-SLA and task-SLA-based reputation deltas.
func (k Keeper) EndBlock(ctx context.Context) error {
	maxGap, err := k.agentKeeper.GetMaxHeartbeatGapBlocks(ctx)
	if err != nil {
		return err
	}

	params, err := k.Params.Get(ctx)
	if err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	height := sdkCtx.BlockHeight()

	if maxGap > 0 {
		if err := k.applyHeartbeatSLAAdjustments(ctx, height, maxGap, params); err != nil {
			return err
		}
	}
	if err := k.applyTaskSLAAdjustments(ctx, height, params); err != nil {
		return err
	}
	if err := k.applyReputationDecay(ctx, height, params); err != nil {
		return err
	}
	return nil
}

func (k Keeper) applyHeartbeatSLAAdjustments(ctx context.Context, height, maxGap int64, params types.Params) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	return k.agentKeeper.WalkHeartbeatStatuses(ctx, func(address string, lastHeartbeatHeight int64) (bool, error) {
		isStale := height-lastHeartbeatHeight > maxGap
		wasStale := false
		prevState, err := k.HeartbeatStaleState.Get(ctx, address)
		if err == nil {
			wasStale = prevState
		} else if !errors.Is(err, collections.ErrNotFound) {
			return true, err
		}

		// Apply deltas only on state transitions (live -> stale, stale -> live).
		if isStale == wasStale {
			return false, nil
		}

		rep, err := k.getOrInitReputation(ctx, address)
		if err != nil {
			return true, err
		}

		if isStale {
			penalty := params.HeartbeatPenaltyBps
			if penalty >= rep.UptimeScoreBps {
				rep.UptimeScoreBps = 0
			} else {
				rep.UptimeScoreBps -= penalty
			}
			rep.HeartbeatSlaPenalties++

			// Slash agent deposit as an economic consequence of SLA penalty.
			depositSlashBps, slashErr := k.agentKeeper.GetDepositSlashBps(ctx)
			if slashErr == nil && depositSlashBps > 0 {
				_ = k.agentKeeper.SlashAgentDeposit(ctx, address, depositSlashBps)
			}
		} else {
			recovery := params.HeartbeatRecoveryBps
			next := rep.UptimeScoreBps + recovery
			if next > uptimeScoreMaxBps {
				next = uptimeScoreMaxBps
			}
			rep.UptimeScoreBps = next
			rep.HeartbeatSlaRecoveries++
		}

		rep.LastUpdated = height
		if err := k.Reputations.Set(ctx, address, rep); err != nil {
			return true, err
		}
		if err := k.HeartbeatStaleState.Set(ctx, address, isStale); err != nil {
			return true, err
		}

		status := "recovered"
		if isStale {
			status = "stale"
		}
		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"reputation_uptime_adjusted",
				sdk.NewAttribute("agent_address", address),
				sdk.NewAttribute("status", status),
				sdk.NewAttribute("uptime_score_bps", strconv.FormatUint(rep.UptimeScoreBps, 10)),
			),
		)

		return false, nil
	})
}

func (k Keeper) applyTaskSLAAdjustments(ctx context.Context, height int64, params types.Params) error {
	cursor := uint64(0)
	currentCursor, err := k.TaskSLACursor.Get(ctx)
	if err == nil {
		cursor = currentCursor
	} else if !errors.Is(err, collections.ErrNotFound) {
		return err
	}
	lastProcessed := cursor

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	if err := k.agentKeeper.WalkCompletedTaskSLAEvents(ctx, cursor, func(taskID uint64, assignee string, onTime bool, latenessBlocks int64) (bool, error) {
		rep, err := k.getOrInitReputation(ctx, assignee)
		if err != nil {
			return true, err
		}

		if onTime {
			reward := params.TaskSlaOnTimeRewardBps
			next := rep.UptimeScoreBps + reward
			if next > uptimeScoreMaxBps {
				next = uptimeScoreMaxBps
			}
			rep.UptimeScoreBps = next
			rep.TaskSlaOnTimeCount++
			rep.TaskSlaRewardBpsTotal += reward
		} else {
			steps := uint64(1)
			if params.TaskSlaLatenessStepBlocks > 0 && latenessBlocks > 0 {
				stepBlocks := int64(params.TaskSlaLatenessStepBlocks)
				steps = uint64((latenessBlocks-1)/stepBlocks + 1)
			}
			penalty := params.TaskSlaLatePenaltyBps * steps
			if penalty >= rep.UptimeScoreBps {
				rep.UptimeScoreBps = 0
			} else {
				rep.UptimeScoreBps -= penalty
			}
			rep.TaskSlaLateCount++
			rep.TaskSlaPenaltyBpsTotal += penalty
		}

		rep.LastUpdated = height
		if err := k.Reputations.Set(ctx, assignee, rep); err != nil {
			return true, err
		}
		lastProcessed = taskID

		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"reputation_task_sla_adjusted",
				sdk.NewAttribute("task_id", strconv.FormatUint(taskID, 10)),
				sdk.NewAttribute("agent_address", assignee),
				sdk.NewAttribute("on_time", strconv.FormatBool(onTime)),
				sdk.NewAttribute("lateness_blocks", strconv.FormatInt(latenessBlocks, 10)),
				sdk.NewAttribute("uptime_score_bps", strconv.FormatUint(rep.UptimeScoreBps, 10)),
			),
		)
		return false, nil
	}); err != nil {
		return err
	}

	if lastProcessed != cursor {
		if err := k.TaskSLACursor.Set(ctx, lastProcessed); err != nil {
			return err
		}
	}

	return nil
}

// applyReputationDecay reduces all reputation scores by decay_rate_bps every
// decay_interval_blocks.  Scores never decay below zero.
func (k Keeper) applyReputationDecay(ctx context.Context, height int64, params types.Params) error {
	if params.DecayIntervalBlocks == 0 || params.DecayRateBps == 0 {
		return nil // decay disabled
	}

	interval := int64(params.DecayIntervalBlocks)

	lastDecay := int64(0)
	stored, err := k.LastDecayBlock.Get(ctx)
	if err == nil {
		lastDecay = stored
	} else if !errors.Is(err, collections.ErrNotFound) {
		return err
	}

	if height-lastDecay < interval {
		return nil // not yet time
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	decayBps := params.DecayRateBps

	err = k.Reputations.Walk(ctx, nil, func(address string, rep types.ReputationRecord) (bool, error) {
		if rep.UptimeScoreBps == 0 {
			return false, nil // already at floor
		}

		reduction := rep.UptimeScoreBps * decayBps / 10000
		if reduction == 0 && decayBps > 0 {
			reduction = 1 // ensure at least 1 bps decay if score > 0
		}
		if reduction >= rep.UptimeScoreBps {
			rep.UptimeScoreBps = 0
		} else {
			rep.UptimeScoreBps -= reduction
		}
		rep.LastUpdated = height

		if err := k.Reputations.Set(ctx, address, rep); err != nil {
			return true, err
		}

		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"reputation_decay_applied",
				sdk.NewAttribute("agent_address", address),
				sdk.NewAttribute("decay_bps", strconv.FormatUint(decayBps, 10)),
				sdk.NewAttribute("uptime_score_bps", strconv.FormatUint(rep.UptimeScoreBps, 10)),
			),
		)
		return false, nil
	})
	if err != nil {
		return err
	}

	return k.LastDecayBlock.Set(ctx, height)
}

func (k Keeper) getOrInitReputation(ctx context.Context, address string) (types.ReputationRecord, error) {
	rep, err := k.Reputations.Get(ctx, address)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return types.ReputationRecord{}, err
		}
		rep = types.ReputationRecord{
			AgentAddress:   address,
			UptimeScoreBps: uptimeScoreMaxBps,
		}
	}
	if rep.UptimeScoreBps == 0 {
		rep.UptimeScoreBps = uptimeScoreMaxBps
	}
	return rep, nil
}
