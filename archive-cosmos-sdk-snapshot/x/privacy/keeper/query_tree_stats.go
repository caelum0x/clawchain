package keeper

import (
	"context"
	"encoding/hex"

	"clawchain/x/privacy/merkle"
	"clawchain/x/privacy/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) TreeStats(ctx context.Context, req *types.QueryTreeStatsRequest) (*types.QueryTreeStatsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	leafCount, err := q.k.CommitmentCount.Peek(ctx)
	if err != nil {
		leafCount = 0
	}

	root, err := q.k.computeRootFromState(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to compute root")
	}
	currentRoot := hex.EncodeToString(root.Bytes())

	return &types.QueryTreeStatsResponse{
		LeafCount:   leafCount,
		CurrentRoot: currentRoot,
		TreeDepth:   uint32(merkle.Depth),
	}, nil
}
