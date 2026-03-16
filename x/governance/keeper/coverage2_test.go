//go:build integration
// +build integration

package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/keeper"
	"clawchain/x/governance/types"
)

// ---------------------------------------------------------------------------
// gRPC MsgServer tests (grpc_msg_server.go)
// ---------------------------------------------------------------------------

func TestGRPCMsgServer_SubmitProposal(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpc_sub___"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	resp, err := msgServer.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:      proposerStr,
		Title:         "GRPC Submit Test",
		Description:   "Testing gRPC msg server submit",
		Module:        "agent",
		ParamKey:      "max_heartbeat_gap_blocks",
		ProposedValue: "300",
		DepositAmount: "10000000uclaw",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify the proposal was created through the keeper.
	proposal, err := f.keeper.GetProposal(f.ctx, resp.ProposalId)
	require.NoError(t, err)
	require.Equal(t, "GRPC Submit Test", proposal.Title)
	require.Equal(t, types.ProposalStatusVoting, proposal.Status)
}

func TestGRPCMsgServer_SubmitProposal_InvalidDeposit(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpc_bad___"))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := msgServer.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:      proposerStr,
		Title:         "Bad Deposit",
		Description:   "Invalid deposit format",
		Module:        "agent",
		ParamKey:      "max_heartbeat_gap_blocks",
		ProposedValue: "300",
		DepositAmount: "not-valid-coins",
	})
	require.Error(t, err)
}

func TestGRPCMsgServer_Vote(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpc_vote__"))
	voter := sdk.AccAddress([]byte("voter_grpc__________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	submitResp, err := msgServer.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:      proposerStr,
		Title:         "Vote GRPC Test",
		Description:   "Testing gRPC msg server vote",
		Module:        "agent",
		ParamKey:      "max_heartbeat_gap_blocks",
		ProposedValue: "200",
		DepositAmount: "10000000uclaw",
	})
	require.NoError(t, err)

	voteResp, err := msgServer.Vote(f.ctx, &types.MsgVote{
		Voter:      voterStr,
		ProposalId: submitResp.ProposalId,
		Option:     "yes",
	})
	require.NoError(t, err)
	require.NotNil(t, voteResp)

	// Verify the vote was recorded.
	votes, err := f.keeper.GetVotes(f.ctx, submitResp.ProposalId)
	require.NoError(t, err)
	require.Len(t, votes, 1)
	require.Equal(t, "yes", votes[0].Option)
}

