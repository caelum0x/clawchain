//! cw-multi-test integration tests for the ModelVault bonding-curve contract.
//!
//! These run fully offline against a simulated bank + wasm environment. They exercise
//! instantiate, Fund, Buy, Sell and assert the constant-product math, monotonic price
//! movement, and the error paths (insufficient inventory, wrong coin).

use cosmwasm_std::{coin, coins, Addr, Empty, Uint128};
use cw_multi_test::{App, Contract, ContractWrapper, Executor};

use model_vault::contract::{execute, instantiate, query};
use model_vault::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, PoolInfoResponse, PoolResponse, QueryMsg,
    QuoteResponse, StakeInfoResponse, TradeSide,
};

const RESERVE: &str = "uclaw";
const MODEL: &str = "factory/claw1issuer/opus46";

fn vault_contract() -> Box<dyn Contract<Empty>> {
    Box::new(ContractWrapper::new(execute, instantiate, query))
}

fn u(n: u128) -> Uint128 {
    Uint128::new(n)
}

/// cw-multi-test 2.x uses a bech32 MockApi, so addresses must be valid bech32 (the
/// contract calls `addr_validate` on the owner). Derive valid addresses from labels.
struct Actors {
    owner: Addr,
    trader: Addr,
}

/// Build an App with valid bech32 actors that start with large balances of both denoms.
fn setup_app() -> (App, Actors) {
    let mut app = App::default();
    let owner = app.api().addr_make("owner");
    let trader = app.api().addr_make("trader");
    app.init_modules(|router, _api, storage| {
        for who in [&owner, &trader] {
            router
                .bank
                .init_balance(
                    storage,
                    who,
                    vec![coin(10_000_000, RESERVE), coin(10_000_000, MODEL)],
                )
                .unwrap();
        }
    });
    (app, Actors { owner, trader })
}

/// Instantiate a vault (no funds attached) owned by `owner`.
fn instantiate_vault(app: &mut App, owner: &Addr) -> Addr {
    let code_id = app.store_code(vault_contract());
    app.instantiate_contract(
        code_id,
        owner.clone(),
        &InstantiateMsg {
            model_denom: MODEL.to_string(),
            reserve_denom: Some(RESERVE.to_string()),
            owner: Some(owner.to_string()),
            initial_reserve: None,
            initial_inventory: None,
            fee_bps: Some(0),
        },
        &[],
        "model-vault",
        None,
    )
    .unwrap()
}

/// Instantiate a vault and Fund it with `reserve`/`inventory` so the curve is seeded.
fn instantiate_and_seed(app: &mut App, owner: &Addr, reserve: u128, inventory: u128) -> Addr {
    let code_id = app.store_code(vault_contract());
    let addr = app
        .instantiate_contract(
            code_id,
            owner.clone(),
            &InstantiateMsg {
                model_denom: MODEL.to_string(),
                reserve_denom: Some(RESERVE.to_string()),
                owner: Some(owner.to_string()),
                initial_reserve: None,
                initial_inventory: None,
                fee_bps: Some(0),
            },
            &[],
            "model-vault",
            None,
        )
        .unwrap();

    // Fund both sides in a single message (multi-coin Fund).
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::Fund {},
        &[coin(reserve, RESERVE), coin(inventory, MODEL)],
    )
    .unwrap();

    addr
}

/// Instantiate a seeded vault with an explicit `fee_bps` (the dividend-pool tests need a
/// non-zero fee to observe the curve->stakers linkage).
fn instantiate_and_seed_fee(
    app: &mut App,
    owner: &Addr,
    reserve: u128,
    inventory: u128,
    fee_bps: u16,
) -> Addr {
    let code_id = app.store_code(vault_contract());
    let addr = app
        .instantiate_contract(
            code_id,
            owner.clone(),
            &InstantiateMsg {
                model_denom: MODEL.to_string(),
                reserve_denom: Some(RESERVE.to_string()),
                owner: Some(owner.to_string()),
                initial_reserve: None,
                initial_inventory: None,
                fee_bps: Some(fee_bps),
            },
            &[],
            "model-vault",
            None,
        )
        .unwrap();
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::Fund {},
        &[coin(reserve, RESERVE), coin(inventory, MODEL)],
    )
    .unwrap();
    addr
}

