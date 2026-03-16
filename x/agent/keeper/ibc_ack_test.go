package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"

	agentibc "clawchain/x/agent/ibc"
	"clawchain/x/agent/types"
)

func TestIBCTaskCompletionACK(t *testing.T) {
	f := initFixture(t)

	// Register the assignee agent first.
	assigneeAddr := sdk.AccAddress([]byte("agent1______________")).String()
	err := f.keeper.Agents.Set(f.ctx, assigneeAddr, types.AgentInfo{
		Address:        assigneeAddr,
		Name:           "test-agent",
		Active:         true,
		SupportedTools: []string{"compute"},
	})
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// Create a task from IBC.
	taskID, err := f.keeper.CreateTaskFromIBC(
		sdkCtx, "delegator1", "chain-b", assigneeAddr,
		"test task", "compute", 0, "1000uclaw", 100,
	)
	require.NoError(t, err)
	// taskID can be 0 (first task) — just verify no error.

	// Accept the task first by setting it to "accepted" status.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	task.Status = "accepted"
	err = f.keeper.Tasks.Set(f.ctx, taskID, task)
	require.NoError(t, err)

	// Complete the task with IBC ACK.
	err = f.keeper.CompleteTaskWithIBCACK(sdkCtx, taskID, "result_hash_abc")
	require.NoError(t, err)

	// Verify task has been completed.
	task, err = f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)
	require.Equal(t, "result_hash_abc", task.Result)
}

func TestIBCTaskCompletionACK_NotFound(t *testing.T) {
	f := initFixture(t)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	err := f.keeper.CompleteTaskWithIBCACK(sdkCtx, 999, "result")
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found")
}

func TestIBCTaskCompletionACK_AlreadyCompleted(t *testing.T) {
	f := initFixture(t)

	// Register the assignee agent.
	assigneeAddr := sdk.AccAddress([]byte("agent2______________")).String()
	err := f.keeper.Agents.Set(f.ctx, assigneeAddr, types.AgentInfo{
		Address: assigneeAddr,
		Name:    "test-agent-2",
		Active:  true,
	})
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	taskID, err := f.keeper.CreateTaskFromIBC(
		sdkCtx, "delegator2", "chain-c", assigneeAddr,
		"test task 2", "compute", 0, "500uclaw", 50,
	)
	require.NoError(t, err)

	// Set task to completed.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	task.Status = "completed"
	err = f.keeper.Tasks.Set(f.ctx, taskID, task)
	require.NoError(t, err)

	// Try to complete again -- should fail.
	err = f.keeper.CompleteTaskWithIBCACK(sdkCtx, taskID, "result2")
	require.Error(t, err)
	require.Contains(t, err.Error(), "expected accepted or pending")
}

func TestParseIBCTaskACK(t *testing.T) {
	// Valid ACK.
	ack := agentibc.ParseIBCTaskACK([]byte(`{"task_id":42,"status":"completed","result_hash":"abc123"}`))
	require.NotNil(t, ack)
	require.Equal(t, uint64(42), ack.TaskId)
	require.Equal(t, "completed", ack.Status)
	require.Equal(t, "abc123", ack.ResultHash)

	// ACK with error.
	ack = agentibc.ParseIBCTaskACK([]byte(`{"task_id":1,"status":"error","error":"agent not found"}`))
	require.NotNil(t, ack)
	require.Equal(t, "agent not found", ack.Error)

	// Invalid ACK (no task_id).
	ack = agentibc.ParseIBCTaskACK([]byte(`{"status":"completed"}`))
	require.Nil(t, ack)

	// Empty ACK.
	ack = agentibc.ParseIBCTaskACK([]byte{})
	require.Nil(t, ack)

	// Non-JSON ACK.
	ack = agentibc.ParseIBCTaskACK([]byte("not json"))
	require.Nil(t, ack)
}
