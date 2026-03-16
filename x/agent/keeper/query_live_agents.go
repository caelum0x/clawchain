package keeper

import (
	"context"

	"clawchain/x/agent/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/query"
)

func (q queryServer) LiveAgents(ctx context.Context, req *types.QueryLiveAgentsRequest) (*types.QueryLiveAgentsResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "empty request")
	}

	params, err := q.k.Params.Get(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to get params")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()

	maxGap := params.MaxHeartbeatGapBlocks
	cutoff := int64(0)
	if maxGap > 0 {
		cutoff = currentHeight - maxGap
		if cutoff < 0 {
			cutoff = 0
		}
	}

	// Paginate over the AgentLiveness map, filtering for live agents.
	liveAgents, pageRes, err := query.CollectionFilteredPaginate(
		ctx,
		q.k.AgentLiveness,
		req.Pagination,
		func(_ string, liveness types.AgentLiveness) (bool, error) {
			// If maxGap is 0 (disabled), include all agents with any heartbeat.
			if maxGap > 0 && liveness.LastHeartbeatHeight < cutoff {
				return false, nil
			}
			return true, nil
		},
		func(_ string, liveness types.AgentLiveness) (types.LiveAgentEntry, error) {
			entry := types.LiveAgentEntry{
				Address:  liveness.AgentAddress,
				Liveness: liveness,
			}

			// Enrich with agent info if available.
			agent, err := q.k.Agents.Get(ctx, liveness.AgentAddress)
			if err == nil {
				entry.Name = agent.Name
				entry.Endpoint = agent.Endpoint
			}

			return entry, nil
		},
	)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to paginate live agents")
	}

	if liveAgents == nil {
		liveAgents = []types.LiveAgentEntry{}
	}

	return &types.QueryLiveAgentsResponse{
		Agents:     liveAgents,
		Pagination: pageRes,
	}, nil
}
