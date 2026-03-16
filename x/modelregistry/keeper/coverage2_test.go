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
// gRPC MsgServer wrappers
// ---------------------------------------------------------------------------

func TestGRPCMsgServer_RegisterModel(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	model := testModel()
	resp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       validOwner(),
		Name:        model.Name,
		Description: model.Description,
		Framework:   model.Framework,
		StorageType: model.StorageType,
		StorageUri:  model.StorageUri,
		AccessType:  model.AccessType,
	})
	require.NoError(t, err)
	require.Equal(t, uint64(1), resp.ModelId)
}

func TestGRPCMsgServer_DelistModel(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       owner,
		Name:        "DelistMe",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://test",
		AccessType:  "free",
	})
	require.NoError(t, err)

	_, err = msgServer.DelistModel(f.ctx, &types.MsgDelistModel{
		ModelId: regResp.ModelId,
		Caller:  owner,
	})
	require.NoError(t, err)
}

func TestGRPCMsgServer_RateModel(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       owner,
		Name:        "RateMe",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://test",
		AccessType:  "free",
	})
	require.NoError(t, err)

	rater := validRater()
	_, err = msgServer.RateModel(f.ctx, &types.MsgRateModel{
		ModelId: regResp.ModelId,
		Rater:   rater,
		Rating:  4,
	})
	require.NoError(t, err)
}

func TestGRPCMsgServer_InferenceAndUpdateWrappers_Invoked(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	requester := validBuyer()

	// Register one model so wrapper methods that require a valid model ID can run.
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       owner,
		Name:        "WrapperModel",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://test",
		AccessType:  "free",
	})
	require.NoError(t, err)

	// UpdateModel wrapper invocation.
	_, err = msgServer.UpdateModel(f.ctx, &types.MsgUpdateModel{
		ModelId: regResp.ModelId,
		Caller:  owner,
		Name:    "WrapperModelV2",
	})
	require.NoError(t, err)

	// PurchaseAccess and RenewSubscription wrappers invocation.
	_, err = msgServer.PurchaseAccess(f.ctx, &types.MsgPurchaseAccess{
		ModelId:             regResp.ModelId,
		Buyer:               requester,
		SubscriptionPeriods: 0,
	})
	require.NoError(t, err)

	_, err = msgServer.RenewSubscription(f.ctx, &types.MsgRenewSubscription{
		ModelId: regResp.ModelId,
		Buyer:   requester,
		Periods: 1,
	})
	require.NoError(t, err)

	// Inference wrapper methods: invoke and assert current keeper behavior.
	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address:       owner,
		ModelIds:      []uint64{regResp.ModelId},
		MaxConcurrent: 1,
		Endpoint:      "http://provider.local/infer",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId:       regResp.ModelId,
		Caller:        owner,
		PricePerToken: "1",
		PricePerQuery: "10",
		MinPayment:    "10",
		MaxTokens:     1024,
	})
	require.NoError(t, err)

	// Missing funding/request context is fine here; wrapper should still execute
	// and return keeper-level errors without panicking.
	_, _ = msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId:      regResp.ModelId,
		ModelVersion: 1,
		Requester:    requester,
		Input:        "hello",
		MaxTokens:    32,
		Temperature:  "0.5",
		Payment:      "10",
	})

	_, err = msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId:    999,
		Provider: owner,
	})
	require.Error(t, err)

	_, err = msgServer.CompleteInferenceJob(f.ctx, &types.MsgCompleteInferenceJob{
		JobId:      999,
		Provider:   owner,
		Output:     "done",
		TokensUsed: 1,
	})
	require.Error(t, err)

	_, err = msgServer.FailInferenceJob(f.ctx, &types.MsgFailInferenceJob{
		JobId:    999,
		Provider: owner,
		ErrorMsg: "failed",
	})
	require.Error(t, err)

	_, err = msgServer.ProviderHeartbeat(f.ctx, &types.MsgProviderHeartbeat{
		Address: owner,
	})
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// gRPC QueryServer wrappers
// ---------------------------------------------------------------------------

func TestGRPCQueryServer_Model(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       validOwner(),
		Name:        "QueryModel",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://test",
		AccessType:  "free",
	})
	require.NoError(t, err)

	resp, err := queryServer.Model(f.ctx, &types.QueryModelRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.NotNil(t, resp.Model)
	require.Equal(t, "QueryModel", resp.Model.Name)
}

