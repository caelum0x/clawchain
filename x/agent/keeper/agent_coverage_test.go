//go:build integration
// +build integration

package keeper_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// coverageQueryServer provides access to the full types.QueryServer methods
// (Agent, AgentStats, Task, etc.) without conflicting with the
// extendedQueryServer defined in agent_integration_test.go.
// ---------------------------------------------------------------------------

type coverageQueryServer interface {
	types.QueryServer
}

func newCoverageQueryServer(t *testing.T, f *fixture) coverageQueryServer {
	t.Helper()
	srv := keeper.NewQueryServerImpl(f.keeper)
	return srv
}

// ---------------------------------------------------------------------------
// RegisterAgent tests
// ---------------------------------------------------------------------------

func TestRegisterAgent_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	resp, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:        addr,
		Pubkey:         "ed25519pubkey001",
		Endpoint:       "https://agent1.example.com",
		Name:           "CoverageAgent",
		SupportedTools: []string{"tool_a", "tool_b"},
		PricingHint:    "0.01uclaw/query",
		Version:        "1.0.0",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify agent stored correctly.
	agentInfo, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, addr, agentInfo.Address)
	require.Equal(t, "ed25519pubkey001", agentInfo.Pubkey)
	require.Equal(t, "https://agent1.example.com", agentInfo.Endpoint)
	require.Equal(t, "CoverageAgent", agentInfo.Name)
	require.True(t, agentInfo.Active)
	require.Equal(t, "0.01uclaw/query", agentInfo.PricingHint)
	require.Equal(t, "1.0.0", agentInfo.Version)
	// SupportedTools are sorted and deduplicated.
	require.Equal(t, []string{"tool_a", "tool_b"}, agentInfo.SupportedTools)
}

func TestRegisterAgent_DuplicateRejected(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	msg := &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk_dup",
		Endpoint: "https://dup.example.com",
		Name:     "DupAgent",
	}

	_, err := msgServer.RegisterAgent(f.ctx, msg)
	require.NoError(t, err)

	// Second registration with the same address must fail.
	_, err = msgServer.RegisterAgent(f.ctx, msg)
	require.Error(t, err)
	require.ErrorContains(t, err, "agent already registered")
}

func TestRegisterAgent_EmptyName(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  validAddress(),
		Pubkey:   "pk_noname",
		Endpoint: "https://noname.example.com",
		Name:     "",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid agent name")
}

func TestRegisterAgent_EmptyPubkey(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  validAddress(),
		Pubkey:   "",
		Endpoint: "https://nopubkey.example.com",
		Name:     "NoPubkeyAgent",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid pubkey")
}

func TestRegisterAgent_WithDeposit(t *testing.T) {
	depositUclaw := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositUclaw)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, err := sdk.AccAddressFromBech32(addr)
	require.NoError(t, err)

	// Fund the account with enough to cover the deposit.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 5_000_000)))

	_, err = msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk_deposit",
		Endpoint: "https://deposit.example.com",
		Name:     "DepositAgent",
	})
	require.NoError(t, err)

	// Verify deposit was deducted from account.
	remainingBal := f.bankKeeper.accountBalances[addr]
	expectedRemaining := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 4_000_000))
	require.True(t, remainingBal.Equal(expectedRemaining),
		"expected %s remaining, got %s", expectedRemaining, remainingBal)

	// Verify module account received the deposit.
	moduleBal := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, moduleBal.AmountOf("uclaw").Int64() >= int64(depositUclaw))
}

func TestRegisterAgent_InsufficientDeposit(t *testing.T) {
	f := initFixtureWithDeposit(t, 1_000_000)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	// Do NOT fund the account -- insufficient balance.

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk_broke",
		Endpoint: "https://broke.example.com",
		Name:     "BrokeAgent",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "insufficient deposit")
}

// ---------------------------------------------------------------------------
// AgentHeartbeat tests
// ---------------------------------------------------------------------------

func TestAgentHeartbeat_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "HeartbeatAgent", "pk_hb")

	resp, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 42,
		Endpoint:   "https://hb.example.com",
		Metadata:   `{"version":"1.0"}`,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify liveness record was created/updated.
	liveness, err := f.keeper.AgentLiveness.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, int64(42), liveness.ReportedNodeHeight)
	require.Equal(t, uint64(1), liveness.HeartbeatCount)
	require.Equal(t, "https://hb.example.com", liveness.Endpoint)
}

func TestAgentHeartbeat_UnregisteredAgent(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	// Send heartbeat without registering first.
	_, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    validAddress(),
		NodeHeight: 10,
		Endpoint:   "https://ghost.example.com",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

func TestAgentHeartbeat_ReactivatesAgent(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "InactiveAgent", "pk_inactive")

	// Manually deactivate the agent.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	agent.Active = false
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr, agent))

	// Verify it is inactive.
	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.False(t, agent.Active)

	// Send heartbeat -- should reactivate.
	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 50,
		Endpoint:   "https://reactivated.example.com",
	})
	require.NoError(t, err)

	// Verify the agent is active again.
	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.True(t, agent.Active)
}

