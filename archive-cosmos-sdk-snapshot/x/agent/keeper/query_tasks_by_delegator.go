package keeper

import (
	"context"

	"clawchain/x/agent/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) TasksByDelegator(ctx context.Context, req *types.QueryTasksByDelegatorRequest) (*types.QueryTasksByDelegatorResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	var tasks []types.TaskRecord
	err := q.k.Tasks.Walk(ctx, nil, func(_ uint64, task types.TaskRecord) (bool, error) {
		if task.DelegatorAddress == req.Address {
			tasks = append(tasks, task)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate tasks")
	}

	return &types.QueryTasksByDelegatorResponse{Tasks: tasks}, nil
}
