use cosmwasm_std::{OverflowError, StdError, Uint128};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("{0}")]
    Overflow(#[from] OverflowError),

    #[error("unauthorized: only the vault owner may call this")]
    Unauthorized {},

    #[error("expected exactly one coin of denom {expected}, got {got} coin(s)")]
    WrongFundsCount { expected: String, got: usize },

    #[error("wrong coin attached: expected denom {expected}, got {got}")]
    WrongDenom { expected: String, got: String },

    #[error("zero amount attached; nothing to trade")]
    ZeroAmount {},

    #[error(
        "trade output rounds to zero (in {amount_in} too small for current pool); increase input"
    )]
    ZeroOutput { amount_in: Uint128 },

    #[error("insufficient inventory: pool has {available} {denom}, trade needs {requested}")]
    InsufficientInventory {
        denom: String,
        available: Uint128,
        requested: Uint128,
    },

    #[error("insufficient reserve: pool has {available} {denom}, trade needs {requested}")]
    InsufficientReserve {
        denom: String,
        available: Uint128,
        requested: Uint128,
    },

    #[error("pool not initialized on the {side} side (reserve={reserve}, inventory={inventory}); owner must Fund the vault before trading")]
    PoolUninitialized {
        side: String,
        reserve: Uint128,
        inventory: Uint128,
    },

    #[error("model_denom and reserve_denom must differ (both were {denom})")]
    SameDenom { denom: String },

    #[error("nothing staked: stake {denom} first (current stake is zero)")]
    NothingStaked { denom: String },

    #[error("cannot unstake {requested} {denom}: only {staked} staked")]
    InsufficientStake {
        denom: String,
        staked: Uint128,
        requested: Uint128,
    },

    #[error("no rewards to claim (pending is zero)")]
    NothingToClaim {},

    #[error("cannot distribute revenue with zero total staked; funds would be stranded")]
    NoStakers {},

    #[error("fee_bps must be <= {max} (10000 = 100%), got {got}")]
    FeeTooHigh { max: u16, got: u16 },
}
