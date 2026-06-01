use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

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
}

#[cw_serde]
pub struct ConfigResponse {
    pub model_denom: String,
    pub reserve_denom: String,
    pub owner: String,
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
