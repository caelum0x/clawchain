package keeper_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/keeper"
	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// Compute gRPC query coverage
// ---------------------------------------------------------------------------

func TestComputeResources_Empty(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qSrv.ComputeResources(f.ctx, &types.QueryComputeResourcesRequest{})
	require.NoError(t, err)
	require.Empty(t, resp.Resources)
}

func TestComputeResources_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeResources(f.ctx, nil)
	require.Error(t, err)
}

func TestComputeResource_NotFound(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeResource(f.ctx, &types.QueryComputeResourceRequest{Id: 999})
	require.Error(t, err)
}

func TestComputeResource_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeResource(f.ctx, nil)
	require.Error(t, err)
}

func TestComputeJobs_Empty(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qSrv.ComputeJobs(f.ctx, &types.QueryComputeJobsRequest{})
	require.NoError(t, err)
	require.Empty(t, resp.Jobs)
}

func TestComputeJobs_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeJobs(f.ctx, nil)
	require.Error(t, err)
}

func TestComputeLeases_Empty(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qSrv.ComputeLeases(f.ctx, &types.QueryComputeLeasesRequest{})
	require.NoError(t, err)
	require.Empty(t, resp.Leases)
}

func TestComputeLeases_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeLeases(f.ctx, nil)
	require.Error(t, err)
}

func TestComputeLeasesForAddress_Empty(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qSrv.ComputeLeasesForAddress(f.ctx, &types.QueryComputeLeasesForAddressRequest{
		Address: validAddress(),
	})
	require.NoError(t, err)
	require.Empty(t, resp.Leases)
}

func TestComputeLeasesForAddress_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeLeasesForAddress(f.ctx, &types.QueryComputeLeasesForAddressRequest{
		Address: "",
	})
	require.Error(t, err)
}

func TestComputeLeasesForAddress_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ComputeLeasesForAddress(f.ctx, nil)
	require.Error(t, err)
}

func TestProviderStats_NotFound(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ProviderStats(f.ctx, &types.QueryProviderStatsRequest{
		Address: validAddress(),
	})
	require.Error(t, err)
}

func TestProviderStats_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ProviderStats(f.ctx, &types.QueryProviderStatsRequest{Address: ""})
	require.Error(t, err)
}

func TestProviderStats_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	_, err := qSrv.ProviderStats(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Keeper compute query methods
// ---------------------------------------------------------------------------

func TestQueryComputeResources_Empty(t *testing.T) {
	f := initFixture(t)

	resources, err := f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.Empty(t, resources)
}

func TestQueryComputeResource_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.QueryComputeResource(f.ctx, 999)
	require.Error(t, err)
}

func TestQueryComputeResource_Success(t *testing.T) {
	f := initFixture(t)
	owner := providerAddr()
	resourceID, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	resource, err := f.keeper.QueryComputeResource(f.ctx, resourceID)
	require.NoError(t, err)
	require.EqualValues(t, resourceID, resource.Id)
	require.Equal(t, owner, resource.Owner)
}

func TestQueryComputeLeases_Empty(t *testing.T) {
	f := initFixture(t)

	leases, err := f.keeper.QueryComputeLeases(f.ctx, "")
	require.NoError(t, err)
	require.Empty(t, leases)
}

func TestQueryComputeResources_FilteringAndMalformed(t *testing.T) {
	f := initFixture(t)

	owner := providerAddr()
	lessee := lesseeAddr()
	fundAccount(f, lessee, 10_000_000)

	resourceID, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)

	// Add one malformed row to exercise the unmarshal-skip branch.
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 9999, "{bad-json"))

	all, err := f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.NotEmpty(t, all)

	available, err := f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Len(t, available, 1)
	require.Equal(t, resourceID, available[0].Id)

	_, err = f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 1)
	require.NoError(t, err)

	available, err = f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Empty(t, available)
}

