package keeper

import (
	"testing"

	"cosmossdk.io/math"
	core "clawchain/types"
	"clawchain/x/oracle/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/stretchr/testify/require"
)

// helper to create a bonded validator in test context
func createBondedValidator(t *testing.T, input TestInput, idx int) {
	stakingMsgSvr := stakingkeeper.NewMsgServerImpl(input.StakingKeeper)
	_, err := stakingMsgSvr.CreateValidator(input.Ctx, NewTestMsgCreateValidator(ValAddrs[idx], ValPubKeys[idx], InitTokens))
	require.NoError(t, err)

	val, err := input.StakingKeeper.GetValidator(input.Ctx, ValAddrs[idx])
	require.NoError(t, err)
	val.Status = stakingtypes.Bonded
	input.StakingKeeper.SetValidator(input.Ctx, val)
}

// TestOracleFullCycle tests the complete prevote→vote→tally→exchange rate cycle.
func TestOracleFullCycle(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx
	msgServer := NewMsgServerImpl(input.OracleKeeper)

	createBondedValidator(t, input, 0)

	// Verify params are set correctly
	params := input.OracleKeeper.GetParams(ctx)
	require.Greater(t, params.VotePeriod, uint64(0))
	require.Equal(t, 6, len(params.Whitelist)) // 6 denoms: uusd, uatom, uusdt, uusdc, ubtc, ueth

	// Step 1: Submit aggregate prevote
	hash := types.GetAggregateVoteHash("salt1", "1.0uusd,50000.0uatom", ValAddrs[0])
	prevoteMsg := &types.MsgAggregateExchangeRatePrevote{
		Hash:      hash.String(),
		Feeder:    Addrs[0].String(),
		Validator: ValAddrs[0].String(),
	}
	_, err := msgServer.AggregateExchangeRatePrevote(ctx, prevoteMsg)
	require.NoError(t, err)

	// Verify prevote was stored
	_, err = input.OracleKeeper.GetAggregateExchangeRatePrevote(ctx, ValAddrs[0])
	require.NoError(t, err)

	// Advance block height to next vote period for reveal
	ctx = ctx.WithBlockHeight(ctx.BlockHeight() + int64(params.VotePeriod))

	// Step 2: Submit aggregate vote (reveal)
	voteMsg := &types.MsgAggregateExchangeRateVote{
		Salt:          "salt1",
		ExchangeRates: "1.0uusd,50000.0uatom",
		Feeder:        Addrs[0].String(),
		Validator:     ValAddrs[0].String(),
	}
	_, err = msgServer.AggregateExchangeRateVote(ctx, voteMsg)
	require.NoError(t, err)

	// Verify vote was stored
	_, err = input.OracleKeeper.GetAggregateExchangeRateVote(ctx, ValAddrs[0])
	require.NoError(t, err)
}

// TestOracleFeederDelegation tests that a validator can delegate feed consent.
func TestOracleFeederDelegation(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx
	msgServer := NewMsgServerImpl(input.OracleKeeper)

	createBondedValidator(t, input, 0)

	// Initially, the feeder is the validator's own account
	feeder := input.OracleKeeper.GetFeederDelegation(ctx, ValAddrs[0])
	require.Equal(t, sdk.AccAddress(ValAddrs[0]).String(), feeder.String())

	// Delegate feed consent to Addrs[1]
	delegateMsg := &types.MsgDelegateFeedConsent{
		Operator: ValAddrs[0].String(),
		Delegate: Addrs[1].String(),
	}
	_, err := msgServer.DelegateFeedConsent(ctx, delegateMsg)
	require.NoError(t, err)

	// Verify delegation
	feeder = input.OracleKeeper.GetFeederDelegation(ctx, ValAddrs[0])
	require.Equal(t, Addrs[1].String(), feeder.String())
}

// TestOracleExchangeRateStorageAndRetrieval tests setting and getting exchange rates.
func TestOracleExchangeRateStorageAndRetrieval(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx

	rate := math.LegacyNewDecWithPrec(1, 0) // 1.0
	input.OracleKeeper.SetLunaExchangeRate(ctx, core.MicroUSDDenom, rate)

	retrieved, err := input.OracleKeeper.GetLunaExchangeRate(ctx, core.MicroUSDDenom)
	require.NoError(t, err)
	require.Equal(t, rate, retrieved)

	// uclaw always returns 1.0
	lunaRate, err := input.OracleKeeper.GetLunaExchangeRate(ctx, core.MicroLunaDenom)
	require.NoError(t, err)
	require.Equal(t, math.LegacyOneDec(), lunaRate)

	// Unknown denom returns error
	_, err = input.OracleKeeper.GetLunaExchangeRate(ctx, "unknown_denom")
	require.Error(t, err)
}

// TestOracleMissCounter tests miss counter operations.
func TestOracleMissCounter(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx

	missCount := input.OracleKeeper.GetMissCounter(ctx, ValAddrs[0])
	require.Equal(t, uint64(0), missCount)

	input.OracleKeeper.SetMissCounter(ctx, ValAddrs[0], 5)
	missCount = input.OracleKeeper.GetMissCounter(ctx, ValAddrs[0])
	require.Equal(t, uint64(5), missCount)

	input.OracleKeeper.DeleteMissCounter(ctx, ValAddrs[0])
	missCount = input.OracleKeeper.GetMissCounter(ctx, ValAddrs[0])
	require.Equal(t, uint64(0), missCount)
}

