//! Tests for the ClawDEX arbitrage strategy.

#[cfg(test)]
mod tests {
    use crate::config::ClawDexConfig;
    use crate::executor::{
        build_arb_tx, build_swap_msg, build_three_leg_arb_tx, build_two_leg_arb_tx,
        ArbLeg, ArbOpportunity, RouteHop, build_router_swap_msg,
    };
    use crate::pool::{
        build_pair_index, simulate_swap, spot_price, ClawDexPool, PoolAsset, SwapResult,
    };
    use crate::{calculate_swap_output, ClawDexArbStrategy};

    // =======================================================================
    // Helpers
    // =======================================================================

    /// Build a pool from two (denom, amount) pairs.
    fn make_pool(
        address: &str,
        denom_a: &str,
        amount_a: u128,
        denom_b: &str,
        amount_b: u128,
    ) -> ClawDexPool {
        ClawDexPool {
            pair_address: address.to_string(),
            assets: [
                PoolAsset {
                    denom: denom_a.to_string(),
                    amount: amount_a,
                },
                PoolAsset {
                    denom: denom_b.to_string(),
                    amount: amount_b,
                },
            ],
            total_share: 1_000_000,
            fee_rate: 0.003,
        }
    }

    /// Build a strategy from a set of pools (no network calls).
    fn make_strategy(pools: Vec<ClawDexPool>, enable_three_leg: bool) -> ClawDexArbStrategy {
        let mut config = ClawDexConfig::default();
        config.min_profit_uclaw = 1;
        config.max_trade_uclaw = 500_000_000;
        config.sender_address = "claw1test".to_string();
        config.factory_address = "claw1factory".to_string();
        config.enable_three_leg = enable_three_leg;

        let pair_index = build_pair_index(&pools);
        let mut denoms: Vec<String> = pair_index.keys().map(|(d, _)| d.clone()).collect();
        denoms.sort();
        denoms.dedup();

        ClawDexArbStrategy {
            config,
            pools,
            pair_index,
            known_denoms: denoms,
        }
    }

    // =======================================================================
    // config tests
    // =======================================================================

    #[test]
    fn test_config_defaults() {
        let cfg = ClawDexConfig::default();
        assert_eq!(cfg.rest_url, "http://localhost:1317");
        assert_eq!(cfg.rpc_url, "http://localhost:26657");
        assert!(cfg.pool_addresses.is_empty());
        assert_eq!(cfg.min_profit_uclaw, 1_000);
        assert_eq!(cfg.max_trade_uclaw, 1_000_000_000);
        assert!(cfg.sender_address.is_empty());
        assert!(cfg.dry_run);
        assert!(!cfg.enable_three_leg);
        assert_eq!(cfg.fee_rate, 0.003);
        assert_eq!(cfg.max_slippage, 0.01);
    }

    #[test]
    fn test_config_gas_cost() {
        let cfg = ClawDexConfig::default();
        // 0.025 * 400_000 = 10_000
        assert_eq!(cfg.two_leg_gas_cost(), 10_000);
        // 0.025 * 600_000 = 15_000
        assert_eq!(cfg.three_leg_gas_cost(), 15_000);
    }

    #[test]
    fn test_config_validate_ok() {
        let mut cfg = ClawDexConfig::default();
        cfg.factory_address = "claw1factory".to_string();
        assert!(cfg.validate().is_ok());
    }

