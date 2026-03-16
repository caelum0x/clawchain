package keeper

import (
	"context"
	"strings"

	"clawchain/x/marketplace/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) SkillsByCategory(ctx context.Context, req *types.QuerySkillsByCategoryRequest) (*types.QuerySkillsByCategoryResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if strings.TrimSpace(req.Category) == "" {
		return nil, status.Error(codes.InvalidArgument, "category cannot be empty")
	}

	target := strings.ToLower(strings.TrimSpace(req.Category))
	skills := make([]types.SkillRecord, 0)
	err := q.k.Skills.Walk(ctx, nil, func(_ uint64, value types.SkillRecord) (bool, error) {
		if strings.ToLower(strings.TrimSpace(value.Category)) == target {
			skills = append(skills, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate skills")
	}

	return &types.QuerySkillsByCategoryResponse{Skills: skills}, nil
}
