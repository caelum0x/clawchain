package keeper

import (
	"context"

	"clawchain/x/reputation/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Ratings(ctx context.Context, req *types.QueryRatingsRequest) (*types.QueryRatingsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.AgentAddress == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_address cannot be empty")
	}

	ratings := make([]types.Rating, 0)
	err := q.k.Ratings.Walk(ctx, nil, func(_ uint64, value types.Rating) (bool, error) {
		if value.RatedAgent == req.AgentAddress {
			ratings = append(ratings, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query ratings")
	}

	return &types.QueryRatingsResponse{Ratings: ratings}, nil
}
