package keeper

import (
	"context"

	"clawchain/x/reputation/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Endorsements(ctx context.Context, req *types.QueryEndorsementsRequest) (*types.QueryEndorsementsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.AgentAddress == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_address cannot be empty")
	}

	endorsements := make([]types.Endorsement, 0)
	err := q.k.Endorsements.Walk(ctx, nil, func(_ uint64, value types.Endorsement) (bool, error) {
		if value.Endorsed == req.AgentAddress {
			endorsements = append(endorsements, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query endorsements")
	}

	return &types.QueryEndorsementsResponse{Endorsements: endorsements}, nil
}
