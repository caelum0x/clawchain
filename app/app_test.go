package app_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/stretchr/testify/require"

	"clawchain/app"
)

func TestNewApp(t *testing.T) {
	application := app.Setup(t, false)
	require.NotNil(t, application)
	require.Equal(t, "clawchain", application.Name())

	// Verify critical keepers are wired.
	require.NotNil(t, application.AppCodec())
	require.NotNil(t, application.InterfaceRegistry())
	require.NotNil(t, application.TxConfig())
	require.NotNil(t, application.SimulationManager())
}

func TestExportAppState(t *testing.T) {
	application := app.Setup(t, false)
	require.NotNil(t, application)

	// Export at the current height (non-zero).
	exported, err := application.ExportAppStateAndValidators(false, nil, nil)
	require.NoError(t, err)
	require.NotEmpty(t, exported.AppState)
	require.True(t, exported.Height > 0, "exported height should be positive")
}

func TestExportAppStateZeroHeight(t *testing.T) {
	application := app.Setup(t, false)
	require.NotNil(t, application)

	// Export for zero-height (genesis restart).
	exported, err := application.ExportAppStateAndValidators(true, nil, nil)
	require.NoError(t, err)
	require.NotEmpty(t, exported.AppState)
	require.Equal(t, int64(0), exported.Height)
}

func TestSetupWithGenesisAccounts(t *testing.T) {
	privKey := secp256k1.GenPrivKey()
	pubKey := privKey.PubKey()
	addr := sdk.AccAddress(pubKey.Address())

	acc := authtypes.NewBaseAccount(addr, pubKey, 0, 0)
	balance := banktypes.Balance{
		Address: addr.String(),
		Coins:   sdk.NewCoins(sdk.NewCoin("uclaw", math.NewInt(1_000_000_000))),
	}

	application := app.SetupWithGenesisAccounts(t, []authtypes.GenesisAccount{acc}, balance)
	require.NotNil(t, application)
	require.Equal(t, "clawchain", application.Name())
}

func TestInitGenesisOnMigration(t *testing.T) {
	application := app.Setup(t, false)
	require.NotNil(t, application)

	ctx := app.NewContextForTest(application)

	// Verify the module manager can report its version map (used during migrations).
	versionMap := application.ModuleManager.GetVersionMap()
	require.NotEmpty(t, versionMap, "version map should not be empty after init")

	// Ensure the context is usable (basic sanity).
	require.NotZero(t, ctx.BlockHeight())
}

func TestGetSubspace(t *testing.T) {
	application := app.Setup(t, false)
	if application == nil {
		return
	}

	// Verify GetSubspace returns a valid (possibly empty) subspace for a known module.
	subspace := application.GetSubspace("staking")
	require.NotNil(t, subspace)
}
