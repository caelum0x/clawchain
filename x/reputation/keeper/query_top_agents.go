package keeper

import (
	"context"
	"sort"

	"clawchain/x/reputation/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) TopAgents(ctx context.Context, req *types.QueryTopAgentsRequest) (*types.QueryTopAgentsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	agents := make([]types.ReputationRecord, 0)
	err := q.k.Reputations.Walk(ctx, nil, func(_ string, value types.ReputationRecord) (bool, error) {
		agents = append(agents, value)
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query top agents")
	}

	sort.Slice(agents, func(i, j int) bool {
		if agents[i].AvgRatingBps != agents[j].AvgRatingBps {
			return agents[i].AvgRatingBps > agents[j].AvgRatingBps
		}
		if agents[i].TotalRatings != agents[j].TotalRatings {
			return agents[i].TotalRatings > agents[j].TotalRatings
		}
		return agents[i].AgentAddress < agents[j].AgentAddress
	})

	limit := int(req.Limit)
	if limit <= 0 || limit > len(agents) {
		limit = len(agents)
	}

	return &types.QueryTopAgentsResponse{Agents: agents[:limit]}, nil
}
