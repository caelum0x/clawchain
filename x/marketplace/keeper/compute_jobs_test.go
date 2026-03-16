package keeper_test

import (
	"encoding/json"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// SubmitComputeJob tests
// ---------------------------------------------------------------------------

func TestSubmitComputeJobSuccess(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	// List a resource
	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	// Lease the resource
	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 2)
	require.NoError(t, err)

	// Submit a job
	job := types.ComputeJob{
		Name:          "test-training-job",
		JobType:       "ai-training",
		ExecutionType: "docker",
		DockerImage:   "nvcr.io/nvidia/pytorch:latest",
	}
	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, job)
	require.NoError(t, err)

	// Verify job stored
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var stored types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &stored))
	require.Equal(t, "test-training-job", stored.Name)
	require.Equal(t, "pending", stored.Status)
	require.Equal(t, lessee, stored.Submitter)
	require.Equal(t, owner, stored.Provider)
	require.Equal(t, "NVIDIA A100", stored.GpuType)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), stored.SubmittedAt)
}

func TestSubmitComputeJobNotLessee(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()
	rando := sdk.AccAddress([]byte("random1_____________")).String()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	// Random address can't submit job
	_, err = f.keeper.SubmitComputeJob(f.ctx, rando, resourceId, leaseId, types.ComputeJob{Name: "bad"})
	require.Error(t, err)
}

func TestSubmitComputeJobEmptyName(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	_, err = f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: ""})
	require.Error(t, err)
}

func TestSubmitComputeJobLeaseNotActive(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	// Release the lease first
	err = f.keeper.ReleaseComputeResource(f.ctx, leaseId, lessee)
	require.NoError(t, err)

	// Cannot submit job on completed lease
	_, err = f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "too-late"})
	require.Error(t, err)
}

func TestSubmitComputeJobResourceMismatch(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	res1 := testResource()
	res1.Name = "GPU-1"
	res2 := testResource()
	res2.Name = "GPU-2"

	resourceId1, err := f.keeper.ListComputeResource(f.ctx, owner, res1)
	require.NoError(t, err)
	resourceId2, err := f.keeper.ListComputeResource(f.ctx, owner, res2)
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 20_000_000)))

	// Lease resource 1
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId1, 1)
	require.NoError(t, err)

	// Try to submit job for resource 2 using lease for resource 1
	_, err = f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId2, leaseId, types.ComputeJob{Name: "mismatch"})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// UpdateJobStatus tests
// ---------------------------------------------------------------------------

func TestUpdateJobStatusPendingToRunning(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "test-job"})
	require.NoError(t, err)

	// Provider updates to running
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)

	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var job types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &job))
	require.Equal(t, "running", job.Status)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), job.StartedAt)
}

func TestUpdateJobStatusRunningToCompleted(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "test-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)

	cr := computeChallengeResponse(t, f, jobId, "model saved to s3://bucket/output")
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", "model saved to s3://bucket/output", cr)
	require.NoError(t, err)

	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var job types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &job))
	require.Equal(t, "completed", job.Status)
	require.Equal(t, "model saved to s3://bucket/output", job.Result)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), job.CompletedAt)
}

func TestUpdateJobStatusInvalidTransition(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "test-job"})
	require.NoError(t, err)

	// Can't go directly from pending to completed
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", "shortcut")
	require.Error(t, err)
}

func TestUpdateJobStatusNotProvider(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "test-job"})
	require.NoError(t, err)

	// Lessee can't update job status
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, lessee, "running", "")
	require.Error(t, err)
}

func TestUpdateJobStatusTerminalState(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "test-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)
	cr := computeChallengeResponse(t, f, jobId, "done")
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", "done", cr)
	require.NoError(t, err)

	// Can't update a completed job
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "failed", "oops")
	require.Error(t, err)
}

func TestUpdateJobStatusFailed(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "test-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "failed", "OOM killed")
	require.NoError(t, err)

	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobId)
	require.NoError(t, err)
	var job types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &job))
	require.Equal(t, "failed", job.Status)
	require.Equal(t, "OOM killed", job.ErrorMessage)
}

// ---------------------------------------------------------------------------
// UpdateGPUMetrics tests
// ---------------------------------------------------------------------------

func TestUpdateGPUMetricsSuccess(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	metrics := types.GPUMetrics{
		UtilizationGPU: 85,
		UtilizationMem: 60,
		Temperature:    72,
		PowerDrawWatts: 280,
		MemoryUsedMb:   65536,
		MemoryTotalMb:  81920,
		IsHealthy:      true,
	}
	err = f.keeper.UpdateGPUMetrics(f.ctx, resourceId, owner, metrics)
	require.NoError(t, err)

	// Verify metrics stored
	metricsJSON, err := f.keeper.GPUMetrics.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var stored types.GPUMetrics
	require.NoError(t, json.Unmarshal([]byte(metricsJSON), &stored))
	require.Equal(t, uint8(85), stored.UtilizationGPU)
	require.True(t, stored.IsHealthy)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), stored.UpdatedAt)

	// Verify resource provider status updated
	resJSON, err := f.keeper.ComputeResources.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var res types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(resJSON), &res))
	require.Equal(t, "idle", res.ProviderStatus)
}

func TestUpdateGPUMetricsNotOwner(t *testing.T) {
	f := initFixture(t)
	resourceId, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), testResource())
	require.NoError(t, err)

	err = f.keeper.UpdateGPUMetrics(f.ctx, resourceId, lesseeAddr(), types.GPUMetrics{IsHealthy: true})
	require.Error(t, err)
}

func TestUpdateGPUMetricsUnhealthySetsOffline(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	metrics := types.GPUMetrics{
		IsHealthy: false,
	}
	err = f.keeper.UpdateGPUMetrics(f.ctx, resourceId, owner, metrics)
	require.NoError(t, err)

	resJSON, err := f.keeper.ComputeResources.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var res types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(resJSON), &res))
	require.Equal(t, "offline", res.ProviderStatus)
}

// ---------------------------------------------------------------------------
// QueryComputeJobs tests
// ---------------------------------------------------------------------------

func TestQueryComputeJobsBySubmitter(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	_, err = f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "job1"})
	require.NoError(t, err)
	_, err = f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "job2"})
	require.NoError(t, err)

	jobs, err := f.keeper.QueryComputeJobs(f.ctx, lessee, 0)
	require.NoError(t, err)
	require.Len(t, jobs, 2)
}

// ---------------------------------------------------------------------------
// ProviderStats tests
// ---------------------------------------------------------------------------

func TestProviderStatsTracking(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	jobId, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceId, leaseId, types.ComputeJob{Name: "tracked-job"})
	require.NoError(t, err)

	err = f.keeper.UpdateGPUMetrics(f.ctx, resourceId, owner, types.GPUMetrics{IsHealthy: true})
	require.NoError(t, err)

	// Provider stats should show 1 total job
	stats, err := f.keeper.QueryProviderStats(f.ctx, owner)
	require.NoError(t, err)
	require.Equal(t, uint64(1), stats.TotalJobs)

	// Complete the job
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "running", "")
	require.NoError(t, err)
	cr := computeChallengeResponse(t, f, jobId, "done")
	err = f.keeper.UpdateJobStatus(f.ctx, jobId, owner, "completed", "done", cr)
	require.NoError(t, err)

	stats, err = f.keeper.QueryProviderStats(f.ctx, owner)
	require.NoError(t, err)
	require.Equal(t, uint64(1), stats.CompletedJobs)
	require.Equal(t, sdk.UnwrapSDKContext(f.ctx).BlockTime().Unix(), stats.LastHeartbeat)
}
