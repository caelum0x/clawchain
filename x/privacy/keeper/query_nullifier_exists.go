package keeper

import (
	"context"

	"clawchain/x/privacy/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) NullifierExists(ctx context.Context, req *types.QueryNullifierExistsRequest) (*types.QueryNullifierExistsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	nullifierHex, _, err := q.k.NormalizeHex(req.Nullifier)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid nullifier hex")
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
