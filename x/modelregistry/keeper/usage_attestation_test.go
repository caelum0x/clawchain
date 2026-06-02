package keeper_test

import (
	"encoding/json"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/types"
)

// completedJob sets up a model, provider, submits and completes a job, returning
// the job ID and the assigned provider address.
func completedJob(t *testing.T, f *fixture) (jobID uint64, provider string) {
	t.Helper()

	modelID, prov := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	id, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	err = f.keeper.StartInferenceJob(f.ctx, id, prov)
	require.NoError(t, err)

	err = f.keeper.CompleteInferenceJob(f.ctx, id, prov, `{"response":"Hello!"}`, 50)
	require.NoError(t, err)

	return id, prov
}

// TestSubmitUsageAttestationSuccess verifies the assigned provider can attest a
// completed job and that the attestation fields are persisted.
func TestSubmitUsageAttestationSuccess(t *testing.T) {
	f := initFixture(t)
	jobID, prov := completedJob(t, f)

	err := f.keeper.SubmitUsageAttestation(f.ctx, jobID, prov, 50, "sha256:deadbeef")
	require.NoError(t, err)

	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))

	require.Equal(t, "sha256:deadbeef", job.AttestationHash)
	require.Equal(t, uint64(50), job.AttestedOutputTokens)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), job.AttestedAt)
}

// TestSubmitUsageAttestationNotProvider verifies a non-provider caller is rejected.
func TestSubmitUsageAttestationNotProvider(t *testing.T) {
	f := initFixture(t)
	jobID, _ := completedJob(t, f)

	notProvider := validRequester()
	err := f.keeper.SubmitUsageAttestation(f.ctx, jobID, notProvider, 50, "sha256:deadbeef")
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrNotJobProvider)
}

// TestSubmitUsageAttestationNotCompleted verifies a job that is not completed
// cannot be attested.
func TestSubmitUsageAttestationNotCompleted(t *testing.T) {
	f := initFixture(t)
	modelID, prov := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	// Job is in pending status, not completed.
	err = f.keeper.SubmitUsageAttestation(f.ctx, jobID, prov, 50, "sha256:deadbeef")
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrJobNotAttestable)
}
