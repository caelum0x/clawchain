package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Task(ctx context.Context, req *types.QueryTaskRequest) (*types.QueryTaskResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	task, err := q.k.Tasks.Get(ctx, req.TaskId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryTaskResponse{
				Found: false,
			}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query task")
	}

	return &types.QueryTaskResponse{
		Found:            true,
		TaskId:           task.TaskId,
		DelegatorAddress: task.DelegatorAddress,
		AssigneeAddress:  task.AssigneeAddress,
		Description:      task.Description,
		Requirements:     task.Requirements,
		SkillId:          task.SkillId,
		Budget:           task.Budget,
		DeadlineBlocks:   task.DeadlineBlocks,
		Status:           task.Status,
		Result:           task.Result,
		CreatedAt:        task.CreatedAt,
		CompletedAt:      task.CompletedAt,
	}, nil
}
