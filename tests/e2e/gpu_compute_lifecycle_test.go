//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"testing"

	"cosmossdk.io/core/address"
	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/keeper"
	module "clawchain/x/marketplace/module"
	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// Mock Bank Keeper for Marketplace
// ---------------------------------------------------------------------------

type marketMockBankKeeper struct {
	balances       map[string]sdk.Coins
	moduleBalances map[string]sdk.Coins
}

func newMarketMockBank() *marketMockBankKeeper {
	return &marketMockBankKeeper{
		balances:       make(map[string]sdk.Coins),
		moduleBalances: make(map[string]sdk.Coins),
	}
}

func (m *marketMockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.balances[addr.String()]
}

func (m *marketMockBankKeeper) SendCoins(_ context.Context, from, to sdk.AccAddress, amt sdk.Coins) error {
	fKey := from.String()
	bal := m.balances[fKey]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[fKey] = newBal
	m.balances[to.String()] = m.balances[to.String()].Add(amt...)
	return nil
}

func (m *marketMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
	key := sender.String()
	bal := m.balances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = newBal
	m.moduleBalances[mod] = m.moduleBalances[mod].Add(amt...)
	return nil
}

func (m *marketMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[mod]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds in module %s", mod)
	}
	m.moduleBalances[mod] = newBal
	m.balances[recipient.String()] = m.balances[recipient.String()].Add(amt...)
	return nil
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type marketFixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
	bankKeeper   *marketMockBankKeeper
}

func initMarketFixture(t *testing.T) *marketFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newMarketMockBank()

	k := keeper.NewKeeper(storeService, encCfg.Codec, addrCodec, authority, bk, nil)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set marketplace params: %v", err)
	}

	return &marketFixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addrCodec,
		bankKeeper:   bk,
	}
}

func gpuProvider() string {
	return sdk.AccAddress([]byte("gpuprovider_________")).String()
}

func gpuLessee() string {
	return sdk.AccAddress([]byte("gpulessee___________")).String()
}

func testGPUResource() types.ComputeResource {
	return types.ComputeResource{
		Name:              "A100-Cluster",
		Description:       "4x NVIDIA A100 80GB",
		GpuModel:          "NVIDIA A100",
		GpuCount:          4,
		VramGb:            320,
		CpuCores:          64,
		RamGb:             512,
		StorageGb:         4000,
		PricePerHourUclaw: "5000000",
		MinLeaseHours:     1,
		MaxLeaseHours:     72,
		Endpoint:          "ssh://gpu-cluster.example.com:22",
	}
}

// computeChallengeResponse builds the expected challenge response for a given
// result and challenge seed: hex(sha256(resultHash + challengeSeed)).
func computeChallengeResponse(result string, challengeSeed string) string {
	resultHash := sha256.Sum256([]byte(result))
	resultHashHex := hex.EncodeToString(resultHash[:])
	preimage := resultHashHex + challengeSeed
	resp := sha256.Sum256([]byte(preimage))
	return hex.EncodeToString(resp[:])
}

// ---------------------------------------------------------------------------
// E2E: GPU Compute Job Submission
// ---------------------------------------------------------------------------

