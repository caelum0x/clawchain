//go:build integration
// +build integration

package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// Reputation adapter: SlashAgentDeposit - not-registered case
// ---------------------------------------------------------------------------

func TestSlashAgentDeposit_NoAgent_Coverage3(t *testing.T) {
	f := initFixture(t)

	// No agent registered → no-op
	err := f.keeper.SlashAgentDeposit(f.ctx, validAddress2(), 100)
	require.NoError(t, err)
}

func TestSlashAgentDeposit_WithActualDeposit_Coverage3(t *testing.T) {
	f := initFixtureWithDeposit(t, 1000)
	addr := validAddress()

	// Fund and register agent with deposit
	addrBytes, _ := sdk.AccAddressFromBech32(addr)
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10000)))

	registerAgent(t, f, addr, "deposited3", "pk_dep3")

	// Fund module account so burn succeeds
	require.NoError(t, f.bankKeeper.MintCoins(f.ctx, types.ModuleName, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 1000))))

	err := f.keeper.SlashAgentDeposit(f.ctx, addr, 500) // 5%
	require.NoError(t, err)

	// Verify deposit was reduced
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.NotEqual(t, "1000", agent.DepositAmount)
}

// ---------------------------------------------------------------------------
// Query servers: RecentActivity and AgentActivity (new tests)
// ---------------------------------------------------------------------------

func TestQueryRecentActivity_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.RecentActivity(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryRecentActivity_EmptyStore_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.RecentActivity(f.ctx, &types.QueryRecentActivityRequest{Limit: 10})
	require.NoError(t, err)
	require.Empty(t, resp.Activities)
}

func TestQueryAgentActivity_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.AgentActivity(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryAgentActivity_EmptyAddress_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.AgentActivity(f.ctx, &types.QueryAgentActivityRequest{Address: ""})
	require.Error(t, err)
}

func TestQueryAgentActivity_NoActivity_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	addr := validAddress()
	registerAgent(t, f, addr, "activity-agent", "pk_activity")

	resp, err := queryServer.AgentActivity(f.ctx, &types.QueryAgentActivityRequest{Address: addr})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

// ---------------------------------------------------------------------------
// Query: Negotiations
// ---------------------------------------------------------------------------

func TestQueryNegotiations_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Negotiations(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryNegotiations_Empty_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Negotiations(f.ctx, &types.QueryNegotiationsRequest{})
	require.NoError(t, err)
	require.Empty(t, resp.Negotiations)
}

// ---------------------------------------------------------------------------
// Query: Tasks
// ---------------------------------------------------------------------------

func TestQueryTask_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Task(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryTask_NotFound_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: 999})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

func TestQueryTasksByAssignee_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.TasksByAssignee(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryTasksByAssignee_Empty_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.TasksByAssignee(f.ctx, &types.QueryTasksByAssigneeRequest{Address: validAddress()})
	require.NoError(t, err)
	require.Empty(t, resp.Tasks)
}

func TestQueryTasksByDelegator_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.TasksByDelegator(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryTasksByDelegator_Empty_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.TasksByDelegator(f.ctx, &types.QueryTasksByDelegatorRequest{Address: validAddress()})
	require.NoError(t, err)
	require.Empty(t, resp.Tasks)
}

// ---------------------------------------------------------------------------
// Query: Intents
// ---------------------------------------------------------------------------

func TestQueryIntent_NilRequest_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Intent(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryIntent_NotFound_C3(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Intent(f.ctx, &types.QueryIntentRequest{IntentId: 999})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

// ===========================================================================
// NEW COVERAGE TESTS — mint_adapter, query_remote_agents, param_executor,
// query_agent_liveness
// ===========================================================================

// ---------------------------------------------------------------------------
// mint_adapter.go — MintKeeperAdapter via the mock mint keeper
// ---------------------------------------------------------------------------

func TestCoverage3_MintKeeperAdapter_GetMintDenom(t *testing.T) {
	fm := initFixtureWithMint(t)

	// The mock mint keeper is configured with denom "uclaw".
	denom, err := fm.mintKeeper.GetMintDenom(fm.ctx)
	require.NoError(t, err)
	require.Equal(t, "uclaw", denom)
}

func TestCoverage3_MintKeeperAdapter_GetAnnualProvisions(t *testing.T) {
	fm := initFixtureWithMint(t)

	ap, err := fm.mintKeeper.GetAnnualProvisions(fm.ctx)
	require.NoError(t, err)
	require.False(t, ap.IsZero(), "annual provisions should be non-zero in mock")
}

// ---------------------------------------------------------------------------
// query_remote_agents.go — gRPC query and direct keeper method
// ---------------------------------------------------------------------------

func TestCoverage3_QueryRemoteAgents_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.RemoteAgents(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
	require.Contains(t, err.Error(), "nil")
}

func TestCoverage3_QueryRemoteAgents_EmptyResults(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.RemoteAgents(f.ctx, &types.QueryRemoteAgentsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Empty(t, resp.Agents)
	// Handler should return empty slice, not nil.
	require.NotNil(t, resp.Agents)
}

func TestCoverage3_QueryRemoteAgents_Populated(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	qs := keeper.NewQueryServerImpl(f.keeper)

	// Populate remote agents collection directly.
	require.NoError(t, f.keeper.RemoteAgents.Set(sdkCtx, "osmosis-1:osmo1abc", `{"address":"osmo1abc","name":"remote-1"}`))
	require.NoError(t, f.keeper.RemoteAgents.Set(sdkCtx, "juno-1:juno1xyz", `{"address":"juno1xyz","name":"remote-2"}`))

	resp, err := qs.RemoteAgents(f.ctx, &types.QueryRemoteAgentsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Len(t, resp.Agents, 2)
}

func TestCoverage3_QueryRemoteAgents_DirectKeeper_Empty(t *testing.T) {
	f := initFixture(t)

	results, err := f.keeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, results)
	require.Empty(t, results)
}

func TestCoverage3_QueryRemoteAgents_DirectKeeper_Multiple(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	require.NoError(t, f.keeper.RemoteAgents.Set(sdkCtx, "chain-a:addr1", `{"name":"a1"}`))
	require.NoError(t, f.keeper.RemoteAgents.Set(sdkCtx, "chain-b:addr2", `{"name":"b2"}`))
	require.NoError(t, f.keeper.RemoteAgents.Set(sdkCtx, "chain-c:addr3", `{"name":"c3"}`))

	results, err := f.keeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Len(t, results, 3)
}

// ---------------------------------------------------------------------------
// param_executor.go — uncovered switch cases
// ---------------------------------------------------------------------------

func TestCoverage3_ParamExecutor_HighImpactMinDepositUclaw(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "high_impact_min_deposit_uclaw", "5000000")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(5000000), p.HighImpactMinDepositUclaw)
}

func TestCoverage3_ParamExecutor_HighImpactMinDepositUclaw_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "high_impact_min_deposit_uclaw", "not_a_number")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestCoverage3_ParamExecutor_StandardTaskMinBudgetUclaw(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "standard_task_min_budget_uclaw", "3000")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(3000), p.StandardTaskMinBudgetUclaw)
}

