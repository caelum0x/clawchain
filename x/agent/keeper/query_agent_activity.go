package keeper

import (
	"context"

	"clawchain/x/agent/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const defaultActivityLimit = 50

func (q queryServer) AgentActivity(ctx context.Context, req *types.QueryAgentActivityRequest) (*types.QueryAgentActivityResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	limit := req.Limit
	if limit == 0 {
		limit = defaultActivityLimit
	}

	all := make([]types.AgentActionRecord, 0)
	err := q.k.AgentActions.Walk(ctx, nil, func(_ uint64, value types.AgentActionRecord) (bool, error) {
		if value.AgentAddress == req.Address {
			all = append(all, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate agent actions")
	}

	start := 0
	if uint64(len(all)) > limit {
		start = len(all) - int(limit)
	}
	return &types.QueryAgentActivityResponse{Activities: all[start:]}, nil
}