// ---------------------------------------------------------------------------
// DelegateTask tests
// ---------------------------------------------------------------------------

func TestDelegateTask_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn")

	// Fund delegator with enough for escrow.
	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Run inference model X",
		Requirements:   `{"gpu":"A100"}`,
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify task was stored with pending status.
	task, err := f.keeper.Tasks.Get(f.ctx, resp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "pending", task.Status)
	require.Equal(t, delegator, task.DelegatorAddress)
	require.Equal(t, assignee, task.AssigneeAddress)
	require.Equal(t, "Run inference model X", task.Description)
	require.Equal(t, "1000000", task.Budget)

	// Verify escrow: module account should have received budget funds.
	moduleBal := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, moduleBal.AmountOf("uclaw").Int64() >= 1_000_000,
		"expected module to hold escrowed budget")
}

func TestDelegateTask_SelfDelegation(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "SelfDel", "pk_sd")

	_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        addr,
		Assignee:       addr, // same as creator
		Description:    "Self task",
		Budget:         "1000000",
		DeadlineBlocks: 100,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "cannot delegate task to yourself")
}

func TestDelegateTask_UnregisteredDelegator(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	assignee := validAddress2()
	registerAgent(t, f, assignee, "Assignee", "pk_asgn2")

	// Creator (validAddress()) is NOT registered.
	_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        validAddress(),
		Assignee:       assignee,
		Description:    "Task from unregistered",
		Budget:         "1000000",
		DeadlineBlocks: 100,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

// ---------------------------------------------------------------------------
// AcceptTask tests
// ---------------------------------------------------------------------------

func TestAcceptTask_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del3")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn3")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Accept me",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Assignee accepts the task.
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
	})
	require.NoError(t, err)

	// Verify status changed to accepted.
	task, err := f.keeper.Tasks.Get(f.ctx, resp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "accepted", task.Status)
}

func TestAcceptTask_WrongAssignee(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	wrongAgent := validAddress3()
	registerAgent(t, f, delegator, "Delegator", "pk_del4")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn4")
	registerAgent(t, f, wrongAgent, "WrongAgent", "pk_wrong")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Wrong accepter",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Wrong agent tries to accept.
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: wrongAgent,
		TaskId:  resp.TaskId,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "only")
}

func TestAcceptTask_NotPending(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del5")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn5")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Double accept",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Accept once.
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
	})
	require.NoError(t, err)

	// Accept again -- should fail because it is no longer pending.
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not in pending status")
}

// ---------------------------------------------------------------------------
// CompleteTask tests
// ---------------------------------------------------------------------------

func TestCompleteTask_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del6")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn6")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// Delegate task.
	delResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Complete me",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Accept task.
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  delResp.TaskId,
	})
	require.NoError(t, err)

	// Record assignee balance before completion.
	assigneeAddr, _ := sdk.AccAddressFromBech32(assignee)
	balBefore := f.bankKeeper.accountBalances[assigneeAddr.String()]

	// Complete task.
	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  delResp.TaskId,
		Result:  `{"inference":"42"}`,
	})
	require.NoError(t, err)

	// Verify task status is completed.
	task, err := f.keeper.Tasks.Get(f.ctx, delResp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)
	require.Equal(t, `{"inference":"42"}`, task.Result)

	// Verify budget was released to assignee.
	balAfter := f.bankKeeper.accountBalances[assigneeAddr.String()]
	diff := balAfter.AmountOf("uclaw").Sub(balBefore.AmountOf("uclaw"))
	require.Equal(t, int64(1_000_000), diff.Int64(),
		"expected 1M uclaw released to assignee, got %s", diff)
}

func TestCompleteTask_NotAccepted(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del7")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn7")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// Delegate task but do NOT accept.
	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Skip accept",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Try to complete while still pending.
	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
		Result:  "too early",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not in accepted status")
}

// ---------------------------------------------------------------------------
// DeregisterAgent tests
// ---------------------------------------------------------------------------

func TestDeregisterAgent_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "ByeAgent", "pk_bye")

	_, err := msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: addr,
	})
	require.NoError(t, err)

	// Verify agent is removed.
	_, err = f.keeper.Agents.Get(f.ctx, addr)
	require.Error(t, err, "agent should be removed after deregistration")
}

func TestDeregisterAgent_WithActiveTasks(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del8")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn8")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// Create a pending task assigned to the assignee.
	_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Active task",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Try to deregister the assignee who has a pending task.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: assignee,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "active tasks")

	// Also try to deregister the delegator who has an active task.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: delegator,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "active tasks")
}

