package keeper_test

import (
	"context"
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

	"clawchain/x/modelregistry/keeper"
	module "clawchain/x/modelregistry/module"
	"clawchain/x/modelregistry/types"
)

// mockBankKeeper for modelregistry tests.
type mockBankKeeper struct {
	moduleBalances  map[string]sdk.Coins
	accountBalances map[string]sdk.Coins
}

func newMockBankKeeper() *mockBankKeeper {
	return &mockBankKeeper{
		moduleBalances:  make(map[string]sdk.Coins),
		accountBalances: make(map[string]sdk.Coins),
	}
}

func (m *mockBankKeeper) fundAccount(addr sdk.AccAddress, coins sdk.Coins) {
	key := addr.String()
	m.accountBalances[key] = m.accountBalances[key].Add(coins...)
}

func (m *mockBankKeeper) SendCoins(_ context.Context, fromAddr, toAddr sdk.AccAddress, amt sdk.Coins) error {
	key := fromAddr.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.accountBalances[toAddr.String()] = m.accountBalances[toAddr.String()].Add(amt...)
	return nil
}

func (m *mockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.accountBalances[addr.String()]
}

func (m *mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error {
	key := senderAddr.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.moduleBalances[recipientModule] = m.moduleBalances[recipientModule].Add(amt...)
	return nil
}

func (m *mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[senderModule]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds in module %s", senderModule)
	}
	m.moduleBalances[senderModule] = newBal
	m.accountBalances[recipientAddr.String()] = m.accountBalances[recipientAddr.String()].Add(amt...)
	return nil
}

// mockReputationKeeper records SlashReputation and RestoreReputation calls so
// dispute/resolve tests can assert the provider was slashed and later restored.
// It implements types.ReputationKeeper.
type mockReputationKeeper struct {
	slashed  map[string]uint64
	restored map[string]uint64
}

func newMockReputationKeeper() *mockReputationKeeper {
	return &mockReputationKeeper{
		slashed:  make(map[string]uint64),
		restored: make(map[string]uint64),
	}
}

func (m *mockReputationKeeper) SlashReputation(_ context.Context, agentAddress string, points uint64) error {
	m.slashed[agentAddress] += points
	return nil
}

func (m *mockReputationKeeper) RestoreReputation(_ context.Context, agentAddress string, points uint64) error {
	m.restored[agentAddress] += points
	return nil
}

type fixture struct {
	ctx              context.Context
	keeper           keeper.Keeper
	addressCodec     address.Codec
	bankKeeper       *mockBankKeeper
	reputationKeeper *mockReputationKeeper
}

func initFixture(t *testing.T) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newMockBankKeeper()
	rk := newMockReputationKeeper()

	k := keeper.NewKeeper(storeService, encCfg.Codec, addressCodec, authority, bk, rk)

	return &fixture{
		ctx:              ctx,
		keeper:           k,
		addressCodec:     addressCodec,
		bankKeeper:       bk,
		reputationKeeper: rk,
	}
}

func validOwner() string {
	return sdk.AccAddress([]byte("owner1______________")).String()
}

func validBuyer() string {
	return sdk.AccAddress([]byte("buyer1______________")).String()
}

func validRater() string {
	return sdk.AccAddress([]byte("rater1______________")).String()
}

func testModel() types.ModelRecord {
	return types.ModelRecord{
		Name:           "TestModel",
		Description:    "A test model",
		Framework:      "pytorch",
		Architecture:   "transformer",
		ParameterCount: "7B",
		License:        "apache-2.0",
		StorageType:    "ipfs",
		StorageUri:     "ipfs://QmTestHash123",
		ChecksumSha256: "abc123def456",
		SizeBytes:      1_000_000,
		AccessType:     "free",
	}
}

// ---------------------------------------------------------------------------
// RegisterModel tests
// ---------------------------------------------------------------------------

func TestRegisterModelSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)
	require.Equal(t, uint64(1), id)

	// Verify model stored
	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)

	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, "TestModel", stored.Name)
	require.Equal(t, owner, stored.Owner)
	require.True(t, stored.Active)
	require.Equal(t, uint64(1), stored.CurrentVersion)
	require.Equal(t, "0", stored.TotalRevenue)
}

