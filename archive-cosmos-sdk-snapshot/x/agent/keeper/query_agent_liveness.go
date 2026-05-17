package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
)

func (q queryServer) AgentLiveness(ctx context.Context, req *types.QueryAgentLivenessRequest) (*types.QueryAgentLivenessResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "empty request")
	}

	liveness, err := q.k.AgentLiveness.Get(ctx, req.Address)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryAgentLivenessResponse{Found: false}, nil
		}
		return nil, errorsmod.Wrap(err, "failed to query agent liveness")
	}

	return &types.QueryAgentLivenessResponse{
		Found:    true,
		Liveness: liveness,
	}, nil
}
