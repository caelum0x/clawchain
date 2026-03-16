package keeper

import (
	"context"

	"clawchain/x/governance/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

type msgServer struct {
	keeper Keeper
}

// NewMsgServerImpl returns an implementation of the MsgServer interface.
func NewMsgServerImpl(keeper Keeper) types.MsgServer {
	return &msgServer{keeper: keeper}
}

var _ types.MsgServer = msgServer{}

func (m msgServer) SubmitProposal(ctx context.Context, msg *types.MsgSubmitProposal) (*types.MsgSubmitProposalResponse, error) {
	deposit, err := sdk.ParseCoinsNormalized(msg.DepositAmount)
	if err != nil {
		return nil, err
	}

	proposalID, err := m.keeper.SubmitProposal(
		ctx,
		msg.Title,
		msg.Description,
		msg.Module,
		msg.ParamKey,
		msg.ProposedValue,
		msg.Proposer,
		deposit,
	)
	if err != nil {
		return nil, err
	}

	return &types.MsgSubmitProposalResponse{ProposalId: proposalID}, nil
}

func (m msgServer) Vote(ctx context.Context, msg *types.MsgVote) (*types.MsgVoteResponse, error) {
	if err := m.keeper.CastVote(ctx, msg.ProposalId, msg.Voter, msg.Option); err != nil {
		return nil, err
	}
	return &types.MsgVoteResponse{}, nil
}