func TestRegisterModelEmptyName(t *testing.T) {
	f := initFixture(t)
	model := testModel()
	model.Name = ""

	_, err := f.keeper.RegisterModel(f.ctx, validOwner(), model)
	require.Error(t, err)
	require.Contains(t, err.Error(), "name cannot be empty")
}

func TestRegisterModelEmptyStorageUri(t *testing.T) {
	f := initFixture(t)
	model := testModel()
	model.StorageUri = ""

	_, err := f.keeper.RegisterModel(f.ctx, validOwner(), model)
	require.Error(t, err)
}

func TestRegisterModelInvalidFramework(t *testing.T) {
	f := initFixture(t)
	model := testModel()
	model.Framework = "invalid_framework"

	_, err := f.keeper.RegisterModel(f.ctx, validOwner(), model)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsupported framework")
}

func TestRegisterModelInvalidAccessType(t *testing.T) {
	f := initFixture(t)
	model := testModel()
	model.AccessType = "invalid_access"

	_, err := f.keeper.RegisterModel(f.ctx, validOwner(), model)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsupported access type")
}

func TestRegisterModelInvalidOwner(t *testing.T) {
	f := initFixture(t)
	model := testModel()

	_, err := f.keeper.RegisterModel(f.ctx, "bad_address", model)
	require.Error(t, err)
}

func TestRegisterModelCreatesInitialVersion(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Verify initial version created
	versionKey := fmt.Sprintf("%d/%d", id, 1)
	raw, err := f.keeper.ModelVersions.Get(f.ctx, versionKey)
	require.NoError(t, err)

	var version types.ModelVersion
	require.NoError(t, json.Unmarshal([]byte(raw), &version))
	require.Equal(t, uint64(1), version.Version)
	require.Equal(t, model.StorageUri, version.StorageUri)
	require.Equal(t, "Initial release", version.Changelog)
}

// ---------------------------------------------------------------------------
// PublishVersion tests
// ---------------------------------------------------------------------------

func TestPublishVersionSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	newVersion := types.ModelVersion{
		StorageUri:     "ipfs://QmNewVersionHash",
		ChecksumSha256: "newchecksum",
		SizeBytes:      2_000_000,
		Changelog:      "Bug fixes and improvements",
	}

	ver, err := f.keeper.PublishVersion(f.ctx, id, owner, newVersion)
	require.NoError(t, err)
	require.Equal(t, uint64(2), ver)

	// Verify model updated
	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, uint64(2), stored.CurrentVersion)
	require.Equal(t, "ipfs://QmNewVersionHash", stored.StorageUri)
}

func TestPublishVersionNotOwner(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	notOwner := validBuyer()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	_, err = f.keeper.PublishVersion(f.ctx, id, notOwner, types.ModelVersion{
		StorageUri: "ipfs://QmTest",
	})
	require.Error(t, err)
}

func TestPublishVersionModelNotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.PublishVersion(f.ctx, 999, validOwner(), types.ModelVersion{})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// DelistModel tests
// ---------------------------------------------------------------------------

func TestDelistModelSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.DelistModel(f.ctx, id, owner)
	require.NoError(t, err)

	// Verify model is inactive
	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.False(t, stored.Active)
}

func TestDelistModelNotOwner(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.DelistModel(f.ctx, id, validBuyer())
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// PurchaseAccess tests
// ---------------------------------------------------------------------------

func TestPurchaseAccessFreeModel(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	model := testModel()
	model.AccessType = "free"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 0)
	require.NoError(t, err)

	// Verify access granted
	accessKey := fmt.Sprintf("%d/%s", id, buyer)
	raw, err := f.keeper.ModelAccess.Get(f.ctx, accessKey)
	require.NoError(t, err)

	var access types.ModelAccess
	require.NoError(t, json.Unmarshal([]byte(raw), &access))
	require.Equal(t, buyer, access.Address)
}

func TestPurchaseAccessPaidModelSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	model := testModel()
	model.AccessType = "one_time"
	model.PriceOneTimeUclaw = "1000000"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Fund buyer
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 0)
	require.NoError(t, err)

	// Verify payment transferred to owner
	ownerAddr, _ := sdk.AccAddressFromBech32(owner)
	ownerBal := f.bankKeeper.accountBalances[ownerAddr.String()]
	require.True(t, ownerBal.AmountOf("uclaw").Equal(math.NewInt(1_000_000)))

	// Verify revenue updated
	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, "1000000", stored.TotalRevenue)
	require.Equal(t, uint64(1), stored.TotalDownloads)
}

func TestPurchaseAccessInsufficientFunds(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	model := testModel()
	model.AccessType = "one_time"
	model.PriceOneTimeUclaw = "1000000"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Buyer has no funds
	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 0)
	require.Error(t, err)
}

func TestPurchaseAccessInactiveModel(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Delist the model
	err = f.keeper.DelistModel(f.ctx, id, owner)
	require.NoError(t, err)

	err = f.keeper.PurchaseAccess(f.ctx, id, validBuyer(), 0)
	require.Error(t, err)
}

func TestPurchaseAccessPerQueryGrantsAccessWithoutCharge(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	model := testModel()
	model.AccessType = "per_query"
	model.PricePerQueryUclaw = "100"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Per-query: no upfront charge
	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 0)
	require.NoError(t, err)

	// Access should be granted
	accessKey := fmt.Sprintf("%d/%s", id, buyer)
	_, err = f.keeper.ModelAccess.Get(f.ctx, accessKey)
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// RateModel tests
// ---------------------------------------------------------------------------

func TestRateModelSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	rater := validRater()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.RateModel(f.ctx, id, rater, 450) // 4.5 stars
	require.NoError(t, err)

	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, uint32(450), stored.Rating)
	require.Equal(t, uint32(1), stored.RatingCount)
}

func TestRateModelMultipleRatings(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	rater1 := sdk.AccAddress([]byte("rater1______________")).String()
	rater2 := sdk.AccAddress([]byte("rater2______________")).String()

	err = f.keeper.RateModel(f.ctx, id, rater1, 400)
	require.NoError(t, err)

	err = f.keeper.RateModel(f.ctx, id, rater2, 200)
	require.NoError(t, err)

	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	// Average: (400 + 200) / 2 = 300
	require.Equal(t, uint32(300), stored.Rating)
	require.Equal(t, uint32(2), stored.RatingCount)
}

func TestRateModelExceedsMax(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.RateModel(f.ctx, id, validRater(), 501)
	require.Error(t, err)
}

func TestRateModelSelfRating(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.RateModel(f.ctx, id, owner, 500)
	require.Error(t, err)
}

func TestRateModelNotFound(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.RateModel(f.ctx, 999, validRater(), 400)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// RecordUsage tests
// ---------------------------------------------------------------------------

func TestRecordUsageFreeModel(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	user := validBuyer()
	model := testModel()
	model.AccessType = "free"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.RecordUsage(f.ctx, id, user)
	require.NoError(t, err)

	// Verify usage recorded
	usageKey := fmt.Sprintf("%d/%s", id, user)
	raw, err := f.keeper.ModelUsage.Get(f.ctx, usageKey)
	require.NoError(t, err)

	var usage types.ModelUsageRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &usage))
	require.Equal(t, uint64(1), usage.QueryCount)
}

func TestRecordUsagePaidModelWithoutAccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()
	model.AccessType = "one_time"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.RecordUsage(f.ctx, id, validBuyer())
	require.Error(t, err)
}

func TestRecordUsagePerQueryCharges(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	user := validBuyer()
	model := testModel()
	model.AccessType = "per_query"
	model.PricePerQueryUclaw = "100"

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Grant access first
	err = f.keeper.PurchaseAccess(f.ctx, id, user, 0)
	require.NoError(t, err)

	// Fund user
	userAddr, _ := sdk.AccAddressFromBech32(user)
	f.bankKeeper.fundAccount(userAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000)))

	err = f.keeper.RecordUsage(f.ctx, id, user)
	require.NoError(t, err)

	// Verify payment
	ownerAddr, _ := sdk.AccAddressFromBech32(owner)
	ownerBal := f.bankKeeper.accountBalances[ownerAddr.String()]
	require.True(t, ownerBal.AmountOf("uclaw").Equal(math.NewInt(100)))
}

