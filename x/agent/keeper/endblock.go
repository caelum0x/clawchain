package keeper

import (
	"context"
	"fmt"
	"strings"

	"clawchain/x/agent/types"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// EndBlock runs at the end of every block. It deactivates agents whose
// last heartbeat is older than the configured max_heartbeat_gap_blocks.
func (k Keeper) EndBlock(ctx context.Context) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	maxGap := params.MaxHeartbeatGapBlocks
	if maxGap > 0 {
		currentHeight := sdkCtx.BlockHeight()
		cutoff := currentHeight - maxGap
		if cutoff >= 0 {
			// Iterate all liveness records and deactivate stale agents.
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
				liveness := kv.Value
				if liveness.LastHeartbeatHeight >= cutoff {
					continue
				}

				// Agent is stale — deactivate it.
				agent, err := k.Agents.Get(ctx, liveness.AgentAddress)
				if err != nil {
					// Agent record missing — skip.
					continue
				}
				if !agent.Active {
					// Already inactive — skip.
					continue
				}

				agent.Active = false
				if err := k.Agents.Set(ctx, liveness.AgentAddress, agent); err != nil {
					return err
				}

				sdkCtx.EventManager().EmitEvent(
					sdk.NewEvent(
						"agent_deactivated",
						sdk.NewAttribute("agent_address", liveness.AgentAddress),
						sdk.NewAttribute("last_heartbeat_height", fmt.Sprintf("%d", liveness.LastHeartbeatHeight)),
						sdk.NewAttribute("reason", "stale_heartbeat"),
					),
				)

				sdkCtx.Logger().Info(
					"agent deactivated due to stale heartbeat",
					"agent", liveness.AgentAddress,
					"last_heartbeat", liveness.LastHeartbeatHeight,
					"cutoff", cutoff,
				)
			}
		}
	}

	// Expire overdue tasks and refund escrowed budgets to delegators.
	if err := k.expireOverdueTasks(ctx, sdkCtx); err != nil {
		sdkCtx.Logger().Error("failed to expire overdue tasks", "error", err)
	}

	// Distribute agent rewards periodically.
	if err := k.distributeAgentRewards(ctx, sdkCtx, params); err != nil {
		sdkCtx.Logger().Error("failed to distribute agent rewards", "error", err)
		// Non-fatal: log but don't halt the chain.
	}

	// Expire stale negotiations.
	if err := k.ExpireNegotiations(ctx, sdkCtx.BlockHeight()); err != nil {
		sdkCtx.Logger().Error("failed to expire negotiations", "error", err)
		// Non-fatal: log but don't halt the chain.
	}

	// Expire stale remote agents (from IBC discovery).
	if err := k.ExpireRemoteAgents(ctx); err != nil {
		sdkCtx.Logger().Error("failed to expire remote agents", "error", err)
		// Non-fatal: log but don't halt the chain.
	}

	return nil
}

// expireOverdueTasks iterates all tasks and marks those past their deadline
// as "expired", refunding the escrowed budget to the delegator.
func (k Keeper) expireOverdueTasks(ctx context.Context, sdkCtx sdk.Context) error {
	currentHeight := sdkCtx.BlockHeight()

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
		task := kv.Value

		// Only expire active (pending/accepted) tasks with a deadline.
		if task.DeadlineBlocks <= 0 {
			continue
		}
		if task.Status != "pending" && task.Status != "accepted" {
			continue
		}
		deadlineHeight := task.CreatedAt + task.DeadlineBlocks
		if currentHeight <= deadlineHeight {
			continue
		}

		// Capture original status before mutating (used for slash decision).
		origStatus := task.Status

		// Mark as expired.
		task.Status = "expired"
		if err := k.Tasks.Set(ctx, kv.Key, task); err != nil {
			return err
		}

		// Refund escrowed budget to delegator (skip IBC-originated tasks).
		budgetAmt, ok := math.NewIntFromString(strings.TrimSpace(task.Budget))
		if ok && budgetAmt.IsPositive() && !strings.HasPrefix(task.DelegatorAddress, "ibc:") {
			delegatorAddr, addrErr := k.addressCodec.StringToBytes(task.DelegatorAddress)
			if addrErr == nil {
				refundCoins := sdk.NewCoins(sdk.NewCoin("uclaw", budgetAmt))
				if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, sdk.AccAddress(delegatorAddr), refundCoins); err != nil {
					sdkCtx.Logger().Error("failed to refund expired task budget",
						"task_id", kv.Key, "delegator", task.DelegatorAddress, "error", err)
					continue
				}
			}
		}

		// Slash the assignee's deposit if the task was accepted but not completed.
		// This penalises agents that commit to tasks and then fail to deliver.
		var slashedBps uint64
		if task.Status == "expired" && task.AssigneeAddress != "" {
			// We just set Status = "expired" above; check the *original* status
			// that we captured before the status change. A task can only reach
			// this point if it was previously "pending" or "accepted". We only
			// slash agents that explicitly accepted the task, because a pending
			// task means the agent never committed.
			//
			// The original status is reconstructed: if it was accepted before
			// we set it to expired, proceed with the slash.
			if origStatus == "accepted" {
				bps, bpsErr := k.GetDepositSlashBps(ctx)
				if bpsErr == nil && bps > 0 {
					slashedBps = bps
					if slashErr := k.SlashAgentDeposit(ctx, task.AssigneeAddress, bps); slashErr != nil {
						sdkCtx.Logger().Error("failed to slash assignee deposit on expired task",
							"task_id", kv.Key, "assignee", task.AssigneeAddress, "error", slashErr)
					}
				}
			}
		}

		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"task_expired",
				sdk.NewAttribute("task_id", fmt.Sprintf("%d", kv.Key)),
				sdk.NewAttribute("delegator", task.DelegatorAddress),
				sdk.NewAttribute("assignee", task.AssigneeAddress),
				sdk.NewAttribute("budget_refunded", task.Budget),
				sdk.NewAttribute("assignee_slashed_bps", fmt.Sprintf("%d", slashedBps)),
			),
		)
	}

	return nil
}

