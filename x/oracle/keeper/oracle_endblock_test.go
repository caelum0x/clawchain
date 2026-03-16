package keeper_test

import (
	"crypto/sha256"
	"fmt"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/oracle/types"
)

func TestEndBlockAggregation(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Set vote period to 1 so EndBlocker fires immediately
	params := types.DefaultParams
	params.VotePeriod = 1
	err := k.SetParams(ctx, params)
	require.NoError(t, err)

	// Set block height to a multiple of vote period
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx = sdkCtx.WithBlockHeight(10)
	ctx = sdkCtx

	// 3 validators submit votes: 1.5, 1.6, 1.4
	validators := []string{testValidator, testValidator2, testValidator3}
	prices := []string{"CLAW/USD:1.5", "CLAW/USD:1.6", "CLAW/USD:1.4"}

	for i, v := range validators {
		salt := fmt.Sprintf("salt%d", i)
		hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+prices[i]+v)))
		err := k.HandlePrevote(ctx, hash, v, v)
		require.NoError(t, err)
		err = k.HandleVote(ctx, salt, prices[i], v, v)
		require.NoError(t, err)
	}

	// Run EndBlocker
	err = k.EndBlocker(ctx)
	require.NoError(t, err)

	// Check canonical price is the median (1.5)
	rate, err := k.GetExchangeRate(ctx, "CLAW/USD")
	require.NoError(t, err)
	require.Equal(t, "1.500000", rate.Price)
}

func TestEndBlockMissCounter(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Set vote period to 1
	params := types.DefaultParams
	params.VotePeriod = 1
	err := k.SetParams(ctx, params)
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx = sdkCtx.WithBlockHeight(10)
	ctx = sdkCtx

	// Only validator1 votes, validator2 and validator3 miss
	salt := "salt"
	rates := "CLAW/USD:1.5"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))
	err = k.HandlePrevote(ctx, hash, testValidator, testValidator)
	require.NoError(t, err)
	err = k.HandleVote(ctx, salt, rates, testValidator, testValidator)
	require.NoError(t, err)

	err = k.EndBlocker(ctx)
	require.NoError(t, err)

	// Check miss counters
	miss2, err := k.MissCounters.Get(ctx, testValidator2)
	require.NoError(t, err)
	require.Equal(t, uint64(1), miss2)

	miss3, err := k.MissCounters.Get(ctx, testValidator3)
	require.NoError(t, err)
	require.Equal(t, uint64(1), miss3)
}

func TestEndBlockSkipsNonVotePeriod(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// VotePeriod is 10, block height is 5 (not a multiple)
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx = sdkCtx.WithBlockHeight(5)
	ctx = sdkCtx

	// EndBlocker should be a no-op
	err := k.EndBlocker(ctx)
	require.NoError(t, err)
}

func TestEndBlockClearsVotes(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	params := types.DefaultParams
	params.VotePeriod = 1
	err := k.SetParams(ctx, params)
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx = sdkCtx.WithBlockHeight(10)
	ctx = sdkCtx

	salt := "salt"
	rates := "CLAW/USD:1.5"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))
	err = k.HandlePrevote(ctx, hash, testValidator, testValidator)
	require.NoError(t, err)
	err = k.HandleVote(ctx, salt, rates, testValidator, testValidator)
	require.NoError(t, err)

	err = k.EndBlocker(ctx)
	require.NoError(t, err)

	// Votes should be cleared
	_, err = k.Votes.Get(ctx, testValidator)
	require.Error(t, err, "votes should be cleared after EndBlocker")
}

func TestEndBlockTWAPUpdate(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	params := types.DefaultParams
	params.VotePeriod = 1
	err := k.SetParams(ctx, params)
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx = sdkCtx.WithBlockHeight(10)
	ctx = sdkCtx

	// Submit a vote
	salt := "salt"
	rates := "CLAW/USD:2.0"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))
	err = k.HandlePrevote(ctx, hash, testValidator, testValidator)
	require.NoError(t, err)
	err = k.HandleVote(ctx, salt, rates, testValidator, testValidator)
	require.NoError(t, err)

	err = k.EndBlocker(ctx)
	require.NoError(t, err)

	// TWAP should exist
	twapJSON, err := k.TWAPStore.Get(ctx, "CLAW/USD")
	require.NoError(t, err)
	require.NotEmpty(t, twapJSON)
}

func TestEndBlockPriceHistory(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	params := types.DefaultParams
	params.VotePeriod = 1
	err := k.SetParams(ctx, params)
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx = sdkCtx.WithBlockHeight(10)
	ctx = sdkCtx

	// Submit a vote
	salt := "salt"
	rates := "CLAW/USD:1.8"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))
	err = k.HandlePrevote(ctx, hash, testValidator, testValidator)
	require.NoError(t, err)
	err = k.HandleVote(ctx, salt, rates, testValidator, testValidator)
	require.NoError(t, err)

	err = k.EndBlocker(ctx)
	require.NoError(t, err)

	// Price history should have an entry
	history, err := k.QueryPriceHistory(ctx, "CLAW/USD", 10)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, "1.800000", history[0].Price)
}
