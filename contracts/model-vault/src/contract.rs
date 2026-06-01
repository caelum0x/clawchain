#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, Addr, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult, Storage, Uint128,
};

use crate::curve::{buy_output, sell_output};
use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, PoolInfoResponse, PoolResponse, QueryMsg,
    QuoteResponse, StakeInfoResponse, TradeSide,
};
use crate::rewards::{earned_since_snapshot, reward_index_delta};
use crate::state::{Config, Dividend, Pool, Stake, CONFIG, DIVIDEND, POOL, STAKES};

const DEFAULT_RESERVE_DENOM: &str = "uclaw";
/// Default swap fee skimmed into the dividend pool: 30 basis points (0.30%).
pub const DEFAULT_FEE_BPS: u16 = 30;
/// Basis-point denominator (100% = 10000 bps).
const BPS_DENOMINATOR: u128 = 10_000;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let reserve_denom = msg
        .reserve_denom
        .unwrap_or_else(|| DEFAULT_RESERVE_DENOM.to_string());

    if msg.model_denom == reserve_denom {
        return Err(ContractError::SameDenom {
            denom: reserve_denom,
        });
    }

    let owner = match msg.owner {
        Some(o) => deps.api.addr_validate(&o)?,
        None => info.sender.clone(),
    };

    let fee_bps = msg.fee_bps.unwrap_or(DEFAULT_FEE_BPS);
    if u128::from(fee_bps) > BPS_DENOMINATOR {
        return Err(ContractError::FeeTooHigh {
            max: BPS_DENOMINATOR as u16,
            got: fee_bps,
        });
    }

    let config = Config {
        model_denom: msg.model_denom.clone(),
        reserve_denom: reserve_denom.clone(),
        owner: owner.clone(),
        fee_bps,
    };
    CONFIG.save(deps.storage, &config)?;

    // Initialize the (empty) dividend pool.
    DIVIDEND.save(deps.storage, &Dividend::zero())?;

    // Seed the pool from explicit instantiate params. The caller is responsible for
    // attaching matching funds; we record the curve state independently of bank balance.
    let initial_reserve = msg.initial_reserve.unwrap_or(Uint128::zero());
    let initial_inventory = msg.initial_inventory.unwrap_or(Uint128::zero());
    POOL.save(
        deps.storage,
        &Pool {
            reserve: initial_reserve,
            inventory: initial_inventory,
        },
    )?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("model_denom", config.model_denom)
        .add_attribute("reserve_denom", config.reserve_denom)
        .add_attribute("owner", owner)
        .add_attribute("fee_bps", fee_bps.to_string())
        .add_attribute("initial_reserve", initial_reserve)
        .add_attribute("initial_inventory", initial_inventory))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Fund {} => execute_fund(deps, info),
        ExecuteMsg::Buy {} => execute_buy(deps, info),
        ExecuteMsg::Sell {} => execute_sell(deps, info),
        ExecuteMsg::Stake {} => execute_stake(deps, info),
        ExecuteMsg::Unstake { amount } => execute_unstake(deps, info, amount),
        ExecuteMsg::ClaimRewards {} => execute_claim_rewards(deps, info),
        ExecuteMsg::DistributeRevenue {} => execute_distribute_revenue(deps, info),
    }
}

/// Owner seeds the vault. Any combination of `model_denom` / `reserve_denom` coins may
/// be attached; matching state amounts are increased. No other denoms are accepted.
fn execute_fund(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized {});
    }

    let mut pool = POOL.load(deps.storage)?;
    let mut added_reserve = Uint128::zero();
    let mut added_inventory = Uint128::zero();

    for coin in &info.funds {
        if coin.denom == config.reserve_denom {
            added_reserve = added_reserve.checked_add(coin.amount)?;
        } else if coin.denom == config.model_denom {
            added_inventory = added_inventory.checked_add(coin.amount)?;
        } else {
            return Err(ContractError::WrongDenom {
                expected: format!("{} or {}", config.reserve_denom, config.model_denom),
                got: coin.denom.clone(),
            });
        }
    }

    if added_reserve.is_zero() && added_inventory.is_zero() {
        return Err(ContractError::ZeroAmount {});
    }

    pool.reserve = pool.reserve.checked_add(added_reserve)?;
    pool.inventory = pool.inventory.checked_add(added_inventory)?;
    POOL.save(deps.storage, &pool)?;

    Ok(Response::new()
        .add_attribute("action", "fund")
        .add_attribute("added_reserve", added_reserve)
        .add_attribute("added_inventory", added_inventory)
        .add_attribute("reserve", pool.reserve)
        .add_attribute("inventory", pool.inventory))
}

