package keeper

import (
	"context"

	"clawchain/x/oracle/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type msgServer struct {
	keeper Keeper
}

// NewMsgServerImpl returns an implementation of the MsgServer interface.
func NewMsgServerImpl(keeper Keeper) types.MsgServer {
	return &msgServer{keeper: keeper}
}

var _ types.MsgServer = msgServer{}

func (m msgServer) DelegateFeeder(ctx context.Context, msg *types.MsgDelegateFeeder) (*types.MsgDelegateFeederResponse, error) {
	if msg == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if err := m.keeper.HandleDelegateFeeder(ctx, msg.Validator, msg.Feeder); err != nil {
		return nil, err
	}
	return &types.MsgDelegateFeederResponse{}, nil
}

func (m msgServer) AggregateExchangeRatePrevote(ctx context.Context, msg *types.MsgAggregateExchangeRatePrevote) (*types.MsgAggregateExchangeRatePrevoteResponse, error) {
	if msg == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if err := m.keeper.HandlePrevote(ctx, msg.Hash, msg.Feeder, msg.Validator); err != nil {
		return nil, err
	}
	return &types.MsgAggregateExchangeRatePrevoteResponse{}, nil
}

func (m msgServer) AggregateExchangeRateVote(ctx context.Context, msg *types.MsgAggregateExchangeRateVote) (*types.MsgAggregateExchangeRateVoteResponse, error) {
	if msg == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	if err := m.keeper.HandleVote(ctx, msg.Salt, msg.ExchangeRates, msg.Feeder, msg.Validator); err != nil {
		return nil, err
	}
	return &types.MsgAggregateExchangeRateVoteResponse{}, nil
}

func (m msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateOracleParams) (*types.MsgUpdateOracleParamsResponse, error) {
	if msg == nil {
		return nil, status.Error(codes.InvalidArgument, "empty request")
	}
	authority := m.keeper.GetAuthority()
	if msg.Authority != string(authority) {
		return nil, status.Error(codes.PermissionDenied, "unauthorized: sender is not the module authority")
	}
	if err := m.keeper.SetParams(ctx, msg.Params); err != nil {
		return nil, err
	}
	return &types.MsgUpdateOracleParamsResponse{}, nil
}
