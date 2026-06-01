//! Pure Synthetix-style reward-index accrual math for the dividend pool.
//!
//! Model-token holders stake their tokens to earn a pro-rata share of revenue (in the
//! reserve denom) that flows into the vault — both explicit `DistributeRevenue` deposits
//! and the swap fee skimmed from each trade.
//!
//! ## The reward-index pattern (O(1) per actor)
//!
//! Instead of iterating over every staker when revenue arrives (unbounded gas), we keep a
//! single global accumulator `reward_per_token_stored`. When `amount` of reserve revenue
//! is distributed across `total_staked` staked tokens, the accumulator grows by
//! `amount * SCALE / total_staked`. The `SCALE` factor (1e18) preserves fractional
//! reward-per-token precision in integer math; the index is held in `Uint256` so the
//! scaled product never overflows for realistic balances.
//!
//! Each staker stores a `reward_index_snapshot` (the value of the global index the last
//! time they were "settled"). Their newly-earned reward since that snapshot is
//! `staked * (global_index - snapshot) / SCALE`. On every stake/unstake/claim we first
//! settle the staker (fold the delta into their `pending`), then refresh their snapshot to
//! the current global index. Because each actor only ever reads the single global index,
//! the cost is O(1) regardless of how many stakers exist.
//!
//! All functions here are pure (no storage, no querier) so they can be unit-tested in
//! isolation and reused by both the execute handlers and the live `StakeInfo` query.

use cosmwasm_std::{OverflowError, Uint128, Uint256};

/// Fixed-point scale for the reward-per-token index. 1e18 mirrors the conventional
/// Synthetix precision and leaves ample headroom in `Uint256`.
pub const SCALE: Uint256 = Uint256::from_u128(1_000_000_000_000_000_000);

/// Compute the increment to add to the global `reward_per_token_stored` when `amount` of
/// reserve revenue is distributed across `total_staked` staked tokens.
///
/// `delta_index = amount * SCALE / total_staked`
///
/// Returns `Err` only on arithmetic overflow (unreachable for realistic `Uint128` inputs
/// because the product is computed in `Uint256`). Callers MUST guard `total_staked != 0`
/// before calling — distributing into an empty pool would strand funds, so the contract
/// layer rejects that case rather than dividing by zero here (we debug-assert it).
pub fn reward_index_delta(
    amount: Uint128,
    total_staked: Uint128,
) -> Result<Uint256, OverflowError> {
    debug_assert!(
        !total_staked.is_zero(),
        "reward_index_delta requires total_staked > 0 (caller must guard)"
    );
    let scaled = Uint256::from(amount).checked_mul(SCALE)?;
    // total_staked is non-zero by contract; checked_div still guards defensively.
    let total = Uint256::from(total_staked);
    Ok(scaled.checked_div(total).unwrap_or(Uint256::zero()))
}

