package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUpdateParam_Reputation(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "heartbeat_penalty_bps", "750")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.EqualValues(t, 750, params.HeartbeatPenaltyBps)
}

func TestUpdateParam_ReputationInvalidValue(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "heartbeat_penalty_bps", "not-a-number")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestUpdateParam_ReputationAllSupportedKeys(t *testing.T) {
	f := initFixture(t)

	testCases := []struct {
		key   string
		value string
	}{
		{key: "max_comment_length", value: "300"},
		{key: "heartbeat_penalty_bps", value: "700"},
		{key: "heartbeat_recovery_bps", value: "200"},
		{key: "task_sla_on_time_reward_bps", value: "60"},
		{key: "task_sla_late_penalty_bps", value: "150"},
		{key: "task_sla_lateness_step_blocks", value: "50"},
	}

	for _, tc := range testCases {
		err := f.keeper.UpdateParam(f.ctx, tc.key, tc.value)
		require.NoError(t, err, tc.key)
	}

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.EqualValues(t, 300, params.MaxCommentLength)
	require.EqualValues(t, 700, params.HeartbeatPenaltyBps)
	require.EqualValues(t, 200, params.HeartbeatRecoveryBps)
	require.EqualValues(t, 60, params.TaskSlaOnTimeRewardBps)
	require.EqualValues(t, 150, params.TaskSlaLatePenaltyBps)
	require.EqualValues(t, 50, params.TaskSlaLatenessStepBlocks)
}

func TestUpdateParam_ReputationValidationFailure(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "task_sla_lateness_step_blocks", "0")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid params after update")
}

func TestUpdateParam_ReputationUnknownKey(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "unknown", "1")
	require.Error(t, err)
	require.Contains(t, err.Error(), "unknown reputation param key")
}
