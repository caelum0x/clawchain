package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/reputation/types"
)

func TestReputationDecay_DisabledWhenZeroRate(t *testing.T) {
	f := initFixture(t)

	params, _ := f.keeper.Params.Get(f.ctx)
	params.DecayRateBps = 0
	params.DecayIntervalBlocks = 100
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 10000,
	}))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(200)
	f.ctx = sdkCtx

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, validAddress())
	require.NoError(t, err)
	require.Equal(t, uint64(10000), rep.UptimeScoreBps) // unchanged
}

func TestReputationDecay_DisabledWhenZeroInterval(t *testing.T) {
	f := initFixture(t)

	params, _ := f.keeper.Params.Get(f.ctx)
	params.DecayRateBps = 10
	params.DecayIntervalBlocks = 0
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 10000,
	}))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(200)
	f.ctx = sdkCtx

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, validAddress())
	require.NoError(t, err)
	require.Equal(t, uint64(10000), rep.UptimeScoreBps) // unchanged
}

func TestReputationDecay_AppliedAfterInterval(t *testing.T) {
	f := initFixture(t)

	params, _ := f.keeper.Params.Get(f.ctx)
	params.DecayRateBps = 100 // 1%
	params.DecayIntervalBlocks = 50
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 10000,
	}))

	// Block 100 — interval elapsed (100 - 0 >= 50)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(100)
	f.ctx = sdkCtx

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, validAddress())
	require.NoError(t, err)
	// 10000 * 100 / 10000 = 100 bps reduction → 9900
	require.Equal(t, uint64(9900), rep.UptimeScoreBps)

	// Verify LastDecayBlock was set
	lastDecay, err := f.keeper.LastDecayBlock.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, int64(100), lastDecay)
}

func TestReputationDecay_NotAppliedBeforeInterval(t *testing.T) {
	f := initFixture(t)

	params, _ := f.keeper.Params.Get(f.ctx)
	params.DecayRateBps = 100
	params.DecayIntervalBlocks = 50
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 10000,
	}))

	// Set last decay to block 80
	require.NoError(t, f.keeper.LastDecayBlock.Set(f.ctx, int64(80)))

	// Block 100 — only 20 blocks since last decay (< 50 interval)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(100)
	f.ctx = sdkCtx

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, validAddress())
	require.NoError(t, err)
	require.Equal(t, uint64(10000), rep.UptimeScoreBps) // unchanged
}

func TestReputationDecay_SkipsZeroScores(t *testing.T) {
	f := initFixture(t)

	params, _ := f.keeper.Params.Get(f.ctx)
	params.DecayRateBps = 100
	params.DecayIntervalBlocks = 50
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	// Agent with zero score
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 0,
	}))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(100)
	f.ctx = sdkCtx

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, validAddress())
	require.NoError(t, err)
	require.Equal(t, uint64(0), rep.UptimeScoreBps)
}
