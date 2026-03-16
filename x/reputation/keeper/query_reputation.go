package keeper

import (
	"context"
	"errors"

	"clawchain/x/reputation/types"
	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Reputation(ctx context.Context, req *types.QueryReputationRequest) (*types.QueryReputationResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.AgentAddress == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_address cannot be empty")
	}

	rep, err := q.k.Reputations.Get(ctx, req.AgentAddress)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryReputationResponse{Found: false}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query reputation")
	}

	return &types.QueryReputationResponse{Reputation: rep, Found: true}, nil
}
