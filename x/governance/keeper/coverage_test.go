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
// GetAuthority
// ---------------------------------------------------------------------------

func TestGetAuthority(t *testing.T) {
	f := initFixture(t)

	authority := f.keeper.GetAuthority()
	require.NotEmpty(t, authority, "authority should not be empty")

	// The authority should be a valid address.
	authorityStr, err := f.addressCodec.BytesToString(authority)
	require.NoError(t, err)
	require.NotEmpty(t, authorityStr)
}

// ---------------------------------------------------------------------------
// RegisterModuleParamExecutor
// ---------------------------------------------------------------------------

func TestRegisterModuleParamExecutor(t *testing.T) {
	f := initFixture(t)

	pe := &mockParamExecutor{applied: make(map[string]string)}
	f.keeper.RegisterModuleParamExecutor("agent", pe)

	// Submit a proposal, then execute to verify the executor is wired up.
	proposer := sdk.AccAddress([]byte("proposer_reg________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Executor Test", "desc", "agent", "max_heartbeat_gap_blocks", "999",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	val, ok := pe.applied["max_heartbeat_gap_blocks"]
	require.True(t, ok, "param should have been applied via registered executor")
	require.Equal(t, "999", val)
}

// ---------------------------------------------------------------------------
// Abstain vote
// ---------------------------------------------------------------------------

func TestCastVote_Abstain(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_abstain____"))
	voter := sdk.AccAddress([]byte("voter_abstain_______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(5000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Abstain Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.CastVote(f.ctx, id, voterStr, "abstain")
	require.NoError(t, err)

	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.True(t, proposal.AbstainVotes.GT(math.ZeroInt()),
		"abstain votes should be positive")
}

// ---------------------------------------------------------------------------
// Vote on nonexistent proposal
// ---------------------------------------------------------------------------

func TestCastVote_NonexistentProposal(t *testing.T) {
	f := initFixture(t)

	voter := sdk.AccAddress([]byte("voter_noexist_______"))
	voterStr, _ := f.addressCodec.BytesToString(voter)

	err := f.keeper.CastVote(f.ctx, 99999, voterStr, "yes")
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found")
}

// ---------------------------------------------------------------------------
// Vote after voting period ends
// ---------------------------------------------------------------------------

func TestCastVote_AfterVotingPeriod(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_late_______"))
	voter := sdk.AccAddress([]byte("voter_late__________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Late Vote Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Advance past voting period.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(proposal.VotingEndBlock + 1)

	err = f.keeper.CastVote(f.ctx, id, voterStr, "yes")
	require.Error(t, err)
	require.Contains(t, err.Error(), "voting")
}

// ---------------------------------------------------------------------------
// ExecuteProposal with no registered executor
// ---------------------------------------------------------------------------

func TestExecuteProposal_NoExecutor(t *testing.T) {
	f := initFixture(t)
	// Deliberately do NOT register any module param executor.

	proposer := sdk.AccAddress([]byte("proposer_noexec_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"No Executor Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.Error(t, err)
	require.Contains(t, err.Error(), "no param executor registered")
}

// ---------------------------------------------------------------------------
// EndBlocker where a proposal passes
// ---------------------------------------------------------------------------

func TestEndBlocker_ProposalPasses(t *testing.T) {
	f := initFixture(t)

	pe := &mockParamExecutor{applied: make(map[string]string)}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_ebpass_____"))
	voter := sdk.AccAddress([]byte("voter_ebpass________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(50_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"EndBlocker Pass Test", "desc", "agent", "max_heartbeat_gap_blocks", "300",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Vote yes so it passes.
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voterStr, "yes"))

	// Advance past voting period.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(proposal.VotingEndBlock + 1)

	// Run EndBlocker.
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)

	// Verify proposal is executed.
	proposal, err = f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status)

	// Verify param was applied.
	val, ok := pe.applied["max_heartbeat_gap_blocks"]
	require.True(t, ok)
	require.Equal(t, "300", val)
}

// ---------------------------------------------------------------------------
// TallyProposal with only abstain votes (edge case)
// ---------------------------------------------------------------------------

func TestTallyProposal_OnlyAbstain(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_allabs_____"))
	voter := sdk.AccAddress([]byte("voter_allabs________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(10_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Abstain Only Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id, voterStr, "abstain"))

	// With only abstain votes, yes+no is zero, so tally should return false.
	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.False(t, passed, "proposal with only abstain votes should not pass")
}

// ---------------------------------------------------------------------------
// TallyProposal with no votes
// ---------------------------------------------------------------------------

func TestTallyProposal_NoVotes(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_novote_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"No Votes Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.False(t, passed, "proposal with no votes should not pass")
}

// ---------------------------------------------------------------------------
// GetProposal for nonexistent ID
// ---------------------------------------------------------------------------

func TestGetProposal_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.GetProposal(f.ctx, 99999)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found")
}

// ---------------------------------------------------------------------------
// GetProposals with status filter returns empty for unmatched status
// ---------------------------------------------------------------------------

func TestGetProposals_FilterNoMatch(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_filter_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Filter Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Filter for "executed" status should return empty since proposal is "voting".
	results, err := f.keeper.GetProposals(f.ctx, types.ProposalStatusExecuted)
	require.NoError(t, err)
	require.Len(t, results, 0)
}

// ---------------------------------------------------------------------------
// SubmitProposal with empty title
// ---------------------------------------------------------------------------

func TestSubmitProposal_EmptyTitle(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_emptytitle_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// SubmitProposal with deposit below minimum
// ---------------------------------------------------------------------------

func TestSubmitProposal_DepositBelowMinimum(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_lowdep_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// 1 uclaw is below the minimum of 10_000_000.
	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 1))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Low Deposit", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.Error(t, err)
	require.Contains(t, err.Error(), "minimum deposit")
}

// ---------------------------------------------------------------------------
// SubmitProposal with invalid param key for module
// ---------------------------------------------------------------------------

func TestSubmitProposal_InvalidParamKey(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_badparam___"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Bad Param", "desc", "agent", "nonexistent_param_key", "100",
		proposerStr, deposit,
	)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// ExecuteProposal refunds deposit
// ---------------------------------------------------------------------------

func TestExecuteProposal_RefundsDeposit(t *testing.T) {
	f := initFixture(t)

	pe := &mockParamExecutor{applied: make(map[string]string)}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_refund_____"))
	initialFunds := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))
	f.bankKeeper.fundAccount(proposer, initialFunds)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Refund Test", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Balance should be reduced after deposit.
	afterDeposit := f.bankKeeper.accountBalances[proposer.String()]
	require.True(t, afterDeposit.AmountOf("uclaw").LT(math.NewInt(100_000_000)))

	// Execute the proposal (refunds deposit).
	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	// Balance should be restored.
	afterRefund := f.bankKeeper.accountBalances[proposer.String()]
	require.True(t, afterRefund.AmountOf("uclaw").Equal(math.NewInt(100_000_000)),
		"proposer should have full balance after refund, got %s", afterRefund.AmountOf("uclaw"))
}

// ---------------------------------------------------------------------------
// SetStakingKeeper with nil (equal-weight voting)
// ---------------------------------------------------------------------------

// Voting must fail closed when no staking keeper is configured, rather than
// silently degrading to one-address-one-vote (a Sybil attack vector).
func TestCastVote_FailsClosedWithoutStakingKeeper(t *testing.T) {
	f := initFixture(t)
	f.keeper.SetStakingKeeper(nil)

	proposer := sdk.AccAddress([]byte("proposer_nostake____"))
	voter := sdk.AccAddress([]byte("voter_nostake1______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"No Staking Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.CastVote(f.ctx, id, voterStr, "yes")
	require.ErrorIs(t, err, types.ErrStakingUnavailable)
}

// A voter with zero bonded stake has no voting power and must be rejected,
// instead of receiving a free minimum-weight vote.
func TestCastVote_ZeroStakeRejected(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_zerostake__"))
	voter := sdk.AccAddress([]byte("voter_zerostake_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	// Deliberately do NOT set any bonded stake for the voter.

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Zero Stake Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.CastVote(f.ctx, id, voterStr, "yes")
	require.ErrorIs(t, err, types.ErrNoVotingPower)
}

// ---------------------------------------------------------------------------
// ExecuteProposal with a failing executor
// ---------------------------------------------------------------------------

type failingParamExecutor struct{}

func (f *failingParamExecutor) UpdateParam(_ context.Context, _ string, _ string) error {
	return types.ErrExecutionFailed.Wrap("simulated failure")
}

func TestExecuteProposal_ExecutorFails(t *testing.T) {
	f := initFixture(t)

	fe := &failingParamExecutor{}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, fe)
	}

	proposer := sdk.AccAddress([]byte("proposer_execfail___"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Fail Exec Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to apply param change")
}

// ---------------------------------------------------------------------------
// TallyProposal with exact 50/50 split (should NOT pass -- needs >50%)
// ---------------------------------------------------------------------------

func TestTallyProposal_ExactTie(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_tie________"))
	voter1 := sdk.AccAddress([]byte("voter_tie_yes_______"))
	voter2 := sdk.AccAddress([]byte("voter_tie_no________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(10_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Tie Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter1Str, "yes"))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter2Str, "no"))

	// Exact 50/50 tie should NOT pass (threshold is >50%).
	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.False(t, passed, "exact 50/50 tie should not pass")
}

// ---------------------------------------------------------------------------
// CastVote on non-voting proposal (e.g., already executed)
// ---------------------------------------------------------------------------

func TestCastVote_OnExecutedProposal(t *testing.T) {
	f := initFixture(t)

	pe := &mockParamExecutor{applied: make(map[string]string)}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_execvote___"))
	voter := sdk.AccAddress([]byte("voter_execvote______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Executed Vote Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Execute the proposal.
	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	// Trying to vote on an executed proposal should fail.
	err = f.keeper.CastVote(f.ctx, id, voterStr, "yes")
	require.Error(t, err)
	require.Contains(t, err.Error(), "status")
}