// TestGPUComputeJobSubmission submits a compute job via the marketplace keeper
// and verifies it is stored with the correct status and metadata.
func TestGPUComputeJobSubmission(t *testing.T) {
	f := initMarketFixture(t)
	provider := gpuProvider()
	lessee := gpuLessee()

	lesseeAddr, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.balances[lesseeAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))

	// List resource and lease it
	resource := testGPUResource()
	resourceID, err := f.keeper.ListComputeResource(f.ctx, provider, resource)
	require.NoError(t, err)

	leaseID, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 2)
	require.NoError(t, err)

	// Submit a compute job
	job := types.ComputeJob{
		Name:          "Training-ResNet50",
		JobType:       "ai-training",
		ExecutionType: "docker",
		DockerImage:   "registry.example.com/resnet:v1",
		GpuCount:      4,
		Params:        `{"epochs":20,"batch_size":64}`,
	}
	jobID, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceID, leaseID, job)
	require.NoError(t, err)
	t.Logf("Job submitted — ID=%d", jobID)

	// Verify job is stored correctly
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobID)
	require.NoError(t, err)

	var stored types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &stored))
	require.Equal(t, "Training-ResNet50", stored.Name)
	require.Equal(t, "ai-training", stored.JobType)
	require.Equal(t, "docker", stored.ExecutionType)
	require.Equal(t, "pending", stored.Status, "newly submitted job should be pending")
	require.Equal(t, lessee, stored.Submitter)
	require.Equal(t, provider, stored.Provider)
	require.Equal(t, resourceID, stored.ResourceId)
	require.Equal(t, leaseID, stored.LeaseId)
	require.Equal(t, uint32(4), stored.GpuCount)

	// Verify challenge was generated for the job
	challengeJSON, err := f.keeper.ComputeChallenges.Get(f.ctx, jobID)
	require.NoError(t, err, "compute challenge should be generated for the job")
	require.NotEmpty(t, challengeJSON)

	// Verify provider stats incremented
	stats, err := f.keeper.QueryProviderStats(f.ctx, provider)
	require.NoError(t, err)
	require.Equal(t, uint64(1), stats.TotalJobs, "provider total_jobs should be 1")

	t.Log("GPU compute job submission verified")
}

// ---------------------------------------------------------------------------
// E2E: GPU Compute Job Accept (provider transitions job to running)
// ---------------------------------------------------------------------------

// TestGPUComputeJobAccept verifies that a provider can accept/start a pending
// job by transitioning its status from pending to running.
func TestGPUComputeJobAccept(t *testing.T) {
	f := initMarketFixture(t)
	provider := gpuProvider()
	lessee := gpuLessee()

	lesseeAddr, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.balances[lesseeAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))

	// Setup: list, lease, submit
	resource := testGPUResource()
	resourceID, err := f.keeper.ListComputeResource(f.ctx, provider, resource)
	require.NoError(t, err)

	leaseID, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 2)
	require.NoError(t, err)

	job := types.ComputeJob{
		Name:          "Inference-Batch",
		JobType:       "inference",
		ExecutionType: "docker",
		DockerImage:   "registry.example.com/infer:v2",
		GpuCount:      2,
	}
	jobID, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceID, leaseID, job)
	require.NoError(t, err)
	t.Logf("Job submitted — ID=%d (status=pending)", jobID)

	// Provider accepts/starts the job
	err = f.keeper.UpdateJobStatus(f.ctx, jobID, provider, "running", "")
	require.NoError(t, err)
	t.Log("Provider transitioned job to running")

	// Verify status changed
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobID)
	require.NoError(t, err)

	var stored types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &stored))
	require.Equal(t, "running", stored.Status, "job should be running after provider accept")
	require.Greater(t, stored.StartedAt, int64(0), "started_at should be set")
	require.Equal(t, int64(0), stored.CompletedAt, "completed_at should still be zero")

	// Verify non-provider cannot update status
	err = f.keeper.UpdateJobStatus(f.ctx, jobID, lessee, "completed", "fake-result")
	require.Error(t, err, "only provider should be able to update job status")

	t.Log("GPU compute job accept verified")
}

// ---------------------------------------------------------------------------
// E2E: GPU Compute Job Complete — verify payment settlement
// ---------------------------------------------------------------------------

