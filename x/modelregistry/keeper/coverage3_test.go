//go:build integration

package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/keeper"
	"clawchain/x/modelregistry/types"
)

// ---------------------------------------------------------------------------
// TestCoverage3 — umbrella for grpc_msg_server.go and grpc_query_server.go
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – RegisterModel success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_RegisterModel_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	resp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       validOwner(),
		Name:        "Cov3Model",
		Description: "coverage test model",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://cov3hash",
		AccessType:  "free",
	})
	require.NoError(t, err)
	require.Equal(t, uint64(1), resp.ModelId)
}

func TestCoverage3_MsgServer_RegisterModel_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       "bad-address",
		Name:        "Bad",
		Description: "bad",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://x",
		AccessType:  "free",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – PublishVersion success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_PublishVersion_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "PubVer", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://v1", AccessType: "free",
	})
	require.NoError(t, err)

	vResp, err := msgServer.PublishVersion(f.ctx, &types.MsgPublishVersion{
		ModelId:    regResp.ModelId,
		Caller:     owner,
		StorageUri: "ipfs://v2",
		Changelog:  "second version",
	})
	require.NoError(t, err)
	require.Equal(t, uint64(2), vResp.VersionId)
}

func TestCoverage3_MsgServer_PublishVersion_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.PublishVersion(f.ctx, &types.MsgPublishVersion{
		ModelId:    999,
		Caller:     validOwner(),
		StorageUri: "ipfs://missing",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – DelistModel success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_DelistModel_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "DelistCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://dl", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.DelistModel(f.ctx, &types.MsgDelistModel{
		ModelId: regResp.ModelId, Caller: owner,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_DelistModel_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.DelistModel(f.ctx, &types.MsgDelistModel{
		ModelId: 999, Caller: validOwner(),
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – PurchaseAccess success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_PurchaseAccess_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "PurchCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://pa", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.PurchaseAccess(f.ctx, &types.MsgPurchaseAccess{
		ModelId: regResp.ModelId, Buyer: validBuyer(), SubscriptionPeriods: 0,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_PurchaseAccess_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.PurchaseAccess(f.ctx, &types.MsgPurchaseAccess{
		ModelId: 999, Buyer: validBuyer(), SubscriptionPeriods: 1,
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – RenewSubscription success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_RenewSubscription_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "RenewCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://rn", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RenewSubscription(f.ctx, &types.MsgRenewSubscription{
		ModelId: regResp.ModelId, Buyer: validBuyer(), Periods: 1,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_RenewSubscription_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.RenewSubscription(f.ctx, &types.MsgRenewSubscription{
		ModelId: 999, Buyer: validBuyer(), Periods: 1,
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – RateModel success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_RateModel_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "RateCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://rt", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RateModel(f.ctx, &types.MsgRateModel{
		ModelId: regResp.ModelId, Rater: validRater(), Rating: 350,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_RateModel_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.RateModel(f.ctx, &types.MsgRateModel{
		ModelId: 999, Rater: validRater(), Rating: 400,
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – UpdateModel success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_UpdateModel_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "UpdCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://um", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.UpdateModel(f.ctx, &types.MsgUpdateModel{
		ModelId: regResp.ModelId, Caller: owner, Name: "UpdCov3V2",
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_UpdateModel_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.UpdateModel(f.ctx, &types.MsgUpdateModel{
		ModelId: 999, Caller: validOwner(), Name: "nope",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – SubmitInferenceJob valid-payment + bad-payment
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_SubmitInferenceJob_ValidPayment(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	requester := validBuyer()

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "InferCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://inf", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 2, Endpoint: "http://cov3/infer",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "1", PricePerQuery: "5", MinPayment: "5", MaxTokens: 512,
	})
	require.NoError(t, err)

	buyerAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 500)))

	resp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId: regResp.ModelId, ModelVersion: 1, Requester: requester,
		Input: "cov3 input", MaxTokens: 10, Temperature: "0.5", Payment: "50",
	})
	require.NoError(t, err)
	require.Greater(t, resp.JobId, uint64(0))
}

func TestCoverage3_MsgServer_SubmitInferenceJob_BadPayment(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Non-numeric payment should fallback to zero; keeper will reject because model doesn't exist
	_, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId: 999, Requester: validOwner(), Input: "x", Payment: "xyz",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – SetInferencePricing valid + bad string prices
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_SetInferencePricing_ValidPrices(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "PriceCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://pc", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "10", PricePerQuery: "100", MinPayment: "50", MaxTokens: 2048,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_SetInferencePricing_BadPrices(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "BadPriceCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://bp", AccessType: "free",
	})
	require.NoError(t, err)

	// All non-numeric prices fallback to zero; should still succeed
	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "bad", PricePerQuery: "bad", MinPayment: "bad", MaxTokens: 100,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_SetInferencePricing_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: 999, Caller: validOwner(),
		PricePerToken: "1", PricePerQuery: "1", MinPayment: "1", MaxTokens: 10,
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – RegisterInferenceProvider success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_RegisterInferenceProvider_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "ProvCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://pv", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 3, Endpoint: "http://cov3/provider",
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_RegisterInferenceProvider_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: validOwner(), ModelIds: []uint64{}, MaxConcurrent: 1, Endpoint: "http://cov3/bad",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – StartInferenceJob success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_StartInferenceJob_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	requester := validBuyer()

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "StartCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://sj", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 5, Endpoint: "http://cov3/start",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "1", PricePerQuery: "5", MinPayment: "5", MaxTokens: 512,
	})
	require.NoError(t, err)

	buyerAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 500)))

	submitResp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId: regResp.ModelId, ModelVersion: 1, Requester: requester,
		Input: "start test", MaxTokens: 10, Temperature: "0.5", Payment: "50",
	})
	require.NoError(t, err)

	_, err = msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId: submitResp.JobId, Provider: owner,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_StartInferenceJob_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId: 999, Provider: validOwner(),
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – CompleteInferenceJob success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_CompleteInferenceJob_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	requester := validBuyer()

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "CompCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://cj", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 5, Endpoint: "http://cov3/comp",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "1", PricePerQuery: "5", MinPayment: "5", MaxTokens: 512,
	})
	require.NoError(t, err)

	buyerAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 500)))

	submitResp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId: regResp.ModelId, ModelVersion: 1, Requester: requester,
		Input: "complete test", MaxTokens: 10, Temperature: "0.5", Payment: "50",
	})
	require.NoError(t, err)

	_, err = msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId: submitResp.JobId, Provider: owner,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteInferenceJob(f.ctx, &types.MsgCompleteInferenceJob{
		JobId: submitResp.JobId, Provider: owner, Output: "cov3 result", TokensUsed: 5,
	})
	require.NoError(t, err)

	// Verify completed status
	job, err := f.keeper.QueryInferenceJob(f.ctx, submitResp.JobId)
	require.NoError(t, err)
	require.Equal(t, types.InferenceStatusCompleted, job.Status)
}

func TestCoverage3_MsgServer_CompleteInferenceJob_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.CompleteInferenceJob(f.ctx, &types.MsgCompleteInferenceJob{
		JobId: 999, Provider: validOwner(), Output: "x", TokensUsed: 1,
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – FailInferenceJob success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_FailInferenceJob_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	requester := validBuyer()

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "FailCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://fj", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 5, Endpoint: "http://cov3/fail",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "1", PricePerQuery: "5", MinPayment: "5", MaxTokens: 512,
	})
	require.NoError(t, err)

	buyerAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 500)))

	submitResp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId: regResp.ModelId, ModelVersion: 1, Requester: requester,
		Input: "fail test", MaxTokens: 10, Temperature: "0.5", Payment: "50",
	})
	require.NoError(t, err)

	_, err = msgServer.FailInferenceJob(f.ctx, &types.MsgFailInferenceJob{
		JobId: submitResp.JobId, Provider: owner, ErrorMsg: "GPU OOM cov3",
	})
	require.NoError(t, err)

	// Verify failed status
	job, err := f.keeper.QueryInferenceJob(f.ctx, submitResp.JobId)
	require.NoError(t, err)
	require.Equal(t, types.InferenceStatusFailed, job.Status)
	require.Equal(t, "GPU OOM cov3", job.ErrorMsg)
}

