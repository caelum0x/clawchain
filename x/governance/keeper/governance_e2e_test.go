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
// trackingParamExecutor records param updates and allows verification that
// parameters were (or were not) applied by governance execution.
// ---------------------------------------------------------------------------

type trackingParamExecutor struct {
	applied map[string]string
}

func newTrackingParamExecutor() *trackingParamExecutor {
	return &trackingParamExecutor{applied: make(map[string]string)}
}

func (m *trackingParamExecutor) UpdateParam(_ context.Context, paramKey string, newValue string) error {
	m.applied[paramKey] = newValue
	return nil
}

// registerExecutorForAllModules wires the executor into every allowed module
// so that ExecuteProposal can find it regardless of which module a proposal
// targets.
func registerExecutorForAllModules(f *fixture, pe types.ModuleParamExecutor) {
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// advancePastVotingPeriod reads the proposal's VotingEndBlock and sets the
// fixture context to one block after that height.
func advancePastVotingPeriod(t *testing.T, f *fixture, proposalID uint64) {
	t.Helper()
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(proposal.VotingEndBlock + 1)
}

// ---------------------------------------------------------------------------
// 1. TestGovernanceProposalLifecycle -- full happy-path lifecycle
//
//   Submit proposal -> query -> vote yes -> advance blocks -> EndBlocker
//   -> proposal passed & executed -> parameter actually changed on-chain
// ---------------------------------------------------------------------------

func TestGovernanceProposalLifecycle(t *testing.T) {
	f := initFixture(t)

	// -- Set up a tracking param executor so we can verify application. ----
	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Accounts ----------------------------------------------------------
	proposer := sdk.AccAddress([]byte("proposer_e2e_lc_____"))
	voter1 := sdk.AccAddress([]byte("voter_e2e_lc_1______"))
	voter2 := sdk.AccAddress([]byte("voter_e2e_lc_2______"))
	voter3 := sdk.AccAddress([]byte("voter_e2e_lc_3______"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(50_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(30_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(20_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)

	// -- Step 1: Submit the proposal. -------------------------------------
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Increase max heartbeat gap",
		"Change max_heartbeat_gap_blocks from 100 to 200 for better stability",
		"agent",
		"max_heartbeat_gap_blocks",
		"200",
		proposerStr,
		deposit,
	)
	require.NoError(t, err, "proposal submission should succeed")

	// -- Step 2: Query the proposal and verify status is "voting". ---------
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusVoting, proposal.Status,
		"newly submitted proposal must be in voting status")
	require.Equal(t, "agent", proposal.Module)
	require.Equal(t, "max_heartbeat_gap_blocks", proposal.ParamKey)
	require.Equal(t, "200", proposal.ProposedValue)
	require.True(t, proposal.VotingEndBlock > 0,
		"voting end block should be set to a positive block height")

	// -- Step 3: Cast YES votes from multiple accounts. -------------------
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter2Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter3Str, types.VoteOptionNo))

	// Quick sanity: yes votes should dominate (50000 + 30000 = 80000 vs 20000).
	proposal, err = f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.True(t, proposal.YesVotes.GT(proposal.NoVotes),
		"yes votes (%s) should exceed no votes (%s)", proposal.YesVotes, proposal.NoVotes)

	// Verify all 3 votes were recorded.
	votes, err := f.keeper.GetVotes(f.ctx, proposalID)
	require.NoError(t, err)
	require.Len(t, votes, 3, "all three votes should be recorded")

	// -- Step 4: Advance blocks past voting period. -----------------------
	advancePastVotingPeriod(t, f, proposalID)

	// -- Step 5: Call EndBlocker to process proposals. --------------------
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err, "EndBlocker should succeed")

	// -- Step 6: Verify proposal status moved to "executed". ---------------
	//
	// EndBlocker flow: voting -> passed -> executed (if ExecuteProposal succeeds).
	proposal, err = f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status,
		"proposal should be executed after EndBlocker processes a passing proposal")

	// -- Step 7: Verify the parameter was actually changed. ----------------
	val, ok := pe.applied["max_heartbeat_gap_blocks"]
	require.True(t, ok, "param executor should have been called for max_heartbeat_gap_blocks")
	require.Equal(t, "200", val, "param value should match the proposed value")

	// -- Step 8: Verify deposit was refunded (since proposal passed). -----
	proposerBal := f.bankKeeper.accountBalances[proposer.String()]
	require.True(t, proposerBal.AmountOf("uclaw").GTE(math.NewInt(100_000_000)),
		"proposer should get deposit refunded on execution; balance: %s", proposerBal)
}

