package oracle

import (
	"time"

	"cosmossdk.io/math"
	core "clawchain/types"
	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"
	"github.com/cosmos/cosmos-sdk/telemetry"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// EndBlocker is called at the end of every block
func EndBlocker(ctx sdk.Context, k keeper.Keeper) {
	defer telemetry.ModuleMeasureSince(types.ModuleName, time.Now(), telemetry.MetricKeyEndBlocker)

	params := k.GetParams(ctx)
	if core.IsPeriodLastBlock(ctx, params.VotePeriod) {

		// Build claim map over all validators in active set
		validatorClaimMap := make(map[string]types.Claim)

		maxValidators, err := k.StakingKeeper.MaxValidators(ctx)
		if err != nil {
			return
		}

		iterator, err := k.StakingKeeper.ValidatorsPowerStoreIterator(ctx)
		if err != nil {
			return
		}
		defer iterator.Close()

		powerReduction := k.StakingKeeper.PowerReduction(ctx)

		i := 0
		for ; iterator.Valid() && i < int(maxValidators); iterator.Next() {
			validator, err := k.StakingKeeper.Validator(ctx, iterator.Value())
			if err != nil {
				continue
			}

			// Exclude not bonded validator
			if validator.IsBonded() {
				valAddrStr := validator.GetOperator()
				valAddr, err := sdk.ValAddressFromBech32(valAddrStr)
				if err != nil {
					continue
				}
				validatorClaimMap[valAddrStr] = types.NewClaim(validator.GetConsensusPower(powerReduction), 0, 0, valAddr)
				i++
			}
		}

		// Denom-TobinTax map
		voteTargets := make(map[string]math.LegacyDec)
		k.IterateTobinTaxes(ctx, func(denom string, tobinTax math.LegacyDec) bool {
			voteTargets[denom] = tobinTax
			return false
		})

		// Clear all exchange rates
		k.IterateLunaExchangeRates(ctx, func(denom string, _ math.LegacyDec) (stop bool) {
			k.DeleteLunaExchangeRate(ctx, denom)
			return false
		})

		// Organize votes to ballot by denom
		// NOTE: **Filter out inactive or jailed validators**
		// NOTE: **Make abstain votes to have zero vote power**
		voteMap := k.OrganizeBallotByDenom(ctx, validatorClaimMap)

		if referenceDenom := PickReferenceDenom(ctx, k, voteTargets, voteMap); referenceDenom != "" {
			// make voteMap of reference denom to calculate cross exchange rates
			ballotRT := voteMap[referenceDenom]
			voteMapRT := ballotRT.ToMap()
			exchangeRateRT := ballotRT.WeightedMedian()

			// Iterate through ballots and update exchange rates; drop if not enough votes have been achieved.
			for denom, ballot := range voteMap {

				// Convert ballot to cross exchange rates
				if denom != referenceDenom {
					ballot = ballot.ToCrossRateWithSort(voteMapRT)
				}

				// Get weighted median of cross exchange rates
				exchangeRate := Tally(ballot, params.RewardBand, validatorClaimMap)

				// Transform into the original form uluna/stablecoin
				if denom != referenceDenom {
					exchangeRate = exchangeRateRT.Quo(exchangeRate)
				}

				// Set the exchange rate, emit ABCI event
				k.SetLunaExchangeRateWithEvent(ctx, denom, exchangeRate)
			}
		}

		//---------------------------
		// Do miss counting & slashing
		voteTargetsLen := len(voteTargets)
		for _, claim := range validatorClaimMap {
			// Skip abstain & valid voters
			if int(claim.WinCount) == voteTargetsLen {
				continue
			}

			// Increase miss counter
			k.SetMissCounter(ctx, claim.Recipient, k.GetMissCounter(ctx, claim.Recipient)+1)
		}

		// Distribute rewards to ballot winners
		k.RewardBallotWinners(
			ctx,
			(int64)(params.VotePeriod),
			(int64)(params.RewardDistributionWindow),
			voteTargets,
			validatorClaimMap,
		)

		// Clear the ballot
		k.ClearBallots(ctx, params.VotePeriod)

		// Update vote targets and tobin tax
		k.ApplyWhitelist(ctx, params.Whitelist, voteTargets)

		// --- Prometheus metrics ---
		keeper.OracleVotePeriodCounter.Inc()
		keeper.OracleVotingValidatorsGauge.Set(float64(len(validatorClaimMap)))
		keeper.OracleExchangeRatesGauge.Set(float64(len(voteTargets)))
		keeper.OracleLastUpdateHeightGauge.Set(float64(ctx.BlockHeight()))

		// Tally total miss counters and increment monotonic miss counter
		totalMisses := float64(0)
		for _, claim := range validatorClaimMap {
			misses := k.GetMissCounter(ctx, claim.Recipient)
			totalMisses += float64(misses)
			if int(claim.WinCount) < len(voteTargets) {
				keeper.OracleMissCounterIncrease.Inc()
			}
		}
		keeper.OracleMissCounterGauge.Set(totalMisses)

		// Count active feeder delegations
		activeFeeders := float64(0)
		k.IterateFeederDelegations(ctx, func(_ sdk.ValAddress, _ sdk.AccAddress) bool {
			activeFeeders++
			return false
		})
		keeper.OracleActiveFeedersGauge.Set(activeFeeders)
	}

	// Do slash who did miss voting over threshold and
	// reset miss counters of all validators at the last block of slash window
	if core.IsPeriodLastBlock(ctx, params.SlashWindow) {
		k.SlashAndResetMissCounters(ctx)
	}
}