func (k Keeper) distributeAgentRewards(ctx context.Context, sdkCtx sdk.Context, params types.Params) error {
	interval := params.RewardDistributionIntervalBlocks
	if interval == 0 {
		return nil
	}
	currentHeight := sdkCtx.BlockHeight()
	if currentHeight%int64(interval) != 0 {
		return nil
	}

	fractionBps := params.AgentRewardPoolFractionBps
	if fractionBps == 0 {
		return nil
	}

	// Require mint keeper to be configured.
	if k.mintKeeper == nil {
		return nil
	}

	minRepBps := params.MinReputationForRewardBps

	// Get the mint denom.
	denom, err := k.mintKeeper.GetMintDenom(ctx)
	if err != nil {
		return err
	}

	// Calculate per-distribution reward pool from actual protocol inflation.
	annualProvisions, err := k.mintKeeper.GetAnnualProvisions(ctx)
	if err != nil || annualProvisions.IsZero() {
		return nil // no inflation yet (chain startup)
	}
	// 6-second blocks → ~5,256,150 blocks/year
	blocksPerYear := math.LegacyNewDec(5_256_150)
	perBlockReward := annualProvisions.Quo(blocksPerYear)
	// fractionBps of each block's provisions, accumulated over the distribution interval
	intervalBlocks := math.LegacyNewDec(int64(params.RewardDistributionIntervalBlocks))
	poolAmount := perBlockReward.MulInt64(int64(fractionBps)).Quo(math.LegacyNewDec(10000)).Mul(intervalBlocks).TruncateInt()
	if poolAmount.IsZero() || poolAmount.IsNegative() {
		return nil
	}

	// Walk active agents with sufficient reputation and calculate weights.
	type agentWeight struct {
		address string
		weight  uint64
	}
	var eligible []agentWeight
	var totalWeight uint64

	agentIter, err := k.Agents.Iterate(ctx, nil)
	if err != nil {
		return err
	}
	defer agentIter.Close()

	for ; agentIter.Valid(); agentIter.Next() {
		kv, err := agentIter.KeyValue()
		if err != nil {
			return err
		}
		agent := kv.Value
		addr := kv.Key
		if !agent.Active {
			continue
		}

		// Check liveness / heartbeat count as reputation proxy.
		liveness, err := k.AgentLiveness.Get(ctx, addr)
		if err != nil {
			continue
		}

		// Use heartbeat count as an uptime proxy.
		// Require minimum heartbeats proportional to minRepBps.
		heartbeats := liveness.HeartbeatCount
		if heartbeats == 0 {
			continue
		}

		// Reputation score: heartbeats * 100 (simplified).
		// If below threshold, skip.
		repScore := heartbeats * 100
		if minRepBps > 0 && repScore < uint64(minRepBps) {
			continue
		}

		// Weight: heartbeat_count * (task_completions + 1)
		stats, _ := k.AgentStats.Get(ctx, addr)
		taskCompletions := stats.IntentsFinalized // reuse finalized as task proxy
		w := heartbeats * (taskCompletions + 1)
		if w == 0 {
			w = 1
		}

		eligible = append(eligible, agentWeight{address: addr, weight: w})
		totalWeight += w
	}

	if len(eligible) == 0 || totalWeight == 0 {
		return nil
	}

	// Mint reward coins to agent module account.
	rewardCoins := sdk.NewCoins(sdk.NewCoin(denom, poolAmount))
	if err := k.bankKeeper.MintCoins(ctx, types.ModuleName, rewardCoins); err != nil {
		return fmt.Errorf("failed to mint agent rewards: %w", err)
	}

	// Distribute proportionally from module account.
	for _, aw := range eligible {
		share := poolAmount.Mul(math.NewInt(int64(aw.weight))).Quo(math.NewInt(int64(totalWeight)))
		if share.IsZero() {
			continue
		}

		coins := sdk.NewCoins(sdk.NewCoin(denom, share))
		recipAddr, err := k.addressCodec.StringToBytes(aw.address)
		if err != nil {
			continue
		}

		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, sdk.AccAddress(recipAddr), coins); err != nil {
			sdkCtx.Logger().Error("failed to send agent reward", "agent", aw.address, "error", err)
			continue
		}

		// Update cumulative rewards.
		existing, _ := k.AgentRewards.Get(ctx, aw.address)
		existingAmt, ok := math.NewIntFromString(existing)
		if !ok {
			existingAmt = math.ZeroInt()
		}
		newTotal := existingAmt.Add(share)
		_ = k.AgentRewards.Set(ctx, aw.address, newTotal.String())

		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"agent_reward_distributed",
				sdk.NewAttribute("agent_address", aw.address),
				sdk.NewAttribute("amount", share.String()),
				sdk.NewAttribute("denom", denom),
			),
		)
	}

	return nil
}
