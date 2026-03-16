package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

func TestCancelProposal_Success(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_cancel_____"))
	initialBalance := int64(100_000_000)
	depositAmt := int64(10_000_000)

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", initialBalance)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", depositAmt))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Cancel Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Verify deposit was deducted.
	afterSubmit := f.bankKeeper.accountBalances[proposer.String()].AmountOf("uclaw")
	require.True(t, afterSubmit.Equal(math.NewInt(initialBalance-depositAmt)))

	// Cancel the proposal.
	err = f.keeper.CancelProposal(f.ctx, id, proposerStr)
	require.NoError(t, err)

	// Verify proposal is cancelled.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusCancelled, proposal.Status)

	// Verify deposit was refunded.
	afterCancel := f.bankKeeper.accountBalances[proposer.String()].AmountOf("uclaw")
	require.True(t, afterCancel.Equal(math.NewInt(initialBalance)),
		"proposer should get deposit back on cancel; got %s", afterCancel)
}

func TestCancelProposal_NonProposerFails(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_cancel2____"))
	other := sdk.AccAddress([]byte("other_cancel________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	otherStr, _ := f.addressCodec.BytesToString(other)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Cancel Auth Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Non-proposer tries to cancel - should fail.
	err = f.keeper.CancelProposal(f.ctx, id, otherStr)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unauthorized")

	// Verify proposal is still in voting.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusVoting, proposal.Status)
}

func TestCancelProposal_ExecutedProposalFails(t *testing.T) {
	f := initFixture(t)

	pe := newTestParamExecutor()
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_cancel3____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Cancel Executed Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Execute the proposal first.
	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	// Try to cancel executed proposal - should fail.
	err = f.keeper.CancelProposal(f.ctx, id, proposerStr)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not cancellable")
}

func TestCancelProposal_RejectedProposalFails(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_cancel4____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Cancel Rejected Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Reject the proposal.
	err = f.keeper.RejectProposal(f.ctx, id)
	require.NoError(t, err)

	// Try to cancel rejected proposal - should fail.
	err = f.keeper.CancelProposal(f.ctx, id, proposerStr)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not cancellable")
}

func TestHandleMsgCancelProposal(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_hmcancel___"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"HandleMsg Cancel Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.HandleMsgCancelProposal(f.ctx, id, proposerStr)
	require.NoError(t, err)

	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusCancelled, proposal.Status)
}