/// Compute the reward (in reserve units) a staker has earned since their snapshot.
///
/// `earned = staked * (global_index - snapshot) / SCALE`
///
/// The global index is monotonically non-decreasing, so `global_index >= snapshot` always
/// holds for a correctly-maintained snapshot; we still use checked subtraction so a
/// corrupted snapshot surfaces as an error rather than a wraparound.
pub fn earned_since_snapshot(
    staked: Uint128,
    global_index: Uint256,
    snapshot: Uint256,
) -> Result<Uint128, OverflowError> {
    let delta = global_index.checked_sub(snapshot)?;
    let scaled = Uint256::from(staked).checked_mul(delta)?;
    let earned = scaled.checked_div(SCALE).unwrap_or(Uint256::zero());
    // `earned` is bounded by the total reserve distributed (a Uint128 sum), so it fits.
    Ok(earned
        .try_into()
        .expect("earned reward fits in Uint128 (bounded by distributed reserve)"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(n: u128) -> Uint128 {
        Uint128::new(n)
    }

    #[test]
    fn settlement_formula_matches_hand_computation() {
        // total_staked=1000, distribute 100 reserve.
        // delta_index = 100 * 1e18 / 1000 = 1e17.
        let delta = reward_index_delta(u(100), u(1000)).unwrap();
        assert_eq!(delta, Uint256::from(100_000_000_000_000_000u128));

        // A staker with 1000 staked, snapshot 0, global 1e17 earns:
        // 1000 * 1e17 / 1e18 = 100. (They own 100% of the pool.)
        let earned = earned_since_snapshot(u(1000), delta, Uint256::zero()).unwrap();
        assert_eq!(earned, u(100));
    }

    #[test]
    fn two_stakers_split_pro_rata() {
        // Alice stakes 750, Bob stakes 250 -> total 1000. Distribute 100 reserve.
        let total = u(1000);
        let delta = reward_index_delta(u(100), total).unwrap();
        let global = delta; // started at zero

        let alice = earned_since_snapshot(u(750), global, Uint256::zero()).unwrap();
        let bob = earned_since_snapshot(u(250), global, Uint256::zero()).unwrap();

        // 75 / 25 split of the 100 reserve.
        assert_eq!(alice, u(75));
        assert_eq!(bob, u(25));
        // Distributed amount is conserved (no dust here because it divides evenly).
        assert_eq!(alice + bob, u(100));
    }

    #[test]
    fn stake_then_distribute_then_claim_roundtrip() {
        // Single staker stakes 500. Two distributions accumulate on the global index.
        let total = u(500);
        let mut global = Uint256::zero();
        global += reward_index_delta(u(40), total).unwrap();
        global += reward_index_delta(u(60), total).unwrap();

        // Sole staker earns the full 100 across both distributions.
        let earned = earned_since_snapshot(u(500), global, Uint256::zero()).unwrap();
        assert_eq!(earned, u(100));
    }

    #[test]
    fn snapshot_excludes_revenue_before_staking() {
        // Distribution #1 happens with 1000 already staked. A late staker who joins
        // afterward (snapshot = global after #1) must NOT earn any of #1.
        let global_after_1 = reward_index_delta(u(100), u(1000)).unwrap();

        // Late staker joins now with 1000; snapshot = global_after_1.
        // Distribution #2: now total_staked = 2000, distribute 200.
        let delta2 = reward_index_delta(u(200), u(2000)).unwrap();
        let global_after_2 = global_after_1 + delta2;

        // Late staker (1000 staked) earns only from #2: 1000 * delta2 / 1e18 = 100.
        let late = earned_since_snapshot(u(1000), global_after_2, global_after_1).unwrap();
        assert_eq!(late, u(100));

        // Original staker (1000 staked, snapshot 0) earns all of #1 (100) + half of #2
        // (100) = 200.
        let original = earned_since_snapshot(u(1000), global_after_2, Uint256::zero()).unwrap();
        assert_eq!(original, u(200));
    }

    #[test]
    fn precision_holds_at_large_values_via_uint256() {
        // Large stake and large distribution: the SCALE multiply would overflow Uint128
        // but stays comfortably within Uint256.
        let total = u(1_000_000_000_000_000_000); // 1e18 staked
        let delta = reward_index_delta(u(1_000_000_000_000_000_000), total).unwrap();
        // amount == total so reward-per-token == SCALE exactly.
        assert_eq!(delta, SCALE);

        // A staker owning the whole pool earns the whole distribution back.
        let earned = earned_since_snapshot(total, delta, Uint256::zero()).unwrap();
        assert_eq!(earned, total);
    }

    #[test]
    fn near_max_uint128_does_not_overflow() {
        // Near-max staked balance with a non-trivial index delta must not panic.
        let big = Uint128::MAX;
        // Pick a small index delta so the result fits in Uint128.
        let small_delta = Uint256::from(1u128); // 1 / 1e18 reward-per-token
        let earned = earned_since_snapshot(big, small_delta, Uint256::zero()).unwrap();
        // floor(MAX * 1 / 1e18) -> a large but valid Uint128.
        assert!(earned <= big);
    }

    #[test]
    fn tiny_distribution_rounds_down_to_dust() {
        // Distribute 1 reserve across 3 staked: delta = floor(1*1e18/3) = 333...333 (the
        // index itself loses 1e-18 of precision). Re-multiplying by the stake also floors:
        //   3 * delta / 1e18 = floor(999_999_999_999_999_999 / 1e18) = 0.
        // So a single indivisible reserve unit cannot be split across stakers and is left
        // behind as dust until enough revenue accumulates. This documents the conservative
        // floor-rounding (the pool never pays out more than it received).
        let delta = reward_index_delta(u(1), u(3)).unwrap();
        let one_token = earned_since_snapshot(u(1), delta, Uint256::zero()).unwrap();
        assert_eq!(one_token, u(0));
        let all_three = earned_since_snapshot(u(3), delta, Uint256::zero()).unwrap();
        assert_eq!(all_three, u(0), "the indivisible 1-unit is left as dust");

        // Distributing 3 across 3 divides evenly: delta = 1e18, each token earns 1.
        let even = reward_index_delta(u(3), u(3)).unwrap();
        assert_eq!(
            earned_since_snapshot(u(3), even, Uint256::zero()).unwrap(),
            u(3)
        );
    }

    #[test]
    fn zero_global_yields_zero_earned() {
        // No distributions yet -> nobody has earned anything.
        let earned = earned_since_snapshot(u(1000), Uint256::zero(), Uint256::zero()).unwrap();
        assert_eq!(earned, u(0));
    }
}
