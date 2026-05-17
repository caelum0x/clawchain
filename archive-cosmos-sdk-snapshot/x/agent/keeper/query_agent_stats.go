package keeper

import (
	"context"

	"clawchain/x/agent/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) AgentStats(ctx context.Context, req *types.QueryAgentStatsRequest) (*types.QueryAgentStatsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	stats, err := q.k.getOrInitAgentStats(ctx, req.Address)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query agent stats")
	}

	return &types.QueryAgentStatsResponse{Stats: stats}, nil
}
