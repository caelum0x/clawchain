package keeper

import (
	"context"
	"encoding/hex"

	"clawchain/x/privacy/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) MerkleRoot(ctx context.Context, req *types.QueryMerkleRootRequest) (*types.QueryMerkleRootResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	// Compute the current Merkle root from state.
	root, err := q.k.computeRootFromState(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to compute merkle root")
	}

	rootHex := hex.EncodeToString(root.Bytes())

	return &types.QueryMerkleRootResponse{
		Root: rootHex,
	}, nil
}
