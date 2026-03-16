package keeper

import (
	"context"

	"clawchain/x/governance/types"
)

// QueryProposal returns a single proposal by ID.
func (k Keeper) QueryProposal(ctx context.Context, proposalID uint64) (*types.Proposal, error) {
	return k.GetProposal(ctx, proposalID)
}

// QueryProposals returns proposals, optionally filtered by status.
func (k Keeper) QueryProposals(ctx context.Context, status string) ([]types.Proposal, error) {
	return k.GetProposals(ctx, status)
}

// QueryVotes returns all votes for a proposal.
func (k Keeper) QueryVotes(ctx context.Context, proposalID uint64) ([]types.Vote, error) {
	return k.GetVotes(ctx, proposalID)
}
