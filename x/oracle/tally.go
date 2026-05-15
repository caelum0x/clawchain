package oracle

import (
	"cosmossdk.io/math"
	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Tally calculates the median and returns it. Sets the set of voters to be rewarded, i.e. voted within
// a reasonable spread from the weighted median to the store
// CONTRACT: pb must be sorted
func Tally(pb types.ExchangeRateBallot, rewardBand math.LegacyDec, validatorClaimMap map[string]types.Claim) (weightedMedian math.LegacyDec) {
	weightedMedian = pb.WeightedMedian()
	standardDeviation := pb.StandardDeviation(weightedMedian)
	rewardSpread := weightedMedian.Mul(rewardBand.QuoInt64(2))

	if standardDeviation.GT(rewardSpread) {
		rewardSpread = standardDeviation
	}

	for _, vote := range pb {
		// Filter ballot winners & abstain voters
		if (vote.ExchangeRate.GTE(weightedMedian.Sub(rewardSpread)) &&
			vote.ExchangeRate.LTE(weightedMedian.Add(rewardSpread))) ||
			!vote.ExchangeRate.IsPositive() {

			key := vote.Voter.String()
			claim := validatorClaimMap[key]
			claim.Weight += vote.Power
			claim.WinCount++
			validatorClaimMap[key] = claim
		}
	}

	return weightedMedian
}

// ballot for the asset is passing the threshold amount of voting power
func ballotIsPassing(ballot types.ExchangeRateBallot, thresholdVotes math.Int) (math.Int, bool) {
	ballotPower := math.NewInt(ballot.Power())
	return ballotPower, !ballotPower.IsZero() && ballotPower.GTE(thresholdVotes)
}

// PickReferenceDenom choose reference denom with the highest voter turnout
// If the voting power of the two denominations is the same,
// select reference denom in alphabetical order.
func PickReferenceDenom(ctx sdk.Context, k keeper.Keeper, voteTargets map[string]math.LegacyDec, voteMap map[string]types.ExchangeRateBallot) string {
	largestBallotPower := int64(0)
	referenceDenom := ""

	totalBondedTokens, err := k.StakingKeeper.TotalBondedTokens(ctx)
	if err != nil {
		return ""
	}
	voteThreshold := k.VoteThreshold(ctx)
	// Convert bonded tokens to consensus power to match ballot power units
	powerReduction := k.StakingKeeper.PowerReduction(ctx)
	totalBondedPower := totalBondedTokens.Quo(powerReduction)
	thresholdVotes := voteThreshold.MulInt(totalBondedPower).RoundInt()

	for denom, ballot := range voteMap {
		// If denom is not in the voteTargets, or the ballot for it has failed, then skip
		// and remove it from voteMap for iteration efficiency
		if _, exists := voteTargets[denom]; !exists {
			delete(voteMap, denom)
			continue
		}

		ballotPower := int64(0)

		// If the ballot is not passed, remove it from the voteTargets array
		// to prevent slashing validators who did valid vote.
		if power, ok := ballotIsPassing(ballot, thresholdVotes); ok {
			if !power.IsInt64() {
				// Overflow guard: skip denom if ballot power exceeds int64
				delete(voteTargets, denom)
				delete(voteMap, denom)
				continue
			}
			ballotPower = power.Int64()
		} else {
			delete(voteTargets, denom)
			delete(voteMap, denom)
			continue
		}

		if ballotPower > largestBallotPower || largestBallotPower == 0 {
			referenceDenom = denom
			largestBallotPower = ballotPower
		} else if largestBallotPower == ballotPower && referenceDenom > denom {
			referenceDenom = denom
		}
	}

	return referenceDenom
}
