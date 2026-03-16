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

// ===========================================================================
// CheckpointTask tests
// ===========================================================================

// createAcceptedTask is a helper that registers delegator + assignee, delegates
// a task, accepts it, and returns the task ID.
func createAcceptedTask(t *testing.T, f *fixture) (taskID uint64) {
	t.Helper()
	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del")
	registerAgent(t, f, assignee, "Assignee", "pk_asg")

	msgServer := newMsgServer(t, f)

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "test task for checkpoint",
		Requirements:   "none",
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
	})
	require.NoError(t, err)

	return resp.TaskId
}

func TestCheckpointTask_Success(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	resp, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  `{"step":1,"output":"partial result"}`,
		PercentComplete: 50,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify checkpoint was stored.
	stored, err := f.keeper.TaskCheckpoints.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Contains(t, stored, `"percent_complete":50`)
	require.Contains(t, stored, `"step":1`)
}

func TestCheckpointTask_InvalidCreatorAddress(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         "not-a-valid-address",
		TaskId:          1,
		CheckpointData:  `{"data":"test"}`,
		PercentComplete: 10,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidAddress.Is(err))
}

func TestCheckpointTask_TaskNotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         validAddress(),
		TaskId:          99999,
		CheckpointData:  `{"data":"test"}`,
		PercentComplete: 10,
	})
	require.Error(t, err)
	require.True(t, types.ErrTaskNotFound.Is(err))
}

func TestCheckpointTask_WrongAssignee(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	delegator := validAddress() // not the assignee

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         delegator,
		TaskId:          taskID,
		CheckpointData:  `{"data":"test"}`,
		PercentComplete: 10,
	})
	require.Error(t, err)
	require.True(t, types.ErrNotAssignee.Is(err))
}

func TestCheckpointTask_TaskNotAccepted(t *testing.T) {
	f := initFixture(t)
	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del")
	registerAgent(t, f, assignee, "Assignee", "pk_asg")

	msgServer := newMsgServer(t, f)
	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "pending task",
		Requirements:   "none",
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	// Task is "pending", not "accepted" — checkpoint should fail.
	_, err = f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          resp.TaskId,
		CheckpointData:  `{"data":"test"}`,
		PercentComplete: 10,
	})
	require.Error(t, err)
	require.True(t, types.ErrTaskNotAccepted.Is(err))
}

func TestCheckpointTask_EmptyData(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  "",
		PercentComplete: 10,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidCheckpoint.Is(err))
}

func TestCheckpointTask_InvalidJSON(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  "not valid json {{{",
		PercentComplete: 10,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidCheckpoint.Is(err))
}

func TestCheckpointTask_PercentOver100(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  `{"data":"test"}`,
		PercentComplete: 101,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidCheckpoint.Is(err))
}

func TestCheckpointTask_ZeroPercent(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	// 0% is valid — just started.
	resp, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  `{"status":"initializing"}`,
		PercentComplete: 0,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestCheckpointTask_100Percent(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	// 100% is valid — almost complete.
	resp, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  `{"status":"final"}`,
		PercentComplete: 100,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestCheckpointTask_UpdatesAgentStats(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  `{"step":3}`,
		PercentComplete: 75,
	})
	require.NoError(t, err)

	// Verify agent stats were written (block height may be 0 in test context).
	stats, err := f.keeper.AgentStats.Get(f.ctx, assignee)
	require.NoError(t, err)
	require.Equal(t, assignee, stats.AgentAddress)
}

func TestCheckpointTask_RecordsAction(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	_, err := f.keeper.CheckpointTask(f.ctx, &keeper.MsgCheckpointTask{
		Creator:         assignee,
		TaskId:          taskID,
		CheckpointData:  `{"step":1}`,
		PercentComplete: 25,
	})
	require.NoError(t, err)

	// Verify an AgentAction record was stored.
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	resp, err := queryServer.AgentActivity(f.ctx, &types.QueryAgentActivityRequest{Address: assignee})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

// ===========================================================================
// Migrations tests
// ===========================================================================

func TestMigrations_Migrate1to2(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	m := keeper.NewMigrator(f.keeper)
	err := m.Migrate1to2(sdkCtx)
	require.NoError(t, err)
}

func TestMigrations_Migrate2to3(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	m := keeper.NewMigrator(f.keeper)
	err := m.Migrate2to3(sdkCtx)
	require.NoError(t, err)
}

func TestMigrations_Migrate3to4(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	m := keeper.NewMigrator(f.keeper)
	err := m.Migrate3to4(sdkCtx)
	require.NoError(t, err)
}

func TestMigrations_NewMigrator(t *testing.T) {
	f := initFixture(t)
	m := keeper.NewMigrator(f.keeper)
	// Verify migrator was created successfully by calling a migration.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	require.NoError(t, m.Migrate1to2(sdkCtx))
}

// ===========================================================================
// Query: AgentStats coverage
// ===========================================================================

func TestQueryAgentStats_NilRequest_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.AgentStats(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryAgentStats_EmptyAddress_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.AgentStats(f.ctx, &types.QueryAgentStatsRequest{Address: ""})
	require.Error(t, err)
}

func TestQueryAgentStats_NoExistingStats_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	// Query for an address with no stats — should return zeroed stats.
	resp, err := qs.AgentStats(f.ctx, &types.QueryAgentStatsRequest{Address: validAddress()})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, int64(0), resp.Stats.LastActiveHeight)
}

