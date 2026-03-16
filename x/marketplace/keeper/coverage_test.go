package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// Genesis export/import tests
// ---------------------------------------------------------------------------

func TestGenesisExportImport(t *testing.T) {
	f := initFixture(t)

	// Export genesis from fixture (params already initialised by initFixture).
	exported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, exported)
	require.Equal(t, types.DefaultParams(), exported.Params)

	// Import exported genesis into a fresh fixture.
	f2 := initFixture(t)
	err = f2.keeper.InitGenesis(f2.ctx, *exported)
	require.NoError(t, err)

	// Re-export and verify params match.
	reExported, err := f2.keeper.ExportGenesis(f2.ctx)
	require.NoError(t, err)
	require.Equal(t, exported.Params, reExported.Params)
}

// ---------------------------------------------------------------------------
// UpdateParam tests
// ---------------------------------------------------------------------------

func TestUpdateParam_MaxSkillsPerAgent(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_skills_per_agent", "100")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(100), params.MaxSkillsPerAgent)
}

func TestUpdateParam_UnknownKey(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "nonexistent_key", "42")
	require.Error(t, err)
	require.Contains(t, err.Error(), "unknown marketplace param key")
}

func TestUpdateParam_InvalidValue(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_skills_per_agent", "not_a_number")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

// ---------------------------------------------------------------------------
// HasPurchased tests
// ---------------------------------------------------------------------------

func TestHasPurchased_NotFound(t *testing.T) {
	f := initFixture(t)

	has, err := f.keeper.HasPurchased(f.ctx, "buyer_addr", "seller_addr")
	require.NoError(t, err)
	require.False(t, has)
}

func TestHasPurchased_Found(t *testing.T) {
	f := initFixture(t)

	// Manually set a purchase record.
	err := f.keeper.Purchases.Set(f.ctx, "buyer_addr|seller_addr", true)
	require.NoError(t, err)

	has, err := f.keeper.HasPurchased(f.ctx, "buyer_addr", "seller_addr")
	require.NoError(t, err)
	require.True(t, has)
}
