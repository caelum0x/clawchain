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

func providerAddr() string {
	return sdk.AccAddress([]byte("provider1___________")).String()
}

func lesseeAddr() string {
	return sdk.AccAddress([]byte("lessee1_____________")).String()
}

// computeChallengeResponse computes the expected challenge response for a
// completed job: hex(sha256(resultHash + challengeSeed)).
func computeChallengeResponse(t *testing.T, f *fixture, jobId uint64, result string) string {
	t.Helper()
	// Compute resultHash the same way UpdateJobStatus does
	rh := sha256.Sum256([]byte(result))
	resultHash := hex.EncodeToString(rh[:])

	// Look up the stored challenge seed
	challengeJSON, err := f.keeper.ComputeChallenges.Get(f.ctx, jobId)
	if err != nil {
		t.Fatalf("challenge not found for job %d: %v", jobId, err)
	}
	var ch types.ComputeChallenge
	if err := json.Unmarshal([]byte(challengeJSON), &ch); err != nil {
		t.Fatalf("failed to unmarshal challenge: %v", err)
	}

	expected := sha256.Sum256([]byte(resultHash + ch.ChallengeSeed))
	return hex.EncodeToString(expected[:])
}

func testResource() types.ComputeResource {
	return types.ComputeResource{
		Name:              "TestGPU",
		Description:       "A test GPU resource",
		GpuModel:          "NVIDIA A100",
		GpuCount:          1,
		VramGb:            80,
		CpuCores:          16,
		RamGb:             128,
		StorageGb:         1000,
		PricePerHourUclaw: "1000000",
		MinLeaseHours:     1,
		MaxLeaseHours:     24,
		Endpoint:          "ssh://provider.example.com:22",
	}
}

// ---------------------------------------------------------------------------
// ListComputeResource tests
// ---------------------------------------------------------------------------

func TestListComputeResourceSuccess(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	resource := testResource()

	id, err := f.keeper.ListComputeResource(f.ctx, owner, resource)
	require.NoError(t, err)
	require.Equal(t, uint64(0), id)

	// Verify resource stored
	raw, err := f.keeper.ComputeResources.Get(f.ctx, id)
	require.NoError(t, err)

	var stored types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	require.Equal(t, "TestGPU", stored.Name)
	require.Equal(t, owner, stored.Owner)
	require.True(t, stored.Active)
	require.Equal(t, "", stored.CurrentLessee)
	require.Equal(t, "0", stored.TotalRevenue)
	require.Equal(t, sdkCtx.BlockTime().Unix(), stored.Timestamp)
}

func TestListComputeResourceEmptyName(t *testing.T) {
	f := initFixture(t)
	resource := testResource()
	resource.Name = ""

	_, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), resource)
	require.Error(t, err)
}

func TestListComputeResourceInvalidGpu(t *testing.T) {
	f := initFixture(t)
	resource := testResource()
	resource.GpuModel = ""
	resource.GpuCount = 0

	_, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), resource)
	require.Error(t, err)
}

func TestListComputeResourceEmptyEndpoint(t *testing.T) {
	f := initFixture(t)
	resource := testResource()
	resource.Endpoint = ""

	_, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), resource)
	require.Error(t, err)
}

func TestListComputeResourceInvalidPrice(t *testing.T) {
	f := initFixture(t)
	resource := testResource()
	resource.PricePerHourUclaw = "0"

	_, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), resource)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// LeaseComputeResource tests
// ---------------------------------------------------------------------------

func TestLeaseComputeResourceSuccess(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()
	resource := testResource()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, resource)
	require.NoError(t, err)

	// Fund lessee: 2 hours * 1000000 uclaw/hr = 2000000 uclaw
	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 2)
	require.NoError(t, err)

	// Verify lease created
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)

	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "active", lease.Status)
	require.Equal(t, lessee, lease.Lessee)
	require.Equal(t, owner, lease.Provider)
	require.Equal(t, "2000000", lease.TotalCostUclaw)

	// Verify resource is marked as leased
	resJSON, err := f.keeper.ComputeResources.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var storedRes types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(resJSON), &storedRes))
	require.Equal(t, lessee, storedRes.CurrentLessee)

	// Verify payment was escrowed
	modBal := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, modBal.AmountOf("uclaw").Equal(math.NewInt(2_000_000)))
}

