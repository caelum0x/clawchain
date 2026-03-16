//go:build integration
// +build integration

package keeper_test

import (
	"encoding/json"
	"fmt"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/types"
)

// getModel is a test helper that fetches and unmarshals a model from the store.
func getModel(t *testing.T, f *fixture, id uint64) types.ModelRecord {
	t.Helper()
	raw, err := f.keeper.Models.Get(f.ctx, id)
	require.NoError(t, err)
	var model types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &model))
	return model
}

// ---------------------------------------------------------------------------
// Full Lifecycle: Register → Publish Version → Purchase → Rate → Inference
// ---------------------------------------------------------------------------

func TestModelRegistryLifecycle_RegisterPublishPurchaseRate(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()
	rater := validRater()

	// Fund buyer
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000)))

	// --- Step 1: Register model ---
	model := testModel()
	model.AccessType = "one_time"
	model.PriceOneTimeUclaw = "1000000"
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)
	t.Logf("Step 1: Model registered — ID=%d", modelID)

	// Verify model stored
	stored := getModel(t, f, modelID)
	require.Equal(t, "TestModel", stored.Name)
	require.Equal(t, owner, stored.Owner)
	require.True(t, stored.Active)
	require.Equal(t, "one_time", stored.AccessType)

	// --- Step 2: Publish new version ---
	version := types.ModelVersion{
		StorageUri:     "ipfs://QmNewVersionHash",
		ChecksumSha256: "newchecksum456",
		SizeBytes:      2_000_000,
		Changelog:      "Improved accuracy by 15%",
	}
	versionID, err := f.keeper.PublishVersion(f.ctx, modelID, owner, version)
	require.NoError(t, err)
	t.Logf("Step 2: Version published — VersionID=%d", versionID)

	// --- Step 3: Purchase access ---
	err = f.keeper.PurchaseAccess(f.ctx, modelID, buyer, 0)
	require.NoError(t, err)
	t.Log("Step 3: Access purchased")

	// Verify payment deducted
	buyerBal := f.bankKeeper.accountBalances[buyer]
	require.True(t, buyerBal.AmountOf("uclaw").LT(math.NewInt(50_000_000)),
		"buyer balance should be reduced after purchase")

	// --- Step 4: Rate model ---
	err = f.keeper.RateModel(f.ctx, modelID, rater, 5)
	require.NoError(t, err)
	t.Log("Step 4: Model rated 5/5")

	// Verify rating recorded
	stored = getModel(t, f, modelID)
	require.True(t, stored.RatingCount > 0, "rating count should be > 0")
	t.Log("Full model lifecycle complete")
}

// TestModelRegistryLifecycle_FreeModelAccess tests that free models don't
// charge on access.
func TestModelRegistryLifecycle_FreeModelAccess(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.fundAccount(buyerAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))

	// Register free model
	model := testModel()
	model.AccessType = "free"
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Purchase access to free model (should succeed without charge)
	err = f.keeper.PurchaseAccess(f.ctx, modelID, buyer, 0)
	require.NoError(t, err)

	// Balance should be unchanged
	buyerBal := f.bankKeeper.accountBalances[buyer]
	require.Equal(t, math.NewInt(10_000_000), buyerBal.AmountOf("uclaw"),
		"balance should not change for free model")
}

// TestModelRegistryLifecycle_VersionOwnershipEnforced tests that only the
// model owner can publish versions.
func TestModelRegistryLifecycle_VersionOwnershipEnforced(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	attacker := validBuyer()

	model := testModel()
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Non-owner tries to publish version
	version := types.ModelVersion{
		StorageUri:     "ipfs://QmEvil",
		ChecksumSha256: "evil",
		SizeBytes:      1,
	}
	_, err = f.keeper.PublishVersion(f.ctx, modelID, attacker, version)
	require.Error(t, err, "non-owner should not publish versions")
}

// TestModelRegistryLifecycle_InferenceJobSubmission tests the inference
// marketplace: submit job → payment flow.
func TestModelRegistryLifecycle_InferenceJobSubmission(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	requester := validBuyer()

	// Fund requester
	requesterAddr, _ := sdk.AccAddressFromBech32(requester)
	f.bankKeeper.fundAccount(requesterAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// Register model with per_query pricing
	model := testModel()
	model.AccessType = "per_query"
	model.PricePerQueryUclaw = "500000"
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Set inference pricing
	err = f.keeper.SetInferencePricing(
		f.ctx,
		modelID,
		owner,
		math.NewInt(100),    // pricePerToken
		math.NewInt(500000), // pricePerQuery
		math.NewInt(500000), // minPayment
		4096,                // maxTokens
	)
	require.NoError(t, err)

	// Submit inference job
	payment := math.NewInt(500000)
	jobID, err := f.keeper.SubmitInferenceJob(
		f.ctx,
		modelID,
		0, // latest version
		requester,
		"What is the meaning of life?",
		1024,  // maxTokens
		"0.7", // temperature
		payment,
	)
	require.NoError(t, err)
	require.True(t, jobID >= 0)
	t.Logf("Inference job submitted — ID=%d", jobID)

	// Verify payment escrowed
	requesterBal := f.bankKeeper.accountBalances[requester]
	require.True(t, requesterBal.AmountOf("uclaw").LT(math.NewInt(100_000_000)),
		"requester balance should be reduced by inference payment")
}

// TestModelRegistryLifecycle_MultipleVersions tests publishing multiple
// versions and verifying the current version number increases.
func TestModelRegistryLifecycle_MultipleVersions(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()

	model := testModel()
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Model starts with CurrentVersion = 1
	stored := getModel(t, f, modelID)
	initialVersion := stored.CurrentVersion
	require.Equal(t, uint64(1), initialVersion)

	// Publish 3 more versions
	for i := 1; i <= 3; i++ {
		version := types.ModelVersion{
			StorageUri:     fmt.Sprintf("ipfs://QmVersion%d", i),
			ChecksumSha256: fmt.Sprintf("checksum_%d", i),
			SizeBytes:      uint64(1_000_000 * (i + 1)),
			Changelog:      fmt.Sprintf("Version %d improvements", i+1),
		}
		_, err := f.keeper.PublishVersion(f.ctx, modelID, owner, version)
		require.NoError(t, err)
	}

	// Verify current version increased
	stored = getModel(t, f, modelID)
	require.Equal(t, initialVersion+3, stored.CurrentVersion,
		"current version should increase by 3")
}

// TestModelRegistryLifecycle_InsufficientFundsForPaidModel tests that
// purchasing a paid model fails with insufficient funds.
func TestModelRegistryLifecycle_InsufficientFundsForPaidModel(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()
	buyer := validBuyer()

	// Don't fund the buyer

	model := testModel()
	model.AccessType = "one_time"
	model.PriceOneTimeUclaw = "5000000"
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	err = f.keeper.PurchaseAccess(f.ctx, modelID, buyer, 0)
	require.Error(t, err, "should fail with insufficient funds")
}

// TestModelRegistryLifecycle_RatingSelfRejected tests that owners cannot
// rate their own models.
func TestModelRegistryLifecycle_RatingSelfRejected(t *testing.T) {
	f := initFixture(t)
	owner := validOwner()

	model := testModel()
	modelID, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)

	// Owner tries to rate own model
	err = f.keeper.RateModel(f.ctx, modelID, owner, 5)
	require.Error(t, err, "self-rating should be rejected")
}