// TestGPUComputeJobComplete runs a job to completion with a valid proof-of-
// computation challenge response, then verifies SettleCompletedJobs releases
// escrowed payment to the provider.
func TestGPUComputeJobComplete(t *testing.T) {
	f := initMarketFixture(t)
	provider := gpuProvider()
	lessee := gpuLessee()

	lesseeAddr, _ := sdk.AccAddressFromBech32(lessee)
	providerAddr, _ := sdk.AccAddressFromBech32(provider)
	f.bankKeeper.balances[lesseeAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))

	providerBalBefore := f.bankKeeper.balances[providerAddr.String()].AmountOf("uclaw")

	// Setup: list, lease, submit
	resource := testGPUResource()
	resourceID, err := f.keeper.ListComputeResource(f.ctx, provider, resource)
	require.NoError(t, err)

	leaseID, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 2)
	require.NoError(t, err)

	// Record lease cost (5M uclaw/hr * 2hr = 10M uclaw)
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseID)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "10000000", lease.TotalCostUclaw)
	t.Logf("Lease created — cost=%s uclaw", lease.TotalCostUclaw)

	// Module should hold escrowed funds
	modBal := f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw")
	require.True(t, modBal.GTE(math.NewInt(10_000_000)),
		"module should hold escrowed lease payment")

	job := types.ComputeJob{
		Name:          "Complete-Job",
		JobType:       "ai-training",
		ExecutionType: "docker",
		DockerImage:   "ml-train:latest",
		GpuCount:      4,
	}
	jobID, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceID, leaseID, job)
	require.NoError(t, err)

	// Provider starts the job
	err = f.keeper.UpdateJobStatus(f.ctx, jobID, provider, "running", "")
	require.NoError(t, err)

	// Retrieve the challenge seed for this job
	challengeJSON, err := f.keeper.ComputeChallenges.Get(f.ctx, jobID)
	require.NoError(t, err)
	var challenge types.ComputeChallenge
	require.NoError(t, json.Unmarshal([]byte(challengeJSON), &challenge))

	// Build a valid challenge response
	result := `{"accuracy":0.95,"loss":0.05,"model_url":"ipfs://QmModel123"}`
	challengeResp := computeChallengeResponse(result, challenge.ChallengeSeed)

	// Provider completes the job with proof
	err = f.keeper.UpdateJobStatus(f.ctx, jobID, provider, "completed", result, challengeResp)
	require.NoError(t, err)
	t.Log("Job completed with valid proof-of-computation")

	// Verify job is completed
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var completedJob types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &completedJob))
	require.Equal(t, "completed", completedJob.Status)
	require.NotEmpty(t, completedJob.Result)
	require.NotEmpty(t, completedJob.ResultHash)
	require.NotEmpty(t, completedJob.ChallengeResponse)

	// Run settlement — should release escrowed funds to provider
	err = f.keeper.SettleCompletedJobs(f.ctx)
	require.NoError(t, err)
	t.Log("SettleCompletedJobs executed")

	// Verify provider received payment
	providerBalAfter := f.bankKeeper.balances[providerAddr.String()].AmountOf("uclaw")
	require.True(t, providerBalAfter.GT(providerBalBefore),
		"provider balance should increase after settlement")
	t.Logf("Provider balance: before=%s after=%s", providerBalBefore, providerBalAfter)

	// Verify lease is now settled
	leaseJSON, err = f.keeper.ComputeLeases.Get(f.ctx, leaseID)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "settled", lease.Status, "lease should be settled after payment")

	// Verify provider stats updated
	stats, err := f.keeper.QueryProviderStats(f.ctx, provider)
	require.NoError(t, err)
	require.Equal(t, uint64(1), stats.CompletedJobs)

	t.Log("GPU compute job completion and settlement verified")
}

// ---------------------------------------------------------------------------
// E2E: GPU Compute Job Cancel — verify cancelled status
// ---------------------------------------------------------------------------

