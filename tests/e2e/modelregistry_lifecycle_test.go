//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"fmt"
	"testing"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/keeper"
	module "clawchain/x/modelregistry/module"
	"clawchain/x/modelregistry/types"
)

// ---------------------------------------------------------------------------
// Mock Bank Keeper for ModelRegistry
// ---------------------------------------------------------------------------

type modelMockBankKeeper struct {
	balances       map[string]sdk.Coins
	moduleBalances map[string]sdk.Coins
}

func newModelMockBank() *modelMockBankKeeper {
	return &modelMockBankKeeper{
		balances:       make(map[string]sdk.Coins),
		moduleBalances: make(map[string]sdk.Coins),
	}
}

func (m *modelMockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.balances[addr.String()]
}

func (m *modelMockBankKeeper) SendCoins(_ context.Context, from, to sdk.AccAddress, amt sdk.Coins) error {
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

func (m *modelMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
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

func (m *modelMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
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

type modelFixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
	bankKeeper   *modelMockBankKeeper
}

func initModelFixture(t *testing.T) *modelFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newModelMockBank()

	k := keeper.NewKeeper(storeService, encCfg.Codec, addrCodec, authority, bk)

	if err := k.Params.Set(ctx, types.DefaultModelRegistryParams()); err != nil {
		t.Fatalf("failed to set modelregistry params: %v", err)
	}

	return &modelFixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addrCodec,
		bankKeeper:   bk,
	}
}

func modelCreator() string {
	return sdk.AccAddress([]byte("modelcreator________")).String()
}

func modelBuyer() string {
	return sdk.AccAddress([]byte("modelbuyer__________")).String()
}

func inferenceProvider() string {
	return sdk.AccAddress([]byte("infprovider_________")).String()
}

// ---------------------------------------------------------------------------
// E2E: Register Model → Query → Delist
// ---------------------------------------------------------------------------

func TestModelRegistryLifecycle_RegisterQueryDelist(t *testing.T) {
	f := initModelFixture(t)
	creator := modelCreator()
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Fund creator for deposit
	creatorAddr, _ := sdk.AccAddressFromBech32(creator)
	f.bankKeeper.balances[creatorAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))

	// --- Step 1: Register a model ---
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:        creator,
		Name:         "GPT-ClawChain",
		Description:  "Fine-tuned LLM for blockchain agent tasks",
		Framework:    "pytorch",
		Architecture: "transformer",
		License:      "apache-2.0",
		StorageType:  "ipfs",
		StorageUri:   "ipfs://QmTest123456789",
		AccessType:   "free",
	})
	require.NoError(t, err)
	require.NotNil(t, regResp)

	modelId := regResp.ModelId

	// --- Step 2: Query the model ---
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	modelResp, err := queryServer.Model(f.ctx, &types.QueryModelRequest{ModelId: modelId})
	require.NoError(t, err)
	require.Equal(t, "GPT-ClawChain", modelResp.Model.Name)
	require.Equal(t, creator, modelResp.Model.Owner)
	require.Equal(t, "pytorch", modelResp.Model.Framework)

	// --- Step 3: Query all models ---
	listResp, err := queryServer.Models(f.ctx, &types.QueryModelsRequest{})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(listResp.Models), 1)

	// --- Step 4: Delist the model ---
	_, err = msgServer.DelistModel(f.ctx, &types.MsgDelistModel{
		Caller:  creator,
		ModelId: modelId,
	})
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// E2E: Register → Publish Version → Rate Model
// ---------------------------------------------------------------------------

func TestModelRegistryLifecycle_VersionAndRating(t *testing.T) {
	f := initModelFixture(t)
	creator := modelCreator()
	buyer := modelBuyer()
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Fund accounts
	creatorAddr, _ := sdk.AccAddressFromBech32(creator)
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.balances[creatorAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))
	f.bankKeeper.balances[buyerAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))

	// --- Step 1: Register model ---
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:        creator,
		Name:         "ClawVision",
		Description:  "Computer vision model for on-chain image verification",
		Framework:    "tensorflow",
		Architecture: "cnn",
		License:      "mit",
		StorageType:  "uri",
		StorageUri:   "https://models.clawchain.io/vision-v1",
		AccessType:   "free",
	})
	require.NoError(t, err)
	modelId := regResp.ModelId

	// --- Step 2: Publish version ---
	versionResp, err := msgServer.PublishVersion(f.ctx, &types.MsgPublishVersion{
		Caller:     creator,
		ModelId:    modelId,
		Changelog:  "Initial release with ResNet backbone",
		StorageUri: "https://models.clawchain.io/vision-v1.0.0",
	})
	require.NoError(t, err)
	require.NotNil(t, versionResp)

	// --- Step 3: Rate the model ---
	_, err = msgServer.RateModel(f.ctx, &types.MsgRateModel{
		Rater:   buyer,
		ModelId: modelId,
		Rating:  5,
	})
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// E2E: Inference Provider Registration → Pricing → Job Submission
// ---------------------------------------------------------------------------