func TestGRPCMsgServer_ErrorAndSuccessBranches(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	owner := validOwner()
	requester := validRequester()
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 20_000)))

	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       owner,
		Name:        "BranchModel",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://branch",
		AccessType:  "per_query",
	})
	require.NoError(t, err)

	// Error branches.
	_, err = msgServer.DelistModel(f.ctx, &types.MsgDelistModel{ModelId: 999999, Caller: owner})
	require.Error(t, err)
	_, err = msgServer.PurchaseAccess(f.ctx, &types.MsgPurchaseAccess{ModelId: 999999, Buyer: requester, SubscriptionPeriods: 1})
	require.Error(t, err)
	_, err = msgServer.RenewSubscription(f.ctx, &types.MsgRenewSubscription{ModelId: 999999, Buyer: requester, Periods: 1})
	require.Error(t, err)
	_, err = msgServer.RateModel(f.ctx, &types.MsgRateModel{ModelId: 999999, Rater: requester, Rating: 5})
	require.Error(t, err)
	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address:       owner,
		ModelIds:      []uint64{},
		MaxConcurrent: 1,
		Endpoint:      "http://provider.invalid",
	})
	require.Error(t, err)

	// Success branches for inference wrappers.
	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address:       owner,
		ModelIds:      []uint64{regResp.ModelId},
		MaxConcurrent: 2,
		Endpoint:      "http://provider.ok",
	})
	require.NoError(t, err)

	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId:       regResp.ModelId,
		Caller:        owner,
		PricePerToken: "10",
		PricePerQuery: "500",
		MinPayment:    "500",
		MaxTokens:     1024,
	})
	require.NoError(t, err)

	submitResp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId:      regResp.ModelId,
		ModelVersion: 0,
		Requester:    requester,
		Input:        "hello",
		MaxTokens:    128,
		Temperature:  "0.7",
		Payment:      "1000",
	})
	require.NoError(t, err)

	_, err = msgServer.ProviderHeartbeat(f.ctx, &types.MsgProviderHeartbeat{Address: owner})
	require.NoError(t, err)

	_, err = msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId:    submitResp.JobId,
		Provider: owner,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteInferenceJob(f.ctx, &types.MsgCompleteInferenceJob{
		JobId:      submitResp.JobId,
		Provider:   owner,
		Output:     "done",
		TokensUsed: 64,
	})
	require.NoError(t, err)

	_, err = msgServer.FailInferenceJob(f.ctx, &types.MsgFailInferenceJob{
		JobId:    999999,
		Provider: owner,
		ErrorMsg: "no such job",
	})
	require.Error(t, err)

	// Success path for FailInferenceJob wrapper.
	submitResp2, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId:      regResp.ModelId,
		ModelVersion: 0,
		Requester:    requester,
		Input:        "to-fail",
		MaxTokens:    32,
		Temperature:  "0.4",
		Payment:      "1000",
	})
	require.NoError(t, err)
	_, err = msgServer.StartInferenceJob(f.ctx, &types.MsgStartInferenceJob{
		JobId:    submitResp2.JobId,
		Provider: owner,
	})
	require.NoError(t, err)
	_, err = msgServer.FailInferenceJob(f.ctx, &types.MsgFailInferenceJob{
		JobId:    submitResp2.JobId,
		Provider: owner,
		ErrorMsg: "expected failure",
	})
	require.NoError(t, err)

	// Error branch for SetInferencePricing (not owner).
	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		ModelId:       regResp.ModelId,
		Caller:        requester,
		PricePerToken: "1",
		PricePerQuery: "1",
		MinPayment:    "1",
		MaxTokens:     16,
	})
	require.Error(t, err)

	// Keep branch for payment parse fallback in wrapper.
	_, err = msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		ModelId:      regResp.ModelId,
		ModelVersion: 0,
		Requester:    requester,
		Input:        "hello-again",
		MaxTokens:    8,
		Temperature:  "0.3",
		Payment:      "not-a-number",
	})
	require.Error(t, err)

	// Ensure RenewSubscription success path also executes.
	_, err = msgServer.RenewSubscription(f.ctx, &types.MsgRenewSubscription{
		ModelId: regResp.ModelId,
		Buyer:   requester,
		Periods: 1,
	})
	require.NoError(t, err)

	// UpdateModel branches.
	_, err = msgServer.UpdateModel(f.ctx, &types.MsgUpdateModel{
		ModelId:   regResp.ModelId,
		Caller:    requester,
		Name:      "unauthorized-update",
		Framework: "pytorch",
	})
	require.Error(t, err)
	_, err = msgServer.UpdateModel(f.ctx, &types.MsgUpdateModel{
		ModelId:   regResp.ModelId,
		Caller:    owner,
		Framework: "invalid-framework",
	})
	require.Error(t, err)
	_, err = msgServer.UpdateModel(f.ctx, &types.MsgUpdateModel{
		ModelId:            regResp.ModelId,
		Caller:             owner,
		Name:               "BranchModelUpdated",
		Description:        "updated",
		Framework:          "tensorflow",
		AccessType:         "free",
		PricePerQueryUclaw: "0",
		PriceOneTimeUclaw:  "0",
	})
	require.NoError(t, err)

	// Ensure DelistModel success path executes.
	_, err = msgServer.DelistModel(f.ctx, &types.MsgDelistModel{ModelId: regResp.ModelId, Caller: owner})
	require.NoError(t, err)

	// ProviderHeartbeat error branch.
	_, err = msgServer.ProviderHeartbeat(f.ctx, &types.MsgProviderHeartbeat{Address: requester})
	require.Error(t, err)

	// Mark references to imported packages as used through assertions.
	require.True(t, math.NewInt(1).IsPositive())
}

