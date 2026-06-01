#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Uint128,
};

use crate::curve::{buy_output, sell_output};
use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, PoolResponse, QueryMsg, QuoteResponse, TradeSide,
};
use crate::state::{Config, Pool, CONFIG, POOL};

const DEFAULT_RESERVE_DENOM: &str = "uclaw";

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

    let config = Config {
        model_denom: msg.model_denom.clone(),
        reserve_denom: reserve_denom.clone(),
        owner: owner.clone(),
    };
    CONFIG.save(deps.storage, &config)?;

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

    let tokens_out = buy_output(pool.reserve, pool.inventory, amount_in)?;
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

    // Update state BEFORE building the send: reserve grows by the funds we already hold,
    // inventory shrinks by what we pay out.
    pool.reserve = pool.reserve.checked_add(amount_in)?;
    pool.inventory = pool.inventory.checked_sub(tokens_out)?;
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
        .add_attribute("tokens_out", tokens_out)
        .add_attribute("reserve", pool.reserve)
        .add_attribute("inventory", pool.inventory))
}

/// Sell model tokens for reserve coin.
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

    // Update state: inventory grows by the model tokens we now hold, reserve shrinks by
    // the reserve coin we pay out.
    pool.inventory = pool.inventory.checked_add(amount_in)?;
    pool.reserve = pool.reserve.checked_sub(reserve_out)?;
    POOL.save(deps.storage, &pool)?;

    let send = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: config.reserve_denom.clone(),
            amount: reserve_out,
        }],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "sell")
        .add_attribute("seller", info.sender)
        .add_attribute("tokens_in", amount_in)
        .add_attribute("reserve_out", reserve_out)
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

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::Pool {} => to_json_binary(&query_pool(deps)?),
        QueryMsg::Quote { side, amount } => to_json_binary(&query_quote(deps, side, amount)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        model_denom: config.model_denom,
        reserve_denom: config.reserve_denom,
        owner: config.owner.to_string(),
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