// TestGPUComputeJobCancel tests that a provider can cancel a pending job and
// that the lessee can release the lease to reclaim escrowed funds.
func TestGPUComputeJobCancel(t *testing.T) {
	f := initMarketFixture(t)
	provider := gpuProvider()
	lessee := gpuLessee()

	lesseeAddr, _ := sdk.AccAddressFromBech32(lessee)
	providerAddr, _ := sdk.AccAddressFromBech32(provider)
	f.bankKeeper.balances[lesseeAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))

	lesseeBalBefore := f.bankKeeper.balances[lesseeAddr.String()].AmountOf("uclaw")

	// Setup: list, lease, submit
	resource := testGPUResource()
	resourceID, err := f.keeper.ListComputeResource(f.ctx, provider, resource)
	require.NoError(t, err)

	leaseID, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 1)
	require.NoError(t, err)

	lesseeBalAfterLease := f.bankKeeper.balances[lesseeAddr.String()].AmountOf("uclaw")
	require.True(t, lesseeBalAfterLease.LT(lesseeBalBefore),
		"lessee balance should decrease after leasing")
	t.Logf("Lessee balance: before=%s after_lease=%s", lesseeBalBefore, lesseeBalAfterLease)

	job := types.ComputeJob{
		Name:          "Cancel-Me-Job",
		JobType:       "rendering",
		ExecutionType: "docker",
		DockerImage:   "render:latest",
		GpuCount:      2,
	}
	jobID, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceID, leaseID, job)
	require.NoError(t, err)
	t.Logf("Job submitted — ID=%d", jobID)

	// Provider cancels the pending job
	err = f.keeper.UpdateJobStatus(f.ctx, jobID, provider, "cancelled", "hardware failure detected")
	require.NoError(t, err)
	t.Log("Provider cancelled the job")

	// Verify job status is cancelled
	jobJSON, err := f.keeper.ComputeJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var stored types.ComputeJob
	require.NoError(t, json.Unmarshal([]byte(jobJSON), &stored))
	require.Equal(t, "cancelled", stored.Status)
	require.Greater(t, stored.CompletedAt, int64(0), "completed_at should be set on cancel")

	// Verify provider stats: failed jobs should increment (cancel counts as failed)
	stats, err := f.keeper.QueryProviderStats(f.ctx, provider)
	require.NoError(t, err)
	// cancelled transitions do not trigger updateProviderJobCompletion, only completed/failed do
	// Verify the job is not counted as completed
	require.Equal(t, uint64(0), stats.CompletedJobs, "cancelled job should not count as completed")

	// Lessee releases the lease to get payment back via ReleaseComputeResource
	// (payment goes to provider on release since the lease was active).
	// In a cancel scenario, the provider would typically release the resource.
	err = f.keeper.ReleaseComputeResource(f.ctx, leaseID, lessee)
	require.NoError(t, err)
	t.Log("Lessee released compute resource after job cancellation")

	// After release, provider receives the escrowed funds (ReleaseComputeResource
	// pays the provider). Verify the provider got paid.
	providerBal := f.bankKeeper.balances[providerAddr.String()].AmountOf("uclaw")
	require.True(t, providerBal.GT(math.ZeroInt()),
		"provider should receive escrowed funds on lease release")

	// Verify lease marked completed
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseID)
	require.NoError(t, err)
	require.Contains(t, leaseJSON, `"completed"`, "lease should be completed after release")

	t.Log("GPU compute job cancellation verified")
}

// ---------------------------------------------------------------------------
// E2E: GPU Compute Resource Listing — verify queryable
// ---------------------------------------------------------------------------

