package keeper_test

import (
	"testing"

	"clawchain/x/reputation/keeper"
	"clawchain/x/reputation/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// UpdateParams, Params query, EndBlock with SLA
// ---------------------------------------------------------------------------

func TestUpdateParams_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	authorityStr, err := f.addressCodec.BytesToString(f.keeper.GetAuthority())
	require.NoError(t, err)

	newParams := types.DefaultParams()
	newParams.MaxCommentLength = 500

	_, err = msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: authorityStr,
		Params:    newParams,
	})
	require.NoError(t, err)

	stored, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(500), stored.MaxCommentLength)
}

func TestUpdateParams_Unauthorized(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: validAddress(),
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "unauthorized")
}

func TestQueryParams_Success(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Params(f.ctx, &types.QueryParamsRequest{})
	require.NoError(t, err)
	require.Equal(t, types.DefaultParams(), resp.Params)
}

func TestQueryParams_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Params(f.ctx, nil)
	require.Error(t, err)
}

func TestEndBlock_WithHeartbeatSLA(t *testing.T) {
	f := initFixture(t)

	// EndBlock should run without error when agent keeper returns data.
	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)
}

func TestEndBlock_AgentKeeperError(t *testing.T) {
	f := initFixture(t)

	// Simulate agent keeper returning error.
	f.agentKeeper.err = types.ErrInvalidSigner
	err := f.keeper.EndBlock(f.ctx)
	require.Error(t, err)
}

func TestEndBlock_AppliesHeartbeatAndTaskSLAAdjustments(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(200)
	f.ctx = sdkCtx

	target := validAddress2()
	f.agentKeeper.maxHeartbeatGap = 100
	f.agentKeeper.heartbeatStatuses[target] = 0 // stale at block 200
	f.agentKeeper.taskEvents = []mockTaskSLAEvent{
		{taskID: 1, assignee: target, onTime: true, latenessBlocks: 0},
		{taskID: 2, assignee: target, onTime: false, latenessBlocks: 25}, // 3 lateness steps at step=10
	}

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.HeartbeatPenaltyBps = 500
	params.HeartbeatRecoveryBps = 200
	params.TaskSlaOnTimeRewardBps = 50
	params.TaskSlaLatePenaltyBps = 100
	params.TaskSlaLatenessStepBlocks = 10
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	err = f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, target)
	require.NoError(t, err)
	require.Equal(t, uint64(9250), rep.UptimeScoreBps) // 10000-500+50-300
	require.Equal(t, uint64(1), rep.HeartbeatSlaPenalties)
	require.Equal(t, uint64(1), rep.TaskSlaOnTimeCount)
	require.Equal(t, uint64(1), rep.TaskSlaLateCount)
	require.Equal(t, uint64(50), rep.TaskSlaRewardBpsTotal)
	require.Equal(t, uint64(300), rep.TaskSlaPenaltyBpsTotal)

	staleState, err := f.keeper.HeartbeatStaleState.Get(f.ctx, target)
	require.NoError(t, err)
	require.True(t, staleState)
	require.Equal(t, uint64(100), f.agentKeeper.slashed[target])

	cursor, err := f.keeper.TaskSLACursor.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(2), cursor)

	// Recovery transition (stale -> live) on subsequent block, no new task events.
	f.agentKeeper.heartbeatStatuses[target] = 199
	f.agentKeeper.taskEvents = nil
	err = f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err = f.keeper.Reputations.Get(f.ctx, target)
	require.NoError(t, err)
	require.Equal(t, uint64(9450), rep.UptimeScoreBps)
	require.Equal(t, uint64(1), rep.HeartbeatSlaRecoveries)

	staleState, err = f.keeper.HeartbeatStaleState.Get(f.ctx, target)
	require.NoError(t, err)
	require.False(t, staleState)
}

func TestEndBlock_ZeroUptimeInitializesToMaxThenAppliesPenalty(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(200)
	f.ctx = sdkCtx

	target := validAddress2()
	f.agentKeeper.maxHeartbeatGap = 100
	f.agentKeeper.heartbeatStatuses[target] = 0

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, target, types.ReputationRecord{
		AgentAddress:   target,
		UptimeScoreBps: 0,
	}))

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, target)
	require.NoError(t, err)
	require.Equal(t, uint64(9500), rep.UptimeScoreBps)
}
