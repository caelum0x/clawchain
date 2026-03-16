//go:build integration
// +build integration

package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

// ---------------------------------------------------------------------------
// TestGovernanceProposalFullLifecycle -- The complete governance loop:
//
//   Submit a parameter change proposal -> deposit meets minimum ->
//   vote YES from enough validators to pass -> EndBlocker executes ->
//   verify the parameter was actually changed on-chain and deposit refunded.
// ---------------------------------------------------------------------------

func TestGovernanceProposalFullLifecycle(t *testing.T) {
	f := initFixture(t)

	// Set up a tracking param executor so we can verify the parameter change.
	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Accounts ----------------------------------------------------------
	proposer := sdk.AccAddress([]byte("prop_full_lc________"))
	validator1 := sdk.AccAddress([]byte("val_full_lc_1_______"))
	validator2 := sdk.AccAddress([]byte("val_full_lc_2_______"))
	validator3 := sdk.AccAddress([]byte("val_full_lc_3_______"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 200_000_000)))
	f.stakingKeeper.setBonded(validator1, math.NewInt(100_000))
	f.stakingKeeper.setBonded(validator2, math.NewInt(80_000))
	f.stakingKeeper.setBonded(validator3, math.NewInt(20_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	val1Str, _ := f.addressCodec.BytesToString(validator1)
	val2Str, _ := f.addressCodec.BytesToString(validator2)
	val3Str, _ := f.addressCodec.BytesToString(validator3)

	// -- Step 1: Submit a parameter change proposal. -----------------------
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Increase max_tasks_per_block",
		"Raise max_tasks_per_block from default to 50 for higher throughput",
		"agent",
		"max_tasks_per_block",
		"50",
		proposerStr,
		deposit,
	)
	require.NoError(t, err, "proposal submission should succeed")

	// -- Step 2: Verify proposal was created in voting status. -------------
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusVoting, proposal.Status)
	require.Equal(t, "agent", proposal.Module)
	require.Equal(t, "max_tasks_per_block", proposal.ParamKey)
	require.Equal(t, "50", proposal.ProposedValue)
	require.True(t, proposal.VotingEndBlock > 0)

	// Verify deposit was deducted from proposer.
	proposerBal := f.bankKeeper.accountBalances[proposer.String()]
	require.Equal(t, math.NewInt(190_000_000), proposerBal.AmountOf("uclaw"),
		"proposer balance should be reduced by deposit amount")

	// -- Step 3: Vote YES from enough validators to pass. -----------------
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, val1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, val2Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, val3Str, types.VoteOptionNo))

	// Verify tally: YES = 100000 + 80000 = 180000, NO = 20000.
	proposal, err = f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.True(t, proposal.YesVotes.Equal(math.NewInt(180_000)),
		"yes votes should be 180000, got %s", proposal.YesVotes)
	require.True(t, proposal.NoVotes.Equal(math.NewInt(20_000)),
		"no votes should be 20000, got %s", proposal.NoVotes)

	// -- Step 4: Advance past voting period and run EndBlocker. -----------
	advancePastVotingPeriod(t, f, proposalID)
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err, "EndBlocker should succeed")

	// -- Step 5: Verify proposal status moved to "executed". ---------------
	proposal, err = f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status,
		"proposal should be executed after passing vote and EndBlocker")

	// -- Step 6: Verify the parameter was actually changed on-chain. ------
	val, ok := pe.applied["max_tasks_per_block"]
	require.True(t, ok, "param executor should have been called for max_tasks_per_block")
	require.Equal(t, "50", val, "param value should match the proposed value")

	// -- Step 7: Verify deposit was refunded. -----------------------------
	proposerBal = f.bankKeeper.accountBalances[proposer.String()]
	require.True(t, proposerBal.AmountOf("uclaw").GTE(math.NewInt(200_000_000)),
		"proposer should get deposit refunded on execution; balance: %s", proposerBal)
}

// ---------------------------------------------------------------------------
// TestGovernanceProposalRejection -- Proposal that gets voted NO:
//
//   Submit proposal -> deposit -> vote NO from majority ->
//   EndBlocker -> verify status is REJECTED and parameters unchanged.
// ---------------------------------------------------------------------------

