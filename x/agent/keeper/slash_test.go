//go:build integration
// +build integration

package keeper_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	sdkmath "cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// advanceBlockHeight returns a new context at the given block height,
// suitable for simulating time progression in EndBlocker tests.
func advanceBlockHeight(f *fixture, height int64) sdk.Context {
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	return sdkCtx.WithBlockHeight(height)
}

// ---------------------------------------------------------------------------
// Test: accepted task expires -> assignee deposit is slashed
// ---------------------------------------------------------------------------

func TestSlash_AcceptedTaskExpires_AssigneeDepositSlashed(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assigneeAddr := sdk.AccAddress([]byte("assignee____________"))
	assignee := assigneeAddr.String()

	// Fund both accounts: delegator for escrow + deposit, assignee for deposit.
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	f.bankKeeper.fundAccount(assigneeAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	// Step 1: Register both agents (each locks 1_000_000 uclaw deposit).
	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "DelegatorAgent",
		Pubkey:  "pk_delegator",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "AssigneeAgent",
		Pubkey:  "pk_assignee",
	})
	require.NoError(t, err)

	// Verify assignee deposit is recorded.
	agentBefore, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)
	require.Equal(t, fmt.Sprintf("%d", depositAmount), agentBefore.DepositAmount)

	// Step 2: Delegate a task with budget and a short deadline.
	taskBudget := "5000"
	deadlineBlocks := int64(10)
	resp, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Process inference batch",
		Budget:         taskBudget,
		DeadlineBlocks: deadlineBlocks,
	})
	require.NoError(t, err)
	taskID := resp.TaskId

	// Verify task is pending with escrowed budget.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "pending", task.Status)

	// Step 3: Assignee accepts the task.
	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	task, err = f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "accepted", task.Status)

	// Step 4: Simulate time passing beyond the deadline without completing the task.
	// Task was created at block 0, deadline = 10 blocks, so at block 11 it expires.
	futureCtx := advanceBlockHeight(f, task.CreatedAt+deadlineBlocks+1)

	// Record burned coins before EndBlock.
	burnedBefore := f.bankKeeper.BurnedCoins.AmountOf("uclaw")

	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Step 5: Verify the task is now expired.
	task, err = f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "expired", task.Status)

	// Step 6: Verify the assignee's deposit was slashed.
	// Default DepositSlashPerPenaltyBps = 100 (1%).
	// 1% of 1_000_000 = 10_000 slashed.
	agentAfter, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)

	expectedDeposit := depositAmount - (depositAmount * types.DefaultDepositSlashPerPenaltyBps / 10000)
	require.Equal(t, fmt.Sprintf("%d", expectedDeposit), agentAfter.DepositAmount,
		"assignee deposit should be reduced by slash penalty")

	// Step 7: Verify coins were burned from the module account.
	expectedBurned := int64(depositAmount) * int64(types.DefaultDepositSlashPerPenaltyBps) / 10000
	burnedAfter := f.bankKeeper.BurnedCoins.AmountOf("uclaw")
	require.Equal(t, expectedBurned, burnedAfter.Sub(burnedBefore).Int64(),
		"slashed deposit should be burned")

	// Step 8: Verify delegator was refunded the escrowed budget.
	delegatorBal := f.bankKeeper.SpendableCoins(f.ctx, delegatorAddr)
	budgetAmt, _ := sdkmath.NewIntFromString(taskBudget)
	require.True(t, delegatorBal.AmountOf("uclaw").GTE(budgetAmt),
		"delegator should have been refunded the escrowed task budget")
}

// ---------------------------------------------------------------------------
// Test: pending task expires -> assignee deposit is NOT slashed
// ---------------------------------------------------------------------------

func TestSlash_PendingTaskExpires_NoSlash(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assigneeAddr := sdk.AccAddress([]byte("assignee____________"))
	assignee := assigneeAddr.String()

	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	f.bankKeeper.fundAccount(assigneeAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "DelegatorPending",
		Pubkey:  "pk_dp",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "AssigneePending",
		Pubkey:  "pk_ap",
	})
	require.NoError(t, err)

	// Delegate task but do NOT accept it.
	resp, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Pending task",
		Budget:         "1000",
		DeadlineBlocks: 5,
	})
	require.NoError(t, err)

	task, err := f.keeper.Tasks.Get(f.ctx, resp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "pending", task.Status)

	// Record deposit before expiry.
	agentBefore, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)
	depositBefore := agentBefore.DepositAmount

	// Advance past deadline.
	futureCtx := advanceBlockHeight(f, task.CreatedAt+6)
	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Task should be expired.
	task, err = f.keeper.Tasks.Get(f.ctx, resp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "expired", task.Status)

	// Assignee deposit should NOT be slashed (they never accepted).
	agentAfter, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)
	require.Equal(t, depositBefore, agentAfter.DepositAmount,
		"deposit should not be slashed for a pending (never-accepted) task")
}

