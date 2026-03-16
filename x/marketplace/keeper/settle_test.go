package keeper_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// SettleCompletedJobs tests
// ---------------------------------------------------------------------------

func TestSettleCompletedJobsSuccess(t *testing.T) {
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

	// 3. Submit a job
	job := types.ComputeJob{
		Name:          "settle-test-job",
		JobType:       "ai-training",
		ExecutionType: "docker",
		DockerImage:   "nvcr.io/nvidia/pytorch:latest",
	}
	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, job)
	require.NoError(t, err)

	// 4. Provider transitions job: pending -> running -> completed
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)

	resultStr := "model saved to s3://bucket/output"
	cr := computeChallengeResponse(t, f, jobId, resultStr)
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", resultStr, cr)
	require.NoError(t, err)

	// Verify ResultHash was computed
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var storedJob types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &storedJob))
	expectedHash := sha256.Sum256([]byte(resultStr))
	require.Equal(t, hex.EncodeToString(expectedHash[:]), storedJob.ResultHash)

	// 5. Record provider balance before settlement
	providerAcc, _ := sdk.AccAddressFromBech32(owner)
	providerBalBefore := f.bankKeeper.balances[providerAcc.String()].AmountOf("uclaw")

	// 6. Run SettleCompletedJobs
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)

	// 7. Verify the lease status changed to "settled"
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "settled", lease.Status)

	// 8. Verify provider received the escrowed funds (2_000_000 uclaw)
	providerBalAfter := f.bankKeeper.balances[providerAcc.String()].AmountOf("uclaw")
	require.Equal(t, math.NewInt(2_000_000), providerBalAfter.Sub(providerBalBefore))

	// 9. Verify module escrow is now empty
	modBalAfter := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, modBalAfter.AmountOf("uclaw").IsZero())

	// 10. Verify resource is available again
	resJSON, err := f.keeper.ComputeResources.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var res types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(resJSON), &res))
	require.Equal(t, "", res.CurrentLessee)
	require.Equal(t, int64(0), res.LeaseExpiresAt)
}

func TestSettleCompletedJobsIdempotent(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "idempotent-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)
	cr := computeChallengeResponse(t, f, jobId, "done")
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", "done", cr)
	require.NoError(t, err)

	// First settle
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)

	// Verify settled
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "settled", lease.Status)

	providerAcc, _ := sdk.AccAddressFromBech32(owner)
	providerBal := f.bankKeeper.balances[providerAcc.String()].AmountOf("uclaw")

	// Second settle should be a no-op (lease already settled)
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)

	// Provider balance should not change
	providerBalAfter := f.bankKeeper.balances[providerAcc.String()].AmountOf("uclaw")
	require.Equal(t, providerBal, providerBalAfter)
}

func TestSettleCompletedJobsSkipsPending(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	_, err = f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "pending-job"})
	require.NoError(t, err)

	// Run settle — job is still pending, so nothing should happen
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)

	// Lease should remain active
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "active", lease.Status)
}

func TestSettleCompletedJobsSkipsFailedJobs(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "fail-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "failed", "OOM killed")
	require.NoError(t, err)

	// Settle should not touch failed jobs
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)

	// Lease should remain active
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "active", lease.Status)
}

func TestResultHashEmptyResult(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "no-result-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)

	// Complete with empty result
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", "")
	require.NoError(t, err)

	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var job types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &job))
	require.Equal(t, "completed", job.Status)
	require.Equal(t, "", job.ResultHash) // no hash for empty result
}
