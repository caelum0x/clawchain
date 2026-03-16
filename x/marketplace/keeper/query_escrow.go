package keeper

import (
	"context"
	"errors"

	"clawchain/x/marketplace/types"
	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Escrow(ctx context.Context, req *types.QueryEscrowRequest) (*types.QueryEscrowResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	escrow, err := q.k.Escrows.Get(ctx, req.EscrowId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "escrow %d not found", req.EscrowId)
		}
		return nil, status.Error(codes.Internal, "failed to get escrow")
	}

	return &types.QueryEscrowResponse{Escrow: escrow}, nil
}

func (q queryServer) Escrows(ctx context.Context, req *types.QueryEscrowsRequest) (*types.QueryEscrowsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	escrows := make([]types.EscrowAgreement, 0)
	err := q.k.Escrows.Walk(ctx, nil, func(_ uint64, value types.EscrowAgreement) (bool, error) {
		if value.Buyer == req.Address || value.Seller == req.Address {
			escrows = append(escrows, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate escrows")
	}

	return &types.QueryEscrowsResponse{Escrows: escrows}, nil
}

func (q queryServer) Dispute(ctx context.Context, req *types.QueryDisputeRequest) (*types.QueryDisputeResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	dispute, err := q.k.Disputes.Get(ctx, req.EscrowId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "dispute for escrow %d not found", req.EscrowId)
		}
		return nil, status.Error(codes.Internal, "failed to get dispute")
	}

	return &types.QueryDisputeResponse{Dispute: dispute}, nil
}
