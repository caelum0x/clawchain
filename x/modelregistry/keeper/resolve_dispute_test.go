package keeper_test

import (
	"encoding/json"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/types"
)

// disputedJob sets up a model, provider, submits/completes a job, and disputes
// it as the requester. It returns the job ID and the addresses involved so
// resolve tests can act as the model owner.
func disputedJob(t *testing.T, f *fixture) (jobID uint64, owner, provider, requester string) {
	t.Helper()

	owner = validOwner()
	modelID, prov := setupModelAndProvider(t, f)

	req := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(req)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	id, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, req,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	require.NoError(t, f.keeper.StartInferenceJob(f.ctx, id, prov))
	require.NoError(t, f.keeper.CompleteInferenceJob(f.ctx, id, prov, `{"response":"Hello!"}`, 50))
	require.NoError(t, f.keeper.DisputeInferenceJob(f.ctx, id, req, "output did not match prompt"))

	return id, owner, prov, req
}

// TestResolveInferenceDisputeUpheld verifies the model owner can uphold a
// dispute: the job is marked resolved + upheld and the dispute slash is NOT
// restored.
func TestResolveInferenceDisputeUpheld(t *testing.T) {
	f := initFixture(t)
	jobID, owner, provider, _ := disputedJob(t, f)

	// Sanity: the dispute slashed the provider.
	require.Equal(t, types.DisputeReputationPenalty, f.reputationKeeper.slashed[provider])

	err := f.keeper.ResolveInferenceDispute(f.ctx, jobID, owner, true)
	require.NoError(t, err)

	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))

	require.True(t, job.Resolved)
	require.True(t, job.ResolutionUpheld)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), job.ResolvedAt)

	// Upheld dispute: the slash stands, nothing restored.
	require.Equal(t, uint64(0), f.reputationKeeper.restored[provider])
}

// TestResolveInferenceDisputeRejected verifies the model owner can reject a
// dispute: the job is marked resolved + not upheld and the dispute slash is
// restored by the penalty.
func TestResolveInferenceDisputeRejected(t *testing.T) {
	f := initFixture(t)
	jobID, owner, provider, _ := disputedJob(t, f)

	err := f.keeper.ResolveInferenceDispute(f.ctx, jobID, owner, false)
	require.NoError(t, err)

	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))

	require.True(t, job.Resolved)
	require.False(t, job.ResolutionUpheld)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), job.ResolvedAt)

	// Rejected dispute: the slash is restored by the penalty.
	require.Equal(t, types.DisputeReputationPenalty, f.reputationKeeper.restored[provider])
}

// TestResolveInferenceDisputeNotOwner verifies a caller that is not the model
// owner is rejected.
func TestResolveInferenceDisputeNotOwner(t *testing.T) {
	f := initFixture(t)
	jobID, _, _, requester := disputedJob(t, f)

	// The requester is not the model owner and may not resolve.
	err := f.keeper.ResolveInferenceDispute(f.ctx, jobID, requester, false)
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrNotModelOwner)
}

// TestResolveInferenceDisputeNotDisputed verifies a job that is not disputed
// cannot be resolved.
func TestResolveInferenceDisputeNotDisputed(t *testing.T) {
	f := initFixture(t)

	owner := validOwner()
	modelID, prov := setupModelAndProvider(t, f)

	req := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(req)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, req,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	require.NoError(t, f.keeper.StartInferenceJob(f.ctx, jobID, prov))
	require.NoError(t, f.keeper.CompleteInferenceJob(f.ctx, jobID, prov, `{"response":"Hello!"}`, 50))

	// Job is completed but never disputed.
	err = f.keeper.ResolveInferenceDispute(f.ctx, jobID, owner, true)
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrJobNotDisputed)
}

// TestResolveInferenceDisputeAlreadyResolved verifies a job whose dispute has
// already been resolved cannot be resolved again.
func TestResolveInferenceDisputeAlreadyResolved(t *testing.T) {
	f := initFixture(t)
	jobID, owner, _, _ := disputedJob(t, f)

	require.NoError(t, f.keeper.ResolveInferenceDispute(f.ctx, jobID, owner, true))

	// Second resolution must be rejected.
	err := f.keeper.ResolveInferenceDispute(f.ctx, jobID, owner, false)
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrDisputeAlreadyResolved)
}