fn pool(app: &App, addr: &Addr) -> PoolResponse {
    app.wrap()
        .query_wasm_smart(addr, &QueryMsg::Pool {})
        .unwrap()
}

fn stake_info(app: &App, addr: &Addr, who: &Addr) -> StakeInfoResponse {
    app.wrap()
        .query_wasm_smart(
            addr,
            &QueryMsg::StakeInfo {
                address: who.to_string(),
            },
        )
        .unwrap()
}

fn pool_info(app: &App, addr: &Addr) -> PoolInfoResponse {
    app.wrap()
        .query_wasm_smart(addr, &QueryMsg::PoolInfo {})
        .unwrap()
}

fn balance(app: &App, who: &Addr, denom: &str) -> Uint128 {
    app.wrap().query_balance(who, denom).unwrap().amount
}

#[test]
fn instantiate_sets_config_and_defaults_reserve_denom() {
    let (mut app, Actors { owner, .. }) = setup_app();
    let code_id = app.store_code(vault_contract());
    let addr = app
        .instantiate_contract(
            code_id,
            owner.clone(),
            &InstantiateMsg {
                model_denom: MODEL.to_string(),
                reserve_denom: None, // should default to uclaw
                owner: None,         // should default to instantiator
                initial_reserve: None,
                initial_inventory: None,
                fee_bps: None, // should default to 30 bps
            },
            &[],
            "model-vault",
            None,
        )
        .unwrap();

    let cfg: ConfigResponse = app
        .wrap()
        .query_wasm_smart(&addr, &QueryMsg::Config {})
        .unwrap();
    assert_eq!(cfg.model_denom, MODEL);
    assert_eq!(cfg.reserve_denom, RESERVE);
    assert_eq!(cfg.owner, owner.to_string());
    assert_eq!(cfg.fee_bps, 30, "fee_bps must default to 30 bps");

    let p = pool(&app, &addr);
    assert_eq!(p.reserve, u(0));
    assert_eq!(p.inventory, u(0));
}

#[test]
fn fund_increases_pool_state() {
    let (mut app, Actors { owner, .. }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    let p = pool(&app, &addr);
    assert_eq!(p.reserve, u(1000));
    assert_eq!(p.inventory, u(1000));

    // Fund again with reserve only.
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::Fund {},
        &coins(500, RESERVE),
    )
    .unwrap();
    let p = pool(&app, &addr);
    assert_eq!(p.reserve, u(1500));
    assert_eq!(p.inventory, u(1000));
}

#[test]
fn buy_matches_constant_product_and_pays_out() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    let before_model = balance(&app, &trader, MODEL);

    // Quote first: buy with 1000 reserve in -> expected 500 model out.
    let q: QuoteResponse = app
        .wrap()
        .query_wasm_smart(
            &addr,
            &QueryMsg::Quote {
                side: TradeSide::Buy,
                amount: u(1000),
            },
        )
        .unwrap();
    assert_eq!(q.amount_out, u(500));
    assert_eq!(q.denom_in, RESERVE);
    assert_eq!(q.denom_out, MODEL);

    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Buy {},
        &coins(1000, RESERVE),
    )
    .unwrap();

    // Trader received exactly 500 model tokens.
    let after_model = balance(&app, &trader, MODEL);
    assert_eq!(after_model - before_model, u(500));

    // Pool updated: reserve 1000->2000, inventory 1000->500.
    let p = pool(&app, &addr);
    assert_eq!(p.reserve, u(2000));
    assert_eq!(p.inventory, u(500));
}

