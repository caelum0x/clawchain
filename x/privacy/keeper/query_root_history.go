package keeper

import (
	"context"

	"clawchain/x/privacy/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const defaultRootHistoryLimit uint64 = 50

func (q queryServer) RootHistory(ctx context.Context, req *types.QueryRootHistoryRequest) (*types.QueryRootHistoryResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	total, err := q.k.RootHistoryCount.Peek(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query root history count")
	}

	offset := req.Offset
	if offset > total {
		offset = total
	}

	limit := req.Limit
	if limit == 0 {
		limit = defaultRootHistoryLimit
	}

	end := offset + limit
	if end > total {
		end = total
	}

	roots := make([]string, 0, end-offset)
	for i := offset; i < end; i++ {
		root, err := q.k.RootHistory.Get(ctx, i)
		if err != nil {
			return nil, status.Error(codes.Internal, "failed to read root history")
		}
		roots = append(roots, root)
	}

	nextOffset := uint64(0)
	if end < total {
		nextOffset = end
	}

	return &types.QueryRootHistoryResponse{
		Roots:      roots,
		NextOffset: nextOffset,
		Total:      total,
	}, nil
}
