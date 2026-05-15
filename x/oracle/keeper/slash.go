package keeper

import (
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// SlashAndResetMissCounters do slash any operator who over criteria & clear all operators miss counter to zero
func (k Keeper) SlashAndResetMissCounters(ctx sdk.Context) {
	height := ctx.BlockHeight()
	distributionHeight := height - sdk.ValidatorUpdateDelay - 1

	// slash_window / vote_period
	votePeriodsPerWindow := uint64(
		math.LegacyNewDec(int64(k.SlashWindow(ctx))).
			QuoInt64(int64(k.VotePeriod(ctx))).
			TruncateInt64(),
	)
	minValidPerWindow := k.MinValidPerWindow(ctx)
	slashFraction := k.SlashFraction(ctx)
	powerReduction := k.StakingKeeper.PowerReduction(ctx)

	k.IterateMissCounters(ctx, func(operator sdk.ValAddress, missCounter uint64) bool {
		// Guard against uint64 underflow: if missCounter exceeds the window
		// (possible after a governance param change), treat validVoteRate as zero.
		var safeCount uint64
		if missCounter < votePeriodsPerWindow {
			safeCount = votePeriodsPerWindow - missCounter
		}
		validVoteRate := math.LegacyNewDecFromInt(
			math.NewInt(int64(safeCount))).
			QuoInt64(int64(votePeriodsPerWindow))

		// Penalize the validator whose the valid vote rate is smaller than min threshold
		if validVoteRate.LT(minValidPerWindow) {
			validator, err := k.StakingKeeper.Validator(ctx, operator)
			if err != nil {
				return false
			}
			if validator.IsBonded() && !validator.IsJailed() {
				consAddr, err := validator.GetConsAddr()
				if err != nil {
					k.Logger(ctx).Error("failed to get consensus address for slashing, skipping", "validator", operator, "error", err)
					k.DeleteMissCounter(ctx, operator)
					return false
				}

				k.StakingKeeper.Slash(
					ctx, consAddr,
					distributionHeight, validator.GetConsensusPower(powerReduction), slashFraction,
				)
				k.StakingKeeper.Jail(ctx, consAddr)
				OracleSlashCounter.Inc()
			}
		}

		k.DeleteMissCounter(ctx, operator)
		return false
	})
}
