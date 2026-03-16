package keeper_test

import (
	"encoding/json"
	"testing"

	"clawchain/x/modelregistry/keeper"
	"clawchain/x/modelregistry/types"
	"github.com/stretchr/testify/require"
)

func mustSetInferenceJob(t *testing.T, f *fixture, id uint64, job types.InferenceJob) {
	t.Helper()
	bz, err := json.Marshal(job)
	require.NoError(t, err)
	require.NoError(t, f.keeper.InferenceJobs.Set(f.ctx, id, string(bz)))
}

func mustSetInferenceProvider(t *testing.T, f *fixture, address string, provider types.InferenceProvider) {
	t.Helper()
	bz, err := json.Marshal(provider)
	require.NoError(t, err)
	require.NoError(t, f.keeper.InferenceProviders.Set(f.ctx, address, string(bz)))
}

func mustSetInferencePricing(t *testing.T, f *fixture, modelID uint64, pricing types.InferencePricing) {
	t.Helper()
	bz, err := json.Marshal(pricing)
	require.NoError(t, err)
	require.NoError(t, f.keeper.InferencePricing.Set(f.ctx, modelID, string(bz)))
}

func TestQueryInferenceJob_Keeper(t *testing.T) {
	f := initFixture(t)

	mustSetInferenceJob(t, f, 1, types.InferenceJob{
		JobId:    1,
		ModelId:  11,
		Status:   "pending",
		Provider: validOwner(),
	})
	require.NoError(t, f.keeper.InferenceJobs.Set(f.ctx, 2, "{bad-json"))

	job, err := f.keeper.QueryInferenceJob(f.ctx, 1)
	require.NoError(t, err)
	require.Equal(t, uint64(1), job.JobId)

	_, err = f.keeper.QueryInferenceJob(f.ctx, 999)
	require.Error(t, err)

	_, err = f.keeper.QueryInferenceJob(f.ctx, 2)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unmarshal")
}

func TestQueryInferenceJobs_Keeper(t *testing.T) {
	f := initFixture(t)

	mustSetInferenceJob(t, f, 1, types.InferenceJob{JobId: 1, ModelId: 10, Status: "pending"})
	mustSetInferenceJob(t, f, 2, types.InferenceJob{JobId: 2, ModelId: 20, Status: "running"})
	require.NoError(t, f.keeper.InferenceJobs.Set(f.ctx, 3, "{bad-json"))

	all, err := f.keeper.QueryInferenceJobs(f.ctx, 0, "")
	require.NoError(t, err)
	require.Len(t, all, 2)

	byModel, err := f.keeper.QueryInferenceJobs(f.ctx, 10, "")
	require.NoError(t, err)
	require.Len(t, byModel, 1)
	require.Equal(t, uint64(1), byModel[0].JobId)

	byStatus, err := f.keeper.QueryInferenceJobs(f.ctx, 0, "running")
	require.NoError(t, err)
	require.Len(t, byStatus, 1)
	require.Equal(t, uint64(2), byStatus[0].JobId)
}

func TestQueryInferenceProviderAndPricing_Keeper(t *testing.T) {
	f := initFixture(t)
	addr := validOwner()

	mustSetInferenceProvider(t, f, addr, types.InferenceProvider{
		Address:  addr,
		ModelIds: []uint64{1, 2},
	})
	mustSetInferencePricing(t, f, 1, types.InferencePricing{ModelId: 1})
	require.NoError(t, f.keeper.InferenceProviders.Set(f.ctx, validBuyer(), "{bad-json"))
	require.NoError(t, f.keeper.InferencePricing.Set(f.ctx, 2, "{bad-json"))

	provider, err := f.keeper.QueryInferenceProvider(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, addr, provider.Address)

	_, err = f.keeper.QueryInferenceProvider(f.ctx, "missing")
	require.Error(t, err)
	_, err = f.keeper.QueryInferenceProvider(f.ctx, validBuyer())
	require.Error(t, err)

	pricing, err := f.keeper.QueryInferencePricing(f.ctx, 1)
	require.NoError(t, err)
	require.Equal(t, uint64(1), pricing.ModelId)

	_, err = f.keeper.QueryInferencePricing(f.ctx, 999)
	require.Error(t, err)
	_, err = f.keeper.QueryInferencePricing(f.ctx, 2)
	require.Error(t, err)
}

func TestQueryInferenceProviders_Keeper(t *testing.T) {
	f := initFixture(t)

	mustSetInferenceProvider(t, f, validOwner(), types.InferenceProvider{
		Address:  validOwner(),
		ModelIds: []uint64{1, 2},
	})
	mustSetInferenceProvider(t, f, validBuyer(), types.InferenceProvider{
		Address:  validBuyer(),
		ModelIds: []uint64{2, 3},
	})
	require.NoError(t, f.keeper.InferenceProviders.Set(f.ctx, validRater(), "{bad-json"))

	all, err := f.keeper.QueryInferenceProviders(f.ctx, 0)
	require.NoError(t, err)
	require.Len(t, all, 2)

	filtered, err := f.keeper.QueryInferenceProviders(f.ctx, 1)
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	require.Equal(t, validOwner(), filtered[0].Address)
}

func TestGRPCQueryServer_InferenceMethods(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	addr := validOwner()
	mustSetInferenceJob(t, f, 1, types.InferenceJob{JobId: 1, ModelId: 1, Status: "pending"})
	mustSetInferenceProvider(t, f, addr, types.InferenceProvider{Address: addr, ModelIds: []uint64{1}})
	mustSetInferencePricing(t, f, 1, types.InferencePricing{ModelId: 1})

	_, err := queryServer.InferenceJob(f.ctx, nil)
	require.Error(t, err)
	jobResp, err := queryServer.InferenceJob(f.ctx, &types.QueryInferenceJobRequest{JobId: 1})
	require.NoError(t, err)
	require.Equal(t, uint64(1), jobResp.Job.JobId)

	_, err = queryServer.InferenceJobs(f.ctx, nil)
	require.Error(t, err)
	jobsResp, err := queryServer.InferenceJobs(f.ctx, &types.QueryInferenceJobsRequest{ModelId: 1})
	require.NoError(t, err)
	require.Len(t, jobsResp.Jobs, 1)

	_, err = queryServer.InferenceProviders(f.ctx, nil)
	require.Error(t, err)
	providersResp, err := queryServer.InferenceProviders(f.ctx, &types.QueryInferenceProvidersRequest{ModelId: 1})
	require.NoError(t, err)
	require.Len(t, providersResp.Providers, 1)

	_, err = queryServer.InferencePricing(f.ctx, nil)
	require.Error(t, err)
	pricingResp, err := queryServer.InferencePricing(f.ctx, &types.QueryInferencePricingRequest{ModelId: 1})
	require.NoError(t, err)
	require.Equal(t, uint64(1), pricingResp.Pricing.ModelId)
}
