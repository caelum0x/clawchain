package keeper

import (
	"context"
	"errors"

	"clawchain/x/marketplace/types"
	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) SkillAnalytics(ctx context.Context, req *types.QuerySkillAnalyticsRequest) (*types.QuerySkillAnalyticsResponse, error) {
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

	return &types.QuerySkillAnalyticsResponse{
		SkillId:       skill.Id,
		PurchaseCount: skill.PurchaseCount,
		TotalRevenue:  skill.TotalRevenue,
		Version:       skill.Version,
	}, nil
}
