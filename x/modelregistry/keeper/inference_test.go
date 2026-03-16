package keeper_test

import (
	"encoding/json"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/types"
)

func validProvider() string {
	return sdk.AccAddress([]byte("provider1___________")).String()
}

func validRequester() string {
	return sdk.AccAddress([]byte("requester1__________")).String()
}

// setupModelAndProvider registers a model, an inference provider, and sets pricing.
func setupModelAndProvider(t *testing.T, f *fixture) (modelID uint64, provider string) {
	t.Helper()

	owner := validOwner()
	model := testModel()
	model.AccessType = "per_query"
	model.PricePerQueryUclaw = "100"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	prov := validProvider()
	err = f.keeper.RegisterInferenceProvider(f.ctx, prov, []uint64{id}, 5, "https://inference.example.com")
	require.NoError(t, err)

	err = f.keeper.SetInferencePricing(f.ctx, id, owner,
		math.NewInt(10),   // pricePerToken
		math.NewInt(500),  // pricePerQuery
		math.NewInt(500),  // minPayment
		1024,              // maxTokens
	)
	require.NoError(t, err)

	return id, prov
}

// ---------------------------------------------------------------------------
// RegisterInferenceProvider tests
// ---------------------------------------------------------------------------

func TestRegisterInferenceProviderSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	prov := validProvider()
	err = f.keeper.RegisterInferenceProvider(f.ctx, prov, []uint64{modelID}, 3, "https://inference.example.com")
	require.NoError(t, err)

	// Verify provider stored
	raw, err := f.keeper.InferenceProviders.Get(f.ctx, prov)
	require.NoError(t, err)

	var stored types.InferenceProvider
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, prov, stored.Address)
	require.Equal(t, uint64(3), stored.MaxConcurrent)
	require.True(t, stored.IsOnline)
	require.Equal(t, uint64(0), stored.ActiveJobs)
}

func TestRegisterInferenceProviderNoModels(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.RegisterInferenceProvider(f.ctx, validProvider(), []uint64{}, 1, "https://test.com")
	require.Error(t, err)
}

func TestRegisterInferenceProviderModelNotFound(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.RegisterInferenceProvider(f.ctx, validProvider(), []uint64{999}, 1, "https://test.com")
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// SetInferencePricing tests
// ---------------------------------------------------------------------------

func TestSetInferencePricingSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.SetInferencePricing(f.ctx, modelID, owner,
		math.NewInt(10),
		math.NewInt(100),
		math.NewInt(50),
		2048,
	)
	require.NoError(t, err)

	raw, err := f.keeper.InferencePricing.Get(f.ctx, modelID)
	require.NoError(t, err)
	var pricing types.InferencePricing
	require.NoError(t, json.Unmarshal([]byte(raw), &pricing))
	require.Equal(t, "10", pricing.PricePerToken)
	require.Equal(t, uint64(2048), pricing.MaxTokens)
}

func TestSetInferencePricingNotOwner(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.SetInferencePricing(f.ctx, modelID, validBuyer(),
		math.NewInt(10), math.NewInt(100), math.NewInt(50), 2048,
	)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// SubmitInferenceJob tests
// ---------------------------------------------------------------------------

func TestSubmitInferenceJobSuccess(t *testing.T) {
	f := initFixture(t)
	modelID, _ := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"Hello world"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)
	require.Equal(t, uint64(1), jobID)

	// Verify job stored
	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))
	require.Equal(t, types.InferenceStatusPending, job.Status)
	require.Equal(t, requester, job.Requester)
	require.Equal(t, "1000", job.Payment)

	// Verify escrow deducted
	bal := f.bankKeeper.accountBalances[requesterAddr.String()]
	require.True(t, bal.AmountOf("uclaw").Equal(math.NewInt(9000)))
}

func TestSubmitInferenceJobInsufficientPayment(t *testing.T) {
	f := initFixture(t)
	modelID, _ := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	// minPayment = 500, trying to pay 100
	_, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(100))
	require.Error(t, err)
	require.Contains(t, err.Error(), "insufficient payment")
}

func TestSubmitInferenceJobModelInactive(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.DelistModel(f.ctx, modelID, owner)
	require.NoError(t, err)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	_, err = f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.Error(t, err)
}

