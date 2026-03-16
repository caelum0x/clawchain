package keeper_test

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"
)

// ---------------------------------------------------------------------------
// Query Server tests
// ---------------------------------------------------------------------------

func TestGRPCQueryPrice(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// Seed an exchange rate directly in the store.
	rate := types.ExchangeRate{
		DenomPair:   "CLAW/USD",
		Price:       "1.500000",
		BlockHeight: 10,
		Timestamp:   1000,
	}
	data, err := json.Marshal(rate)
	require.NoError(t, err)
	require.NoError(t, k.ExchangeRates.Set(ctx, rate.DenomPair, string(data)))

	resp, err := qs.Price(ctx, &types.QueryPriceRequest{DenomPair: "CLAW/USD"})
	require.NoError(t, err)
	require.NotNil(t, resp.Rate)
	require.Equal(t, "1.500000", resp.Rate.Price)
	require.Equal(t, "CLAW/USD", resp.Rate.DenomPair)
	require.Equal(t, int64(10), resp.Rate.BlockHeight)
	require.Equal(t, int64(1000), resp.Rate.Timestamp)
}

func TestGRPCQueryPriceNotFound(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	_, err := qs.Price(ctx, &types.QueryPriceRequest{DenomPair: "NONEXISTENT/PAIR"})
	require.Error(t, err)
}

func TestGRPCQueryPrices(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// Seed two exchange rates.
	for _, r := range []types.ExchangeRate{
		{DenomPair: "CLAW/USD", Price: "1.500000", BlockHeight: 10, Timestamp: 1000},
		{DenomPair: "CLAW/ATOM", Price: "0.120000", BlockHeight: 10, Timestamp: 1000},
	} {
		data, err := json.Marshal(r)
		require.NoError(t, err)
		require.NoError(t, k.ExchangeRates.Set(ctx, r.DenomPair, string(data)))
	}

	resp, err := qs.Prices(ctx, &types.QueryPricesRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Rates, 2)

	// Build a lookup by denom pair for order-independent assertion.
	byPair := make(map[string]types.ExchangeRate)
	for _, r := range resp.Rates {
		byPair[r.DenomPair] = r
	}
	require.Equal(t, "1.500000", byPair["CLAW/USD"].Price)
	require.Equal(t, "0.120000", byPair["CLAW/ATOM"].Price)
}

func TestGRPCQueryPriceHistory(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// Seed 5 price history entries for CLAW/USD.
	var history []types.PriceHistoryEntry
	for i := 0; i < 5; i++ {
		history = append(history, types.PriceHistoryEntry{
			Price:       fmt.Sprintf("%d.000000", i+1),
			BlockHeight: int64((i + 1) * 10),
			Timestamp:   int64((i + 1) * 100),
		})
	}
	data, err := json.Marshal(history)
	require.NoError(t, err)
	require.NoError(t, k.PriceHistory.Set(ctx, "CLAW/USD", string(data)))

	// Query with limit=3 — should return the last 3 entries.
	resp, err := qs.PriceHistory(ctx, &types.QueryPriceHistoryRequest{
		DenomPair: "CLAW/USD",
		Limit:     3,
	})
	require.NoError(t, err)
	require.Len(t, resp.Entries, 3)
	require.Equal(t, "3.000000", resp.Entries[0].Price)
	require.Equal(t, "5.000000", resp.Entries[2].Price)

	// Query with limit=0 — server defaults to 20, so all 5 should be returned.
	resp2, err := qs.PriceHistory(ctx, &types.QueryPriceHistoryRequest{
		DenomPair: "CLAW/USD",
		Limit:     0,
	})
	require.NoError(t, err)
	require.Len(t, resp2.Entries, 5)
}

func TestGRPCQueryFeederDelegation(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// Set a feeder delegation.
	require.NoError(t, k.FeederDelegations.Set(ctx, testValidator, testFeeder))

	resp, err := qs.FeederDelegation(ctx, &types.QueryFeederDelegationRequest{
		Validator: testValidator,
	})
	require.NoError(t, err)
	require.Equal(t, testFeeder, resp.Feeder)
}

func TestGRPCQueryFeederDelegationEmpty(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// No delegation set — should return empty string, no error.
	resp, err := qs.FeederDelegation(ctx, &types.QueryFeederDelegationRequest{
		Validator: testValidator,
	})
	require.NoError(t, err)
	require.Equal(t, "", resp.Feeder)
}

func TestGRPCQueryMissCounter(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// Set miss counter to 7.
	require.NoError(t, k.MissCounters.Set(ctx, testValidator, 7))

	resp, err := qs.MissCounter(ctx, &types.QueryMissCounterRequest{
		Validator: testValidator,
	})
	require.NoError(t, err)
	require.Equal(t, uint64(7), resp.MissCounter)
}

func TestGRPCQueryMissCounterZero(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	// No misses recorded — should return 0.
	resp, err := qs.MissCounter(ctx, &types.QueryMissCounterRequest{
		Validator: testValidator,
	})
	require.NoError(t, err)
	require.Equal(t, uint64(0), resp.MissCounter)
}

