use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Item;

/// Immutable-ish configuration of the vault.
#[cw_serde]
pub struct Config {
    pub model_denom: String,
    pub reserve_denom: String,
    pub owner: Addr,
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

pub const CONFIG: Item<Config> = Item::new("config");
pub const POOL: Item<Pool> = Item::new("pool");