func TestGRPCMsgServer_Vote_InvalidOption(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpc_vbad__"))
	voter := sdk.AccAddress([]byte("voter_grpc_bad______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	submitResp, err := msgServer.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:      proposerStr,
		Title:         "Vote Bad Option Test",
		Description:   "Testing gRPC msg server bad vote",
		Module:        "agent",
		ParamKey:      "max_heartbeat_gap_blocks",
		ProposedValue: "200",
		DepositAmount: "10000000uclaw",
	})
	require.NoError(t, err)

	_, err = msgServer.Vote(f.ctx, &types.MsgVote{
		Voter:      voterStr,
		ProposalId: submitResp.ProposalId,
		Option:     "invalid_option",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer tests (grpc_query_server.go)
// ---------------------------------------------------------------------------

func TestGRPCQueryServer_Proposal(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpcq_prop_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Query GRPC Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	resp, err := queryServer.Proposal(f.ctx, &types.QueryProposalRequest{ProposalId: id})
	require.NoError(t, err)
	require.NotNil(t, resp.Proposal)
	require.Equal(t, "Query GRPC Test", resp.Proposal.Title)
}

func TestGRPCQueryServer_Proposal_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Proposal(f.ctx, nil)
	require.Error(t, err)
}

func TestGRPCQueryServer_Proposal_NotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Proposal(f.ctx, &types.QueryProposalRequest{ProposalId: 99999})
	require.Error(t, err)
}

func TestGRPCQueryServer_Proposals(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpcq_list_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	_, err := f.keeper.SubmitProposal(f.ctx,
		"Proposal A", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)
	_, err = f.keeper.SubmitProposal(f.ctx,
		"Proposal B", "desc", "agent", "max_heartbeat_gap_blocks", "300",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	resp, err := queryServer.Proposals(f.ctx, &types.QueryProposalsRequest{Status: ""})
	require.NoError(t, err)
	require.Len(t, resp.Proposals, 2)
}

func TestGRPCQueryServer_Proposals_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Proposals(f.ctx, nil)
	require.Error(t, err)
}

func TestGRPCQueryServer_Proposals_FilterByStatus(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpcq_filt_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	_, err := f.keeper.SubmitProposal(f.ctx,
		"Filter Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Filter for "executed" should return nothing since proposal is "voting".
	resp, err := queryServer.Proposals(f.ctx, &types.QueryProposalsRequest{Status: types.ProposalStatusExecuted})
	require.NoError(t, err)
	require.Len(t, resp.Proposals, 0)
}

func TestGRPCQueryServer_Votes(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpcq_vote_"))
	voter := sdk.AccAddress([]byte("voter_grpcq_________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Votes Query Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id, voterStr, "yes"))

	resp, err := queryServer.Votes(f.ctx, &types.QueryVotesRequest{ProposalId: id})
	require.NoError(t, err)
	require.Len(t, resp.Votes, 1)
	require.Equal(t, "yes", resp.Votes[0].Option)
}

func TestGRPCQueryServer_Votes_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Votes(f.ctx, nil)
	require.Error(t, err)
}

func TestGRPCQueryServer_Votes_NoVotes(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	proposer := sdk.AccAddress([]byte("proposer_grpcq_nov__"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"No Votes Query", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	resp, err := queryServer.Votes(f.ctx, &types.QueryVotesRequest{ProposalId: id})
	require.NoError(t, err)
	require.Len(t, resp.Votes, 0)
}

func TestGRPCQueryServer_Params(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Params(f.ctx, &types.QueryParamsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestGRPCQueryServer_Params_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Params(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// HandleMsg* keeper method tests (msg_server.go)
// ---------------------------------------------------------------------------

func TestHandleMsgSubmitProposal(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_handle_sub_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.keeper.HandleMsgSubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:      proposerStr,
		Title:         "Handle Submit",
		Description:   "Test HandleMsgSubmitProposal",
		Module:        "agent",
		ParamKey:      "max_heartbeat_gap_blocks",
		ProposedValue: "250",
		DepositAmount: "10000000uclaw",
	})
	require.NoError(t, err)

	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, "Handle Submit", proposal.Title)
}

func TestHandleMsgSubmitProposal_BadCoins(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_handle_bad_"))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.HandleMsgSubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:      proposerStr,
		Title:         "Bad Coins",
		Description:   "Invalid deposit",
		Module:        "agent",
		ParamKey:      "max_heartbeat_gap_blocks",
		ProposedValue: "200",
		DepositAmount: "garbage",
	})
	require.Error(t, err)
}

func TestHandleMsgVote(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_handle_vot_"))
	voter := sdk.AccAddress([]byte("voter_handle________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Handle Vote Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.HandleMsgVote(f.ctx, &types.MsgVote{
		Voter:      voterStr,
		ProposalId: id,
		Option:     "no",
	})
	require.NoError(t, err)

	votes, err := f.keeper.GetVotes(f.ctx, id)
	require.NoError(t, err)
	require.Len(t, votes, 1)
	require.Equal(t, "no", votes[0].Option)
}

// ---------------------------------------------------------------------------
// Query* keeper method tests (query.go)
// ---------------------------------------------------------------------------

func TestQueryProposal_Keeper(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qk_prop____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Keeper Query Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	proposal, err := f.keeper.QueryProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, "Keeper Query Test", proposal.Title)
}

func TestQueryProposal_Keeper_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.QueryProposal(f.ctx, 99999)
	require.Error(t, err)
}

func TestQueryProposals_Keeper(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qk_list____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	_, err := f.keeper.SubmitProposal(f.ctx,
		"KQ Proposal 1", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	proposals, err := f.keeper.QueryProposals(f.ctx, "")
	require.NoError(t, err)
	require.Len(t, proposals, 1)

	// Filter with matching status.
	voting, err := f.keeper.QueryProposals(f.ctx, types.ProposalStatusVoting)
	require.NoError(t, err)
	require.Len(t, voting, 1)

	// Filter with non-matching status.
	executed, err := f.keeper.QueryProposals(f.ctx, types.ProposalStatusExecuted)
	require.NoError(t, err)
	require.Len(t, executed, 0)
}

func TestQueryVotes_Keeper(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qk_votes___"))
	voter := sdk.AccAddress([]byte("voter_qk_votes______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"KQ Votes Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id, voterStr, "abstain"))

	votes, err := f.keeper.QueryVotes(f.ctx, id)
	require.NoError(t, err)
	require.Len(t, votes, 1)
	require.Equal(t, "abstain", votes[0].Option)
}

func TestQueryVotes_Keeper_Empty(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qk_novotes_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"KQ No Votes", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	votes, err := f.keeper.QueryVotes(f.ctx, id)
	require.NoError(t, err)
	require.Len(t, votes, 0)
}