func TestQueryAgentStats_WithStats_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	addr := validAddress()

	// Set stats directly using the correct type.
	require.NoError(t, f.keeper.AgentStats.Set(f.ctx, addr, types.AgentStats{
		AgentAddress:     addr,
		IntentsSubmitted: 10,
		IntentsResponded: 5,
		LastActiveHeight: 42,
		LastActiveTime:   1000,
	}))

	resp, err := qs.AgentStats(f.ctx, &types.QueryAgentStatsRequest{Address: addr})
	require.NoError(t, err)
	require.Equal(t, uint64(10), resp.Stats.IntentsSubmitted)
	require.Equal(t, uint64(5), resp.Stats.IntentsResponded)
	require.Equal(t, int64(42), resp.Stats.LastActiveHeight)
}

// ===========================================================================
// Query: AgentRewards coverage
// ===========================================================================

func TestQueryAgentRewards_NilRequest_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.AgentRewards(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryAgentRewards_NotFound_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.AgentRewards(f.ctx, &types.QueryAgentRewardsRequest{Address: validAddress()})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

// ===========================================================================
// Query: LiveAgents coverage
// ===========================================================================

func TestQueryLiveAgents_NilRequest_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.LiveAgents(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryLiveAgents_Empty_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.LiveAgents(f.ctx, &types.QueryLiveAgentsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Empty(t, resp.Agents)
}

func TestQueryLiveAgents_WithRegistered_C4(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	addr := validAddress()
	registerAgent(t, f, addr, "Live1", "pk_live1")

	// Set liveness data.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	require.NoError(t, f.keeper.AgentLiveness.Set(sdkCtx, addr, types.AgentLiveness{
		AgentAddress:        addr,
		LastHeartbeatHeight: 10,
		HeartbeatCount:      3,
	}))

	resp, err := qs.LiveAgents(f.ctx, &types.QueryLiveAgentsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

// ===========================================================================
// AcceptTask error paths (67.7% → higher)
// ===========================================================================

func TestAcceptTask_InvalidAddress_C4(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: "invalid-address",
		TaskId:  1,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidAddress.Is(err))
}

func TestAcceptTask_TaskNotFound_C4(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: validAddress(),
		TaskId:  99999,
	})
	require.Error(t, err)
	require.True(t, types.ErrTaskNotFound.Is(err))
}

func TestAcceptTask_WrongAssignee_C4(t *testing.T) {
	f := initFixture(t)
	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del")
	registerAgent(t, f, assignee, "Assignee", "pk_asg")

	msgServer := newMsgServer(t, f)
	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "wrong assignee test",
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	// Try to accept with the delegator (not the assignee).
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: delegator,
		TaskId:  resp.TaskId,
	})
	require.Error(t, err)
	require.True(t, types.ErrNotAssignee.Is(err))
}

func TestAcceptTask_AlreadyAccepted_C4(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	msgServer := newMsgServer(t, f)
	_, err := msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  taskID,
	})
	require.Error(t, err)
	require.True(t, types.ErrTaskNotPending.Is(err))
}

// ===========================================================================
// CompleteTask error paths (74.5% → higher)
// ===========================================================================

func TestCompleteTask_InvalidAddress_C4(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: "bad-addr",
		TaskId:  1,
		Result:  `{"done":true}`,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidAddress.Is(err))
}

func TestCompleteTask_TaskNotFound_C4(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: validAddress(),
		TaskId:  99999,
		Result:  `{"done":true}`,
	})
	require.Error(t, err)
	require.True(t, types.ErrTaskNotFound.Is(err))
}