/// Buy model tokens with reserve coin.
///
/// The swap fee is skimmed from the incoming `reserve_denom` BEFORE the curve sees it: the
/// fee portion is diverted into the dividend pool (raising the reward-index), and only the
/// net remainder feeds the constant-product curve. If nothing is staked when the fee
/// accrues, the fee is left in the curve reserve instead of being routed to the (empty)
/// dividend pool (documented fallback — funds are never stranded).
fn execute_buy(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let amount_in = exactly_one(&info, &config.reserve_denom)?;

    let mut pool = POOL.load(deps.storage)?;
    if pool.reserve.is_zero() || pool.inventory.is_zero() {
        return Err(ContractError::PoolUninitialized {
            side: "buy".to_string(),
            reserve: pool.reserve,
            inventory: pool.inventory,
        });
    }

    // Skim the fee from the reserve_denom input; the curve only sees the net amount.
    let fee = fee_amount(amount_in, config.fee_bps)?;
    let net_in = amount_in.checked_sub(fee)?;

    let tokens_out = buy_output(pool.reserve, pool.inventory, net_in)?;
    if tokens_out.is_zero() {
        return Err(ContractError::ZeroOutput { amount_in });
    }
    if tokens_out >= pool.inventory {
        // Defensive: constant-product floor math guarantees tokens_out < inventory, but
        // guard explicitly so we never empty the inventory or underflow.
        return Err(ContractError::InsufficientInventory {
            denom: config.model_denom.clone(),
            available: pool.inventory,
            requested: tokens_out,
        });
    }

    // Update state BEFORE building the send: reserve grows by the net funds we already
    // hold, inventory shrinks by what we pay out.
    pool.reserve = pool.reserve.checked_add(net_in)?;
    pool.inventory = pool.inventory.checked_sub(tokens_out)?;

    // Route the fee to the dividend pool (or fall back to the curve reserve if empty).
    let fee_to_stakers = accrue_fee(deps.storage, &mut pool, fee)?;
    POOL.save(deps.storage, &pool)?;

    let send = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: config.model_denom.clone(),
            amount: tokens_out,
        }],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "buy")
        .add_attribute("buyer", info.sender)
        .add_attribute("reserve_in", amount_in)
        .add_attribute("fee", fee)
        .add_attribute("fee_to_stakers", fee_to_stakers)
        .add_attribute("tokens_out", tokens_out)
        .add_attribute("reserve", pool.reserve)
        .add_attribute("inventory", pool.inventory))
}

