package keeper

import (
	"context"
	"errors"

	"clawchain/x/privacy/types"

	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) CommitmentIndex(ctx context.Context, req *types.QueryCommitmentIndexRequest) (*types.QueryCommitmentIndexResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	commitmentHex, _, err := q.k.NormalizeHex(req.CommitmentHex)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid commitment_hex")
	}

	leafIndex, err := q.k.CommitmentIndex.Get(ctx, commitmentHex)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryCommitmentIndexResponse{Found: false}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query commitment index")
	}

	return &types.QueryCommitmentIndexResponse{
		LeafIndex: leafIndex,
		Found:     true,
	}, nil
}