#[test]
fn sell_matches_constant_product_and_pays_out() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    let before_reserve = balance(&app, &trader, RESERVE);

    // Sell with 1000 model in -> expected 500 reserve out.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Sell {},
        &coins(1000, MODEL),
    )
    .unwrap();

    let after_reserve = balance(&app, &trader, RESERVE);
    assert_eq!(after_reserve - before_reserve, u(500));

    // Pool updated: inventory 1000->2000, reserve 1000->500.
    let p = pool(&app, &addr);
    assert_eq!(p.inventory, u(2000));
    assert_eq!(p.reserve, u(500));
}

/// Spot price of the model token (in reserve units) = reserve / inventory.
/// We compare it as a rational reserve*OTHER.inventory vs OTHER.reserve*inventory to
/// avoid float rounding.
fn price_rises(before: &PoolResponse, after: &PoolResponse) -> bool {
    // after_price > before_price  <=>  after.reserve/after.inventory > before.reserve/before.inventory
    after.reserve.full_mul(before.inventory) > before.reserve.full_mul(after.inventory)
}

#[test]
fn price_rises_after_buy_and_falls_after_sell() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 5000, 5000);

    let p0 = pool(&app, &addr);

    // Buy pushes reserve up and inventory down -> price (reserve/inventory) rises.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Buy {},
        &coins(1000, RESERVE),
    )
    .unwrap();
    let p1 = pool(&app, &addr);
    assert!(price_rises(&p0, &p1), "price must rise after a Buy");

    // Sell pushes inventory up and reserve down -> price falls.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Sell {},
        &coins(1000, MODEL),
    )
    .unwrap();
    let p2 = pool(&app, &addr);
    assert!(price_rises(&p2, &p1), "price must fall after a Sell");
}

#[test]
fn buy_on_uninitialized_pool_fails() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_vault(&mut app, &owner);

    // No Fund yet -> pool is empty -> Buy must error.
    let err = app
        .execute_contract(
            trader.clone(),
            addr.clone(),
            &ExecuteMsg::Buy {},
            &coins(100, RESERVE),
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("not initialized"));
}

#[test]
fn buy_with_wrong_coin_fails() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    // Buy expects reserve_denom; attach model_denom instead.
    let err = app
        .execute_contract(
            trader.clone(),
            addr.clone(),
            &ExecuteMsg::Buy {},
            &coins(100, MODEL),
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("wrong coin"));
}

#[test]
fn buy_with_two_coins_fails() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    let err = app
        .execute_contract(
            trader.clone(),
            addr.clone(),
            &ExecuteMsg::Buy {},
            &[coin(100, RESERVE), coin(100, MODEL)],
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("exactly one coin"));
}

#[test]
fn fund_by_non_owner_fails() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    let err = app
        .execute_contract(
            trader.clone(),
            addr.clone(),
            &ExecuteMsg::Fund {},
            &coins(100, RESERVE),
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("unauthorized"));
}

#[test]
fn huge_buy_that_would_drain_inventory_fails() {
    let (mut app, Actors { owner, trader }) = setup_app();
    // Tiny inventory, small reserve: a massive reserve input would floor the curve to
    // hand out the entire inventory, which the contract rejects (InsufficientInventory).
    let addr = instantiate_and_seed(&mut app, &owner, 10, 10);

    let err = app
        .execute_contract(
            trader.clone(),
            addr.clone(),
            &ExecuteMsg::Buy {},
            &coins(1_000_000, RESERVE),
        )
        .unwrap_err();
    assert!(err
        .root_cause()
        .to_string()
        .contains("insufficient inventory"));
}

