package settlement

import "cosmossdk.io/math"

// ComputeSettlement is a faithful, chain-independent port of the cost split in
// Keeper.CompleteInferenceJob (x/modelregistry/keeper/msg_server_inference.go).
//
// actualCost = min( max(pricePerQuery, pricePerToken * tokensUsed), escrow )
// payout     = actualCost                (paid to provider)
// refund     = escrow - actualCost       (returned to requester)
//
// The computation is pure and deterministic: identical inputs always yield
// identical outputs, which is what lets the off-chain outcome be signed and
// independently verified.
func ComputeSettlement(p Pricing, escrow math.Int, tokensUsed uint64) (payout, refund math.Int) {
	perToken := orZero(p.PricePerToken)
	perQuery := orZero(p.PricePerQuery)
	esc := orZero(escrow)

	// Apply the on-chain max-tokens cap before charging.
	effectiveTokens := tokensUsed
	if p.MaxTokens > 0 && effectiveTokens > p.MaxTokens {
		effectiveTokens = p.MaxTokens
	}

	tokenCost := perToken.MulRaw(int64(effectiveTokens))
	actualCost := perQuery
	if tokenCost.GT(actualCost) {
		actualCost = tokenCost
	}
	// Never charge more than was escrowed.
	if actualCost.GT(esc) {
		actualCost = esc
	}

	payout = actualCost
	refund = esc.Sub(actualCost)
	return payout, refund
}

// SlashReputation is a faithful port of x/reputation Keeper.SlashReputation:
// saturating subtraction that never underflows below 0. Slashing an unknown /
// already-zero score is a no-op that returns 0.
func SlashReputation(score, points uint64) uint64 {
	if score > points {
		return score - points
	}
	return 0
}

// RestoreReputation is a faithful port of x/reputation Keeper.RestoreReputation:
// saturating addition capped at MaxReputationBps. It is the symmetric undo of
// SlashReputation, applied when a dispute is rejected.
func RestoreReputation(score, points uint64) uint64 {
	next := score + points
	if next > MaxReputationBps {
		return MaxReputationBps
	}
	return next
}

// orZero returns math.ZeroInt() for a nil (uninitialized) math.Int, mirroring
// the on-chain keeper's tolerance of unset numeric fields.
func orZero(v math.Int) math.Int {
	if v.IsNil() {
		return math.ZeroInt()
	}
	return v
}