// ---------------------------------------------------------------------------
// Test: explicit SlashAgentDeposit reduces deposit and burns coins
// ---------------------------------------------------------------------------

func TestSlash_ExplicitSlashReducesDeposit(t *testing.T) {
	depositAmount := uint64(2_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	agentAccAddr := sdk.AccAddress([]byte("slashable___________"))
	addr := agentAccAddr.String()

	f.bankKeeper.fundAccount(agentAccAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(depositAmount))))

	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: addr,
		Name:    "SlashableAgent",
		Pubkey:  "pk_slash",
	})
	require.NoError(t, err)

	// Verify initial deposit.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, fmt.Sprintf("%d", depositAmount), agent.DepositAmount)

	// Slash 500 bps (5%) = 100_000 from 2_000_000.
	err = f.keeper.SlashAgentDeposit(f.ctx, addr, 500)
	require.NoError(t, err)

	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "1900000", agent.DepositAmount)

	// Verify burned amount.
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").Equal(sdkmath.NewInt(100_000)))

	// Slash again: 500 bps of 1_900_000 = 95_000. Remaining = 1_805_000.
	err = f.keeper.SlashAgentDeposit(f.ctx, addr, 500)
	require.NoError(t, err)

	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "1805000", agent.DepositAmount)

	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").Equal(sdkmath.NewInt(195_000)))
}

// ---------------------------------------------------------------------------
// Test: full slash lifecycle (register -> accept task -> expire -> slash ->
// deregister with reduced refund)
// ---------------------------------------------------------------------------

func TestSlash_FullLifecycle_RegisterAcceptExpireSlashDeregister(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assigneeAddr := sdk.AccAddress([]byte("assignee____________"))
	assignee := assigneeAddr.String()

	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	f.bankKeeper.fundAccount(assigneeAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	// Step 1: Register both agents.
	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "Delegator",
		Pubkey:  "pk_d",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "Assignee",
		Pubkey:  "pk_a",
	})
	require.NoError(t, err)

	// Step 2: Delegate + accept task.
	resp, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Lifecycle test task",
		Budget:         "5000",
		DeadlineBlocks: 10,
	})
	require.NoError(t, err)
	taskID := resp.TaskId

	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	// Step 3: Let the task expire.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	futureCtx := advanceBlockHeight(f, task.CreatedAt+11)

	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Verify task expired and deposit was slashed.
	task, err = f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "expired", task.Status)

	agent, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)
	// 1% of 1_000_000 = 10_000 slashed -> 990_000 remaining
	require.Equal(t, "990000", agent.DepositAmount)

	// Step 4: Deregister the assignee -- should refund the reduced deposit.
	// The task is expired now, so no active tasks block deregistration.
	assigneeBalBefore := f.bankKeeper.SpendableCoins(f.ctx, assigneeAddr).AmountOf("uclaw")

	_, err = ms.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: assignee,
	})
	require.NoError(t, err)

	// Assignee should get back the slashed-reduced deposit (990_000).
	assigneeBalAfter := f.bankKeeper.SpendableCoins(f.ctx, assigneeAddr).AmountOf("uclaw")
	refundedAmount := assigneeBalAfter.Sub(assigneeBalBefore)
	require.Equal(t, sdkmath.NewInt(990_000), refundedAmount,
		"deregistration should refund the deposit minus the slashed amount")
}

// ---------------------------------------------------------------------------
// Test: multiple task failures compound the slash
// ---------------------------------------------------------------------------

func TestSlash_MultipleTasks_CompoundSlash(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assigneeAddr := sdk.AccAddress([]byte("assignee____________"))
	assignee := assigneeAddr.String()

	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000)))
	f.bankKeeper.fundAccount(assigneeAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "MultiDelegator",
		Pubkey:  "pk_md",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "MultiAssignee",
		Pubkey:  "pk_ma",
	})
	require.NoError(t, err)

	// Create and accept two tasks with different deadlines.
	resp1, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Task 1",
		Budget:         "1000",
		DeadlineBlocks: 10,
	})
	require.NoError(t, err)

	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp1.TaskId,
	})
	require.NoError(t, err)

	resp2, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Task 2",
		Budget:         "1000",
		DeadlineBlocks: 10,
	})
	require.NoError(t, err)

	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp2.TaskId,
	})
	require.NoError(t, err)

	// Let both tasks expire.
	futureCtx := advanceBlockHeight(f, 11)
	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Both tasks should be expired.
	task1, err := f.keeper.Tasks.Get(f.ctx, resp1.TaskId)
	require.NoError(t, err)
	require.Equal(t, "expired", task1.Status)

	task2, err := f.keeper.Tasks.Get(f.ctx, resp2.TaskId)
	require.NoError(t, err)
	require.Equal(t, "expired", task2.Status)

	// The deposit should have been slashed twice.
	// First slash: 1% of 1_000_000 = 10_000 -> remaining 990_000
	// Second slash: 1% of 990_000 = 9_900 -> remaining 980_100
	agent, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)
	require.Equal(t, "980100", agent.DepositAmount,
		"two expired accepted tasks should compound the slash")

	// Total burned: 10_000 + 9_900 = 19_900
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").Equal(sdkmath.NewInt(19_900)))
}