func TestGovernanceProposalRejectionLifecycle(t *testing.T) {
	f := initFixture(t)

	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Accounts ----------------------------------------------------------
	proposer := sdk.AccAddress([]byte("prop_reject_________"))
	voter1 := sdk.AccAddress([]byte("voter_reject_1______"))
	voter2 := sdk.AccAddress([]byte("voter_reject_2______"))
	voter3 := sdk.AccAddress([]byte("voter_reject_3______"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(50_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(40_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)

	// Submit proposal.
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Bad param change proposal",
		"This proposal should be rejected",
		"agent",
		"max_tasks_per_block",
		"99999",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)

	// Cast votes: 1 YES (10k), 2 NO (50k + 40k = 90k).
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter2Str, types.VoteOptionNo))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter3Str, types.VoteOptionNo))

	// Advance past voting period and run EndBlocker.
	advancePastVotingPeriod(t, f, proposalID)
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)

	// Verify proposal is rejected.
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, proposal.Status,
		"proposal should be rejected when NO votes dominate")

	// Verify parameters were NOT changed.
	_, applied := pe.applied["max_tasks_per_block"]
	require.False(t, applied,
		"param executor should NOT have been called for a rejected proposal")

	// Verify deposit was burned (governance burns deposits on rejection).
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").GT(math.ZeroInt()),
		"rejected proposal deposit should be burned")
}

// ---------------------------------------------------------------------------
// TestGovernanceProposalExpiry -- Proposal that expires due to insufficient deposit:
//
//   Attempt to submit a proposal with deposit below the minimum ->
//   verify submission fails -> no proposal stored -> no state change.
//
//   Note: The ClawChain governance module enforces deposit at submission
//   time (not via a separate deposit period). A proposal that does not
//   meet the minimum deposit is rejected immediately.
// ---------------------------------------------------------------------------

func TestGovernanceProposalExpiry(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("prop_expiry_________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	// Minimum deposit is 10_000_000 uclaw. Try with only 1_000_000.
	tooSmallDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 1_000_000))

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Underfunded proposal",
		"This deposit is too small and should be rejected",
		"agent",
		"max_tasks_per_block",
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

	// Also test with zero deposit.
	zeroDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 0))
	_, err = f.keeper.SubmitProposal(f.ctx,
		"Zero deposit proposal",
		"Zero deposit should also fail",
		"agent",
		"max_tasks_per_block",
		"200",
		proposerStr,
		zeroDeposit,
	)
	require.Error(t, err, "proposal with zero deposit should be rejected")

	// Verify still no proposals.
	all, err = f.keeper.GetProposals(f.ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 0, "no proposal should be stored after zero deposit attempt")
}

// ---------------------------------------------------------------------------
// TestGovernanceMultipleVoters -- Multiple validators voting:
//
//   Submit proposal -> multiple accounts vote (some YES, some NO, some
//   ABSTAIN) -> verify tally is correct -> verify final outcome.
// ---------------------------------------------------------------------------