func TestCoverage3_ParamExecutor_StandardTaskMinBudgetUclaw_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "standard_task_min_budget_uclaw", "bad")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestCoverage3_ParamExecutor_ExpeditedTaskMinBudgetUclaw(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "expedited_task_min_budget_uclaw", "7000")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(7000), p.ExpeditedTaskMinBudgetUclaw)
}

func TestCoverage3_ParamExecutor_ExpeditedTaskMinBudgetUclaw_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "expedited_task_min_budget_uclaw", "xyz")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestCoverage3_ParamExecutor_ExpeditedTaskMaxDeadlineBlocks(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "expedited_task_max_deadline_blocks", "500")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(500), p.ExpeditedTaskMaxDeadlineBlocks)
}

func TestCoverage3_ParamExecutor_ExpeditedTaskMaxDeadlineBlocks_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "expedited_task_max_deadline_blocks", "nope")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestCoverage3_ParamExecutor_MinReputationForRewardBps(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "min_reputation_for_reward_bps", "7500")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(7500), p.MinReputationForRewardBps)
}

func TestCoverage3_ParamExecutor_MinReputationForRewardBps_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "min_reputation_for_reward_bps", "invalid")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestCoverage3_ParamExecutor_MaxIntentsPerBlock(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "max_intents_per_block", "50")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(50), p.MaxIntentsPerBlock)
}

func TestCoverage3_ParamExecutor_MaxIntentsPerBlock_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "max_intents_per_block", "oops")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestCoverage3_ParamExecutor_MaxTasksPerBlock(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "max_tasks_per_block", "60")
	require.NoError(t, err)

	p, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(60), p.MaxTasksPerBlock)
}

func TestCoverage3_ParamExecutor_MaxTasksPerBlock_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "max_tasks_per_block", "bad_value")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

// ---------------------------------------------------------------------------
// query_agent_liveness.go — edge cases
// ---------------------------------------------------------------------------

func TestCoverage3_QueryAgentLiveness_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.AgentLiveness(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestCoverage3_QueryAgentLiveness_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.AgentLiveness(f.ctx, &types.QueryAgentLivenessRequest{
		Address: "cosmos1nonexistent",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.False(t, resp.Found)
}

func TestCoverage3_QueryAgentLiveness_Found(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	qs := keeper.NewQueryServerImpl(f.keeper)

	addr := validAddress()
	liveness := types.AgentLiveness{
		AgentAddress:        addr,
		LastHeartbeatHeight: 42,
		LastHeartbeatTime:   1000,
		ReportedNodeHeight:  40,
		Endpoint:            "https://agent.example.com",
		Metadata:            `{"version":"1.0"}`,
		HeartbeatCount:      7,
	}
	require.NoError(t, f.keeper.AgentLiveness.Set(sdkCtx, addr, liveness))

	resp, err := qs.AgentLiveness(f.ctx, &types.QueryAgentLivenessRequest{Address: addr})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.True(t, resp.Found)
	require.Equal(t, int64(42), resp.Liveness.LastHeartbeatHeight)
	require.Equal(t, uint64(7), resp.Liveness.HeartbeatCount)
	require.Equal(t, "https://agent.example.com", resp.Liveness.Endpoint)
	require.Equal(t, `{"version":"1.0"}`, resp.Liveness.Metadata)
}

func TestCoverage3_QueryAgentLiveness_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	// Empty address should return not-found rather than panic.
	resp, err := qs.AgentLiveness(f.ctx, &types.QueryAgentLivenessRequest{Address: ""})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.False(t, resp.Found)
}