func TestCoverage3_MsgServer_FailInferenceJob_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.FailInferenceJob(f.ctx, &types.MsgFailInferenceJob{
		JobId: 999, Provider: validOwner(), ErrorMsg: "nope",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC MsgServer wrapper – ProviderHeartbeat success + error
// ---------------------------------------------------------------------------

func TestCoverage3_MsgServer_ProviderHeartbeat_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "HBCov3", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://hb", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 1, Endpoint: "http://cov3/hb",
	})
	require.NoError(t, err)

	_, err = msgServer.ProviderHeartbeat(f.ctx, &types.MsgProviderHeartbeat{
		Address: owner,
	})
	require.NoError(t, err)
}

func TestCoverage3_MsgServer_ProviderHeartbeat_Error(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ProviderHeartbeat(f.ctx, &types.MsgProviderHeartbeat{
		Address: "cosmos1notregistered",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – nil requests return error
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_NilRequests(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.Model(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.Models(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.ModelVersions(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.InferenceJob(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.InferenceJobs(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.InferenceProviders(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.InferencePricing(f.ctx, nil)
	require.Error(t, err)

	_, err = qs.Params(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – Model success + not-found
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_Model_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: validOwner(), Name: "QModel", Description: "q", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://qm", AccessType: "free",
	})
	require.NoError(t, err)

	resp, err := qs.Model(f.ctx, &types.QueryModelRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.Equal(t, "QModel", resp.Model.Name)
}

func TestCoverage3_QueryServer_Model_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.Model(f.ctx, &types.QueryModelRequest{ModelId: 999})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – Models with tag filter
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_Models_WithTag(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: validOwner(), Name: "Tagged", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://tag", AccessType: "free",
		Tags: []string{"vision"},
	})
	require.NoError(t, err)

	resp, err := qs.Models(f.ctx, &types.QueryModelsRequest{Tag: "vision"})
	require.NoError(t, err)
	require.Len(t, resp.Models, 1)

	// No match
	resp, err = qs.Models(f.ctx, &types.QueryModelsRequest{Tag: "audio"})
	require.NoError(t, err)
	require.Empty(t, resp.Models)
}

func TestCoverage3_QueryServer_Models_OnlyFree(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: validOwner(), Name: "Free1", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://f1", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: validOwner(), Name: "Paid1", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://p1", AccessType: "per_query",
	})
	require.NoError(t, err)

	resp, err := qs.Models(f.ctx, &types.QueryModelsRequest{OnlyFree: true})
	require.NoError(t, err)
	require.Len(t, resp.Models, 1)
	require.Equal(t, "Free1", resp.Models[0].Name)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – ModelVersions success
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_ModelVersions_Success(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "Versioned", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://v0", AccessType: "free",
	})
	require.NoError(t, err)

	_, err = msgServer.PublishVersion(f.ctx, &types.MsgPublishVersion{
		ModelId: regResp.ModelId, Caller: owner, StorageUri: "ipfs://v2c3", Changelog: "c3",
	})
	require.NoError(t, err)

	resp, err := qs.ModelVersions(f.ctx, &types.QueryModelVersionsRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.Len(t, resp.Versions, 2)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – InferenceJob success
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_InferenceJob_Success(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	mustSetInferenceJob(t, f, 42, types.InferenceJob{
		JobId: 42, ModelId: 1, Status: "pending", Provider: validOwner(),
	})

	resp, err := qs.InferenceJob(f.ctx, &types.QueryInferenceJobRequest{JobId: 42})
	require.NoError(t, err)
	require.Equal(t, uint64(42), resp.Job.JobId)
}

func TestCoverage3_QueryServer_InferenceJob_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.InferenceJob(f.ctx, &types.QueryInferenceJobRequest{JobId: 999})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – InferenceJobs with filters
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_InferenceJobs_Filtered(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	mustSetInferenceJob(t, f, 1, types.InferenceJob{JobId: 1, ModelId: 10, Status: "pending"})
	mustSetInferenceJob(t, f, 2, types.InferenceJob{JobId: 2, ModelId: 20, Status: "running"})

	// All jobs
	resp, err := qs.InferenceJobs(f.ctx, &types.QueryInferenceJobsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Jobs, 2)

	// Filter by model
	resp, err = qs.InferenceJobs(f.ctx, &types.QueryInferenceJobsRequest{ModelId: 10})
	require.NoError(t, err)
	require.Len(t, resp.Jobs, 1)
	require.Equal(t, uint64(1), resp.Jobs[0].JobId)

	// Filter by status
	resp, err = qs.InferenceJobs(f.ctx, &types.QueryInferenceJobsRequest{Status: "running"})
	require.NoError(t, err)
	require.Len(t, resp.Jobs, 1)
	require.Equal(t, uint64(2), resp.Jobs[0].JobId)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – InferenceProviders filtered
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_InferenceProviders_Filtered(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	mustSetInferenceProvider(t, f, validOwner(), types.InferenceProvider{
		Address: validOwner(), ModelIds: []uint64{1, 2},
	})
	mustSetInferenceProvider(t, f, validBuyer(), types.InferenceProvider{
		Address: validBuyer(), ModelIds: []uint64{3},
	})

	// All providers
	resp, err := qs.InferenceProviders(f.ctx, &types.QueryInferenceProvidersRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Providers, 2)

	// Filter by model 1
	resp, err = qs.InferenceProviders(f.ctx, &types.QueryInferenceProvidersRequest{ModelId: 1})
	require.NoError(t, err)
	require.Len(t, resp.Providers, 1)
	require.Equal(t, validOwner(), resp.Providers[0].Address)

	// Filter by model 3
	resp, err = qs.InferenceProviders(f.ctx, &types.QueryInferenceProvidersRequest{ModelId: 3})
	require.NoError(t, err)
	require.Len(t, resp.Providers, 1)
	require.Equal(t, validBuyer(), resp.Providers[0].Address)

	// No match
	resp, err = qs.InferenceProviders(f.ctx, &types.QueryInferenceProvidersRequest{ModelId: 999})
	require.NoError(t, err)
	require.Empty(t, resp.Providers)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – InferencePricing success + not-found
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_InferencePricing_Success(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	mustSetInferencePricing(t, f, 7, types.InferencePricing{
		ModelId: 7, PricePerToken: "10", PricePerQuery: "100", MinPayment: "50", MaxTokens: 1024,
	})

	resp, err := qs.InferencePricing(f.ctx, &types.QueryInferencePricingRequest{ModelId: 7})
	require.NoError(t, err)
	require.Equal(t, uint64(7), resp.Pricing.ModelId)
	require.Equal(t, "10", resp.Pricing.PricePerToken)
}

func TestCoverage3_QueryServer_InferencePricing_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	_, err := qs.InferencePricing(f.ctx, &types.QueryInferencePricingRequest{ModelId: 999})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrapper – Params
// ---------------------------------------------------------------------------

func TestCoverage3_QueryServer_Params(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)

	resp, err := qs.Params(f.ctx, &types.QueryModelRegistryParamsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

// ---------------------------------------------------------------------------
// Full lifecycle through gRPC wrappers: submit -> start -> complete -> query
// ---------------------------------------------------------------------------

func TestCoverage3_FullLifecycleThroughGRPC(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	owner := validOwner()
	requester := validBuyer()

	// Register model
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: owner, Name: "LifecycleCov3", Description: "full lifecycle", Framework: "onnx",
		StorageType: "ipfs", StorageUri: "ipfs://lc3", AccessType: "per_query",
		PricePerQueryUclaw: "100",
	})
	require.NoError(t, err)

	// Register provider
	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address: owner, ModelIds: []uint64{regResp.ModelId}, MaxConcurrent: 10, Endpoint: "http://cov3/lifecycle",
	})
	require.NoError(t, err)

	// Set pricing
	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId: regResp.ModelId, Caller: owner,
		PricePerToken: "2", PricePerQuery: "20", MinPayment: "20", MaxTokens: 256,
	})
	require.NoError(t, err)

	// Fund requester
	buyerAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	// Submit
	submitResp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId: regResp.ModelId, ModelVersion: 1, Requester: requester,
		Input: "lifecycle input", MaxTokens: 50, Temperature: "0.8", Payment: "200",
	})
	require.NoError(t, err)

	// Query job via gRPC
	jobResp, err := qs.InferenceJob(f.ctx, &types.QueryInferenceJobRequest{JobId: submitResp.JobId})
	require.NoError(t, err)
	require.Equal(t, "pending", jobResp.Job.Status)

	// Start
	_, err = msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId: submitResp.JobId, Provider: owner,
	})
	require.NoError(t, err)

	// Complete
	_, err = msgServer.CompleteInferenceJob(f.ctx, &types.MsgCompleteInferenceJob{
		JobId: submitResp.JobId, Provider: owner, Output: "lifecycle output", TokensUsed: 25,
	})
	require.NoError(t, err)

	// Query completed job
	jobResp, err = qs.InferenceJob(f.ctx, &types.QueryInferenceJobRequest{JobId: submitResp.JobId})
	require.NoError(t, err)
	require.Equal(t, types.InferenceStatusCompleted, jobResp.Job.Status)
	require.Equal(t, "lifecycle output", jobResp.Job.Output)

	// Query model to verify it exists
	modelResp, err := qs.Model(f.ctx, &types.QueryModelRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.Equal(t, "LifecycleCov3", modelResp.Model.Name)

	// Query providers for this model
	provResp, err := qs.InferenceProviders(f.ctx, &types.QueryInferenceProvidersRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.Len(t, provResp.Providers, 1)

	// Query pricing
	pricingResp, err := qs.InferencePricing(f.ctx, &types.QueryInferencePricingRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.Equal(t, "2", pricingResp.Pricing.PricePerToken)

	// Suppress unused import warnings
	require.True(t, math.NewInt(1).IsPositive())
}
