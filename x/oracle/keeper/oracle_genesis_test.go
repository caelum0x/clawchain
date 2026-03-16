package keeper_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/oracle/types"
)

func TestInitExportGenesis(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Set up some state via the collections API (no SetExchangeRate method)
	rate := types.ExchangeRate{
		DenomPair:   "CLAW/USD",
		Price:       "1.5",
		BlockHeight: 10,
	}
	rateJSON, err := json.Marshal(rate)
	require.NoError(t, err)
	err = k.ExchangeRates.Set(ctx, rate.DenomPair, string(rateJSON))
	require.NoError(t, err)

	err = k.HandleDelegateFeeder(ctx, testValidator, testFeeder)
	require.NoError(t, err)

	err = k.MissCounters.Set(ctx, testValidator2, 3)
	require.NoError(t, err)

	// Export
	genState, err := k.ExportGenesis(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(10), genState.Params.VotePeriod)
	require.Len(t, genState.ExchangeRates, 1)
	require.Equal(t, testFeeder, genState.FeederDelegations[testValidator])
	require.Equal(t, uint64(3), genState.MissCounters[testValidator2])

	// Create a new keeper and init from exported genesis
	k2, ctx2 := setupOracleKeeper(t)
	err = k2.InitGenesis(ctx2, *genState)
	require.NoError(t, err)

	// Verify state was restored
	result, err := k2.GetExchangeRate(ctx2, "CLAW/USD")
	require.NoError(t, err)
	require.Equal(t, "1.5", result.Price)

	feeder, err := k2.FeederDelegations.Get(ctx2, testValidator)
	require.NoError(t, err)
	require.Equal(t, testFeeder, feeder)

	miss, err := k2.MissCounters.Get(ctx2, testValidator2)
	require.NoError(t, err)
	require.Equal(t, uint64(3), miss)
}

func TestDefaultGenesis(t *testing.T) {
	gs := types.DefaultGenesis()
	require.Equal(t, uint64(10), gs.Params.VotePeriod)
	require.Empty(t, gs.ExchangeRates)

	err := gs.Validate()
	require.NoError(t, err)
}

func TestValidateGenesisZeroVotePeriod(t *testing.T) {
	gs := types.GenesisState{
		Params: types.OracleParams{
			VotePeriod: 0,
			Whitelist:  []string{"CLAW/USD"},
		},
	}
	err := gs.Validate()
	require.Error(t, err)
}
