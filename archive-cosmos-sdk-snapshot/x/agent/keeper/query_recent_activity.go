package keeper

import (
	"context"

	"clawchain/x/agent/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) RecentActivity(ctx context.Context, req *types.QueryRecentActivityRequest) (*types.QueryRecentActivityResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	limit := req.Limit
	if limit == 0 {
		limit = defaultActivityLimit
	}

	all := make([]types.AgentActionRecord, 0)
	err := q.k.AgentActions.Walk(ctx, nil, func(_ uint64, value types.AgentActionRecord) (bool, error) {
		all = append(all, value)
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate agent actions")
	}

	start := 0
	if uint64(len(all)) > limit {
		start = len(all) - int(limit)
	}
	return &types.QueryRecentActivityResponse{Activities: all[start:]}, nil
}
