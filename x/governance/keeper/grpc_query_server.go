package keeper

import (
	"context"

	"clawchain/x/governance/types"

	errorsmod "cosmossdk.io/errors"
)

type queryServer struct {
	keeper Keeper
}

// NewQueryServerImpl returns an implementation of the QueryServer interface.
func NewQueryServerImpl(keeper Keeper) types.QueryServer {
	return &queryServer{keeper: keeper}
}

var _ types.QueryServer = queryServer{}

func (q queryServer) Proposal(ctx context.Context, req *types.QueryProposalRequest) (*types.QueryProposalResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProposal, "empty request")
	}

	proposal, err := q.keeper.GetProposal(ctx, req.ProposalId)
	if err != nil {
		return nil, err
	}

	return &types.QueryProposalResponse{Proposal: proposal}, nil
}

func (q queryServer) Proposals(ctx context.Context, req *types.QueryProposalsRequest) (*types.QueryProposalsResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProposal, "empty request")
	}

	proposals, err := q.keeper.GetProposals(ctx, req.Status)
	if err != nil {
		return nil, err
	}

	// Convert value slice to pointer slice for pb compatibility
	pbProposals := make([]*types.Proposal, len(proposals))
	for i := range proposals {
		pbProposals[i] = &proposals[i]
	}

	return &types.QueryProposalsResponse{Proposals: pbProposals}, nil
}

func (q queryServer) Votes(ctx context.Context, req *types.QueryVotesRequest) (*types.QueryVotesResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProposal, "empty request")
	}

	votes, err := q.keeper.GetVotes(ctx, req.ProposalId)
	if err != nil {
		return nil, err
	}

	// Convert value slice to pointer slice for pb compatibility
	pbVotes := make([]*types.Vote, len(votes))
	for i := range votes {
		pbVotes[i] = &votes[i]
	}

	return &types.QueryVotesResponse{Votes: pbVotes}, nil
}

func (q queryServer) Params(ctx context.Context, req *types.QueryParamsRequest) (*types.QueryParamsResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProposal, "empty request")
	}

	// Return default params for now
	return &types.QueryParamsResponse{}, nil
}
