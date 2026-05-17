package keeper

import (
	"context"
	"errors"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Intent(ctx context.Context, req *types.QueryIntentRequest) (*types.QueryIntentResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	intent, err := q.k.Intents.Get(ctx, req.IntentId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryIntentResponse{
				Found: false,
			}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query intent")
	}

	return &types.QueryIntentResponse{
		Found:          true,
		Id:             intent.Id,
		CreatorAddress: intent.CreatorAddress,
		Description:    intent.Description,
		IntentType:     intent.IntentType,
		Payload:        intent.Payload,
		Status:         intent.Status,
		MinResponses:   intent.MinResponses,
	}, nil
}
