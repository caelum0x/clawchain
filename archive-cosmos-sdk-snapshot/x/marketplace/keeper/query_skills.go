package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"

	"clawchain/x/marketplace/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Skills(ctx context.Context, req *types.QuerySkillsRequest) (*types.QuerySkillsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	var skills []types.SkillRecord
	err := q.k.Skills.Walk(ctx, nil, func(key uint64, value types.SkillRecord) (bool, error) {
		skills = append(skills, value)
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate skills")
	}

	return &types.QuerySkillsResponse{Skills: skills}, nil
}

func (q queryServer) Skill(ctx context.Context, req *types.QuerySkillRequest) (*types.QuerySkillResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	skill, err := q.k.Skills.Get(ctx, req.SkillId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "skill %d not found", req.SkillId)
		}
		return nil, status.Error(codes.Internal, "failed to get skill")
	}

	return &types.QuerySkillResponse{Skill: skill}, nil
}
