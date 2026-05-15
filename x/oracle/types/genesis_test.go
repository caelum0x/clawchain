package types_test

import (
	"encoding/json"
	"testing"

	"clawchain/x/oracle/types"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/stretchr/testify/require"
)

func TestGenesisValidation(t *testing.T) {
	genState := types.DefaultGenesisState()
	require.NoError(t, types.ValidateGenesis(genState))

	genState.Params.VotePeriod = 0
	require.Error(t, types.ValidateGenesis(genState))
}

func TestGetGenesisStateFromAppState(t *testing.T) {
	interfaceRegistry := codectypes.NewInterfaceRegistry()
	cdc := codec.NewProtoCodec(interfaceRegistry)
	appState := make(map[string]json.RawMessage)

	defaultGenesisState := types.DefaultGenesisState()
	appState[types.ModuleName] = cdc.MustMarshalJSON(defaultGenesisState)
	require.Equal(t, *defaultGenesisState, *types.GetGenesisStateFromAppState(cdc, appState))
}