func TestModelRegistryLifecycle_InferenceWorkflow(t *testing.T) {
	f := initModelFixture(t)
	creator := modelCreator()
	provider := inferenceProvider()
	buyer := modelBuyer()
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Fund accounts
	creatorAddr, _ := sdk.AccAddressFromBech32(creator)
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.balances[creatorAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))
	f.bankKeeper.balances[buyerAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))

	// --- Step 1: Register model ---
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:        creator,
		Name:         "ClawLLM-7B",
		Description:  "7B parameter LLM for agent orchestration",
		Framework:    "pytorch",
		Architecture: "transformer",
		License:      "apache-2.0",
		StorageType:  "ipfs",
		StorageUri:   "ipfs://QmLLM7B123",
		AccessType:   "per_query",
	})
	require.NoError(t, err)
	modelId := regResp.ModelId

	// --- Step 2: Register inference provider ---
	_, err = msgServer.RegisterInferenceProvider(f.ctx, &types.MsgRegisterInferenceProvider{
		Address:       provider,
		ModelIds:      []uint64{modelId},
		Endpoint:      "https://inference.gpu-provider.io/v1",
		MaxConcurrent: 100,
	})
	require.NoError(t, err)

	// --- Step 3: Set inference pricing (must be model owner) ---
	_, err = msgServer.SetInferencePricing(f.ctx, &types.MsgSetInferencePricing{
		Caller:        creator,
		ModelId:       modelId,
		PricePerToken: "100",
		PricePerQuery: "50000",
		MinPayment:    "10000",
		MaxTokens:     4096,
	})
	require.NoError(t, err)

	// --- Step 4: Submit inference job ---
	jobResp, err := msgServer.SubmitInferenceJob(f.ctx, &types.MsgSubmitInferenceJob{
		Requester: buyer,
		ModelId:   modelId,
		Input:     "Explain how ClawChain's agent module works",
		MaxTokens: 512,
		Payment:   "100000",
	})
	require.NoError(t, err)
	require.NotNil(t, jobResp)

	// --- Step 5: Query inference jobs ---
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	jobsResp, err := queryServer.InferenceJobs(f.ctx, &types.QueryInferenceJobsRequest{})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(jobsResp.Jobs), 1)
}

// ---------------------------------------------------------------------------
// E2E: Unauthorized Operations Rejected
// ---------------------------------------------------------------------------

func TestModelRegistryLifecycle_UnauthorizedRejected(t *testing.T) {
	f := initModelFixture(t)
	creator := modelCreator()
	attacker := sdk.AccAddress([]byte("attacker____________")).String()
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Fund creator
	creatorAddr, _ := sdk.AccAddressFromBech32(creator)
	f.bankKeeper.balances[creatorAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))

	// Register a model
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:        creator,
		Name:         "SecureModel",
		Description:  "Only creator can delist",
		Framework:    "pytorch",
		Architecture: "transformer",
		License:      "proprietary",
		StorageType:  "uri",
		StorageUri:   "https://private.models.io/secure",
		AccessType:   "one_time",
	})
	require.NoError(t, err)
	modelId := regResp.ModelId

	// Attacker tries to delist — should fail
	_, err = msgServer.DelistModel(f.ctx, &types.MsgDelistModel{
		Caller:  attacker,
		ModelId: modelId,
	})
	require.Error(t, err, "attacker should not be able to delist another creator's model")
}

// ---------------------------------------------------------------------------
// E2E: Model Access Purchase Flow
// ---------------------------------------------------------------------------

func TestModelRegistryLifecycle_PurchaseAccess(t *testing.T) {
	f := initModelFixture(t)
	creator := modelCreator()
	buyer := modelBuyer()
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Fund accounts
	creatorAddr, _ := sdk.AccAddressFromBech32(creator)
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.balances[creatorAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))
	f.bankKeeper.balances[buyerAddr.String()] = sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000))

	// --- Register model ---
	regResp, err := msgServer.RegisterModel(f.ctx, &types.MsgRegisterModel{
		Owner:              creator,
		Name:               "PremiumModel",
		Description:        "Paid access model",
		Framework:          "pytorch",
		Architecture:       "transformer",
		License:            "commercial",
		StorageType:        "uri",
		StorageUri:         "https://models.clawchain.io/premium",
		AccessType:         "one_time",
		PriceOneTimeUclaw:  "5000000",
	})
	require.NoError(t, err)

	// --- Purchase access ---
	_, err = msgServer.PurchaseAccess(f.ctx, &types.MsgPurchaseAccess{
		Buyer:   buyer,
		ModelId: regResp.ModelId,
	})
	require.NoError(t, err)
}