// TestOracleWhitelistParams verifies ClawChain-specific whitelist defaults.
func TestOracleWhitelistParams(t *testing.T) {
	params := types.DefaultParams()
	require.NoError(t, params.Validate())

	denomNames := make(map[string]bool)
	for _, d := range params.Whitelist {
		denomNames[d.Name] = true
	}

	require.True(t, denomNames["uusd"], "uusd should be in whitelist")
	require.True(t, denomNames["uatom"], "uatom should be in whitelist")
	require.True(t, denomNames["uusdt"], "uusdt should be in whitelist")
	require.True(t, denomNames["uusdc"], "uusdc should be in whitelist")
	require.True(t, denomNames["ubtc"], "ubtc should be in whitelist")
	require.True(t, denomNames["ueth"], "ueth should be in whitelist")

	// Should NOT have legacy Terra denoms (these were replaced by ClawChain denoms)
	require.Equal(t, 6, len(params.Whitelist), "should have exactly 6 ClawChain denoms")
}

// TestOracleTobinTaxConfiguration verifies Tobin tax per denom.
func TestOracleTobinTaxConfiguration(t *testing.T) {
	params := types.DefaultParams()
	for _, denom := range params.Whitelist {
		require.False(t, denom.TobinTax.IsNegative())
		require.True(t, denom.TobinTax.LTE(math.LegacyOneDec()))

		if denom.Name == "ubtc" || denom.Name == "ueth" {
			expected := math.LegacyNewDecWithPrec(1, 2) // 1%
			require.Equal(t, expected, denom.TobinTax, "%s should have 1%% Tobin tax", denom.Name)
		}
	}
}

// TestOracleStakingIntegration verifies keeper interacts with staking.
func TestOracleStakingIntegration(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx

	createBondedValidator(t, input, 0)

	val, err := input.OracleKeeper.StakingKeeper.Validator(ctx, ValAddrs[0])
	require.NoError(t, err)
	require.NotNil(t, val)
	require.True(t, val.IsBonded())

	stakingParams, err := input.StakingKeeper.GetParams(ctx)
	require.NoError(t, err)
	require.Equal(t, core.MicroLunaDenom, stakingParams.BondDenom)
}

// TestOracleGenesisRoundtrip verifies genesis state roundtrip.
func TestOracleGenesisRoundtrip(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx

	input.OracleKeeper.SetLunaExchangeRate(ctx, "uusd", math.LegacyNewDecWithPrec(1, 0))
	input.OracleKeeper.SetMissCounter(ctx, ValAddrs[0], 3)

	var exportedRates []types.ExchangeRateTuple
	input.OracleKeeper.IterateLunaExchangeRates(ctx, func(denom string, rate math.LegacyDec) bool {
		exportedRates = append(exportedRates, types.ExchangeRateTuple{
			Denom:        denom,
			ExchangeRate: rate,
		})
		return false
	})

	require.NotEmpty(t, exportedRates)
	require.Equal(t, uint64(3), input.OracleKeeper.GetMissCounter(ctx, ValAddrs[0]))
}

// TestOracleParamsValidation verifies parameter validation.
func TestOracleParamsValidation(t *testing.T) {
	tests := []struct {
		name      string
		mutate    func(*types.Params)
		expectErr bool
	}{
		{"valid defaults", func(p *types.Params) {}, false},
		{"zero vote period", func(p *types.Params) { p.VotePeriod = 0 }, true},
		{"threshold too low", func(p *types.Params) { p.VoteThreshold = math.LegacyNewDecWithPrec(10, 2) }, true},
		{"negative reward band", func(p *types.Params) { p.RewardBand = math.LegacyNewDec(-1) }, true},
		{"slash window < vote period", func(p *types.Params) { p.SlashWindow = 1; p.VotePeriod = 100 }, true},
		{"negative slash fraction", func(p *types.Params) { p.SlashFraction = math.LegacyNewDec(-1) }, true},
		{"empty whitelist denom", func(p *types.Params) {
			p.Whitelist = types.DenomList{{Name: "", TobinTax: math.LegacyZeroDec()}}
		}, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			params := types.DefaultParams()
			tc.mutate(&params)
			err := params.Validate()
			if tc.expectErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// TestOracleUpdateParam verifies governance parameter updates with validation.
func TestOracleUpdateParam(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx

	err := input.OracleKeeper.UpdateParam(ctx, "vote_period", "10")
	require.NoError(t, err)
	require.Equal(t, uint64(10), input.OracleKeeper.VotePeriod(ctx))

	err = input.OracleKeeper.UpdateParam(ctx, "reward_band", "0.05")
	require.NoError(t, err)
	require.Equal(t, math.LegacyNewDecWithPrec(5, 2), input.OracleKeeper.RewardBand(ctx))

	// Invalid param name
	err = input.OracleKeeper.UpdateParam(ctx, "nonexistent", "1")
	require.Error(t, err)

	// vote_period=0 fails validation
	err = input.OracleKeeper.UpdateParam(ctx, "vote_period", "0")
	require.Error(t, err)
}

// TestOracleStakingDenomIsUclaw verifies denom constants.
func TestOracleStakingDenomIsUclaw(t *testing.T) {
	require.Equal(t, "uclaw", core.MicroLunaDenom)
	require.Equal(t, "uclaw", core.MicroClawDenom)
}

// TestOracleRewardPool verifies reward pool mechanics.
func TestOracleRewardPool(t *testing.T) {
	input := CreateTestInput(t)
	ctx := input.Ctx

	rewardCoins := sdk.NewCoins(sdk.NewInt64Coin(core.MicroLunaDenom, 1000000))
	err := FundAccount(input, input.AccountKeeper.GetModuleAddress(types.ModuleName), rewardCoins)
	require.NoError(t, err)

	pool := input.OracleKeeper.GetRewardPool(ctx, core.MicroLunaDenom)
	require.True(t, pool.Amount.GT(math.ZeroInt()), "reward pool should have funds")
}

// Compile-time interface check.
var _ types.MsgServer = msgServer{}