func TestLeaseComputeResourceAlreadyLeased(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()
	lessee2 := sdk.AccAddress([]byte("lessee2_____________")).String()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	// Fund both lessees
	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	lessee2Acc, _ := sdk.AccAddressFromBech32(lessee2)
	f.bankKeeper.FundAccount(lessee2Acc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err = f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	// Second lease should fail
	_, err = f.keeper.LeaseComputeResource(f.ctx, lessee2, resourceId, 1)
	require.Error(t, err)
}

func TestLeaseComputeResourceSelfLease(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	ownerAcc, _ := sdk.AccAddressFromBech32(owner)
	f.bankKeeper.FundAccount(ownerAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err = f.keeper.LeaseComputeResource(f.ctx, owner, resourceId, 1)
	require.Error(t, err)
}

func TestLeaseComputeResourceBelowMinHours(t *testing.T) {
	f := initFixture(t)
	resource := testResource()
	resource.MinLeaseHours = 2

	resourceId, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), resource)
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lesseeAddr())
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err = f.keeper.LeaseComputeResource(f.ctx, lesseeAddr(), resourceId, 1) // below min
	require.Error(t, err)
}

func TestLeaseComputeResourceInsufficientFunds(t *testing.T) {
	f := initFixture(t)
	resourceId, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), testResource())
	require.NoError(t, err)

	// No funds for lessee
	_, err = f.keeper.LeaseComputeResource(f.ctx, lesseeAddr(), resourceId, 1)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// ReleaseComputeResource tests
// ---------------------------------------------------------------------------

func TestReleaseComputeResourceByLessee(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	err = f.keeper.ReleaseComputeResource(f.ctx, leaseId, lessee)
	require.NoError(t, err)

	// Verify lease completed
	leaseJSON, err := f.keeper.ComputeLeases.Get(f.ctx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "completed", lease.Status)

	// Verify resource is available again
	resJSON, err := f.keeper.ComputeResources.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var res types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(resJSON), &res))
	require.Equal(t, "", res.CurrentLessee)
}

func TestReleaseComputeResourceUnauthorized(t *testing.T) {
	f := initFixture(t)
	resourceId, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lesseeAddr())
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lesseeAddr(), resourceId, 1)
	require.NoError(t, err)

	// Random address can't release
	rando := sdk.AccAddress([]byte("random1_____________")).String()
	err = f.keeper.ReleaseComputeResource(f.ctx, leaseId, rando)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// DelistComputeResource tests
// ---------------------------------------------------------------------------

func TestDelistComputeResourceSuccess(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	err = f.keeper.DelistComputeResource(f.ctx, resourceId, owner)
	require.NoError(t, err)

	raw, err := f.keeper.ComputeResources.Get(f.ctx, resourceId)
	require.NoError(t, err)
	var res types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(raw), &res))
	require.False(t, res.Active)
}

func TestDelistComputeResourceNotOwner(t *testing.T) {
	f := initFixture(t)
	resourceId, err := f.keeper.ListComputeResource(f.ctx, providerAddr(), testResource())
	require.NoError(t, err)

	err = f.keeper.DelistComputeResource(f.ctx, resourceId, lesseeAddr())
	require.Error(t, err)
}

func TestDelistComputeResourceWhileLeased(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lesseeAddr())
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	_, err = f.keeper.LeaseComputeResource(f.ctx, lesseeAddr(), resourceId, 1)
	require.NoError(t, err)

	// Cannot delist while leased
	err = f.keeper.DelistComputeResource(f.ctx, resourceId, owner)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// ExpireComputeLeases tests
// ---------------------------------------------------------------------------

func TestExpireComputeLeases(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	lessee := lesseeAddr()

	resourceId, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	lesseeAcc, _ := sdk.AccAddressFromBech32(lessee)
	f.bankKeeper.FundAccount(lesseeAcc, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	leaseId, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceId, 1)
	require.NoError(t, err)

	// Advance block height past lease expiry (600 blocks per hour + some)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	newCtx := sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 700)

	err = f.keeper.ExpireComputeLeases(newCtx)
	require.NoError(t, err)

	// Verify lease expired
	leaseJSON, err := f.keeper.ComputeLeases.Get(newCtx, leaseId)
	require.NoError(t, err)
	var lease types.ComputeLease
	require.NoError(t, json.Unmarshal([]byte(leaseJSON), &lease))
	require.Equal(t, "expired", lease.Status)

	// Verify resource is available again
	resJSON, err := f.keeper.ComputeResources.Get(newCtx, resourceId)
	require.NoError(t, err)
	var res types.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(resJSON), &res))
	require.Equal(t, "", res.CurrentLessee)
}