#[test]
fn round_trip_returns_close_to_principal() {
    // Buy then immediately sell the received tokens. v0 has NO swap fee, so a round trip
    // returns approximately the principal. With integer floor rounding the result can
    // differ from the principal by a tiny dust amount in either direction (a fee-less
    // constant-product market is not strictly arbitrage-free at the integer-rounding
    // level — adding a swap fee in a later version closes that gap). We assert the round
    // trip stays within a small epsilon of the principal and conserves total funds.
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 10_000, 10_000);

    let start_reserve = balance(&app, &trader, RESERVE);
    let start_model = balance(&app, &trader, MODEL);
    let principal = u(2000);

    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Buy {},
        &coins(principal.u128(), RESERVE),
    )
    .unwrap();
    // Tokens gained over the trader's starting model balance.
    let bought = balance(&app, &trader, MODEL) - start_model;
    assert!(bought > u(0), "buy must yield tokens");

    // Sell exactly what we bought back.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Sell {},
        &coins(bought.u128(), MODEL),
    )
    .unwrap();

    let end_reserve = balance(&app, &trader, RESERVE);
    let end_model = balance(&app, &trader, MODEL);

    // Model balance is back to the starting amount (we sold exactly what we bought).
    assert_eq!(end_model, start_model);

    // Reserve is within a small dust epsilon of where it started (no fee).
    let epsilon = u(10);
    let diff = if end_reserve >= start_reserve {
        end_reserve - start_reserve
    } else {
        start_reserve - end_reserve
    };
    assert!(
        diff <= epsilon,
        "round trip drifted {diff} from principal (start={start_reserve}, end={end_reserve}), expected <= {epsilon}"
    );

    // Total system funds (trader + vault) are conserved across the round trip.
    let vault_reserve = balance(&app, &addr, RESERVE);
    let vault_model = balance(&app, &addr, MODEL);
    assert_eq!(end_reserve + vault_reserve, start_reserve + u(10_000));
    assert_eq!(end_model + vault_model, start_model + u(10_000));
}

// ========================================================================================
// Dividend pool (P2): stake the model token, earn pro-rata revenue.
// ========================================================================================

/// Create a fresh bech32 actor funded with both denoms.
fn funded_actor(app: &mut App, label: &str) -> Addr {
    let who = app.api().addr_make(label);
    app.init_modules(|router, _api, storage| {
        router
            .bank
            .init_balance(
                storage,
                &who,
                vec![coin(10_000_000, RESERVE), coin(10_000_000, MODEL)],
            )
            .unwrap();
    });
    who
}

#[test]
fn stake_distribute_claim_pays_full_amount_to_sole_staker() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    // Trader stakes 1000 model tokens.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(1000, MODEL),
    )
    .unwrap();

    let info = stake_info(&app, &addr, &trader);
    assert_eq!(info.staked, u(1000));
    assert_eq!(info.claimable, u(0));
    assert_eq!(pool_info(&app, &addr).total_staked, u(1000));

    // Anyone distributes 500 reserve revenue into the pool.
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::DistributeRevenue {},
        &coins(500, RESERVE),
    )
    .unwrap();

    // Sole staker is now owed the full 500.
    let info = stake_info(&app, &addr, &trader);
    assert_eq!(info.claimable, u(500));

    let before = balance(&app, &trader, RESERVE);
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::ClaimRewards {},
        &[],
    )
    .unwrap();
    let after = balance(&app, &trader, RESERVE);
    assert_eq!(after - before, u(500), "sole staker claims full revenue");

    // Pending is zeroed; staked is unchanged.
    let info = stake_info(&app, &addr, &trader);
    assert_eq!(info.claimable, u(0));
    assert_eq!(info.staked, u(1000));
}

#[test]
fn two_stakers_split_revenue_pro_rata() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let alice = trader;
    let bob = funded_actor(&mut app, "bob");
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    // Alice stakes 750, Bob stakes 250 -> total 1000.
    app.execute_contract(
        alice.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(750, MODEL),
    )
    .unwrap();
    app.execute_contract(
        bob.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(250, MODEL),
    )
    .unwrap();
    assert_eq!(pool_info(&app, &addr).total_staked, u(1000));

    // Distribute 1000 reserve -> Alice 750, Bob 250.
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::DistributeRevenue {},
        &coins(1000, RESERVE),
    )
    .unwrap();

    assert_eq!(stake_info(&app, &addr, &alice).claimable, u(750));
    assert_eq!(stake_info(&app, &addr, &bob).claimable, u(250));

    // Both claim and receive exactly their share.
    let a_before = balance(&app, &alice, RESERVE);
    let b_before = balance(&app, &bob, RESERVE);
    app.execute_contract(
        alice.clone(),
        addr.clone(),
        &ExecuteMsg::ClaimRewards {},
        &[],
    )
    .unwrap();
    app.execute_contract(bob.clone(), addr.clone(), &ExecuteMsg::ClaimRewards {}, &[])
        .unwrap();
    assert_eq!(balance(&app, &alice, RESERVE) - a_before, u(750));
    assert_eq!(balance(&app, &bob, RESERVE) - b_before, u(250));
}

