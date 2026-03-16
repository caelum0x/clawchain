package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"
	"cosmossdk.io/collections"
)

func (k Keeper) getOrInitAgentStats(ctx context.Context, address string) (types.AgentStats, error) {
	stats, err := k.AgentStats.Get(ctx, address)
	if err == nil {
		return stats, nil
	}
	if !errors.Is(err, collections.ErrNotFound) {
		return types.AgentStats{}, err
	}

	stats = types.AgentStats{AgentAddress: address}
	if setErr := k.AgentStats.Set(ctx, address, stats); setErr != nil {
		return types.AgentStats{}, setErr
	}
	return stats, nil
}
