package keeper

import (
	"context"
	"fmt"

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

	// Distribute agent rewards periodically.
	if err := k.distributeAgentRewards(ctx, sdkCtx, params); err != nil {
		sdkCtx.Logger().Error("failed to distribute agent rewards", "error", err)
		// Non-fatal: log but don't halt the chain.
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

	// Calculate reward pool: use a fixed per-distribution amount.
	// In production this would read from inflation; for now use a fixed amount
	// scaled by the fraction BPS parameter.
	poolAmount := math.NewInt(int64(fractionBps) * 1000) // fractionBps * 1000 uclaw per distribution
	if poolAmount.IsZero() {
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

	// Distribute proportionally.
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