func TestQueryComputeLeases_FilterByAddressAndMalformed(t *testing.T) {
	f := initFixture(t)

	owner := providerAddr()
	lessee := lesseeAddr()
	fundAccount(f, lessee, 10_000_000)
	resourceID, err := f.keeper.ListComputeResource(f.ctx, owner, testResource())
	require.NoError(t, err)
	leaseID, err := f.keeper.LeaseComputeResource(f.ctx, lessee, resourceID, 1)
	require.NoError(t, err)
	require.GreaterOrEqual(t, leaseID, uint64(0))

	// Add malformed lease record to exercise skip behavior.
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 9999, "{bad-json"))

	all, err := f.keeper.QueryComputeLeases(f.ctx, "")
	require.NoError(t, err)
	require.NotEmpty(t, all)

	forLessee, err := f.keeper.QueryComputeLeases(f.ctx, lessee)
	require.NoError(t, err)
	require.Len(t, forLessee, 1)
	require.Equal(t, lessee, forLessee[0].Lessee)

	forProvider, err := f.keeper.QueryComputeLeases(f.ctx, owner)
	require.NoError(t, err)
	require.Len(t, forProvider, 1)
	require.Equal(t, owner, forProvider[0].Provider)
}

func TestComputeJobs_FilteringAndMalformed(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	job1 := types.ComputeJob{
		Id:         1,
		ResourceId: 10,
		Submitter:  "cosmos1submitteraaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Provider:   "cosmos1provideraaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Name:       "job-1",
		Status:     "running",
	}
	job2 := types.ComputeJob{
		Id:         2,
		ResourceId: 11,
		Submitter:  "cosmos1submitterbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Provider:   "cosmos1providerbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Name:       "job-2",
		Status:     "completed",
	}

	bz1, err := json.Marshal(job1)
	require.NoError(t, err)
	bz2, err := json.Marshal(job2)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ComputeJobs.Set(f.ctx, 1, string(bz1)))
	require.NoError(t, f.keeper.ComputeJobs.Set(f.ctx, 2, string(bz2)))
	require.NoError(t, f.keeper.ComputeJobs.Set(f.ctx, 999, "{bad-json"))

	resp, err := qSrv.ComputeJobs(f.ctx, &types.QueryComputeJobsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Jobs, 2)

	resp, err = qSrv.ComputeJobs(f.ctx, &types.QueryComputeJobsRequest{Address: job1.Submitter})
	require.NoError(t, err)
	require.Len(t, resp.Jobs, 1)
	require.EqualValues(t, 1, resp.Jobs[0].Id)

	resp, err = qSrv.ComputeJobs(f.ctx, &types.QueryComputeJobsRequest{ResourceId: 11})
	require.NoError(t, err)
	require.Len(t, resp.Jobs, 1)
	require.EqualValues(t, 2, resp.Jobs[0].Id)
}

func TestProviderStats_SuccessAndMalformed(t *testing.T) {
	f := initFixture(t)
	qSrv := keeper.NewQueryServerImpl(f.keeper)

	stats := types.ProviderStats{
		Address:        providerAddr(),
		TotalResources: 2,
		ActiveLeases:   1,
		TotalJobs:      5,
		CompletedJobs:  4,
		FailedJobs:     1,
		TotalRevenue:   "1000",
		AvgRating:      4900,
		Uptime:         100,
		LastHeartbeat:  12345,
	}
	statsBz, err := json.Marshal(stats)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ProviderStats.Set(f.ctx, providerAddr(), string(statsBz)))

	resp, err := qSrv.ProviderStats(f.ctx, &types.QueryProviderStatsRequest{Address: providerAddr()})
	require.NoError(t, err)
	require.Equal(t, providerAddr(), resp.Stats.Address)
	require.EqualValues(t, 5, resp.Stats.TotalJobs)

	require.NoError(t, f.keeper.ProviderStats.Set(f.ctx, "cosmos1badstatsxxxxxxxxxxxxxxxxxxxxxxxxx", "{bad-json"))
	_, err = qSrv.ProviderStats(f.ctx, &types.QueryProviderStatsRequest{Address: "cosmos1badstatsxxxxxxxxxxxxxxxxxxxxxxxxx"})
	require.Error(t, err)
}