// ---------------------------------------------------------------------------
// UpdateModel tests
// ---------------------------------------------------------------------------

func TestUpdateModelSuccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.UpdateModel(f.ctx, id, owner, types.ModelRecord{
		Name:        "UpdatedModel",
		Description: "Updated description",
	})
	require.NoError(t, err)

	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, "UpdatedModel", stored.Name)
	require.Equal(t, "Updated description", stored.Description)
	// Framework should remain unchanged
	require.Equal(t, "pytorch", stored.Framework)
}

func TestUpdateModelNotOwner(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.UpdateModel(f.ctx, id, validBuyer(), types.ModelRecord{Name: "Hacked"})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Subscription access tests
// ---------------------------------------------------------------------------

func TestSubscriptionPurchaseAndExpiry(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	model := testModel()
	model.AccessType = "subscription"
	model.PriceSubscriptionUclaw = "500"
	model.SubscriptionPeriodBlocks = 100

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Fund buyer
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000)))

	// Purchase 1 period
	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 1)
	require.NoError(t, err)

	// Access should be granted with expiry
	accessKey := fmt.Sprintf("%d/%s", id, buyer)
	rawAccess, err := f.keeper.ModelAccess.Get(f.ctx, accessKey)
	require.NoError(t, err)

	var access types.ModelAccess
	require.NoError(t, json.Unmarshal([]byte(rawAccess), &access))
	require.Greater(t, access.ExpiresAt, int64(0))

	// Usage before expiry should work
	err = f.keeper.RecordUsage(f.ctx, id, buyer)
	require.NoError(t, err)

	// Verify payment of 500 uclaw
	ownerAddr, _ := sdk.AccAddressFromBech32(owner)
	ownerBal := f.bankKeeper.accountBalances[ownerAddr.String()]
	require.True(t, ownerBal.AmountOf("uclaw").Equal(math.NewInt(500)))
}

func TestSubscriptionRenewal(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	model := testModel()
	model.AccessType = "subscription"
	model.PriceSubscriptionUclaw = "500"
	model.SubscriptionPeriodBlocks = 100

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Fund buyer
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000)))

	// Purchase 1 period
	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 1)
	require.NoError(t, err)

	accessKey := fmt.Sprintf("%d/%s", id, buyer)
	rawAccess, err := f.keeper.ModelAccess.Get(f.ctx, accessKey)
	require.NoError(t, err)
	var access1 types.ModelAccess
	require.NoError(t, json.Unmarshal([]byte(rawAccess), &access1))

	// Renew for 2 more periods (should extend from current expiry)
	err = f.keeper.PurchaseAccess(f.ctx, id, buyer, 2)
	require.NoError(t, err)

	rawAccess2, err := f.keeper.ModelAccess.Get(f.ctx, accessKey)
	require.NoError(t, err)
	var access2 types.ModelAccess
	require.NoError(t, json.Unmarshal([]byte(rawAccess2), &access2))

	// Expiry should be extended by 200 blocks from original expiry
	require.Equal(t, access1.ExpiresAt+200, access2.ExpiresAt)

	// Verify total payment of 500 + 1000 = 1500 uclaw
	ownerAddr, _ := sdk.AccAddressFromBech32(owner)
	ownerBal := f.bankKeeper.accountBalances[ownerAddr.String()]
	require.True(t, ownerBal.AmountOf("uclaw").Equal(math.NewInt(1500)))
}

func TestSubscriptionNoPrice(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	model := testModel()
	model.AccessType = "subscription"
	// No subscription price set

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.PurchaseAccess(f.ctx, id, validBuyer(), 1)
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrNoSubscriptionPrice)
}