// ---------------------------------------------------------------------------
// Test: completed task on time -> no slash
// ---------------------------------------------------------------------------

func TestSlash_CompletedOnTime_NoSlash(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assigneeAddr := sdk.AccAddress([]byte("assignee____________"))
	assignee := assigneeAddr.String()

	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	f.bankKeeper.fundAccount(assigneeAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "GoodDelegator",
		Pubkey:  "pk_gd",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "GoodAssignee",
		Pubkey:  "pk_ga",
	})
	require.NoError(t, err)

	resp, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "On-time task",
		Budget:         "5000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
	})
	require.NoError(t, err)

	// Complete the task before the deadline.
	_, err = ms.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
		Result:  "Done successfully",
	})
	require.NoError(t, err)

	// Run EndBlock well past the deadline.
	futureCtx := advanceBlockHeight(f, 200)
	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Verify task is completed, NOT expired.
	task, err := f.keeper.Tasks.Get(f.ctx, resp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)

	// Verify deposit is untouched.
	agent, err := f.keeper.Agents.Get(f.ctx, assignee)
	require.NoError(t, err)
	require.Equal(t, fmt.Sprintf("%d", depositAmount), agent.DepositAmount,
		"deposit should not be slashed when task is completed on time")
}

// ---------------------------------------------------------------------------
// Test: slashing agent with zero deposit is a no-op
// ---------------------------------------------------------------------------

func TestSlash_ZeroDeposit_NoOp(t *testing.T) {
	f := initFixture(t) // zero deposit

	addr := validAddress()
	registerAgent(t, f, addr, "ZeroDepositAgent", "pk_zd")

	// Set deposit to 0 explicitly.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	agent.DepositAmount = "0"
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr, agent))

	// Slash should succeed without panicking.
	err = f.keeper.SlashAgentDeposit(f.ctx, addr, 100)
	require.NoError(t, err)

	// Deposit is still 0.
	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "0", agent.DepositAmount)
}

// ---------------------------------------------------------------------------
// Test: slashing non-existent agent is a no-op
// ---------------------------------------------------------------------------

func TestSlash_NonExistentAgent_NoOp(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.SlashAgentDeposit(f.ctx, "cosmos1nonexistent_addr_", 500)
	require.NoError(t, err, "slashing a non-existent agent should be a no-op")
}

// ---------------------------------------------------------------------------
// Test: stale heartbeat deactivation (EndBlocker) -- agent goes offline
// ---------------------------------------------------------------------------

func TestSlash_StaleHeartbeat_AgentDeactivated(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	ms := keeper.NewMsgServerImpl(f.keeper)

	agentAccAddr := sdk.AccAddress([]byte("stale_______________"))
	addr := agentAccAddr.String()

	f.bankKeeper.fundAccount(agentAccAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(depositAmount))))

	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: addr,
		Name:    "StaleAgent",
		Pubkey:  "pk_stale",
	})
	require.NoError(t, err)

	// Send a heartbeat at block 10.
	_, err = ms.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 10,
		Endpoint:   "https://stale.example.com",
	})
	require.NoError(t, err)

	// Agent should be active.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.True(t, agent.Active)

	// Advance far past the max heartbeat gap (default 200 blocks).
	// At height 211: cutoff = 211 - 200 = 11 > heartbeat at 10 -> stale.
	futureCtx := advanceBlockHeight(f, 211)
	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Agent should be deactivated.
	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.False(t, agent.Active,
		"agent should be deactivated after missing heartbeats")

	// Note: deposit is NOT slashed by the heartbeat deactivation alone --
	// slashing is applied through task expiration or explicit calls.
	require.Equal(t, fmt.Sprintf("%d", depositAmount), agent.DepositAmount,
		"heartbeat deactivation alone should not slash deposit")
}
