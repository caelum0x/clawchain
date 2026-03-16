package keeper_test

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/modelregistry/types"
)

// ---------------------------------------------------------------------------
// Genesis export/import tests
// ---------------------------------------------------------------------------

func TestGenesisExportImportEmpty(t *testing.T) {
	f := initFixture(t)

	// Initialize genesis with empty state.
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	// Export genesis from the empty state.
	exported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, exported)
	require.Empty(t, exported.Models)

	// Import exported genesis into a fresh fixture.
	f2 := initFixture(t)
	err = f2.keeper.InitGenesis(f2.ctx, *exported)
	require.NoError(t, err)

	// Re-export and verify it is still empty.
	reExported, err := f2.keeper.ExportGenesis(f2.ctx)
	require.NoError(t, err)
	require.Empty(t, reExported.Models)
}

func TestGenesisExportImportWithModels(t *testing.T) {
	f := initFixture(t)

	// Initialize genesis.
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	// Register a model via the keeper.
	owner := validOwner()
	model := testModel()

	id, err := f.keeper.RegisterModel(f.ctx, owner, model)
	require.NoError(t, err)
	require.Equal(t, uint64(1), id)

	// Export genesis.
	exported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.Len(t, exported.Models, 1)
	require.Equal(t, "TestModel", exported.Models[0].Name)
	require.Equal(t, owner, exported.Models[0].Owner)

	// Import into a fresh fixture.
	f2 := initFixture(t)
	err = f2.keeper.InitGenesis(f2.ctx, *exported)
	require.NoError(t, err)

	// Verify model was imported by reading from store.
	raw, err := f2.keeper.Models.Get(f2.ctx, id)
	require.NoError(t, err)

	var stored types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, "TestModel", stored.Name)
	require.Equal(t, owner, stored.Owner)
	require.True(t, stored.Active)
}

// ---------------------------------------------------------------------------
// UpdateParam tests
// ---------------------------------------------------------------------------

func TestUpdateParam_MinDepositUclaw(t *testing.T) {
	f := initFixture(t)

	// Initialize params.
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	// Update min_deposit_uclaw.
	err = f.keeper.UpdateParam(f.ctx, "min_deposit_uclaw", "5000000")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(5000000), params.MinDepositUclaw)

	// Verify other params remain at defaults.
	require.Equal(t, types.DefaultMaxModels, params.MaxModels)
	require.Equal(t, types.DefaultPlatformFeeBps, params.PlatformFeeBps)
}

func TestUpdateParam_MaxModels(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	err = f.keeper.UpdateParam(f.ctx, "max_models", "200")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(200), params.MaxModels)

	// Verify other params remain at defaults.
	require.Equal(t, types.DefaultMinDepositUclaw, params.MinDepositUclaw)
	require.Equal(t, types.DefaultPlatformFeeBps, params.PlatformFeeBps)
}

func TestUpdateParam_PlatformFeeBps(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	err = f.keeper.UpdateParam(f.ctx, "platform_fee_bps", "250")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(250), params.PlatformFeeBps)

	// Verify other params remain at defaults.
	require.Equal(t, types.DefaultMinDepositUclaw, params.MinDepositUclaw)
	require.Equal(t, types.DefaultMaxModels, params.MaxModels)
}

func TestUpdateParam_UnknownKey(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	err = f.keeper.UpdateParam(f.ctx, "nonexistent_key", "42")
	require.Error(t, err)
	require.Contains(t, err.Error(), "unknown modelregistry param key")
}

func TestUpdateParam_InvalidValue(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	err = f.keeper.UpdateParam(f.ctx, "min_deposit_uclaw", "not_a_number")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

// ---------------------------------------------------------------------------
// Direct query coverage tests
// ---------------------------------------------------------------------------

func TestQueryModels_WithFilters(t *testing.T) {
	f := initFixture(t)

	modelA := testModel()
	modelA.Name = "Vision-Free"
	modelA.Framework = "PyTorch"
	modelA.AccessType = "free"
	modelA.Tags = []string{"vision", "image"}
	idA, err := f.keeper.RegisterModel(f.ctx, validOwner(), modelA)
	require.NoError(t, err)

	modelB := testModel()
	modelB.Name = "NLP-Paid"
	modelB.Framework = "tensorflow"
	modelB.AccessType = "per_query"
	modelB.Tags = []string{"nlp"}
	_, err = f.keeper.RegisterModel(f.ctx, validOwner(), modelB)
	require.NoError(t, err)

	// Mark A inactive to cover the inactive skip path.
	rawA, err := f.keeper.Models.Get(f.ctx, idA)
	require.NoError(t, err)
	var recA types.ModelRecord
	require.NoError(t, json.Unmarshal([]byte(rawA), &recA))
	recA.Active = false
	updatedA, err := json.Marshal(recA)
	require.NoError(t, err)
	require.NoError(t, f.keeper.Models.Set(f.ctx, idA, string(updatedA)))

	all, err := f.keeper.QueryModels(f.ctx, "", nil, false)
	require.NoError(t, err)
	require.Len(t, all, 1)
	require.Equal(t, "NLP-Paid", all[0].Name)

	freeOnly, err := f.keeper.QueryModels(f.ctx, "", nil, true)
	require.NoError(t, err)
	require.Empty(t, freeOnly)

	filtered, err := f.keeper.QueryModels(f.ctx, "TensorFlow", []string{"NLP"}, false)
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	require.Equal(t, "NLP-Paid", filtered[0].Name)
}

func TestQueryModelAccess_FoundAndNotFound(t *testing.T) {
	f := initFixture(t)

	modelID, err := f.keeper.RegisterModel(f.ctx, validOwner(), testModel())
	require.NoError(t, err)

	_, err = f.keeper.QueryModelAccess(f.ctx, modelID, validBuyer())
	require.ErrorIs(t, err, types.ErrNoAccess)

	access := types.ModelAccess{
		ModelId:    modelID,
		Address:    validBuyer(),
		GrantedAt:  100,
		ExpiresAt:  200,
		QueryCount: 3,
	}
	bz, err := json.Marshal(access)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ModelAccess.Set(f.ctx, fmt.Sprintf("%d/%s", modelID, validBuyer()), string(bz)))

	got, err := f.keeper.QueryModelAccess(f.ctx, modelID, validBuyer())
	require.NoError(t, err)
	require.Equal(t, access.Address, got.Address)
	require.Equal(t, access.QueryCount, got.QueryCount)
}
