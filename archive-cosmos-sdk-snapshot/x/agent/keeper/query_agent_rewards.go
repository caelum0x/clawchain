package keeper

import (
	"context"

	"clawchain/x/agent/types"
)

func (k Keeper) QueryAgentRewards(ctx context.Context, req *types.QueryAgentRewardsRequest) (*types.QueryAgentRewardsResponse, error) {
	if req == nil || req.Address == "" {
		return nil, types.ErrInvalidAddress
	}

	cumulative, _ := k.AgentRewards.Get(ctx, req.Address)
	if cumulative == "" {
		cumulative = "0"
	}

	denom := "uclaw"
	if k.mintKeeper != nil {
		if d, err := k.mintKeeper.GetMintDenom(ctx); err == nil {
			denom = d
		}
	}

	return &types.QueryAgentRewardsResponse{
		Address:           req.Address,
		CumulativeRewards: cumulative,
		Denom:             denom,
	}, nil
}
