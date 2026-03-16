package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

func TestQueryAgentTasks_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	tasks, err := f.keeper.QueryAgentTasks(f.ctx, "")
	require.NoError(t, err)
	require.Nil(t, tasks)
}

func TestQueryAgentTasks_NoTasks(t *testing.T) {
	f := initFixture(t)
	addr := sdk.AccAddress([]byte("agent_______________")).String()
	tasks, err := f.keeper.QueryAgentTasks(f.ctx, addr)
	require.NoError(t, err)
	require.Empty(t, tasks)
}

func TestQueryAgentTasks_ReturnsTasks(t *testing.T) {
	f := initFixture(t)
	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assignee := sdk.AccAddress([]byte("assignee____________")).String()
	otherAgent := sdk.AccAddress([]byte("otheragent__________")).String()

	// Fund delegator for escrow.
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	ms := keeper.NewMsgServerImpl(f.keeper)

	// Register both agents.
	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "delegator-agent",
		Pubkey:  "pk_delegator",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "assignee-agent",
		Pubkey:  "pk_assignee",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: otherAgent,
		Name:    "other-agent",
		Pubkey:  "pk_other",
	})
	require.NoError(t, err)

	// Delegate two tasks to assignee and one to other agent.
	_, err = ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "task-1",
		Budget:         "100",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	_, err = ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "task-2",
		Budget:         "200",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	_, err = ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       otherAgent,
		Description:    "task-other",
		Budget:         "100",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Query tasks for assignee — should get exactly 2.
	tasks, err := f.keeper.QueryAgentTasks(f.ctx, assignee)
	require.NoError(t, err)
	require.Len(t, tasks, 2)

	descriptions := map[string]bool{}
	for _, task := range tasks {
		descriptions[task.Description] = true
		require.Equal(t, assignee, task.AssigneeAddress)
	}
	require.True(t, descriptions["task-1"])
	require.True(t, descriptions["task-2"])

	// Query tasks for other agent — should get exactly 1.
	otherTasks, err := f.keeper.QueryAgentTasks(f.ctx, otherAgent)
	require.NoError(t, err)
	require.Len(t, otherTasks, 1)
	require.Equal(t, "task-other", otherTasks[0].Description)
}

func TestQueryAgentActiveTasks_FiltersStatus(t *testing.T) {
	f := initFixture(t)
	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assignee := sdk.AccAddress([]byte("assignee____________")).String()

	// Fund delegator for escrow.
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	ms := keeper.NewMsgServerImpl(f.keeper)

	// Register both agents.
	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "delegator-agent",
		Pubkey:  "pk_delegator",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "assignee-agent",
		Pubkey:  "pk_assignee",
	})
	require.NoError(t, err)

	// Delegate three tasks.
	res1, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "task-pending",
		Budget:         "100",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	res2, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "task-accepted",
		Budget:         "200",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	res3, err := ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "task-completed",
		Budget:         "300",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	_ = res1

	// Accept task-accepted.
	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  res2.TaskId,
	})
	require.NoError(t, err)

	// Accept then complete task-completed.
	_, err = ms.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  res3.TaskId,
	})
	require.NoError(t, err)

	_, err = ms.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  res3.TaskId,
		Result:  "done",
	})
	require.NoError(t, err)

	// QueryAgentTasks should return all 3.
	allTasks, err := f.keeper.QueryAgentTasks(f.ctx, assignee)
	require.NoError(t, err)
	require.Len(t, allTasks, 3)

	// QueryAgentActiveTasks should return only 2 (pending + accepted).
	activeTasks, err := f.keeper.QueryAgentActiveTasks(f.ctx, assignee)
	require.NoError(t, err)
	require.Len(t, activeTasks, 2)

	statuses := map[string]bool{}
	for _, task := range activeTasks {
		statuses[task.Status] = true
	}
	require.True(t, statuses["pending"])
	require.True(t, statuses["accepted"])
	require.False(t, statuses["completed"])
}