/// Sell model tokens for reserve coin.
///
/// The swap fee is skimmed from the `reserve_denom` the curve would pay out: the gross
/// `reserve_out` leaves the curve reserve, the fee portion is diverted into the dividend
/// pool, and the seller receives the net remainder. As with [`execute_buy`], if nothing is
/// staked the fee is left in the curve reserve instead.
fn execute_sell(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let amount_in = exactly_one(&info, &config.model_denom)?;

    let mut pool = POOL.load(deps.storage)?;
    if pool.reserve.is_zero() || pool.inventory.is_zero() {
        return Err(ContractError::PoolUninitialized {
            side: "sell".to_string(),
            reserve: pool.reserve,
            inventory: pool.inventory,
        });
    }

    let reserve_out = sell_output(pool.reserve, pool.inventory, amount_in)?;
    if reserve_out.is_zero() {
        return Err(ContractError::ZeroOutput { amount_in });
    }
    if reserve_out >= pool.reserve {
        return Err(ContractError::InsufficientReserve {
            denom: config.reserve_denom.clone(),
            available: pool.reserve,
            requested: reserve_out,
        });
    }

    // Skim the fee from the gross reserve output; the seller receives the net.
    let fee = fee_amount(reserve_out, config.fee_bps)?;
    let net_out = reserve_out.checked_sub(fee)?;
    if net_out.is_zero() {
        return Err(ContractError::ZeroOutput { amount_in });
    }

    // Update state: inventory grows by the model tokens we now hold, reserve shrinks by
    // the full reserve coin leaving the curve (net to seller + fee to dividend pool).
    pool.inventory = pool.inventory.checked_add(amount_in)?;
    pool.reserve = pool.reserve.checked_sub(reserve_out)?;

    // Route the fee to the dividend pool (or fall back to the curve reserve if empty).
    let fee_to_stakers = accrue_fee(deps.storage, &mut pool, fee)?;
    POOL.save(deps.storage, &pool)?;

    let send = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: config.reserve_denom.clone(),
            amount: net_out,
        }],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "sell")
        .add_attribute("seller", info.sender)
        .add_attribute("tokens_in", amount_in)
        .add_attribute("reserve_out", net_out)
        .add_attribute("fee", fee)
        .add_attribute("fee_to_stakers", fee_to_stakers)
        .add_attribute("reserve", pool.reserve)
        .add_attribute("inventory", pool.inventory))
}

/// Validate that exactly one coin of the expected denom is attached, and return its
/// non-zero amount.
fn exactly_one(info: &MessageInfo, expected: &str) -> Result<Uint128, ContractError> {
    if info.funds.len() != 1 {
        return Err(ContractError::WrongFundsCount {
            expected: expected.to_string(),
            got: info.funds.len(),
        });
    }
    let coin = &info.funds[0];
    if coin.denom != expected {
        return Err(ContractError::WrongDenom {
            expected: expected.to_string(),
            got: coin.denom.clone(),
        });
    }
    if coin.amount.is_zero() {
        return Err(ContractError::ZeroAmount {});
    }
    Ok(coin.amount)
}

// ----------------------------------------------------------------------------------------
// Dividend pool (Synthetix-style reward-index accrual)
// ----------------------------------------------------------------------------------------

/// Compute the fee portion of `amount` at `fee_bps` basis points, using `Uint128` checked
/// math. `fee = amount * fee_bps / 10000` (floor). A 0-bps fee yields 0.
fn fee_amount(amount: Uint128, fee_bps: u16) -> Result<Uint128, ContractError> {
    if fee_bps == 0 {
        return Ok(Uint128::zero());
    }
    let bps = Uint128::from(u128::from(fee_bps));
    let denom = Uint128::from(BPS_DENOMINATOR);
    // amount * fee_bps fits in Uint128's internal Uint256 multiply; multiply_ratio floors.
    Ok(amount.multiply_ratio(bps, denom))
}

/// Route `fee` (in reserve_denom) to the dividend pool by raising the global reward-index
/// pro-rata across current stakers. Returns the amount actually credited to stakers.
///
/// FALLBACK: if `total_staked == 0` there is nobody to credit, so the fee is left in the
/// curve `reserve` (added back) rather than stranded; returns `Uint128::zero()` in that
/// case. The caller has already subtracted the fee from the reserve, so we add it back
/// here when falling back.
fn accrue_fee(
    storage: &mut dyn Storage,
    pool: &mut Pool,
    fee: Uint128,
) -> Result<Uint128, ContractError> {
    if fee.is_zero() {
        return Ok(Uint128::zero());
    }
    let mut dividend = DIVIDEND.load(storage)?;
    if dividend.total_staked.is_zero() {
        // No stakers: keep the fee in the curve reserve so funds are never stranded.
        pool.reserve = pool.reserve.checked_add(fee)?;
        return Ok(Uint128::zero());
    }
    let delta = reward_index_delta(fee, dividend.total_staked)?;
    dividend.reward_per_token_stored = dividend.reward_per_token_stored.checked_add(delta)?;
    DIVIDEND.save(storage, &dividend)?;
    Ok(fee)
}

