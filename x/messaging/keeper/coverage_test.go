package keeper_test

import (
	"testing"

	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/messaging/keeper"
	"clawchain/x/messaging/types"
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

func TestGenesisExportImportWithMessages(t *testing.T) {
	f := initFixture(t)

	// Send some messages to populate state.
	sendMessage(t, f, validAddress(), validAddress2(), "hello", "n1")
	sendMessage(t, f, validAddress2(), validAddress(), "reply", "n2")

	// Export genesis.
	exported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, exported)

	// Genesis only carries params (messages are in collections, not genesis).
	// Verify params round-trip correctly.
	require.Equal(t, types.DefaultParams(), exported.Params)

	// Import into a fresh fixture.
	f2 := initFixture(t)
	err = f2.keeper.InitGenesis(f2.ctx, *exported)
	require.NoError(t, err)

	reExported, err := f2.keeper.ExportGenesis(f2.ctx)
	require.NoError(t, err)
	require.Equal(t, exported.Params, reExported.Params)
}

// ---------------------------------------------------------------------------
// Query params test
// ---------------------------------------------------------------------------

func TestQueryParams(t *testing.T) {
	f := initFixture(t)

	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Params(f.ctx, &types.QueryParamsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, types.DefaultMaxMessageSize, resp.Params.MaxMessageSize)
}

func TestGetAuthority(t *testing.T) {
	f := initFixture(t)
	expected := authtypes.NewModuleAddress(types.GovModuleName).Bytes()
	require.Equal(t, expected, f.keeper.GetAuthority())
}

func TestUpdateParamsMsgServer(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	authority, err := f.addressCodec.BytesToString(f.keeper.GetAuthority())
	require.NoError(t, err)

	_, err = msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: authority,
		Params: types.Params{
			MaxMessageSize: 8192,
		},
	})
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.EqualValues(t, 8192, params.MaxMessageSize)

	_, err = msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: "bad-authority",
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)

	_, err = msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: validAddress(),
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)
}
