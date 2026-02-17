package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Agent(ctx context.Context, req *types.QueryAgentRequest) (*types.QueryAgentResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	// Look up the agent by address.
	agentInfo, err := q.k.Agents.Get(ctx, req.Address)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			// Return a response indicating the agent is not registered.
			return &types.QueryAgentResponse{
				Registered: false,
			}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query agent")
	}

	return &types.QueryAgentResponse{
		Name:       agentInfo.Name,
		Pubkey:     agentInfo.Pubkey,
		Endpoint:   agentInfo.Endpoint,
		Registered: agentInfo.Active,
	}, nil
}