func TestGovernanceMultipleVoters(t *testing.T) {
	f := initFixture(t)

	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Accounts (5 voters with different stake weights). -----------------
	proposer := sdk.AccAddress([]byte("prop_multivoter_____"))
	voter1 := sdk.AccAddress([]byte("voter_mv_1__________"))
	voter2 := sdk.AccAddress([]byte("voter_mv_2__________"))
	voter3 := sdk.AccAddress([]byte("voter_mv_3__________"))
	voter4 := sdk.AccAddress([]byte("voter_mv_4__________"))
	voter5 := sdk.AccAddress([]byte("voter_mv_5__________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(100_000)) // YES
	f.stakingKeeper.setBonded(voter2, math.NewInt(80_000))  // YES
	f.stakingKeeper.setBonded(voter3, math.NewInt(70_000))  // NO
	f.stakingKeeper.setBonded(voter4, math.NewInt(60_000))  // NO
	f.stakingKeeper.setBonded(voter5, math.NewInt(50_000))  // ABSTAIN

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)
	voter4Str, _ := f.addressCodec.BytesToString(voter4)
	voter5Str, _ := f.addressCodec.BytesToString(voter5)

	// Submit proposal.
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Multi-voter proposal",
		"Testing tally with 5 voters",
		"agent",
		"max_tasks_per_block",
		"25",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)

	// Cast votes.
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter2Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter3Str, types.VoteOptionNo))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter4Str, types.VoteOptionNo))
	require.NoError(t, f.keeper.CastVote(f.ctx, proposalID, voter5Str, types.VoteOptionAbstain))

	// -- Verify all 5 votes were recorded. --------------------------------
	votes, err := f.keeper.GetVotes(f.ctx, proposalID)
	require.NoError(t, err)
	require.Len(t, votes, 5, "all five votes should be recorded")

	// -- Verify tally is correct. -----------------------------------------
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)

	// YES: voter1 (100k) + voter2 (80k) = 180000
	require.True(t, proposal.YesVotes.Equal(math.NewInt(180_000)),
		"yes votes should be 180000, got %s", proposal.YesVotes)

	// NO: voter3 (70k) + voter4 (60k) = 130000
	require.True(t, proposal.NoVotes.Equal(math.NewInt(130_000)),
		"no votes should be 130000, got %s", proposal.NoVotes)

	// ABSTAIN: voter5 (50k) = 50000
	require.True(t, proposal.AbstainVotes.Equal(math.NewInt(50_000)),
		"abstain votes should be 50000, got %s", proposal.AbstainVotes)

	// -- Verify tally result: YES (180k) > 50% of (YES+NO=310k) => passes.
	passed, err := f.keeper.TallyProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.True(t, passed,
		"proposal should pass: YES 180000 > 50%% of (YES+NO=310000)")

	// -- Execute via EndBlocker and verify execution. ---------------------
	advancePastVotingPeriod(t, f, proposalID)
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)

	proposal, err = f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status)

	val, ok := pe.applied["max_tasks_per_block"]
	require.True(t, ok)
	require.Equal(t, "25", val)

	// -- Now test a scenario where NO wins with multiple voters. ----------
	f2 := initFixture(t)
	pe2 := newTrackingParamExecutor()
	registerExecutorForAllModules(f2, pe2)

	proposer2 := sdk.AccAddress([]byte("prop_mv_reject______"))
	voterA := sdk.AccAddress([]byte("voter_mv_a__________"))
	voterB := sdk.AccAddress([]byte("voter_mv_b__________"))
	voterC := sdk.AccAddress([]byte("voter_mv_c__________"))

	f2.bankKeeper.fundAccount(proposer2, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f2.stakingKeeper.setBonded(voterA, math.NewInt(30_000)) // YES
	f2.stakingKeeper.setBonded(voterB, math.NewInt(80_000)) // NO
	f2.stakingKeeper.setBonded(voterC, math.NewInt(90_000)) // NO

	proposer2Str, _ := f2.addressCodec.BytesToString(proposer2)
	voterAStr, _ := f2.addressCodec.BytesToString(voterA)
	voterBStr, _ := f2.addressCodec.BytesToString(voterB)
	voterCStr, _ := f2.addressCodec.BytesToString(voterC)

	proposalID2, err := f2.keeper.SubmitProposal(f2.ctx,
		"Multi-voter rejection",
		"NO should win",
		"agent",
		"max_tasks_per_block",
		"999",
		proposer2Str,
		deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f2.keeper.CastVote(f2.ctx, proposalID2, voterAStr, types.VoteOptionYes))
	require.NoError(t, f2.keeper.CastVote(f2.ctx, proposalID2, voterBStr, types.VoteOptionNo))
	require.NoError(t, f2.keeper.CastVote(f2.ctx, proposalID2, voterCStr, types.VoteOptionNo))

	// Verify tally: YES=30k, NO=170k => rejected.
	passed2, err := f2.keeper.TallyProposal(f2.ctx, proposalID2)
	require.NoError(t, err)
	require.False(t, passed2,
		"proposal should fail: YES 30000 < 50%% of (YES+NO=200000)")

	advancePastVotingPeriod(t, f2, proposalID2)
	err = f2.keeper.EndBlocker(f2.ctx)
	require.NoError(t, err)

	proposal2, err := f2.keeper.GetProposal(f2.ctx, proposalID2)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, proposal2.Status)

	_, applied := pe2.applied["max_tasks_per_block"]
	require.False(t, applied, "param should not be changed for rejected proposal")
}