func TestCompleteTask_WrongAssignee_C4(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	delegator := validAddress()

	msgServer := newMsgServer(t, f)
	_, err := msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: delegator,
		TaskId:  taskID,
		Result:  `{"done":true}`,
	})
	require.Error(t, err)
	require.True(t, types.ErrNotAssignee.Is(err))
}

func TestCompleteTask_NotAccepted_C4(t *testing.T) {
	f := initFixture(t)
	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk_del")
	registerAgent(t, f, assignee, "Assignee", "pk_asg")

	msgServer := newMsgServer(t, f)
	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "still pending task",
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	// Try to complete a pending (not accepted) task.
	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
		Result:  `{"done":true}`,
	})
	require.Error(t, err)
	require.True(t, types.ErrTaskNotAccepted.Is(err))
}

func TestCompleteTask_Success_C4(t *testing.T) {
	f := initFixture(t)
	taskID := createAcceptedTask(t, f)
	assignee := validAddress2()

	msgServer := newMsgServer(t, f)

	// Fund module account so budget release works.
	require.NoError(t, f.bankKeeper.MintCoins(f.ctx, types.ModuleName, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10000))))

	_, err := msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  taskID,
		Result:  `{"output":"the answer is 42"}`,
	})
	require.NoError(t, err)

	// Verify task is completed.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)
	require.Contains(t, task.Result, "the answer is 42")
}

// ===========================================================================
// FinalizeIntent error paths (69.4% → higher)
// ===========================================================================

func TestFinalizeIntent_InvalidAddress_C4(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  "bad-address",
		IntentId: 1,
	})
	require.Error(t, err)
	require.True(t, types.ErrInvalidAddress.Is(err))
}

func TestFinalizeIntent_IntentNotFound_C4(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  validAddress(),
		IntentId: 99999,
	})
	require.Error(t, err)
	require.True(t, types.ErrIntentNotFound.Is(err))
}

func TestFinalizeIntent_NotCreator_C4(t *testing.T) {
	f := initFixture(t)
	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Creator1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	msgServer := newMsgServer(t, f)

	// Submit an intent from addr1.
	resp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:    addr1,
		IntentType:  "joint_transfer",
		Description: "test intent",
		Payload:     `{"model":"gpt-4"}`,
	})
	require.NoError(t, err)

	// addr2 tries to finalize — should fail.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr2,
		IntentId: resp.IntentId,
	})
	require.Error(t, err)
	require.True(t, types.ErrNotIntentCreator.Is(err))
}

func TestFinalizeIntent_Cancel_C4(t *testing.T) {
	f := initFixture(t)
	addr := validAddress()
	registerAgent(t, f, addr, "CancelAgent", "pk_cancel")

	msgServer := newMsgServer(t, f)

	resp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:    addr,
		IntentType:  "data_share",
		Description: "test intent",
		Payload:     `{"model":"test"}`,
	})
	require.NoError(t, err)

	// Cancel the intent.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr,
		IntentId: resp.IntentId,
		Cancel:   true,
	})
	require.NoError(t, err)

	// Verify status is cancelled.
	intent, err := f.keeper.Intents.Get(f.ctx, resp.IntentId)
	require.NoError(t, err)
	require.Equal(t, "cancelled", intent.Status)
}

func TestFinalizeIntent_Finalize_C4(t *testing.T) {
	f := initFixture(t)
	addr := validAddress()
	registerAgent(t, f, addr, "FinalAgent", "pk_final")

	msgServer := newMsgServer(t, f)

	resp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:    addr,
		IntentType:  "data_share",
		Description: "test intent",
		Payload:     `{"model":"test"}`,
	})
	require.NoError(t, err)

	// Finalize the intent.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr,
		IntentId: resp.IntentId,
		Cancel:   false,
	})
	require.NoError(t, err)

	// Verify status is finalized.
	intent, err := f.keeper.Intents.Get(f.ctx, resp.IntentId)
	require.NoError(t, err)
	require.Equal(t, "finalized", intent.Status)
}

func TestFinalizeIntent_AlreadyFinalized_C4(t *testing.T) {
	f := initFixture(t)
	addr := validAddress()
	registerAgent(t, f, addr, "DoubleFinalize", "pk_df")

	msgServer := newMsgServer(t, f)

	resp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:    addr,
		IntentType:  "data_share",
		Description: "test intent",
		Payload:     `{"model":"test"}`,
	})
	require.NoError(t, err)

	// Finalize.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr,
		IntentId: resp.IntentId,
	})
	require.NoError(t, err)

	// Try to finalize again.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr,
		IntentId: resp.IntentId,
	})
	require.Error(t, err)
	require.True(t, types.ErrIntentNotPending.Is(err))
}