func TestDeregisterAgent_DepositRefunded(t *testing.T) {
	depositUclaw := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositUclaw)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, err := sdk.AccAddressFromBech32(addr)
	require.NoError(t, err)

	// Fund account with enough for deposit.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 5_000_000)))

	// Register with deposit.
	_, err = msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk_refund",
		Endpoint: "https://refund.example.com",
		Name:     "RefundAgent",
	})
	require.NoError(t, err)

	// After registration: 5M - 1M = 4M in account, 1M in module.
	balAfterReg := f.bankKeeper.accountBalances[addr]
	require.Equal(t, int64(4_000_000), balAfterReg.AmountOf("uclaw").Int64())

	// Deregister should refund the deposit.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: addr,
	})
	require.NoError(t, err)

	// After deregistration: should have 5M again (4M + 1M refund).
	balAfterDereg := f.bankKeeper.accountBalances[addr]
	require.Equal(t, int64(5_000_000), balAfterDereg.AmountOf("uclaw").Int64())
}

// ---------------------------------------------------------------------------
// SubmitIntent tests
// ---------------------------------------------------------------------------

func TestSubmitIntent_Success_Coverage(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "IntentAgent", "pk_intent")

	resp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      addr,
		IntentType:   "data_share",
		Description:  "Share ML dataset",
		Payload:      `{"dataset":"imagenet-subset"}`,
		MinResponses: 2,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify stored intent.
	intent, err := f.keeper.Intents.Get(f.ctx, resp.IntentId)
	require.NoError(t, err)
	require.Equal(t, addr, intent.CreatorAddress)
	require.Equal(t, "data_share", intent.IntentType)
	require.Equal(t, "pending", intent.Status)
	require.Equal(t, "Share ML dataset", intent.Description)
}

func TestSubmitIntent_InvalidType_Coverage(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "IntentAgent2", "pk_intent2")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "invalid_type_xyz",
		Description: "should fail",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "unsupported intent type")
}

// ---------------------------------------------------------------------------
// QueryAgent tests
// ---------------------------------------------------------------------------

func TestQueryAgent_Found_Coverage(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "QueryableAgent", "pk_qa")

	resp, err := qSrv.Agent(f.ctx, &types.QueryAgentRequest{Address: addr})
	require.NoError(t, err)
	require.True(t, resp.Registered)
	require.Equal(t, "QueryableAgent", resp.Name)
	require.Equal(t, "pk_qa", resp.Pubkey)
	require.Equal(t, "https://agent.example.com", resp.Endpoint)
}

func TestQueryAgent_NotFound_Coverage(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	resp, err := qSrv.Agent(f.ctx, &types.QueryAgentRequest{Address: validAddress()})
	require.NoError(t, err)
	require.False(t, resp.Registered)
}

// ---------------------------------------------------------------------------
// QueryTask tests
// ---------------------------------------------------------------------------

func TestQueryTask_Found_Coverage(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	qSrv := newCoverageQueryServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del_q")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn_q")

	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	delResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Query this task",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	taskResp, err := qSrv.Task(f.ctx, &types.QueryTaskRequest{TaskId: delResp.TaskId})
	require.NoError(t, err)
	require.True(t, taskResp.Found)
	require.Equal(t, delegator, taskResp.DelegatorAddress)
	require.Equal(t, assignee, taskResp.AssigneeAddress)
	require.Equal(t, "Query this task", taskResp.Description)
	require.Equal(t, "pending", taskResp.Status)
	require.Equal(t, "1000000", taskResp.Budget)
}

func TestQueryTask_NotFound_Coverage(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	resp, err := qSrv.Task(f.ctx, &types.QueryTaskRequest{TaskId: 999})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

// ---------------------------------------------------------------------------
// QueryAgentStats tests
// ---------------------------------------------------------------------------

func TestQueryAgentStats_Success_Coverage(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	qSrv := newCoverageQueryServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "StatsAgent", "pk_stats")
	registerAgent(t, f, assignee, "Assignee", "pk_asgn_stats")

	// Send heartbeat to populate liveness.
	_, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    delegator,
		NodeHeight: 100,
		Endpoint:   "https://stats.example.com",
	})
	require.NoError(t, err)

	// Delegate a task to populate stats.
	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	_, err = msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Stats task",
		Budget:         "1000000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Query stats for the delegator.
	statsResp, err := qSrv.AgentStats(f.ctx, &types.QueryAgentStatsRequest{
		Address: delegator,
	})
	require.NoError(t, err)
	require.Equal(t, delegator, statsResp.Stats.AgentAddress)
}

// ---------------------------------------------------------------------------
// Unused variable sink (keeps compiler happy for the context import).
// ---------------------------------------------------------------------------
var _ context.Context
