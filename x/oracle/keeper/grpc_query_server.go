package keeper

import (
	"context"

	"clawchain/x/oracle/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type queryServer struct {
	keeper Keeper
}

// NewQueryServerImpl returns an implementation of the QueryServer interface.
func NewQueryServerImpl(keeper Keeper) types.QueryServer {
	return &queryServer{keeper: keeper}
}

var _ types.QueryServer = queryServer{}

func (q queryServer) Price(ctx context.Context, req *types.QueryPriceRequest) (*types.QueryPriceResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if req.DenomPair == "" {
		return nil, status.Error(codes.InvalidArgument, "denom_pair is required")
	}
	rate, err := q.keeper.QueryPrice(ctx, req.DenomPair)
	if err != nil {
		return nil, err
	}
	return &types.QueryPriceResponse{Rate: rate}, nil
}

func (q queryServer) Prices(ctx context.Context, req *types.QueryPricesRequest) (*types.QueryPricesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	rates, err := q.keeper.QueryPrices(ctx)
	if err != nil {
		return nil, err
	}
	return &types.QueryPricesResponse{Rates: rates}, nil
}

func (q queryServer) PriceHistory(ctx context.Context, req *types.QueryPriceHistoryRequest) (*types.QueryPriceHistoryResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if req.DenomPair == "" {
		return nil, status.Error(codes.InvalidArgument, "denom_pair is required")
	}
	limit := req.Limit
	if limit == 0 {
		limit = 20
	}
	entries, err := q.keeper.QueryPriceHistory(ctx, req.DenomPair, limit)
	if err != nil {
		return nil, err
	}
	return &types.QueryPriceHistoryResponse{Entries: entries}, nil
}

func (q queryServer) FeederDelegation(ctx context.Context, req *types.QueryFeederDelegationRequest) (*types.QueryFeederDelegationResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if req.Validator == "" {
		return nil, status.Error(codes.InvalidArgument, "validator is required")
	}
	feeder, err := q.keeper.QueryFeederDelegation(ctx, req.Validator)
	if err != nil {
		return nil, err
	}
	return &types.QueryFeederDelegationResponse{Feeder: feeder}, nil
}

func (q queryServer) MissCounter(ctx context.Context, req *types.QueryMissCounterRequest) (*types.QueryMissCounterResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if req.Validator == "" {
		return nil, status.Error(codes.InvalidArgument, "validator is required")
	}
	count, err := q.keeper.QueryMissCounter(ctx, req.Validator)
	if err != nil {
		return nil, err
	}
	return &types.QueryMissCounterResponse{MissCounter: count}, nil
}

func (q queryServer) Params(ctx context.Context, req *types.QueryOracleParamsRequest) (*types.QueryOracleParamsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	params := q.keeper.GetParams(ctx)
	return &types.QueryOracleParamsResponse{Params: params}, nil
}
