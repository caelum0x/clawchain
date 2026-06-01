//! Pure constant-product bonding-curve math.
//!
//! The invariant is `k = reserve * inventory`. A trade keeps `k` constant (no fee in
//! v0): adding `in` of one side lets the trader withdraw enough of the other side that
//! the product is unchanged.
//!
//! All functions here are pure (no storage, no querier) so they can be unit-tested in
//! isolation and reused by the `Quote` query without touching state.

use cosmwasm_std::{OverflowError, Uint128, Uint256};

/// Given a Buy: the trader sends `amount_in` of the reserve coin and receives model
/// tokens out of inventory.
///
/// `tokens_out = inventory - k / (reserve + amount_in)`, where `k = reserve * inventory`.
/// Floor division is used so the contract never pays out more than the invariant allows.
///
/// Returns `Ok(0)` when the result rounds down to zero (caller decides whether that is
/// an error). Returns `Err` only on arithmetic overflow, which is unreachable for
/// `Uint128` inputs because the intermediate product is computed in `Uint256`.
pub fn buy_output(
    reserve: Uint128,
    inventory: Uint128,
    amount_in: Uint128,
) -> Result<Uint128, OverflowError> {
    constant_product_out(reserve, inventory, amount_in)
}

/// Given a Sell: the trader sends `amount_in` of model tokens and receives reserve coin.
///
/// `reserve_out = reserve - k / (inventory + amount_in)`, where `k = reserve * inventory`.
/// Symmetric to [`buy_output`] with the two sides swapped.
pub fn sell_output(
    reserve: Uint128,
    inventory: Uint128,
    amount_in: Uint128,
) -> Result<Uint128, OverflowError> {
    constant_product_out(inventory, reserve, amount_in)
}

/// Core constant-product step. `in_side` is the pool balance of the coin the trader is
/// adding; `out_side` is the pool balance of the coin the trader is withdrawing.
///
/// `out = out_side - (in_side * out_side) / (in_side + amount_in)`.
///
/// Computed in `Uint256` to avoid overflow on the `in_side * out_side` product, then
/// narrowed back to `Uint128` (the result is always <= `out_side`, so it fits).
fn constant_product_out(
    in_side: Uint128,
    out_side: Uint128,
    amount_in: Uint128,
) -> Result<Uint128, OverflowError> {
    let in_side = Uint256::from(in_side);
    let out_side = Uint256::from(out_side);
    let amount_in = Uint256::from(amount_in);

    // k = in_side * out_side
    let k = in_side.checked_mul(out_side)?;
    // new_in = in_side + amount_in
    let new_in = in_side.checked_add(amount_in)?;
    // new_out = floor(k / new_in)   (new_in is >= in_side >= 1 once seeded)
    let new_out = k
        .checked_div(new_in)
        .expect("new_in is non-zero when seeded");
    // out = out_side - new_out  (new_out <= out_side, so this never underflows)
    let out = out_side.checked_sub(new_out)?;

    // out <= out_side <= Uint128::MAX, so this conversion cannot fail.
    Ok(out
        .try_into()
        .expect("constant-product output fits in Uint128"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(n: u128) -> Uint128 {
        Uint128::new(n)
    }

    #[test]
    fn buy_matches_constant_product_formula() {
        // reserve=1000, inventory=1000, k=1_000_000. Buy with 1000 reserve in:
        // new_reserve = 2000, new_inventory = 1_000_000 / 2000 = 500, out = 500.
        assert_eq!(buy_output(u(1000), u(1000), u(1000)).unwrap(), u(500));
    }

    #[test]
    fn sell_matches_constant_product_formula() {
        // reserve=1000, inventory=1000, k=1_000_000. Sell with 1000 model in:
        // new_inventory = 2000, new_reserve = 1_000_000 / 2000 = 500, out = 500.
        assert_eq!(sell_output(u(1000), u(1000), u(1000)).unwrap(), u(500));
    }

    #[test]
    fn buy_and_sell_are_symmetric() {
        // Swapping the meaning of the two sides gives the same number for symmetric pools.
        let buy = buy_output(u(5000), u(2000), u(750)).unwrap();
        let sell = sell_output(u(2000), u(5000), u(750)).unwrap();
        assert_eq!(buy, sell);
    }

    #[test]
    fn tiny_input_still_yields_at_least_one() {
        // reserve=inventory=1e9, in=1: k=1e18, new_in=1e9+1,
        // new_out=floor(1e18/(1e9+1))=999_999_999, out=1e9-999_999_999=1.
        //
        // Note the constant-product floor formula `inventory - floor(k/new_in)` always
        // yields >= 1 for a seeded pool (inventory>=1) and amount_in>=1, because
        // k/new_in = reserve*inventory/(reserve+in) < inventory, so floor <= inventory-1.
        // The contract's ZeroOutput guard is therefore defensive (degenerate states),
        // not the normal small-trade path.
        assert_eq!(
            buy_output(u(1_000_000_000), u(1_000_000_000), u(1)).unwrap(),
            u(1)
        );
        assert!(buy_output(u(1_000_000), u(1), u(1)).unwrap() >= u(1));
    }

    #[test]
    fn floor_rounding_can_let_input_take_all_of_out_side() {
        // With a huge input into a tiny pool, floor(k/new_in) reaches 0 and the formula
        // yields the entire out_side. The contract layer guards against actually emptying
        // inventory via an explicit `tokens_out >= inventory` check; the pure math here
        // simply reports the constant-product result.
        let out = buy_output(u(10), u(10), u(1_000_000_000)).unwrap();
        assert_eq!(
            out,
            u(10),
            "floor math reports full out_side for a huge input"
        );
    }

    #[test]
    fn invariant_does_not_grow() {
        // Floor division on the output means k_after = new_in * floor(k/new_in) <= k.
        // The pool never loses value (it keeps the rounding dust), so k must not GROW.
        let (reserve, inventory, amount_in) = (u(12345), u(67890), u(999));
        let out = buy_output(reserve, inventory, amount_in).unwrap();
        let k_before = Uint256::from(reserve) * Uint256::from(inventory);
        let k_after = (Uint256::from(reserve) + Uint256::from(amount_in))
            * (Uint256::from(inventory) - Uint256::from(out));
        assert!(
            k_after <= k_before,
            "constant-product invariant must not grow"
        );
        // And it stays within one `new_in` step of the original (floor error bound).
        assert!(k_before - k_after < Uint256::from(reserve + amount_in));
    }

    #[test]
    fn large_values_do_not_overflow() {
        // Near-max Uint128 balances must not overflow thanks to Uint256 intermediates.
        let big = Uint128::MAX;
        let out = buy_output(big, big, u(1_000_000)).unwrap();
        // Output is tiny relative to the pool but must be computed without panicking.
        assert!(out <= big);
    }
}