func TestSubmitInferenceJobNoPricing(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	// No pricing set
	_, err = f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// StartInferenceJob tests
// ---------------------------------------------------------------------------

func TestStartInferenceJobSuccess(t *testing.T) {
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

	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))
	require.Equal(t, types.InferenceStatusRunning, job.Status)
	require.NotZero(t, job.StartedAt)
}

func TestStartInferenceJobNotProvider(t *testing.T) {
	f := initFixture(t)
	modelID, _ := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	// Wrong provider
	err = f.keeper.StartInferenceJob(f.ctx, jobID, requester)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// CompleteInferenceJob tests
// ---------------------------------------------------------------------------

func TestCompleteInferenceJobSuccess(t *testing.T) {
	f := initFixture(t)
	modelID, prov := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	// Fund module for escrow return
	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	err = f.keeper.StartInferenceJob(f.ctx, jobID, prov)
	require.NoError(t, err)

	err = f.keeper.CompleteInferenceJob(f.ctx, jobID, prov, `{"response":"Hello!"}`, 50)
	require.NoError(t, err)

	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))
	require.Equal(t, types.InferenceStatusCompleted, job.Status)
	require.Equal(t, `{"response":"Hello!"}`, job.Output)
	require.Equal(t, uint64(50), job.GasUsed)
}

func TestCompleteInferenceJobNotProvider(t *testing.T) {
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

	err = f.keeper.CompleteInferenceJob(f.ctx, jobID, requester, "output", 10)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// FailInferenceJob tests
// ---------------------------------------------------------------------------

func TestFailInferenceJobRefundsPayment(t *testing.T) {
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

	err = f.keeper.FailInferenceJob(f.ctx, jobID, prov, "GPU OOM")
	require.NoError(t, err)

	// Verify job status
	raw, err := f.keeper.InferenceJobs.Get(f.ctx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))
	require.Equal(t, types.InferenceStatusFailed, job.Status)
	require.Equal(t, "GPU OOM", job.ErrorMsg)

	// Verify refund
	bal := f.bankKeeper.accountBalances[requesterAddr.String()]
	require.True(t, bal.AmountOf("uclaw").Equal(math.NewInt(10_000)))
}

// ---------------------------------------------------------------------------
// ProviderHeartbeat tests
// ---------------------------------------------------------------------------

func TestProviderHeartbeat(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	prov := validProvider()
	err = f.keeper.RegisterInferenceProvider(f.ctx, prov, []uint64{modelID}, 5, "https://test.com")
	require.NoError(t, err)

	err = f.keeper.ProviderHeartbeat(f.ctx, prov)
	require.NoError(t, err)

	raw, err := f.keeper.InferenceProviders.Get(f.ctx, prov)
	require.NoError(t, err)
	var stored types.InferenceProvider
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.True(t, stored.IsOnline)
}

func TestProviderHeartbeatNotRegistered(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.ProviderHeartbeat(f.ctx, validProvider())
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// ExpireInferenceJobs tests
// ---------------------------------------------------------------------------

func TestExpireInferenceJobsRefundsOnTimeout(t *testing.T) {
	f := initFixture(t)
	modelID, _ := setupModelAndProvider(t, f)

	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	jobID, err := f.keeper.SubmitInferenceJob(f.ctx, modelID, 0, requester,
		`{"prompt":"test"}`, 100, "0.7", math.NewInt(1000))
	require.NoError(t, err)

	// Advance block height past timeout (DefaultInferenceTimeoutBlocks = 100)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	newCtx := sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 200)

	err = f.keeper.ExpireInferenceJobs(newCtx)
	require.NoError(t, err)

	// Verify job expired
	raw, err := f.keeper.InferenceJobs.Get(newCtx, jobID)
	require.NoError(t, err)
	var job types.InferenceJob
	require.NoError(t, json.Unmarshal([]byte(raw), &job))
	require.Equal(t, types.InferenceStatusTimeout, job.Status)
	require.Equal(t, "job timed out", job.ErrorMsg)

	// Verify full refund
	bal := f.bankKeeper.accountBalances[requesterAddr.String()]
	require.True(t, bal.AmountOf("uclaw").Equal(math.NewInt(10_000)))
}