// ---------------------------------------------------------------------------
// 2. TestGovernanceProposalRejection -- rejection path
//
//   Submit proposal -> vote NO from majority -> advance -> EndBlocker
//   -> proposal rejected -> parameters unchanged
// ---------------------------------------------------------------------------

func TestGovernanceProposalRejection(t *testing.T) {
	f := initFixture(t)

	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Accounts ----------------------------------------------------------
	proposer := sdk.AccAddress([]byte("proposer_e2e_rej____"))
	voter1 := sdk.AccAddress([]byte("voter_e2e_rej_1_____"))
	voter2 := sdk.AccAddress([]byte("voter_e2e_rej_2_____"))
	voter3 := sdk.AccAddress([]byte("voter_e2e_rej_3_____"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(40_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(50_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)

	// Submit proposal.
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Bad param change",
		"This should be rejected",
		"agent",
		"max_heartbeat_gap_blocks",
		"99999",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)

	// Cast votes: 1 yes (10k), 2 no (40k + 50k = 90k).
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter2Str, types.VoteOptionNo))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter3Str, types.VoteOptionNo))

	// Advance past voting period.
	advancePastVotingPeriod(t, f, proposalID)

	// Run EndBlocker.
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)

	// Verify proposal is rejected.
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, proposal.Status,
		"proposal should be rejected when NO votes dominate")

	// Verify parameters were NOT changed.
	_, applied := pe.applied["max_heartbeat_gap_blocks"]
	require.False(t, applied, "param executor should NOT have been called for a rejected proposal")

	// Verify deposit was burned (rejection burns the deposit).
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").GT(math.ZeroInt()),
		"rejected proposal deposit should be burned")
}

// ---------------------------------------------------------------------------
// 3. TestGovernanceProposalInsufficientDeposit -- error path
//
//   Submit proposal with deposit below minimum -> verify error.
// ---------------------------------------------------------------------------

func TestGovernanceProposalInsufficientDeposit(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_e2e_dep____"))
	// Fund proposer with a small amount (but still enough to pay the deposit
	// if the keeper were to try -- the point is the deposit is too small).
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	// Minimum deposit is 10_000_000 uclaw.  Try with 1_000_000 (too low).
	tooSmallDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 1_000_000))

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Underfunded proposal",
		"This deposit is too small",
		"agent",
		"max_heartbeat_gap_blocks",
		"200",
		proposerStr,
		tooSmallDeposit,
	)
	require.Error(t, err, "proposal with insufficient deposit should be rejected")
	require.ErrorContains(t, err, "minimum deposit",
		"error should mention minimum deposit requirement")

	// Verify no proposals were stored.
	all, err := f.keeper.GetProposals(f.ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 0, "no proposal should be stored when deposit is insufficient")

	// Verify proposer's balance was not touched.
	balance := f.bankKeeper.accountBalances[proposer.String()]
	require.Equal(t, math.NewInt(100_000_000), balance.AmountOf("uclaw"),
		"proposer balance should be unchanged after failed submission")
}

// ---------------------------------------------------------------------------
// 4. TestGovernanceVoteInvalidProposal -- error path
//
//   Try to vote on a non-existent proposal -> verify error.
// ---------------------------------------------------------------------------