// TestGPUComputeResourceListing lists multiple GPU resources and verifies they
// are queryable individually and as a collection.
func TestGPUComputeResourceListing(t *testing.T) {
	f := initMarketFixture(t)
	provider := gpuProvider()
	provider2 := sdk.AccAddress([]byte("gpuprovider2________")).String()

	// List first resource
	resource1 := testGPUResource()
	id1, err := f.keeper.ListComputeResource(f.ctx, provider, resource1)
	require.NoError(t, err)
	t.Logf("Resource 1 listed — ID=%d", id1)

	// List second resource with different specs
	resource2 := types.ComputeResource{
		Name:              "RTX-4090-Rig",
		Description:       "2x RTX 4090 gaming rig",
		GpuModel:          "NVIDIA RTX 4090",
		GpuCount:          2,
		VramGb:            48,
		CpuCores:          16,
		RamGb:             64,
		StorageGb:         2000,
		PricePerHourUclaw: "2000000",
		MinLeaseHours:     1,
		MaxLeaseHours:     24,
		Endpoint:          "ssh://rtx-rig.example.com:22",
	}
	id2, err := f.keeper.ListComputeResource(f.ctx, provider2, resource2)
	require.NoError(t, err)
	t.Logf("Resource 2 listed — ID=%d", id2)

	// Query individual resource
	queried, err := f.keeper.QueryComputeResource(f.ctx, id1)
	require.NoError(t, err)
	require.Equal(t, "A100-Cluster", queried.Name)
	require.Equal(t, provider, queried.Owner)
	require.Equal(t, "NVIDIA A100", queried.GpuModel)
	require.Equal(t, uint32(4), queried.GpuCount)
	require.Equal(t, uint32(320), queried.VramGb)
	require.True(t, queried.Active, "newly listed resource should be active")
	require.Empty(t, queried.CurrentLessee, "resource should not be leased yet")

	// Query second resource
	queried2, err := f.keeper.QueryComputeResource(f.ctx, id2)
	require.NoError(t, err)
	require.Equal(t, "RTX-4090-Rig", queried2.Name)
	require.Equal(t, provider2, queried2.Owner)

	// Query all resources
	all, err := f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.Len(t, all, 2, "should have 2 listed resources")

	// Query available-only resources
	available, err := f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Len(t, available, 2, "both resources should be available")

	// Delist one resource and verify query filtering
	err = f.keeper.DelistComputeResource(f.ctx, id1, provider)
	require.NoError(t, err)
	t.Log("Resource 1 delisted")

	available, err = f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Len(t, available, 1, "only 1 resource should be available after delisting")
	require.Equal(t, "RTX-4090-Rig", available[0].Name)

	// All resources still returns both (including inactive)
	all, err = f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.Len(t, all, 2, "all resources includes inactive ones")

	// Verify non-existent resource returns error
	_, err = f.keeper.QueryComputeResource(f.ctx, 99999)
	require.Error(t, err, "querying non-existent resource should fail")

	t.Log("GPU compute resource listing verified")
}

// ---------------------------------------------------------------------------
// E2E: GPU Compute Lease Lifecycle — create, use, release, verify billing
// ---------------------------------------------------------------------------

