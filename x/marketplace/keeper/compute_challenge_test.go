//go:build integration

package keeper_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// TestGenerateChallenge - challenge is deterministic from block hash + job ID
// ---------------------------------------------------------------------------

func TestGenerateChallenge(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	// Set up a resource + lease so we can submit a job
	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 2)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{
		Name:    "challenge-test-job",
		JobType: "ai-training",
	})
	require.NoError(t, err)

	// The challenge should have been auto-generated during SubmitComputeJob.
	challengeJSON, err := f.keeper.ComputeChallenges.Get(f.ctx, jobId)
	require.NoError(t, err)

	var challenge types.ComputeChallenge
	require.NoError(t, json.Unmarshal([]byte(challengeJSON), &challenge))
	require.Equal(t, jobId, challenge.JobId)
	require.NotEmpty(t, challenge.ChallengeSeed)

	// Verify determinism: manually compute the expected seed
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	preimage := append(sdkCtx.BlockHeader().AppHash, []byte(fmt.Sprintf("%d", jobId))...)
	expectedSeed := sha256.Sum256(preimage)
	require.Equal(t, hex.EncodeToString(expectedSeed[:]), challenge.ChallengeSeed)

	// Verify the block height is recorded
	require.Equal(t, sdkCtx.BlockHeight(), challenge.BlockHeight)

	// Calling GenerateChallenge again with the same context should produce the same seed
	challenge2, err := f.keeper.GenerateChallenge(f.ctx, jobId)
	require.NoError(t, err)
	require.Equal(t, challenge.ChallengeSeed, challenge2.ChallengeSeed)
}

// ---------------------------------------------------------------------------
// TestVerifyComputeProof - valid proof passes, invalid proof fails
// ---------------------------------------------------------------------------

func TestVerifyComputeProof(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	// Set up resource + lease + job
	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 2)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{
		Name:    "proof-test-job",
		JobType: "inference",
	})
	require.NoError(t, err)

	// Look up the stored challenge seed
	challengeJSON, err := f.keeper.ComputeChallenges.Get(f.ctx, jobId)
	require.NoError(t, err)
	var challenge types.ComputeChallenge
	require.NoError(t, json.Unmarshal([]byte(challengeJSON), &challenge))

	// Simulate a result hash
	result := "model output v1.0"
	rh := sha256.Sum256([]byte(result))
	resultHash := hex.EncodeToString(rh[:])

	// Build valid challenge response: sha256(resultHash + challengeSeed)
	validPreimage := resultHash + challenge.ChallengeSeed
	validHash := sha256.Sum256([]byte(validPreimage))
	validResponse := hex.EncodeToString(validHash[:])

	// Valid proof should pass
	valid, err := f.keeper.VerifyComputeProof(f.ctx, jobId, resultHash, validResponse)
	require.NoError(t, err)
	require.True(t, valid, "valid challenge response should verify successfully")

	// Invalid proof should fail
	invalid, err := f.keeper.VerifyComputeProof(f.ctx, jobId, resultHash, "deadbeef")
	require.NoError(t, err)
	require.False(t, invalid, "invalid challenge response should fail verification")

	// Empty challenge response should fail
	empty, err := f.keeper.VerifyComputeProof(f.ctx, jobId, resultHash, "")
	require.NoError(t, err)
	require.False(t, empty, "empty challenge response should fail verification")

	// Non-existent job challenge should return error
	_, err = f.keeper.VerifyComputeProof(f.ctx, 99999, resultHash, validResponse)
	require.Error(t, err, "should error for missing challenge")
}

// ---------------------------------------------------------------------------
// TestComputeChallengeIntegration - full flow: assign job -> get challenge ->
//   submit valid proof -> settles
// ---------------------------------------------------------------------------

func TestComputeChallengeIntegration(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	// 1. List a compute resource
	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	// 2. Fund lessee and create a lease (2 hours * 1_000_000 uclaw/hr = 2_000_000 uclaw)
	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 2)
	require.NoError(t, err)

	// Verify escrow holds funds
	modBal := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, modBal.AmountOf("uclaw").Equal(math.NewInt(2_000_000)))

	// 3. Submit a job - challenge is auto-generated
	job := types.ComputeJob{
		Name:          "integration-challenge-job",
		JobType:       "ai-training",
		ExecutionType: "docker",
		DockerImage:   "nvcr.io/nvidia/pytorch:latest",
	}
	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, job)
	require.NoError(t, err)

	// Verify challenge was stored
	challengeJSON, err := f.keeper.ComputeChallenges.Get(f.ctx, jobId)
	require.NoError(t, err)
	var challenge types.ComputeChallenge
	require.NoError(t, json.Unmarshal([]byte(challengeJSON), &challenge))
	require.Equal(t, jobId, challenge.JobId)
	require.NotEmpty(t, challenge.ChallengeSeed)

	// 4. Provider transitions job: pending -> running
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)

	// 5. Provider completes with a valid challenge response
	resultStr := "training complete: accuracy=0.95, loss=0.02"
	cr := computeChallengeResponse(t, f, jobId, resultStr)
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", resultStr, cr)
	require.NoError(t, err)

	// 6. Verify job stored with ChallengeResponse
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var storedJob types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &storedJob))
	require.Equal(t, "completed", storedJob.Status)
	require.NotEmpty(t, storedJob.ResultHash)
	require.NotEmpty(t, storedJob.ChallengeResponse)
	require.Equal(t, cr, storedJob.ChallengeResponse)

	// 7. Attempting to complete with INVALID response should fail
	//    (We test this separately since the job is already completed)
	f2 := initFixture(t)
	resourceId2, err := f2.keeper.ListComputeResource(f2.ctx, owner, testResource())
	require.NoError(t, err)
	lesseeAcc2, _ := sdk.AccAddressFromBech32(lessee)
	f2.bankKeeper.FundAccount(lesseeAcc2, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId2, err := f2.keeper.LeaseComputeResource(f2.ctx, lessee, resourceId2, 2)
	require.NoError(t, err)
	jobId2, err := f2.keeper.SubmitComputeJob(f2.ctx, lessee, resourceId2, leaseId2, types.ComputeJob{Name: "bad-proof-job"})
	require.NoError(t, err)
	err = f2.keeper.UpdateJobStatus(f2.ctx, jobId2, owner, "running", "")
	require.NoError(t, err)
	err = f2.keeper.UpdateJobStatus(f2.ctx, jobId2, owner, "completed", "some result", "invalid-response")
	require.Error(t, err, "completing with invalid challenge response should fail")

	// 8. Record provider balance before settlement
	providerAcc, _ := sdk.AccAddressFromBech32(owner)
	providerBalBefore := f.bankKeeper.balances[providerAcc.String()].AmountOf("uclaw")

	// 9. Run SettleCompletedJobs - should succeed because proof is valid
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)

	// 10. Verify the lease status changed to "settled"
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "settled", lease.Status)

	// 11. Verify provider received the escrowed funds (2_000_000 uclaw)
	providerBalAfter := f.bankKeeper.balances[providerAcc.String()].AmountOf("uclaw")
	require.Equal(t, math.NewInt(2_000_000), providerBalAfter.Sub(providerBalBefore))

	// 12. Verify module escrow is now empty
	modBalAfter := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, modBalAfter.AmountOf("uclaw").IsZero())
}