#[test]
fn unstake_mid_stream_settles_pending() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    // Stake 1000, distribute 400 -> claimable 400.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(1000, MODEL),
    )
    .unwrap();
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::DistributeRevenue {},
        &coins(400, RESERVE),
    )
    .unwrap();

    // Unstake half: the 400 already earned is settled into pending and survives.
    let before_model = balance(&app, &trader, MODEL);
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Unstake { amount: u(500) },
        &[],
    )
    .unwrap();
    assert_eq!(balance(&app, &trader, MODEL) - before_model, u(500));

    let info = stake_info(&app, &addr, &trader);
    assert_eq!(info.staked, u(500));
    assert_eq!(info.claimable, u(400), "pending survives the unstake");

    // A second distribution of 500 now only accrues to the remaining 500 staked.
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::DistributeRevenue {},
        &coins(500, RESERVE),
    )
    .unwrap();
    // claimable = 400 (old) + 500 (sole remaining staker) = 900.
    assert_eq!(stake_info(&app, &addr, &trader).claimable, u(900));

    let before = balance(&app, &trader, RESERVE);
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::ClaimRewards {},
        &[],
    )
    .unwrap();
    assert_eq!(balance(&app, &trader, RESERVE) - before, u(900));
}

#[test]
fn claim_with_nothing_staked_errs() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    let err = app
        .execute_contract(
            trader.clone(),
            addr.clone(),
            &ExecuteMsg::ClaimRewards {},
            &[],
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("no rewards to claim"));
}

#[test]
fn distribute_with_zero_stakers_errs() {
    let (mut app, Actors { owner, .. }) = setup_app();
    let addr = instantiate_and_seed(&mut app, &owner, 1000, 1000);

    // Nobody has staked yet -> DistributeRevenue must error so funds aren't stranded.
    let err = app
        .execute_contract(
            owner.clone(),
            addr.clone(),
            &ExecuteMsg::DistributeRevenue {},
            &coins(100, RESERVE),
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("zero total staked"));
}

#[test]
fn buy_with_fee_credits_the_dividend_pool() {
    let (mut app, Actors { owner, trader }) = setup_app();
    // 100 bps = 1% fee for an easy-to-read split.
    let addr = instantiate_and_seed_fee(&mut app, &owner, 100_000, 100_000, 100);

    // A staker must exist for the fee to route to the pool.
    let staker = funded_actor(&mut app, "staker");
    app.execute_contract(
        staker.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(1000, MODEL),
    )
    .unwrap();

    // Buy with 10_000 reserve in -> fee = 1% = 100 reserve routed to the sole staker.
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Buy {},
        &coins(10_000, RESERVE),
    )
    .unwrap();

    // Sole staker is now owed the 100-reserve fee.
    let info = stake_info(&app, &addr, &staker);
    assert_eq!(info.claimable, u(100), "1% buy fee credited to the staker");

    let before = balance(&app, &staker, RESERVE);
    app.execute_contract(
        staker.clone(),
        addr.clone(),
        &ExecuteMsg::ClaimRewards {},
        &[],
    )
    .unwrap();
    assert_eq!(balance(&app, &staker, RESERVE) - before, u(100));
}