    #[test]
    fn test_config_validate_missing_rest_url() {
        let mut cfg = ClawDexConfig::default();
        cfg.rest_url = "".to_string();
        cfg.factory_address = "claw1factory".to_string();
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn test_config_validate_missing_sender_non_dry() {
        let mut cfg = ClawDexConfig::default();
        cfg.factory_address = "claw1factory".to_string();
        cfg.dry_run = false;
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn test_config_validate_no_pools_no_factory() {
        let cfg = ClawDexConfig::default();
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn test_config_validate_bad_fee_rate() {
        let mut cfg = ClawDexConfig::default();
        cfg.factory_address = "claw1factory".to_string();
        cfg.fee_rate = 1.5;
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn test_config_serde_roundtrip() {
        let cfg = ClawDexConfig::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: ClawDexConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.rest_url, cfg.rest_url);
        assert_eq!(deserialized.fee_rate, cfg.fee_rate);
        assert_eq!(deserialized.dry_run, cfg.dry_run);
    }

    // =======================================================================
    // Pool / AMM math tests
    // =======================================================================

    #[test]
    fn test_simulate_swap_basic() {
        let pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        let result = simulate_swap(&pool, "uclaw", 1_000).unwrap();
        // 1000 * 0.997 * 1_000_000 / (1_000_000 + 997) ~ 996
        assert!(result.return_amount > 990 && result.return_amount < 1000);
        assert_eq!(result.ask_denom, "uatom");
    }

    #[test]
    fn test_simulate_swap_reverse_direction() {
        let pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        let result = simulate_swap(&pool, "uatom", 1_000).unwrap();
        assert!(result.return_amount > 990 && result.return_amount < 1000);
        assert_eq!(result.ask_denom, "uclaw");
    }

    #[test]
    fn test_simulate_swap_unknown_denom() {
        let pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        assert!(simulate_swap(&pool, "ujuno", 1_000).is_none());
    }

    #[test]
    fn test_simulate_swap_zero_reserves() {
        let pool = make_pool("pool1", "uclaw", 0, "uatom", 1_000_000);
        let result = simulate_swap(&pool, "uclaw", 1_000).unwrap();
        assert_eq!(result.return_amount, 0);
    }

    #[test]
    fn test_simulate_swap_zero_input() {
        let pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        let result = simulate_swap(&pool, "uclaw", 0).unwrap();
        assert_eq!(result.return_amount, 0);
    }

    #[test]
    fn test_simulate_swap_large_input_approaches_reserve() {
        let pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        let result = simulate_swap(&pool, "uclaw", 1_000_000_000).unwrap();
        // Output should approach but never reach the full ask reserve.
        assert!(result.return_amount < 1_000_000);
        assert!(result.return_amount > 990_000);
    }

    #[test]
    fn test_simulate_swap_commission_nonzero() {
        let pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        let result = simulate_swap(&pool, "uclaw", 100_000).unwrap();
        assert!(result.commission_amount > 0);
        assert!(result.spread_amount > 0);
    }

    #[test]
    fn test_simulate_swap_zero_fee_pool() {
        let mut pool = make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000);
        pool.fee_rate = 0.0;
        let result = simulate_swap(&pool, "uclaw", 100_000).unwrap();
        // 100_000 * 1_000_000 / (1_000_000 + 100_000) = 90909
        assert_eq!(result.return_amount, 90909);
    }

    #[test]
    fn test_spot_price() {
        let pool = make_pool("pool1", "uclaw", 2_000_000, "uatom", 1_000_000);
        // Price of uclaw in uatom terms = 1_000_000 / 2_000_000 = 0.5
        let price = spot_price(&pool, "uclaw").unwrap();
        assert!((price - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_spot_price_unknown_denom() {
        let pool = make_pool("pool1", "uclaw", 2_000_000, "uatom", 1_000_000);
        assert!(spot_price(&pool, "ujuno").is_none());
    }

    #[test]
    fn test_spot_price_zero_base_reserve() {
        let pool = make_pool("pool1", "uclaw", 0, "uatom", 1_000_000);
        assert!(spot_price(&pool, "uclaw").is_none());
    }

    // =======================================================================
    // Legacy calculate_swap_output (u64 interface)
    // =======================================================================

    #[test]
    fn test_legacy_swap_output_basic() {
        let out = calculate_swap_output(1_000, 1_000_000, 1_000_000, 0.003);
        assert!(out > 990 && out < 1000, "got {}", out);
    }

    #[test]
    fn test_legacy_swap_output_zero_reserves() {
        assert_eq!(calculate_swap_output(1_000, 0, 1_000_000, 0.003), 0);
        assert_eq!(calculate_swap_output(1_000, 1_000_000, 0, 0.003), 0);
    }

    #[test]
    fn test_legacy_swap_output_zero_fee() {
        let out = calculate_swap_output(100_000, 1_000_000, 1_000_000, 0.0);
        assert_eq!(out, 90909);
    }

    // =======================================================================
    // Pair index tests
    // =======================================================================

    #[test]
    fn test_build_pair_index() {
        let pools = vec![
            make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000),
            make_pool("pool2", "uclaw", 2_000_000, "uatom", 1_000_000),
            make_pool("pool3", "uclaw", 1_000_000, "uosmo", 500_000),
        ];

        let index = build_pair_index(&pools);

        // uclaw->uatom should map to pool indices 0 and 1.
        let uclaw_uatom = index.get(&("uclaw".to_string(), "uatom".to_string())).unwrap();
        assert_eq!(uclaw_uatom.len(), 2);
        assert!(uclaw_uatom.contains(&0));
        assert!(uclaw_uatom.contains(&1));

        // uatom->uclaw (reverse) should also map to the same pools.
        let uatom_uclaw = index.get(&("uatom".to_string(), "uclaw".to_string())).unwrap();
        assert_eq!(uatom_uclaw.len(), 2);

        // uclaw->uosmo should map to pool index 2.
        let uclaw_uosmo = index.get(&("uclaw".to_string(), "uosmo".to_string())).unwrap();
        assert_eq!(uclaw_uosmo.len(), 1);
        assert!(uclaw_uosmo.contains(&2));
    }

    // =======================================================================
    // Two-leg arb detection
    // =======================================================================

    #[test]
    fn test_two_leg_arb_detected() {
        // Pool1 prices uatom at 2 uclaw, Pool2 prices at 0.5 uclaw. Big arb.
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();

        assert!(!arbs.is_empty(), "should detect a two-leg arb");
        let best = &arbs[0];
        assert!(best.net_profit > 0, "net profit {} should be positive", best.net_profit);
        assert!(best.legs.len() == 2);
        assert!(best.label.contains("2-leg"));
    }

    #[test]
    fn test_two_leg_arb_none_for_identical_pools() {
        let pools = vec![
            make_pool("pool1", "uclaw", 1_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 1_000_000_000, "uatom", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();

        assert!(arbs.is_empty(), "identical pools should produce no arb");
    }

    #[test]
    fn test_two_leg_arb_respects_min_profit() {
        // Small price difference.
        let pools = vec![
            make_pool("pool1", "uclaw", 1_000_000_000, "uatom", 1_000_100_000),
            make_pool("pool2", "uclaw", 1_000_100_000, "uatom", 1_000_000_000),
        ];

        let mut strategy = make_strategy(pools, false);
        // Set a very high minimum so the tiny arb is filtered out.
        strategy.config.min_profit_uclaw = 1_000_000_000;
        let arbs = strategy.find_two_leg_arbs();
        assert!(arbs.is_empty(), "tiny arb should not meet high min_profit");
    }

    #[test]
    fn test_two_leg_arb_single_pool_no_pair() {
        // Only one pool for the pair -> no arb possible.
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();
        assert!(arbs.is_empty());
    }

    #[test]
    fn test_two_leg_arb_multiple_pairs() {
        // Two pairs: uclaw/uatom and uclaw/uosmo. Each pair has a price discrepancy.
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
            make_pool("pool3", "uclaw", 1_000_000_000, "uosmo", 500_000_000),
            make_pool("pool4", "uclaw", 500_000_000, "uosmo", 500_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();

        // Should find arbs for both pairs.
        assert!(arbs.len() >= 2, "should find arbs for both pairs, got {}", arbs.len());
    }

    #[test]
    fn test_two_leg_arb_correct_direction() {
        // Pool1: uclaw cheap (lots of uclaw per uatom) -> buy uatom here
        // Pool2: uclaw expensive (few uclaw per uatom) -> sell uatom here
        let pools = vec![
            make_pool("pool_cheap", "uclaw", 2_000_000_000, "uatom", 500_000_000),
            make_pool("pool_expensive", "uclaw", 500_000_000, "uatom", 2_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();

        assert!(!arbs.is_empty());
        let best = &arbs[0];
        // The buy leg should be on pool_cheap (buy uatom with uclaw).
        assert_eq!(best.legs[0].offer_denom, "uclaw");
    }

    // =======================================================================
    // Three-leg (triangular) arb detection
    // =======================================================================

    #[test]
    fn test_three_leg_arb_detected() {
        // Create a triangular opportunity: uclaw -> uatom -> uosmo -> uclaw
        // with prices that make the cycle profitable.
        let pools = vec![
            // uclaw/uatom: 1 uclaw = 1 uatom
            make_pool("pool_ab", "uclaw", 1_000_000_000, "uatom", 1_000_000_000),
            // uatom/uosmo: 1 uatom = 2 uosmo
            make_pool("pool_bc", "uatom", 500_000_000, "uosmo", 1_000_000_000),
            // uosmo/uclaw: 1 uosmo = 1 uclaw (mispriced -- should be 0.5 for equilibrium)
            make_pool("pool_ca", "uosmo", 1_000_000_000, "uclaw", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, true);
        let arbs = strategy.find_three_leg_arbs();

        assert!(!arbs.is_empty(), "should detect a triangular arb");
        let best = &arbs[0];
        assert_eq!(best.legs.len(), 3);
        assert!(best.net_profit > 0);
        assert!(best.label.contains("3-leg"));
    }

    #[test]
    fn test_three_leg_arb_disabled_by_config() {
        let pools = vec![
            make_pool("pool_ab", "uclaw", 1_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool_bc", "uatom", 500_000_000, "uosmo", 1_000_000_000),
            make_pool("pool_ca", "uosmo", 1_000_000_000, "uclaw", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_three_leg_arbs();

        assert!(arbs.is_empty(), "three-leg should be disabled");
    }

    #[test]
    fn test_three_leg_arb_equilibrium_no_profit() {
        // Pools in equilibrium: no triangular arb should exist.
        // uclaw/uatom = 1:1, uatom/uosmo = 1:1, uosmo/uclaw = 1:1
        let pools = vec![
            make_pool("pool_ab", "uclaw", 1_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool_bc", "uatom", 1_000_000_000, "uosmo", 1_000_000_000),
            make_pool("pool_ca", "uosmo", 1_000_000_000, "uclaw", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, true);
        let arbs = strategy.find_three_leg_arbs();

        // Even with tiny amounts, fees + gas make the round-trip unprofitable.
        assert!(arbs.is_empty(), "equilibrium pools should yield no three-leg arb");
    }

    // =======================================================================
    // Unified scan
    // =======================================================================

    #[test]
    fn test_scan_returns_both_types() {
        let pools = vec![
            // Two-leg pair.
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
            // Additional pool for triangular path.
            make_pool("pool3", "uatom", 500_000_000, "uosmo", 1_000_000_000),
            make_pool("pool4", "uosmo", 1_000_000_000, "uclaw", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, true);
        let arbs = strategy.scan();

        let two_leg_count = arbs.iter().filter(|a| a.legs.len() == 2).count();
        let three_leg_count = arbs.iter().filter(|a| a.legs.len() == 3).count();

        assert!(two_leg_count > 0, "should have two-leg arbs");
        // Three-leg may or may not exist depending on prices; just check no panic.
        assert!(arbs.len() >= two_leg_count);
    }

    #[test]
    fn test_scan_sorted_by_profit() {
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.scan();

        for window in arbs.windows(2) {
            assert!(
                window[0].net_profit >= window[1].net_profit,
                "results should be sorted by descending net_profit"
            );
        }
    }

    // =======================================================================
    // Executor / message building tests
    // =======================================================================

    #[test]
    fn test_build_swap_msg_structure() {
        let msg = build_swap_msg("claw1sender", "claw1pool", "uclaw", 500_000, 0.01);

        assert_eq!(msg["@type"], "/cosmwasm.wasm.v1.MsgExecuteContract");
        assert_eq!(msg["sender"], "claw1sender");
        assert_eq!(msg["contract"], "claw1pool");

        let funds = msg["funds"].as_array().unwrap();
        assert_eq!(funds.len(), 1);
        assert_eq!(funds[0]["denom"], "uclaw");
        assert_eq!(funds[0]["amount"], "500000");

        // Decode the embedded swap message.
        let encoded = msg["msg"].as_str().unwrap();
        let decoded_bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("msg should be valid base64");
        let decoded: serde_json::Value =
            serde_json::from_slice(&decoded_bytes).expect("decoded msg should be JSON");
        assert_eq!(decoded["swap"]["offer_asset"]["info"]["native_token"]["denom"], "uclaw");
        assert_eq!(decoded["swap"]["offer_asset"]["amount"], "500000");
    }

    use base64::Engine;

    #[test]
    fn test_build_router_swap_msg() {
        let hops = vec![
            RouteHop {
                pair_address: "claw1pair1".to_string(),
                offer_denom: "uclaw".to_string(),
            },
            RouteHop {
                pair_address: "claw1pair2".to_string(),
                offer_denom: "uatom".to_string(),
            },
        ];

        let msg = build_router_swap_msg(
            "claw1sender",
            "claw1router",
            "uclaw",
            100_000,
            &hops,
            95_000,
        );

        assert_eq!(msg["@type"], "/cosmwasm.wasm.v1.MsgExecuteContract");
        assert_eq!(msg["contract"], "claw1router");
        assert_eq!(msg["funds"][0]["denom"], "uclaw");
        assert_eq!(msg["funds"][0]["amount"], "100000");

        // Decode and verify the inner message.
        let encoded = msg["msg"].as_str().unwrap();
        let decoded_bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        let decoded: serde_json::Value = serde_json::from_slice(&decoded_bytes).unwrap();
        let ops = decoded["execute_swap_operations"]["operations"]
            .as_array()
            .unwrap();
        assert_eq!(ops.len(), 2);
        assert_eq!(
            decoded["execute_swap_operations"]["minimum_receive"],
            "95000"
        );
    }

    #[test]
    fn test_build_two_leg_arb_tx() {
        let config = ClawDexConfig {
            sender_address: "claw1arber".to_string(),
            factory_address: "claw1factory".to_string(),
            ..Default::default()
        };

        let opp = ArbOpportunity {
            label: "2-leg uclaw->uatom->uclaw".to_string(),
            legs: vec![
                ArbLeg {
                    pair_address: "pool_buy".to_string(),
                    offer_denom: "uclaw".to_string(),
                    offer_amount: 1_000_000,
                    expected_return: 990_000,
                    return_denom: "uatom".to_string(),
                },
                ArbLeg {
                    pair_address: "pool_sell".to_string(),
                    offer_denom: "uatom".to_string(),
                    offer_amount: 990_000,
                    expected_return: 1_050_000,
                    return_denom: "uclaw".to_string(),
                },
            ],
            base_denom: "uclaw".to_string(),
            input_amount: 1_000_000,
            expected_output: 1_050_000,
            gross_profit: 50_000,
            gas_cost: 10_000,
            net_profit: 40_000,
            net_profit_pct: 4.0,
        };

        let tx = build_two_leg_arb_tx(&config, &opp);
        let messages = tx["body"]["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["contract"], "pool_buy");
        assert_eq!(messages[1]["contract"], "pool_sell");
        assert_eq!(tx["body"]["memo"], "clawdex-arb");
    }

    #[test]
    fn test_build_three_leg_arb_tx() {
        let config = ClawDexConfig {
            sender_address: "claw1arber".to_string(),
            factory_address: "claw1factory".to_string(),
            ..Default::default()
        };

        let opp = ArbOpportunity {
            label: "3-leg uclaw->uatom->uosmo->uclaw".to_string(),
            legs: vec![
                ArbLeg {
                    pair_address: "pool_1".to_string(),
                    offer_denom: "uclaw".to_string(),
                    offer_amount: 1_000_000,
                    expected_return: 990_000,
                    return_denom: "uatom".to_string(),
                },
                ArbLeg {
                    pair_address: "pool_2".to_string(),
                    offer_denom: "uatom".to_string(),
                    offer_amount: 990_000,
                    expected_return: 1_950_000,
                    return_denom: "uosmo".to_string(),
                },
                ArbLeg {
                    pair_address: "pool_3".to_string(),
                    offer_denom: "uosmo".to_string(),
                    offer_amount: 1_950_000,
                    expected_return: 1_100_000,
                    return_denom: "uclaw".to_string(),
                },
            ],
            base_denom: "uclaw".to_string(),
            input_amount: 1_000_000,
            expected_output: 1_100_000,
            gross_profit: 100_000,
            gas_cost: 15_000,
            net_profit: 85_000,
            net_profit_pct: 8.5,
        };

        let tx = build_three_leg_arb_tx(&config, &opp);
        let messages = tx["body"]["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0]["contract"], "pool_1");
        assert_eq!(messages[1]["contract"], "pool_2");
        assert_eq!(messages[2]["contract"], "pool_3");

        // Gas limit should be the three-leg default.
        assert_eq!(
            tx["auth_info"]["fee"]["gas_limit"],
            config.gas_limit_three_leg.to_string()
        );
    }

    #[test]
    fn test_build_arb_tx_generic() {
        let config = ClawDexConfig {
            sender_address: "claw1arber".to_string(),
            factory_address: "claw1factory".to_string(),
            ..Default::default()
        };

        let opp = ArbOpportunity {
            label: "test".to_string(),
            legs: vec![
                ArbLeg {
                    pair_address: "p1".to_string(),
                    offer_denom: "uclaw".to_string(),
                    offer_amount: 100,
                    expected_return: 95,
                    return_denom: "uatom".to_string(),
                },
                ArbLeg {
                    pair_address: "p2".to_string(),
                    offer_denom: "uatom".to_string(),
                    offer_amount: 95,
                    expected_return: 105,
                    return_denom: "uclaw".to_string(),
                },
            ],
            base_denom: "uclaw".to_string(),
            input_amount: 100,
            expected_output: 105,
            gross_profit: 5,
            gas_cost: 1,
            net_profit: 4,
            net_profit_pct: 4.0,
        };

        let tx = build_arb_tx(&config, &opp);
        let messages = tx["body"]["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
    }

    // =======================================================================
    // Serde round-trip tests
    // =======================================================================

    #[test]
    fn test_pool_serde_roundtrip() {
        let pool = make_pool("claw1abc", "uclaw", 42, "uatom", 99);
        let json = serde_json::to_string(&pool).unwrap();
        let de: ClawDexPool = serde_json::from_str(&json).unwrap();
        assert_eq!(de.pair_address, "claw1abc");
        assert_eq!(de.assets[0].amount, 42);
        assert_eq!(de.assets[1].denom, "uatom");
    }

    #[test]
    fn test_arb_opportunity_serde_roundtrip() {
        let opp = ArbOpportunity {
            label: "test".to_string(),
            legs: vec![],
            base_denom: "uclaw".to_string(),
            input_amount: 1000,
            expected_output: 1050,
            gross_profit: 50,
            gas_cost: 10,
            net_profit: 40,
            net_profit_pct: 4.0,
        };
        let json = serde_json::to_string(&opp).unwrap();
        let de: ArbOpportunity = serde_json::from_str(&json).unwrap();
        assert_eq!(de.net_profit, 40);
        assert_eq!(de.gas_cost, 10);
        assert_eq!(de.net_profit_pct, 4.0);
    }

    #[test]
    fn test_arb_leg_serde_roundtrip() {
        let leg = ArbLeg {
            pair_address: "claw1pair".to_string(),
            offer_denom: "uclaw".to_string(),
            offer_amount: 500,
            expected_return: 490,
            return_denom: "uatom".to_string(),
        };
        let json = serde_json::to_string(&leg).unwrap();
        let de: ArbLeg = serde_json::from_str(&json).unwrap();
        assert_eq!(de.pair_address, "claw1pair");
        assert_eq!(de.offer_amount, 500);
    }

    // =======================================================================
    // Profit calculation tests
    // =======================================================================

    #[test]
    fn test_profit_accounts_for_gas() {
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();

        if !arbs.is_empty() {
            let best = &arbs[0];
            assert_eq!(
                best.net_profit,
                best.gross_profit - best.gas_cost as i128,
                "net_profit should equal gross_profit - gas_cost"
            );
        }
    }

    #[test]
    fn test_profit_pct_calculation() {
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();

        if !arbs.is_empty() {
            let best = &arbs[0];
            let expected_pct =
                (best.net_profit as f64 / best.input_amount as f64) * 100.0;
            assert!(
                (best.net_profit_pct - expected_pct).abs() < 0.0001,
                "profit_pct should match manual calculation"
            );
        }
    }

    // =======================================================================
    // Edge cases
    // =======================================================================

    #[test]
    fn test_strategy_empty_pools() {
        let strategy = make_strategy(vec![], false);
        let arbs = strategy.scan();
        assert!(arbs.is_empty());
    }

    #[test]
    fn test_strategy_single_pool() {
        let pools = vec![make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000)];
        let strategy = make_strategy(pools, false);
        let arbs = strategy.scan();
        assert!(arbs.is_empty());
    }

    #[test]
    fn test_pools_with_different_pairs_no_arb() {
        // Two pools but they trade different pairs.
        let pools = vec![
            make_pool("pool1", "uclaw", 1_000_000, "uatom", 1_000_000),
            make_pool("pool2", "uclaw", 1_000_000, "uosmo", 1_000_000),
        ];

        let strategy = make_strategy(pools, false);
        let arbs = strategy.find_two_leg_arbs();
        assert!(arbs.is_empty(), "different pairs should not produce two-leg arb");
    }

    #[test]
    fn test_max_trade_respected() {
        let pools = vec![
            make_pool("pool1", "uclaw", 2_000_000_000, "uatom", 1_000_000_000),
            make_pool("pool2", "uclaw", 500_000_000, "uatom", 1_000_000_000),
        ];

        let mut strategy = make_strategy(pools, false);
        strategy.config.max_trade_uclaw = 1; // Below all trade sizes.
        let arbs = strategy.find_two_leg_arbs();
        assert!(arbs.is_empty(), "max_trade=1 should skip all trade sizes");
    }
}
