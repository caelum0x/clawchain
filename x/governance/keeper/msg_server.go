package keeper

import (
	"context"

	"clawchain/x/governance/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// HandleMsgSubmitProposal handles submission of a parameter change proposal.
func (k Keeper) HandleMsgSubmitProposal(ctx context.Context, msg *types.MsgSubmitProposal) (uint64, error) {
	deposit, err := sdk.ParseCoinsNormalized(msg.DepositAmount)
	if err != nil {
		return 0, err
	}

	return k.SubmitProposal(
		ctx,
		msg.Title,
		msg.Description,
		msg.Module,
		msg.ParamKey,
		msg.ProposedValue,
		msg.Proposer,
		deposit,
	)
}

// HandleMsgVote handles casting a vote on a proposal.
func (k Keeper) HandleMsgVote(ctx context.Context, msg *types.MsgVote) error {
	return k.CastVote(ctx, msg.ProposalId, msg.Voter, msg.Option)
}

// HandleMsgCancelProposal handles cancellation of a proposal by its proposer.
func (k Keeper) HandleMsgCancelProposal(ctx context.Context, proposalID uint64, canceller string) error {
	return k.CancelProposal(ctx, proposalID, canceller)
}