func TestGRPCQueryParams(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	qs := keeper.NewQueryServerImpl(k)

	resp, err := qs.Params(ctx, &types.QueryOracleParamsRequest{})
	require.NoError(t, err)
	require.Equal(t, types.DefaultParams.VotePeriod, resp.Params.VotePeriod)
	require.Equal(t, types.DefaultParams.VoteThreshold, resp.Params.VoteThreshold)
	require.Equal(t, types.DefaultParams.RewardBand, resp.Params.RewardBand)
	require.Equal(t, types.DefaultParams.SlashFraction, resp.Params.SlashFraction)
	require.Equal(t, types.DefaultParams.SlashWindow, resp.Params.SlashWindow)
	require.Equal(t, types.DefaultParams.MinValidPerWindow, resp.Params.MinValidPerWindow)
	require.ElementsMatch(t, types.DefaultParams.Whitelist, resp.Params.Whitelist)
}

// ---------------------------------------------------------------------------
// Msg Server tests
// ---------------------------------------------------------------------------

func TestGRPCMsgDelegateFeeder(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	ms := keeper.NewMsgServerImpl(k)

	_, err := ms.DelegateFeeder(ctx, &types.MsgDelegateFeeder{
		Validator: testValidator,
		Feeder:    testFeeder,
	})
	require.NoError(t, err)

	// Verify via query server that the delegation is stored.
	qs := keeper.NewQueryServerImpl(k)
	resp, err := qs.FeederDelegation(ctx, &types.QueryFeederDelegationRequest{
		Validator: testValidator,
	})
	require.NoError(t, err)
	require.Equal(t, testFeeder, resp.Feeder)
}

func TestGRPCMsgPrevote(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	ms := keeper.NewMsgServerImpl(k)

	hash := fmt.Sprintf("%x", sha256.Sum256([]byte("salt1"+"CLAW/USD:1.5"+testValidator)))

	// Validator submits its own prevote (feeder == validator).
	_, err := ms.AggregateExchangeRatePrevote(ctx, &types.MsgAggregateExchangeRatePrevote{
		Hash:      hash,
		Feeder:    testValidator,
		Validator: testValidator,
	})
	require.NoError(t, err)

	// Verify the prevote was stored by reading from the Prevotes collection.
	prevoteJSON, err := k.Prevotes.Get(ctx, testValidator)
	require.NoError(t, err)

	var stored types.AggregateExchangeRatePrevote
	require.NoError(t, json.Unmarshal([]byte(prevoteJSON), &stored))
	require.Equal(t, hash, stored.Hash)
	require.Equal(t, testValidator, stored.Voter)
}

func TestGRPCMsgPrevoteDelegatedFeeder(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	ms := keeper.NewMsgServerImpl(k)

	// Delegate feeder first.
	_, err := ms.DelegateFeeder(ctx, &types.MsgDelegateFeeder{
		Validator: testValidator,
		Feeder:    testFeeder,
	})
	require.NoError(t, err)

	hash := fmt.Sprintf("%x", sha256.Sum256([]byte("salt1"+"CLAW/USD:1.5"+testValidator)))

	// Delegated feeder submits a prevote on behalf of the validator.
	_, err = ms.AggregateExchangeRatePrevote(ctx, &types.MsgAggregateExchangeRatePrevote{
		Hash:      hash,
		Feeder:    testFeeder,
		Validator: testValidator,
	})
	require.NoError(t, err)

	prevoteJSON, err := k.Prevotes.Get(ctx, testValidator)
	require.NoError(t, err)

	var stored types.AggregateExchangeRatePrevote
	require.NoError(t, json.Unmarshal([]byte(prevoteJSON), &stored))
	require.Equal(t, hash, stored.Hash)
}

func TestGRPCMsgPrevoteUnauthorizedFeeder(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	ms := keeper.NewMsgServerImpl(k)

	// No delegation exists — a third-party feeder should be rejected.
	_, err := ms.AggregateExchangeRatePrevote(ctx, &types.MsgAggregateExchangeRatePrevote{
		Hash:      "somehash",
		Feeder:    testFeeder, // not the validator, not delegated
		Validator: testValidator,
	})
	require.Error(t, err)
}

func TestGRPCMsgUpdateParams(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	ms := keeper.NewMsgServerImpl(k)

	// The authority in setupOracleKeeper is []byte("authority").
	newParams := types.OracleParams{
		VotePeriod:        20,
		VoteThreshold:     "0.67",
		RewardBand:        "0.05",
		SlashFraction:     "0.001",
		SlashWindow:       200,
		MinValidPerWindow: "0.10",
		Whitelist:         []string{"CLAW/USD", "CLAW/BTC"},
	}

	_, err := ms.UpdateParams(ctx, &types.MsgUpdateOracleParams{
		Authority: "authority",
		Params:    newParams,
	})
	require.NoError(t, err)

	// Verify the params were updated.
	stored := k.GetParams(ctx)
	require.Equal(t, uint64(20), stored.VotePeriod)
	require.Equal(t, "0.67", stored.VoteThreshold)
	require.Equal(t, "0.05", stored.RewardBand)
	require.Equal(t, "0.001", stored.SlashFraction)
	require.Equal(t, uint64(200), stored.SlashWindow)
	require.Equal(t, "0.10", stored.MinValidPerWindow)
	require.ElementsMatch(t, []string{"CLAW/USD", "CLAW/BTC"}, stored.Whitelist)
}

func TestGRPCMsgUpdateParamsUnauthorized(t *testing.T) {
	k, ctx := setupOracleKeeper(t)
	ms := keeper.NewMsgServerImpl(k)

	_, err := ms.UpdateParams(ctx, &types.MsgUpdateOracleParams{
		Authority: "wrong-authority",
		Params:    types.DefaultParams,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "unauthorized")
}