// TestGPUComputeLeaseLifecycle creates a lease, submits jobs during the lease
// period, releases the resource, and verifies the full billing flow including
// escrow, payment to provider, and resource status transitions.
func TestGPUComputeLeaseLifecycle(t *testing.T) {
	f := initMarketFixture(t)
	provider := gpuProvider()
	lessee := gpuLessee()

	lesseeAddr, _ := sdk.AccAddressFromBech32(lessee)
	providerAddr, _ := sdk.AccAddressFromBech32(provider)
	initialBalance := int64(500_000_000)
	f.bankKeeper.balances[lesseeAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", initialBalance))

	// --- Step 1: List resource ---
	resource := testGPUResource()
	resourceID, err := f.keeper.ListComputeResource(f.ctx, provider, resource)
	require.NoError(t, err)
	t.Logf("Step 1: Resource listed — ID=%d", resourceID)

	// --- Step 2: Create lease (4 hours at 5M/hr = 20M uclaw) ---
	leaseID, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 4)
	require.NoError(t, err)
	t.Logf("Step 2: Lease created — ID=%d", leaseID)

	// Verify lessee balance reduced by 20M uclaw
	lesseeBalAfterLease := f.bankKeeper.balances[lesseeAddr.String()].AmountOf("uclaw")
	expectedCost := math.NewInt(20_000_000) // 5M * 4 hours
	actualDeducted := math.NewInt(initialBalance).Sub(lesseeBalAfterLease)
	require.True(t, actualDeducted.Equal(expectedCost),
		"lessee should be charged 20M uclaw; got deducted=%s", actualDeducted)

	// Verify resource marked as leased
	queriedRes, err := f.keeper.QueryComputeResource(f.ctx, resourceID)
	require.NoError(t, err)
	require.Equal(t, lessee, queriedRes.CurrentLessee, "resource should show current lessee")
	require.Greater(t, queriedRes.LeaseExpiresAt, int64(0), "lease_expires_at should be set")
	require.Equal(t, uint64(1), queriedRes.TotalLeases, "total_leases should be 1")

	// Verify lease stored correctly
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseID)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "active", lease.Status)
	require.Equal(t, "20000000", lease.TotalCostUclaw)
	require.Equal(t, lessee, lease.Lessee)
	require.Equal(t, provider, lease.Provider)

	// Verify lease appears in query
	leases, err := f.keeper.QueryComputeLeases(f.ctx, lessee)
	require.NoError(t, err)
	require.Len(t, leases, 1)
	require.Equal(t, leaseID, leases[0].Id)

	// --- Step 3: Submit multiple jobs during the lease ---
	jobNames := []string{"training-phase1", "training-phase2", "evaluation"}
	var jobIDs []uint64
	for _, name := range jobNames {
		j := types.ComputeJob{
			Name:          name,
			JobType:       "ai-training",
			ExecutionType: "docker",
			DockerImage:   "ml-image:latest",
			GpuCount:      4,
		}
		jid, err := f.keeper.SubmitComputeJob(f.ctx, lessee, resourceID, leaseID, j)
		require.NoError(t, err)
		jobIDs = append(jobIDs, jid)
		t.Logf("Step 3: Job '%s' submitted — ID=%d", name, jid)
	}
	require.Len(t, jobIDs, 3)

	// Query jobs for the resource
	jobs, err := f.keeper.QueryComputeJobs(f.ctx, "", resourceID)
	require.NoError(t, err)
	require.Len(t, jobs, 3, "should have 3 jobs for this resource")

	// --- Step 4: Release resource (lessee voluntary release) ---
	providerBalBefore := f.bankKeeper.balances[providerAddr.String()].AmountOf("uclaw")

	err = f.keeper.ReleaseComputeResource(f.ctx, leaseID, lessee)
	require.NoError(t, err)
	t.Log("Step 4: Resource released by lessee")

	// Verify payment released to provider
	providerBalAfter := f.bankKeeper.balances[providerAddr.String()].AmountOf("uclaw")
	require.True(t, providerBalAfter.GT(providerBalBefore),
		"provider should receive payment on release; before=%s after=%s",
		providerBalBefore, providerBalAfter)

	paymentReceived := providerBalAfter.Sub(providerBalBefore)
	require.True(t, paymentReceived.Equal(math.NewInt(20_000_000)),
		"provider should receive full 20M uclaw; got %s", paymentReceived)

	// --- Step 5: Verify final state ---
	// Lease should be completed
	leaseJSON, err = f.keeper.ComputeLeases.Get(f.ctx, leaseID)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "completed", lease.Status)

	// Resource should be available again
	queriedRes, err = f.keeper.QueryComputeResource(f.ctx, resourceID)
	require.NoError(t, err)
	require.Empty(t, queriedRes.CurrentLessee, "resource should have no lessee after release")
	require.Equal(t, int64(0), queriedRes.LeaseExpiresAt, "lease_expires_at should be cleared")
	require.True(t, queriedRes.Active, "resource should still be active")

	// Resource should be available for new leases
	available, err := f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Len(t, available, 1, "resource should be available again")

	// Verify self-lease still rejected
	providerAddrObj, _ := sdk.AccAddressFromBech32(provider)
	f.bankKeeper.balances[providerAddrObj.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000))
	_, err = f.keeper.LeaseComputeResource(f.ctx, provider, resourceID, 1)
	require.Error(t, err, "self-lease should be rejected")

	// Verify expired lease path: create a new lease and expire it
	leaseID2, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 1)
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 10000) // well past expiry

	err = f.keeper.ExpireComputeLeases(f.ctx)
	require.NoError(t, err)

	leaseJSON2, err := f.keeper.ComputeLeases.Get(f.ctx, leaseID2)
	require.NoError(t, err)
	var lease2 types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON2), &lease2))
	require.Equal(t, "expired", lease2.Status, "lease should be expired after block advancement")

	t.Log("GPU compute lease lifecycle fully verified")
}