/// Settle a staker against the current global index: fold newly-earned rewards into
/// `pending` and advance the snapshot. Returns the (possibly freshly-created) settled
/// `Stake`. Pure-ish: reads no funds, only the global index passed in.
fn settle(stake: &Stake, global_index: cosmwasm_std::Uint256) -> Result<Stake, ContractError> {
    let earned = earned_since_snapshot(stake.staked, global_index, stake.reward_index_snapshot)?;
    Ok(Stake {
        staked: stake.staked,
        reward_index_snapshot: global_index,
        pending: stake.pending.checked_add(earned)?,
    })
}

/// Load a staker's entry, creating a fresh one (snapshotted at the current global index) if
/// it does not yet exist.
fn load_or_new_stake(
    storage: &dyn Storage,
    addr: &Addr,
    global_index: cosmwasm_std::Uint256,
) -> Result<Stake, ContractError> {
    Ok(STAKES
        .may_load(storage, addr)?
        .unwrap_or_else(|| Stake::new(global_index)))
}

/// Stake model tokens into the dividend pool.
fn execute_stake(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let amount = exactly_one(&info, &config.model_denom)?;

    let mut dividend = DIVIDEND.load(deps.storage)?;
    let global = dividend.reward_per_token_stored;

    // Settle BEFORE changing the stake so the new tokens don't retroactively earn.
    let existing = load_or_new_stake(deps.storage, &info.sender, global)?;
    let settled = settle(&existing, global)?;

    let new_stake = Stake {
        staked: settled.staked.checked_add(amount)?,
        ..settled
    };
    STAKES.save(deps.storage, &info.sender, &new_stake)?;

    dividend.total_staked = dividend.total_staked.checked_add(amount)?;
    DIVIDEND.save(deps.storage, &dividend)?;

    Ok(Response::new()
        .add_attribute("action", "stake")
        .add_attribute("staker", info.sender)
        .add_attribute("staked_added", amount)
        .add_attribute("staked", new_stake.staked)
        .add_attribute("total_staked", dividend.total_staked))
}

/// Unstake model tokens; returns them via BankMsg::Send. Pending rewards remain claimable.
fn execute_unstake(
    deps: DepsMut,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    if amount.is_zero() {
        return Err(ContractError::ZeroAmount {});
    }
    let config = CONFIG.load(deps.storage)?;

    let mut dividend = DIVIDEND.load(deps.storage)?;
    let global = dividend.reward_per_token_stored;

    let existing =
        STAKES
            .may_load(deps.storage, &info.sender)?
            .ok_or(ContractError::NothingStaked {
                denom: config.model_denom.clone(),
            })?;
    if existing.staked < amount {
        return Err(ContractError::InsufficientStake {
            denom: config.model_denom.clone(),
            staked: existing.staked,
            requested: amount,
        });
    }

    // Settle first so the unstaked tokens keep the rewards they already earned.
    let settled = settle(&existing, global)?;
    let new_stake = Stake {
        staked: settled.staked.checked_sub(amount)?,
        ..settled
    };
    STAKES.save(deps.storage, &info.sender, &new_stake)?;

    dividend.total_staked = dividend.total_staked.checked_sub(amount)?;
    DIVIDEND.save(deps.storage, &dividend)?;

    let send = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: config.model_denom.clone(),
            amount,
        }],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "unstake")
        .add_attribute("staker", info.sender)
        .add_attribute("unstaked", amount)
        .add_attribute("staked", new_stake.staked)
        .add_attribute("pending", new_stake.pending)
        .add_attribute("total_staked", dividend.total_staked))
}

/// Claim accrued reserve-denom dividends; pays them out and zeroes pending.
fn execute_claim_rewards(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let dividend = DIVIDEND.load(deps.storage)?;
    let global = dividend.reward_per_token_stored;

    let existing = STAKES
        .may_load(deps.storage, &info.sender)?
        .ok_or(ContractError::NothingToClaim {})?;

    let settled = settle(&existing, global)?;
    let payout = settled.pending;
    if payout.is_zero() {
        return Err(ContractError::NothingToClaim {});
    }

    let claimed = Stake {
        pending: Uint128::zero(),
        ..settled
    };
    STAKES.save(deps.storage, &info.sender, &claimed)?;

    let send = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: config.reserve_denom.clone(),
            amount: payout,
        }],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "claim_rewards")
        .add_attribute("staker", info.sender)
        .add_attribute("claimed", payout)
        .add_attribute("staked", claimed.staked))
}