// ---------------------------------------------------------------------------
// TestGovernanceProposalDeposit -- Deposit mechanics:
//
//   Since ClawChain governance requires the full deposit at submission time,
//   this test verifies:
//   1. Exact minimum deposit succeeds and proposal enters voting.
//   2. Deposit above minimum also succeeds.
//   3. Deposit is properly tracked (deducted from proposer, held by module).
//   4. On execution (pass), deposit is refunded.
//   5. On rejection, deposit is burned.
// ---------------------------------------------------------------------------

func TestGovernanceProposalDeposit(t *testing.T) {
	f := initFixture(t)

	pe := newTrackingParamExecutor()
	registerExecutorForAllModules(f, pe)

	// -- Test 1: Exact minimum deposit succeeds. --------------------------
	t.Run("exact_minimum_deposit", func(t *testing.T) {
		proposer := sdk.AccAddress([]byte("prop_dep_exact______"))
		f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
		proposerStr, _ := f.addressCodec.BytesToString(proposer)

		exactDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", types.DefaultMinDepositUclaw))
		proposalID, err := f.keeper.SubmitProposal(f.ctx,
			"Exact deposit test",
			"Deposit exactly meets minimum",
			"agent",
			"max_tasks_per_block",
			"10",
			proposerStr,
			exactDeposit,
		)
		require.NoError(t, err, "exact minimum deposit should succeed")

		// Verify proposal is in voting status.
		proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
		require.NoError(t, err)
		require.Equal(t, types.ProposalStatusVoting, proposal.Status)

		// Verify deposit was deducted from proposer.
		expectedBal := math.NewInt(100_000_000 - types.DefaultMinDepositUclaw)
		actualBal := f.bankKeeper.accountBalances[proposer.String()].AmountOf("uclaw")
		require.True(t, actualBal.Equal(expectedBal),
			"proposer balance should be %s, got %s", expectedBal, actualBal)

		// Verify deposit is held by the module.
		moduleBal := f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw")
		require.True(t, moduleBal.GTE(math.NewInt(types.DefaultMinDepositUclaw)),
			"module should hold the deposit")
	})

	// -- Test 2: Above minimum deposit succeeds. --------------------------
	t.Run("above_minimum_deposit", func(t *testing.T) {
		proposer := sdk.AccAddress([]byte("prop_dep_above______"))
		f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 200_000_000)))
		proposerStr, _ := f.addressCodec.BytesToString(proposer)

		largeDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))
		proposalID, err := f.keeper.SubmitProposal(f.ctx,
			"Large deposit test",
			"Deposit above minimum",
			"agent",
			"max_tasks_per_block",
			"20",
			proposerStr,
			largeDeposit,
		)
		require.NoError(t, err, "above-minimum deposit should succeed")

		proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
		require.NoError(t, err)
		require.Equal(t, types.ProposalStatusVoting, proposal.Status)
	})

	// -- Test 3: Below minimum deposit fails. -----------------------------
	t.Run("below_minimum_deposit", func(t *testing.T) {
		proposer := sdk.AccAddress([]byte("prop_dep_below______"))
		f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
		proposerStr, _ := f.addressCodec.BytesToString(proposer)

		smallDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", types.DefaultMinDepositUclaw-1))
		_, err := f.keeper.SubmitProposal(f.ctx,
			"Small deposit test",
			"Deposit below minimum",
			"agent",
			"max_tasks_per_block",
			"30",
			proposerStr,
			smallDeposit,
		)
		require.Error(t, err, "below-minimum deposit should fail")
		require.ErrorContains(t, err, "minimum deposit")
	})

	// -- Test 4: Deposit refunded on execution (pass). --------------------
	t.Run("deposit_refunded_on_pass", func(t *testing.T) {
		f2 := initFixture(t)
		pe2 := newTrackingParamExecutor()
		registerExecutorForAllModules(f2, pe2)

		proposer := sdk.AccAddress([]byte("prop_dep_refund_____"))
		voter := sdk.AccAddress([]byte("voter_dep_refund____"))

		initialBalance := int64(100_000_000)
		depositAmt := int64(10_000_000)

		f2.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", initialBalance)))
		f2.stakingKeeper.setBonded(voter, math.NewInt(100_000))

		deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", depositAmt))
		proposerStr, _ := f2.addressCodec.BytesToString(proposer)
		voterStr, _ := f2.addressCodec.BytesToString(voter)

		proposalID, err := f2.keeper.SubmitProposal(f2.ctx,
			"Refund test",
			"Testing deposit refund",
			"agent",
			"max_tasks_per_block",
			"15",
			proposerStr,
			deposit,
		)
		require.NoError(t, err)

		// Verify deposit was deducted.
		afterSubmit := f2.bankKeeper.accountBalances[proposer.String()].AmountOf("uclaw")
		require.True(t, afterSubmit.Equal(math.NewInt(initialBalance-depositAmt)),
			"balance after submit should be %d, got %s", initialBalance-depositAmt, afterSubmit)

		// Vote YES and execute.
		require.NoError(t, f2.keeper.CastVote(f2.ctx, proposalID, voterStr, types.VoteOptionYes))
		advancePastVotingPeriod(t, f2, proposalID)
		err = f2.keeper.EndBlocker(f2.ctx)
		require.NoError(t, err)

		// Verify deposit was refunded.
		afterRefund := f2.bankKeeper.accountBalances[proposer.String()].AmountOf("uclaw")
		require.True(t, afterRefund.Equal(math.NewInt(initialBalance)),
			"balance after refund should be %d, got %s", initialBalance, afterRefund)
	})

	// -- Test 5: Deposit burned on rejection. -----------------------------
	t.Run("deposit_burned_on_rejection", func(t *testing.T) {
		f3 := initFixture(t)
		pe3 := newTrackingParamExecutor()
		registerExecutorForAllModules(f3, pe3)

		proposer := sdk.AccAddress([]byte("prop_dep_burn_______"))
		voter := sdk.AccAddress([]byte("voter_dep_burn______"))

		initialBalance := int64(100_000_000)
		depositAmt := int64(10_000_000)

		f3.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", initialBalance)))
		f3.stakingKeeper.setBonded(voter, math.NewInt(100_000))

		deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", depositAmt))
		proposerStr, _ := f3.addressCodec.BytesToString(proposer)
		voterStr, _ := f3.addressCodec.BytesToString(voter)

		proposalID, err := f3.keeper.SubmitProposal(f3.ctx,
			"Burn test",
			"Testing deposit burn on rejection",
			"agent",
			"max_tasks_per_block",
			"999",
			proposerStr,
			deposit,
		)
		require.NoError(t, err)

		// Vote NO and reject.
		require.NoError(t, f3.keeper.CastVote(f3.ctx, proposalID, voterStr, types.VoteOptionNo))
		advancePastVotingPeriod(t, f3, proposalID)
		err = f3.keeper.EndBlocker(f3.ctx)
		require.NoError(t, err)

		// Verify proposal is rejected.
		proposal, err := f3.keeper.GetProposal(f3.ctx, proposalID)
		require.NoError(t, err)
		require.Equal(t, types.ProposalStatusRejected, proposal.Status)

		// Verify deposit was burned.
		require.True(t, f3.bankKeeper.BurnedCoins.AmountOf("uclaw").Equal(math.NewInt(depositAmt)),
			"burned coins should equal deposit amount %d", depositAmt)

		// Verify proposer did NOT get deposit back.
		afterReject := f3.bankKeeper.accountBalances[proposer.String()].AmountOf("uclaw")
		require.True(t, afterReject.Equal(math.NewInt(initialBalance-depositAmt)),
			"proposer should not get deposit back on rejection; balance: %s", afterReject)
	})
}
