use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128, Uint256};
use cw_storage_plus::{Item, Map};

/// Immutable-ish configuration of the vault.
#[cw_serde]
pub struct Config {
    pub model_denom: String,
    pub reserve_denom: String,
    pub owner: Addr,
    /// Swap fee in basis points (1 bp = 0.01%). Skimmed from each Buy/Sell output and
    /// routed into the dividend pool so stakers "earn from the model's usage". Defaults to
    /// [`crate::contract::DEFAULT_FEE_BPS`] (30 bps) at instantiate time.
    pub fee_bps: u16,
}

/// The constant-product pool balances, tracked explicitly in state.
///
/// IMPORTANT: these are NOT inferred from live contract balances. During `execute`,
/// attached funds are already credited to the contract's bank balance, so reading
/// `querier.query_balance` would double-count the incoming coins. The curve math
/// therefore reads `reserve`/`inventory` from here and updates them on every trade.
#[cw_serde]
pub struct Pool {
    /// Amount of `reserve_denom` backing the curve.
    pub reserve: Uint128,
    /// Amount of `model_denom` available to sell to buyers.
    pub inventory: Uint128,
}

/// Global dividend-pool accumulator (Synthetix-style reward-index accrual).
///
/// `reward_per_token_stored` is the running sum of `revenue * SCALE / total_staked` over
/// every distribution; it is monotonically non-decreasing. `total_staked` is the sum of
/// all stakers' `staked`. See [`crate::rewards`] for the accrual math.
///
/// INVARIANT: the contract's reserve-denom balance always covers
/// `pool.reserve + sum(stakers' settleable rewards)`, and its model-denom balance always
/// covers `pool.inventory + total_staked`. Staked tokens are escrowed and never enter the
/// curve; dividends are paid out of the contract's own reserve balance.
#[cw_serde]
pub struct Dividend {
    /// Scaled reward-per-staked-token index (1e18 fixed point), held in `Uint256` to avoid
    /// precision loss on the `revenue * SCALE` product.
    pub reward_per_token_stored: Uint256,
    /// Total model-token amount currently staked across all stakers.
    pub total_staked: Uint128,
}

impl Dividend {
    pub fn zero() -> Self {
        Self {
            reward_per_token_stored: Uint256::zero(),
            total_staked: Uint128::zero(),
        }
    }
}

/// Per-staker dividend entry.
#[cw_serde]
pub struct Stake {
    /// Model tokens this staker has escrowed in the dividend pool.
    pub staked: Uint128,
    /// Snapshot of the global `reward_per_token_stored` at the staker's last settlement.
    pub reward_index_snapshot: Uint256,
    /// Settled-but-unclaimed reward (in reserve_denom), accumulated across settlements.
    pub pending: Uint128,
}

impl Stake {
    pub fn new(snapshot: Uint256) -> Self {
        Self {
            staked: Uint128::zero(),
            reward_index_snapshot: snapshot,
            pending: Uint128::zero(),
        }
    }
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const POOL: Item<Pool> = Item::new("pool");
pub const DIVIDEND: Item<Dividend> = Item::new("dividend");
pub const STAKES: Map<&Addr, Stake> = Map::new("stakes");