func TestGRPCQueryServer_Model_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Model(f.ctx, nil)
	require.Error(t, err)
}

func TestGRPCQueryServer_Models(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       validOwner(),
		Name:        "M1",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://test",
		AccessType:  "free",
	})
	require.NoError(t, err)

	resp, err := queryServer.Models(f.ctx, &types.QueryModelsRequest{})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(resp.Models), 1)
}

func TestGRPCQueryServer_Models_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Models(f.ctx, nil)
	require.Error(t, err)
}

func TestGRPCQueryServer_ModelVersions(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	owner := validOwner()
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:       owner,
		Name:        "VersionModel",
		Description: "test",
		Framework:   "pytorch",
		StorageType: "ipfs",
		StorageUri:  "ipfs://test",
		AccessType:  "free",
	})
	require.NoError(t, err)

	_, err = msgServer.PublishVersion(f.ctx, &types.MsgPublishVersion{
		ModelId:    regResp.ModelId,
		Caller:     owner,
		StorageUri: "ipfs://v2",
		Changelog:  "fix bugs",
	})
	require.NoError(t, err)

	resp, err := queryServer.ModelVersions(f.ctx, &types.QueryModelVersionsRequest{ModelId: regResp.ModelId})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(resp.Versions), 1)
}

func TestGRPCQueryServer_Params(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Params(f.ctx, &types.QueryModelRegistryParamsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestGRPCQueryServer_Params_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Params(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Keeper query methods
// ---------------------------------------------------------------------------

func TestQueryModels_Framework(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: validOwner(), Name: "PyTorch1", Description: "t", Framework: "pytorch",
		StorageType: "ipfs", StorageUri: "ipfs://t", AccessType: "free",
	})
	require.NoError(t, err)
	_, err = msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner: validOwner(), Name: "TF1", Description: "t", Framework: "tensorflow",
		StorageType: "ipfs", StorageUri: "ipfs://t", AccessType: "free",
	})
	require.NoError(t, err)

	models, err := f.keeper.QueryModels(f.ctx, "pytorch", nil, false)
	require.NoError(t, err)
	require.Len(t, models, 1)
	require.Equal(t, "PyTorch1", models[0].Name)
}

func TestQueryModel_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.QueryModel(f.ctx, 999)
	require.Error(t, err)
}

func TestQueryModelVersions_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.QueryModelVersions(f.ctx, 999)
	require.Error(t, err)
}

func TestQueryModelAccess_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.QueryModelAccess(f.ctx, 999, validBuyer())
	require.Error(t, err)
}

func TestGetAuthority_ModelRegistry(t *testing.T) {
	f := initFixture(t)

	auth := f.keeper.GetAuthority()
	require.NotEmpty(t, auth)
}