func TestGovernanceVoteInvalidProposal(t *testing.T) {
	f := initFixture(t)

	voter := sdk.AccAddress([]byte("voter_e2e_invalid___"))
	voterStr, _ := f.addressCodec.BytesToString(voter)

	// Try to vote on proposal ID 999 which does not exist.
	err := f.keeper.CastVote(f.ctx, 999, voterStr, types.VoteOptionYes)
	require.Error(t, err, "voting on non-existent proposal should fail")
	require.ErrorContains(t, err, "not found",
		"error should indicate the proposal was not found")

	// Also verify voting on proposal ID 0 fails (no proposals created).
	err = f.keeper.CastVote(f.ctx, 0, voterStr, types.VoteOptionNo)
	require.Error(t, err, "voting on proposal 0 should fail when none exist")
}

// ---------------------------------------------------------------------------
// 5. TestGovernanceMultipleProposals -- concurrent proposals
//
//   Submit 2 proposals, vote YES on one, NO on the other, verify outcomes.
// ---------------------------------------------------------------------------

func TestGovernanceMultipleProposals(t *testing.T) {
	f := initFixture(t)

	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Accounts ----------------------------------------------------------
	proposer := sdk.AccAddress([]byte("proposer_e2e_multi__"))
	voter1 := sdk.AccAddress([]byte("voter_e2e_multi_1___"))
	voter2 := sdk.AccAddress([]byte("voter_e2e_multi_2___"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 200_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(60_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(40_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)

	// -- Submit proposal A (should pass). ----------------------------------
	idA, err := f.keeper.SubmitProposal(f.ctx,
		"Proposal A - should pass",
		"Increase heartbeat gap",
		"agent",
		"max_heartbeat_gap_blocks",
		"200",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)

	// -- Submit proposal B (should be rejected). ---------------------------
	idB, err := f.keeper.SubmitProposal(f.ctx,
		"Proposal B - should fail",
		"Reduce actions per block",
		"agent",
		"max_actions_per_block",
		"5",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)

	require.NotEqual(t, idA, idB, "proposal IDs should be unique")

	// -- Vote on proposal A: majority YES. ---------------------------------
	require.NoError(t, f.keeper.CastVote(f.ctx, idA, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, idA, voter2Str, types.VoteOptionYes))

	// -- Vote on proposal B: majority NO. ----------------------------------
	require.NoError(t, f.keeper.CastVote(f.ctx, idB, voter1Str, types.VoteOptionNo))
	require.NoError(t, f.keeper.CastVote(f.ctx, idB, voter2Str, types.VoteOptionNo))

	// -- Advance past both voting periods (they share the same end block). -
	// Use the higher of the two VotingEndBlocks to be safe.
	pA, err := f.keeper.GetProposal(f.ctx, idA)
	require.NoError(t, err)
	pB, err := f.keeper.GetProposal(f.ctx, idB)
	require.NoError(t, err)
	endBlock := pA.VotingEndBlock
	if pB.VotingEndBlock > endBlock {
		endBlock = pB.VotingEndBlock
	}
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(endBlock + 1)

	// -- Run EndBlocker. ---------------------------------------------------
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)

	// -- Verify proposal A was executed. -----------------------------------
	pA, err = f.keeper.GetProposal(f.ctx, idA)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, pA.Status,
		"proposal A should be executed (majority YES)")

	valA, ok := pe.applied["max_heartbeat_gap_blocks"]
	require.True(t, ok, "param executor should be called for proposal A's param")
	require.Equal(t, "200", valA)

	// -- Verify proposal B was rejected. -----------------------------------
	pB, err = f.keeper.GetProposal(f.ctx, idB)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, pB.Status,
		"proposal B should be rejected (majority NO)")

	_, appliedB := pe.applied["max_actions_per_block"]
	require.False(t, appliedB, "param executor should NOT be called for rejected proposal B")

	// -- Verify deposit refund/burn behavior. ------------------------------
	// Proposal A (passed) => deposit refunded.
	// Proposal B (rejected) => deposit burned.
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").GT(math.ZeroInt()),
		"rejected proposal B deposit should be burned")
}
