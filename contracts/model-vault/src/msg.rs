use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Uint128, Uint256};

/// Which direction a hypothetical Quote trade goes.
#[cw_serde]
pub enum TradeSide {
    /// Spend `reserve_denom` to receive `model_denom` (price of the model token rises).
    Buy,
    /// Spend `model_denom` to receive `reserve_denom` (price of the model token falls).
    Sell,
}

#[cw_serde]
pub struct InstantiateMsg {
    /// Native tokenfactory denom of the model token, e.g. `factory/<issuer>/<subdenom>`.
    pub model_denom: String,
    /// Native reserve denom. Defaults to `uclaw` when omitted.
    pub reserve_denom: Option<String>,
    /// Vault owner. Only the owner may `Fund`. Defaults to the instantiator when omitted.
    pub owner: Option<String>,
    /// Optional starting reserve amount recorded in state (must be attached as funds at
    /// instantiate time if non-zero). Used to seed the constant-product curve.
    pub initial_reserve: Option<Uint128>,
    /// Optional starting inventory amount recorded in state (must be attached as funds at
    /// instantiate time if non-zero). Used to seed the constant-product curve.
    pub initial_inventory: Option<Uint128>,
    /// Optional swap fee in basis points routed to the dividend pool. Defaults to 30 bps
    /// (0.30%) when omitted. Must be <= 10000.
    pub fee_bps: Option<u16>,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Owner seeds the vault. Attach `model_denom` and/or `reserve_denom` funds; the
    /// matching state amounts are increased.
    Fund {},
    /// Attach `reserve_denom` funds. Constant-product market computes tokens_out of
    /// `model_denom` and sends them to the buyer.
    Buy {},
    /// Attach `model_denom` funds. Constant-product market computes reserve_out of
    /// `reserve_denom` and sends it to the seller.
    Sell {},
    /// Stake model tokens into the dividend pool. Attach exactly one `model_denom` coin;
    /// the staker's settleable rewards are settled first, then their stake + total_staked
    /// increase. Staked tokens are escrowed (held by the contract, outside the curve).
    Stake {},
    /// Unstake `amount` of previously staked model tokens. Settles pending rewards first,
    /// decreases the stake, and returns the model tokens via `BankMsg::Send`.
    Unstake { amount: Uint128 },
    /// Claim accrued reserve-denom dividends. Settles pending rewards, pays them out via
    /// `BankMsg::Send`, and zeroes the staker's pending balance.
    ClaimRewards {},
    /// Distribute reserve-denom revenue across current stakers pro-rata by raising the
    /// global reward-index. Attach exactly one `reserve_denom` coin. Anyone may call.
    /// Errors if `total_staked == 0` (so funds are never stranded).
    DistributeRevenue {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ConfigResponse)]
    Config {},
    #[returns(PoolResponse)]
    Pool {},
    /// Pure constant-product math for a hypothetical trade. No state change.
    #[returns(QuoteResponse)]
    Quote { side: TradeSide, amount: Uint128 },
    /// A single staker's position. `claimable` is computed live (settled `pending` plus
    /// rewards earned since the staker's last on-chain settlement).
    #[returns(StakeInfoResponse)]
    StakeInfo { address: String },
    /// Global dividend-pool state.
    #[returns(PoolInfoResponse)]
    PoolInfo {},
}

#[cw_serde]
pub struct ConfigResponse {
    pub model_denom: String,
    pub reserve_denom: String,
    pub owner: String,
    /// Swap fee in basis points routed to the dividend pool.
    pub fee_bps: u16,
}

#[cw_serde]
pub struct PoolResponse {
    /// Reserve-coin (reserve_denom) amount held by the curve.
    pub reserve: Uint128,
    /// Model-token (model_denom) amount held by the curve.
    pub inventory: Uint128,
}

#[cw_serde]
pub struct QuoteResponse {
    /// Amount of the output denom the trade would yield.
    pub amount_out: Uint128,
    /// Denom of the input the caller would attach.
    pub denom_in: String,
    /// Denom of the output the caller would receive.
    pub denom_out: String,
}

#[cw_serde]
pub struct StakeInfoResponse {
    /// Model tokens this address currently has staked.
    pub staked: Uint128,
    /// Reserve-denom rewards claimable right now (settled `pending` + live accrual since
    /// the staker's last settlement).
    pub claimable: Uint128,
}

#[cw_serde]
pub struct PoolInfoResponse {
    /// Total model tokens staked across all stakers.
    pub total_staked: Uint128,
    /// Global scaled reward-per-token index (1e18 fixed point).
    pub reward_per_token_stored: Uint256,
}
