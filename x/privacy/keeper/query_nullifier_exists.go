package keeper

import (
	"context"
	"strings"

	"clawchain/x/privacy/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) NullifierExists(ctx context.Context, req *types.QueryNullifierExistsRequest) (*types.QueryNullifierExistsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	nullifierHex := strings.TrimSpace(req.Nullifier)
	if nullifierHex == "" {
		return nil, status.Error(codes.InvalidArgument, "nullifier is empty")
	}

	// Check if the nullifier exists in the spent nullifier set.
	exists, err := q.k.Nullifiers.Has(ctx, nullifierHex)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to check nullifier")
	}

	return &types.QueryNullifierExistsResponse{
		Exists: exists,
	}, nil
}
