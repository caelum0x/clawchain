package keeper

import (
	"context"
	"encoding/hex"
	"errors"

	"clawchain/x/privacy/merkle"
	"clawchain/x/privacy/types"

	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) MerkleProof(ctx context.Context, req *types.QueryMerkleProofRequest) (*types.QueryMerkleProofResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	commitmentHex, _, err := q.k.NormalizeHex(req.CommitmentHex)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid commitment_hex")
	}

	// Look up leaf index via the reverse index.
	leafIndex, err := q.k.CommitmentIndex.Get(ctx, commitmentHex)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryMerkleProofResponse{Found: false}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query commitment index")
	}

	// Walk the tree from leaf to root, collecting siblings.
	path := make([]string, merkle.Depth)
	indices := make([]uint64, merkle.Depth)

	currentIdx := leafIndex
	for level := 0; level < merkle.Depth; level++ {
		parentIdx := currentIdx / 2
		leftChildIdx := parentIdx * 2
		rightChildIdx := leftChildIdx + 1

		// Determine sibling: if currentIdx is left child, sibling is right; vice versa.
		var siblingIdx uint64
		if currentIdx == leftChildIdx {
			siblingIdx = rightChildIdx
			indices[level] = 0 // current node is on the left
		} else {
			siblingIdx = leftChildIdx
			indices[level] = 1 // current node is on the right
		}

		sibling, err := q.k.getMerkleNode(ctx, level, siblingIdx)
		if err != nil {
			return nil, status.Error(codes.Internal, "failed to get merkle node")
		}
		path[level] = hex.EncodeToString(sibling.Bytes())

		currentIdx = parentIdx
	}

	// Get the current root.
	root, err := q.k.computeRootFromState(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to compute root")
	}

	return &types.QueryMerkleProofResponse{
		LeafIndex: leafIndex,
		Path:      path,
		Indices:   indices,
		Root:      hex.EncodeToString(root.Bytes()),
		Found:     true,
	}, nil
}
