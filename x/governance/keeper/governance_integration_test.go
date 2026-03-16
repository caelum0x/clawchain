//go:build integration
// +build integration

package keeper_test

import (
	"context"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

// ---------------------------------------------------------------------------
// Full governance lifecycle integration tests
// ---------------------------------------------------------------------------

func TestGovernanceLifecycle_SubmitVoteTally(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_integ______"))
	voter1 := sdk.AccAddress([]byte("voter_int1__________"))
	voter2 := sdk.AccAddress([]byte("voter_int2__________"))
	voter3 := sdk.AccAddress([]byte("voter_int3__________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// Set up stake weights
	f.stakingKeeper.setBonded(voter1, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(30_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(20_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)

	// Step 1: Submit proposal
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Increase heartbeat gap",
		"Change max_heartbeat_gap_blocks from 100 to 200 for better stability",
		"agent",
		"max_heartbeat_gap_blocks",
		"200",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)

	// Step 2: Multiple voters vote
	err = f.keeper.CastVote(f.ctx, proposalID, voter1Str, "yes")
	require.NoError(t, err)

	err = f.keeper.CastVote(f.ctx, proposalID, voter2Str, "yes")
	require.NoError(t, err)

	err = f.keeper.CastVote(f.ctx, proposalID, voter3Str, "no")
	require.NoError(t, err)

	// Step 3: Verify tally reflects stake weights
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)

	// voter1 (10000) + voter2 (30000) = 40000 yes
	// voter3 (20000) = 20000 no
	require.True(t, proposal.YesVotes.GT(proposal.NoVotes),
		"yes votes (%s) should exceed no votes (%s)", proposal.YesVotes, proposal.NoVotes)

	// Step 4: Verify all votes recorded
	votes, err := f.keeper.GetVotes(f.ctx, proposalID)
	require.NoError(t, err)
	require.Len(t, votes, 3)
}

func TestGovernanceLifecycle_MultipleProposals(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_multi______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	// Submit two proposals
	id1, err := f.keeper.SubmitProposal(f.ctx,
		"Proposal 1", "desc1", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	id2, err := f.keeper.SubmitProposal(f.ctx,
		"Proposal 2", "desc2", "agent", "max_heartbeat_gap_blocks", "300",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NotEqual(t, id1, id2, "proposal IDs should be unique")

	// Verify both exist
	p1, err := f.keeper.GetProposal(f.ctx, id1)
	require.NoError(t, err)
	require.Equal(t, "Proposal 1", p1.Title)

	p2, err := f.keeper.GetProposal(f.ctx, id2)
	require.NoError(t, err)
	require.Equal(t, "Proposal 2", p2.Title)
}

func TestGovernanceLifecycle_DepositDeducted(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_dep________"))
	initialFunds := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))
	f.bankKeeper.fundAccount(proposer, initialFunds)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Deposit Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Verify deposit was taken from proposer
	remaining := f.bankKeeper.accountBalances[proposer.String()]
	require.True(t, remaining.AmountOf("uclaw").LT(math.NewInt(100_000_000)),
		"proposer balance should be reduced after deposit")
}

func TestGovernanceLifecycle_InsufficientDeposit(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_poor_______"))
	// Don't fund the proposer at all

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Poor Proposal", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// TallyProposal, ExecuteProposal, RejectProposal
// ---------------------------------------------------------------------------

// mockParamExecutor records param updates for verification.
type mockParamExecutor struct {
	applied map[string]string
}

func (m *mockParamExecutor) UpdateParam(_ context.Context, paramKey string, newValue string) error {
	m.applied[paramKey] = newValue
	return nil
}

func submitAndVoteProposal(t *testing.T, f *fixture, yesStake, noStake int64) uint64 {
	t.Helper()

	proposer := sdk.AccAddress([]byte("proposer_tv_________"))
	voter1 := sdk.AccAddress([]byte("voter_tv_yes________"))
	voter2 := sdk.AccAddress([]byte("voter_tv_no_________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(yesStake))
	f.stakingKeeper.setBonded(voter2, math.NewInt(noStake))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Tally Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter1Str, "yes"))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter2Str, "no"))

	return id
}

func TestGovernanceLifecycle_TallyProposalPasses(t *testing.T) {
	f := initFixture(t)
	id := submitAndVoteProposal(t, f, 30_000, 10_000)

	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.True(t, passed, "proposal should pass with majority yes")
}

func TestGovernanceLifecycle_TallyProposalFails(t *testing.T) {
	f := initFixture(t)
	id := submitAndVoteProposal(t, f, 10_000, 30_000)

	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.False(t, passed, "proposal should fail with majority no")
}

func TestGovernanceLifecycle_ExecuteProposal(t *testing.T) {
	f := initFixture(t)

	// Register a mock param executor for the agent module.
	pe := &mockParamExecutor{applied: make(map[string]string)}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	id := submitAndVoteProposal(t, f, 30_000, 10_000)

	err := f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	// Verify status is executed.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status)

	// Verify param was applied.
	val, ok := pe.applied["max_heartbeat_gap_blocks"]
	require.True(t, ok)
	require.Equal(t, "200", val)
}

func TestGovernanceLifecycle_RejectProposal(t *testing.T) {
	f := initFixture(t)
	id := submitAndVoteProposal(t, f, 10_000, 30_000)

	err := f.keeper.RejectProposal(f.ctx, id)
	require.NoError(t, err)

	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, proposal.Status)

	// Verify deposit was burned.
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").GT(math.ZeroInt()),
		"rejected proposal deposit should be burned")
}

func TestGovernanceLifecycle_EndBlocker(t *testing.T) {
	f := initFixture(t)

	pe := &mockParamExecutor{applied: make(map[string]string)}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_eb_________"))
	voter := sdk.AccAddress([]byte("voter_eb____________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(50_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"EndBlocker Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Vote no so it fails.
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voterStr, "no"))

	// Advance past voting period.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(proposal.VotingEndBlock + 1)

	// Run EndBlocker.
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)

	// Verify proposal is rejected.
	proposal, err = f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, proposal.Status)
}

func TestGovernanceLifecycle_GetProposals(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_gp_________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx, "P1", "d1", "agent", "max_heartbeat_gap_blocks", "200", proposerStr, deposit)
	require.NoError(t, err)
	_, err = f.keeper.SubmitProposal(f.ctx, "P2", "d2", "agent", "max_heartbeat_gap_blocks", "300", proposerStr, deposit)
	require.NoError(t, err)

	// Get all proposals.
	all, err := f.keeper.GetProposals(f.ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 2)

	// Filter by status.
	voting, err := f.keeper.GetProposals(f.ctx, types.ProposalStatusVoting)
	require.NoError(t, err)
	require.Len(t, voting, 2)
}

func TestGovernanceLifecycle_GenesisExportImport(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_gen________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx, "Genesis Test", "d1", "agent", "max_heartbeat_gap_blocks", "200", proposerStr, deposit)
	require.NoError(t, err)

	// Export genesis.
	genState, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, genState)

	// Init genesis into a fresh keeper.
	f2 := initFixture(t)
	err = f2.keeper.InitGenesis(f2.ctx, *genState)
	require.NoError(t, err)

	// Verify proposal was restored.
	all, err := f2.keeper.GetProposals(f2.ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 1)
	require.Equal(t, "Genesis Test", all[0].Title)
}
