package keeper_test

import (
	"encoding/json"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/types"
)

// TestDisputeInferenceJobSuccess verifies the original requester can dispute a
// completed job and that the dispute fields are persisted.
func TestDisputeInferenceJobSuccess(t *testing.T) {
	f := initFixture(t)

	modelID, prov := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	err = f.keeper.StartInferenceJob(f.ctx, jobID, prov)
	require.NoError(t, err)

	err = f.keeper.CompleteInferenceJob(f.ctx, jobID, prov, `{"response":"Hello!"}`, 50)
	require.NoError(t, err)

	err = f.keeper.DisputeInferenceJob(f.ctx, jobID, requester, "output did not match prompt")
	require.NoError(t, err)

	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))

	require.True(t, job.Disputed)
	require.Equal(t, "output did not match prompt", job.DisputeReason)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), job.DisputedAt)
}

// TestDisputeInferenceJobNotRequester verifies a caller that is not the original
// requester is rejected.
func TestDisputeInferenceJobNotRequester(t *testing.T) {
	f := initFixture(t)

	modelID, prov := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	err = f.keeper.StartInferenceJob(f.ctx, jobID, prov)
	require.NoError(t, err)

	err = f.keeper.CompleteInferenceJob(f.ctx, jobID, prov, `{"response":"Hello!"}`, 50)
	require.NoError(t, err)

	// The provider is not the requester and may not dispute.
	err = f.keeper.DisputeInferenceJob(f.ctx, jobID, prov, "self dispute")
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrNotJobRequester)
}

// TestDisputeInferenceJobNotCompleted verifies a job that is not completed
// cannot be disputed.
func TestDisputeInferenceJobNotCompleted(t *testing.T) {
	f := initFixture(t)

	modelID, _ := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	// Job is in pending status, not completed.
	err = f.keeper.DisputeInferenceJob(f.ctx, jobID, requester, "too early")
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrJobNotDisputable)
}