#[test]
fn sell_with_fee_credits_the_dividend_pool() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed_fee(&mut app, &owner, 100_000, 100_000, 100);

    let staker = funded_actor(&mut app, "staker2");
    app.execute_contract(
        staker.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(1000, MODEL),
    )
    .unwrap();

    // Quote the gross reserve_out for a 10_000-model sell to derive the expected fee.
    let q: QuoteResponse = app
        .wrap()
        .query_wasm_smart(
            &addr,
            &QueryMsg::Quote {
                side: TradeSide::Sell,
                amount: u(10_000),
            },
        )
        .unwrap();
    let gross_out = q.amount_out;
    let expected_fee = gross_out.multiply_ratio(u(100), u(10_000)); // 1%

    let seller_before = balance(&app, &trader, RESERVE);
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Sell {},
        &coins(10_000, MODEL),
    )
    .unwrap();
    let seller_received = balance(&app, &trader, RESERVE) - seller_before;

    // Seller got gross minus the fee; the fee is credited to the staker.
    assert_eq!(seller_received, gross_out - expected_fee);
    assert_eq!(stake_info(&app, &addr, &staker).claimable, expected_fee);
}

#[test]
fn fee_with_no_stakers_stays_in_reserve() {
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed_fee(&mut app, &owner, 100_000, 100_000, 100);

    // No stakers: the fee must fall back into the curve reserve, not be stranded.
    let p_before = pool(&app, &addr);
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Buy {},
        &coins(10_000, RESERVE),
    )
    .unwrap();
    let p_after = pool(&app, &addr);

    // The full 10_000 reserve_in (net + fee) ended up in the curve reserve.
    assert_eq!(p_after.reserve, p_before.reserve + u(10_000));
    // Reward index untouched because there were no stakers.
    assert_eq!(
        pool_info(&app, &addr).reward_per_token_stored,
        cosmwasm_std::Uint256::zero()
    );
}

#[test]
fn dividend_funds_conservation_round_trip() {
    // Stake -> distribute -> claim, with a buy fee in the middle: assert total system funds
    // (all actors + vault) are conserved across the whole dividend lifecycle.
    let (mut app, Actors { owner, trader }) = setup_app();
    let addr = instantiate_and_seed_fee(&mut app, &owner, 100_000, 100_000, 100);
    let staker = funded_actor(&mut app, "conserver");

    let actors = [&owner, &trader, &staker, &addr];
    let total_reserve_before: Uint128 = actors.iter().map(|a| balance(&app, a, RESERVE)).sum();
    let total_model_before: Uint128 = actors.iter().map(|a| balance(&app, a, MODEL)).sum();

    // Stake, trade (fee accrues), distribute extra revenue, claim, unstake.
    app.execute_contract(
        staker.clone(),
        addr.clone(),
        &ExecuteMsg::Stake {},
        &coins(2000, MODEL),
    )
    .unwrap();
    app.execute_contract(
        trader.clone(),
        addr.clone(),
        &ExecuteMsg::Buy {},
        &coins(10_000, RESERVE),
    )
    .unwrap();
    app.execute_contract(
        owner.clone(),
        addr.clone(),
        &ExecuteMsg::DistributeRevenue {},
        &coins(777, RESERVE),
    )
    .unwrap();
    app.execute_contract(
        staker.clone(),
        addr.clone(),
        &ExecuteMsg::ClaimRewards {},
        &[],
    )
    .unwrap();
    app.execute_contract(
        staker.clone(),
        addr.clone(),
        &ExecuteMsg::Unstake { amount: u(2000) },
        &[],
    )
    .unwrap();

    let total_reserve_after: Uint128 = actors.iter().map(|a| balance(&app, a, RESERVE)).sum();
    let total_model_after: Uint128 = actors.iter().map(|a| balance(&app, a, MODEL)).sum();

    assert_eq!(
        total_reserve_after, total_reserve_before,
        "reserve denom is conserved across the dividend lifecycle"
    );
    assert_eq!(
        total_model_after, total_model_before,
        "model denom is conserved across the dividend lifecycle"
    );
}
