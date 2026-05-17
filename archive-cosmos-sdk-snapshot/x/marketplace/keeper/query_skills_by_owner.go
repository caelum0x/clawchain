package keeper

import (
	"context"
	"strings"

	"clawchain/x/marketplace/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) SkillsByOwner(ctx context.Context, req *types.QuerySkillsByOwnerRequest) (*types.QuerySkillsByOwnerResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if strings.TrimSpace(req.Owner) == "" {
		return nil, status.Error(codes.InvalidArgument, "owner cannot be empty")
	}

	skills := make([]types.SkillRecord, 0)
	err := q.k.Skills.Walk(ctx, nil, func(_ uint64, value types.SkillRecord) (bool, error) {
		if value.Owner == req.Owner {
			skills = append(skills, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate skills")
	}

	return &types.QuerySkillsByOwnerResponse{Skills: skills}, nil
}