/// Distribute attached reserve-denom revenue across current stakers pro-rata. Anyone may
/// call. Errors if `total_staked == 0` so the funds are never stranded.
fn execute_distribute_revenue(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let amount = exactly_one(&info, &config.reserve_denom)?;

    let mut dividend = DIVIDEND.load(deps.storage)?;
    if dividend.total_staked.is_zero() {
        return Err(ContractError::NoStakers {});
    }

    let delta = reward_index_delta(amount, dividend.total_staked)?;
    dividend.reward_per_token_stored = dividend.reward_per_token_stored.checked_add(delta)?;
    DIVIDEND.save(deps.storage, &dividend)?;

    Ok(Response::new()
        .add_attribute("action", "distribute_revenue")
        .add_attribute("distributor", info.sender)
        .add_attribute("amount", amount)
        .add_attribute("total_staked", dividend.total_staked)
        .add_attribute(
            "reward_per_token_stored",
            dividend.reward_per_token_stored.to_string(),
        ))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::Pool {} => to_json_binary(&query_pool(deps)?),
        QueryMsg::Quote { side, amount } => to_json_binary(&query_quote(deps, side, amount)?),
        QueryMsg::StakeInfo { address } => to_json_binary(&query_stake_info(deps, address)?),
        QueryMsg::PoolInfo {} => to_json_binary(&query_pool_info(deps)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        model_denom: config.model_denom,
        reserve_denom: config.reserve_denom,
        owner: config.owner.to_string(),
        fee_bps: config.fee_bps,
    })
}

fn query_pool(deps: Deps) -> StdResult<PoolResponse> {
    let pool = POOL.load(deps.storage)?;
    Ok(PoolResponse {
        reserve: pool.reserve,
        inventory: pool.inventory,
    })
}

fn query_quote(deps: Deps, side: TradeSide, amount: Uint128) -> StdResult<QuoteResponse> {
    let config = CONFIG.load(deps.storage)?;
    let pool = POOL.load(deps.storage)?;

    let (amount_out, denom_in, denom_out) = match side {
        TradeSide::Buy => (
            buy_output(pool.reserve, pool.inventory, amount)
                .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?,
            config.reserve_denom,
            config.model_denom,
        ),
        TradeSide::Sell => (
            sell_output(pool.reserve, pool.inventory, amount)
                .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?,
            config.model_denom,
            config.reserve_denom,
        ),
    };

    Ok(QuoteResponse {
        amount_out,
        denom_in,
        denom_out,
    })
}

fn query_stake_info(deps: Deps, address: String) -> StdResult<StakeInfoResponse> {
    let addr = deps.api.addr_validate(&address)?;
    let dividend = DIVIDEND.load(deps.storage)?;
    let global = dividend.reward_per_token_stored;

    let stake = STAKES.may_load(deps.storage, &addr)?;
    match stake {
        None => Ok(StakeInfoResponse {
            staked: Uint128::zero(),
            claimable: Uint128::zero(),
        }),
        Some(s) => {
            // Compute claimable live: settled pending + accrual since last settlement.
            let earned = earned_since_snapshot(s.staked, global, s.reward_index_snapshot)
                .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;
            let claimable = s
                .pending
                .checked_add(earned)
                .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;
            Ok(StakeInfoResponse {
                staked: s.staked,
                claimable,
            })
        }
    }
}

fn query_pool_info(deps: Deps) -> StdResult<PoolInfoResponse> {
    let dividend = DIVIDEND.load(deps.storage)?;
    Ok(PoolInfoResponse {
        total_staked: dividend.total_staked,
        reward_per_token_stored: dividend.reward_per_token_stored,
    })
}
