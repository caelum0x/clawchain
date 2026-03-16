package keeper_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/oracle/types"
)

func TestQueryPrice(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Set an exchange rate via the collections API
	rate := types.ExchangeRate{
		DenomPair:   "CLAW/USD",
		Price:       "1.5",
		BlockHeight: 10,
		Timestamp:   1000,
	}
	rateJSON, err := json.Marshal(rate)
	require.NoError(t, err)
	err = k.ExchangeRates.Set(ctx, rate.DenomPair, string(rateJSON))
	require.NoError(t, err)

	// Query it
	result, err := k.QueryPrice(ctx, "CLAW/USD")
	require.NoError(t, err)
	require.Equal(t, "1.5", result.Price)
	require.Equal(t, "CLAW/USD", result.DenomPair)
}

func TestQueryPriceNotAvailable(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	_, err := k.QueryPrice(ctx, "NONEXISTENT/PAIR")
	require.Error(t, err)
}

func TestQueryPrices(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Set multiple rates via the collections API
	for _, r := range []types.ExchangeRate{
		{DenomPair: "CLAW/USD", Price: "1.5"},
		{DenomPair: "CLAW/ATOM", Price: "0.12"},
	} {
		data, err := json.Marshal(r)
		require.NoError(t, err)
		err = k.ExchangeRates.Set(ctx, r.DenomPair, string(data))
		require.NoError(t, err)
	}

	rates, err := k.QueryPrices(ctx)
	require.NoError(t, err)
	require.Len(t, rates, 2)
}

func TestQueryMissCounter(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Set a miss counter
	err := k.MissCounters.Set(ctx, testValidator, 5)
	require.NoError(t, err)

	count, err := k.QueryMissCounter(ctx, testValidator)
	require.NoError(t, err)
	require.Equal(t, uint64(5), count)
}

func TestQueryMissCounterZero(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// No misses recorded
	count, err := k.QueryMissCounter(ctx, testValidator)
	require.NoError(t, err)
	require.Equal(t, uint64(0), count)
}

func TestQueryPriceHistoryEmpty(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// No price history exists yet, so QueryPriceHistory returns an error
	_, err := k.QueryPriceHistory(ctx, "CLAW/USD", 10)
	require.Error(t, err)
}

func TestGetSetParams(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	params := k.GetParams(ctx)
	require.Equal(t, uint64(10), params.VotePeriod)
	require.Equal(t, "0.50", params.VoteThreshold)

	// Modify and set
	params.VotePeriod = 20
	err := k.SetParams(ctx, params)
	require.NoError(t, err)

	// Verify
	params2 := k.GetParams(ctx)
	require.Equal(t, uint64(20), params2.VotePeriod)
}
