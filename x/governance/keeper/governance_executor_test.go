package keeper_test

import (
	"context"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

// testParamExecutor records param updates for verification.
type testParamExecutor struct {
	applied map[string]string
}

func newTestParamExecutor() *testParamExecutor {
	return &testParamExecutor{applied: make(map[string]string)}
}

func (m *testParamExecutor) UpdateParam(_ context.Context, paramKey string, newValue string) error {
	m.applied[paramKey] = newValue
	return nil
}

// TestParamExecutor_Marketplace verifies proposals targeting marketplace module.
func TestParamExecutor_Marketplace(t *testing.T) {
	f := initFixture(t)
	pe := newTestParamExecutor()
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_pe_mkt_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Marketplace Param", "Change max_skills_per_agent",
		"marketplace", "max_skills_per_agent", "25",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	val, ok := pe.applied["max_skills_per_agent"]
	require.True(t, ok, "marketplace param executor should be called")
	require.Equal(t, "25", val)
}

// TestParamExecutor_Reputation verifies proposals targeting reputation module.
func TestParamExecutor_Reputation(t *testing.T) {
	f := initFixture(t)
	pe := newTestParamExecutor()
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_pe_rep_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Reputation Param", "Change heartbeat_penalty_bps",
		"reputation", "heartbeat_penalty_bps", "750",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	val, ok := pe.applied["heartbeat_penalty_bps"]
	require.True(t, ok, "reputation param executor should be called")
	require.Equal(t, "750", val)
}

// TestParamExecutor_Messaging verifies proposals targeting messaging module.
func TestParamExecutor_Messaging(t *testing.T) {
	f := initFixture(t)
	pe := newTestParamExecutor()
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_pe_msg_____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Messaging Param", "Change max_message_size",
		"messaging", "max_message_size", "8192",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	val, ok := pe.applied["max_message_size"]
	require.True(t, ok, "messaging param executor should be called")
	require.Equal(t, "8192", val)
}

// TestParamExecutor_ModelRegistry verifies proposals targeting modelregistry module.
func TestParamExecutor_ModelRegistry(t *testing.T) {
	f := initFixture(t)
	pe := newTestParamExecutor()
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_pe_mr______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"ModelRegistry Param", "Change platform_fee_bps",
		"modelregistry", "platform_fee_bps", "250",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	val, ok := pe.applied["platform_fee_bps"]
	require.True(t, ok, "modelregistry param executor should be called")
	require.Equal(t, "250", val)
}

// TestExecutionLog_SuccessfulExecution verifies ExecutionHeight is set after execution.
func TestExecutionLog_SuccessfulExecution(t *testing.T) {
	f := initFixture(t)
	pe := newTestParamExecutor()
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, pe)
	}

	proposer := sdk.AccAddress([]byte("proposer_execlog_____"))
	voter := sdk.AccAddress([]byte("voter_execlog________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(50_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Execution Log Test", "desc", "agent", "max_heartbeat_gap_blocks", "300",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Set a non-zero block height on the context.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(42)

	// Vote yes.
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voterStr, types.VoteOptionYes))

	// Execute the proposal.
	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.NoError(t, err)

	// Verify execution log fields.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status)
	require.Equal(t, int64(42), proposal.ExecutionHeight, "ExecutionHeight should be set to block height")
	require.Equal(t, "", proposal.ExecutionError, "ExecutionError should be empty on success")
}

// failTestParamExecutor always fails with a simulated error.
type failTestParamExecutor struct{}

func (f *failTestParamExecutor) UpdateParam(_ context.Context, _ string, _ string) error {
	return types.ErrExecutionFailed.Wrap("simulated failure")
}

// TestExecutionLog_FailedExecution verifies ExecutionError is set on failure.
func TestExecutionLog_FailedExecution(t *testing.T) {
	f := initFixture(t)
	fe := &failTestParamExecutor{}
	for moduleName := range types.AllowedModules {
		f.keeper.RegisterModuleParamExecutor(moduleName, fe)
	}

	proposer := sdk.AccAddress([]byte("proposer_execlogerr_"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Exec Error Log Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Set block height.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(99)

	err = f.keeper.ExecuteProposal(f.ctx, id)
	require.Error(t, err)

	// Verify execution log fields capture the error.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, int64(99), proposal.ExecutionHeight, "ExecutionHeight should be set even on failure")
	require.NotEmpty(t, proposal.ExecutionError, "ExecutionError should capture the error message")
	require.Contains(t, proposal.ExecutionError, "simulated failure")
}
