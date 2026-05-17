//! ClawDEX Arbitrage Strategy
//!
//! Detects and executes arbitrage opportunities across ClawDEX (CosmWasm AMM)
//! pools on ClawChain.
//!
//! ## Architecture
//!
//! ```text
//!  +--------------+      +-----------+      +-------------+
//!  | Pool         | ---> | Arb       | ---> | Executor    |
//!  | Discovery &  |      | Detection |      | (build tx,  |
//!  | Price Monitor|      | (2-leg &  |      |  broadcast) |
//!  +--------------+      |  3-leg)   |      +-------------+
//!                        +-----------+
//! ```
//!
//! - **Pool discovery**: queries the factory contract for all pairs, or uses
//!   an explicit list of pool addresses from config.
//! - **Price monitoring**: polls pool reserves via
//!   `/cosmwasm/wasm/v1/contract/{addr}/smart/{query}` on the chain LCD.
//! - **Arb detection**: compares prices across pools that share at least one
//!   common denomination. Evaluates both *two-leg* (A->B->A) and *three-leg*
//!   (A->B->C->A) triangular arbitrage paths.
//! - **Execution**: constructs `MsgExecuteContract` swap messages and wraps
//!   them in an unsigned Cosmos SDK transaction body.

pub mod config;
pub mod executor;
pub mod pool;

#[cfg(test)]
mod tests;

use std::collections::HashMap;

use anyhow::Result;
use tracing::{debug, info, warn};

pub use config::ClawDexConfig;
pub use executor::{
    build_arb_tx, build_swap_msg, build_two_leg_arb_tx, build_three_leg_arb_tx,
    ArbLeg, ArbOpportunity,
};
pub use pool::{
    build_pair_index, fetch_pool, fetch_pool_addresses_from_factory, fetch_pools,
    simulate_swap, spot_price, ClawDexPool, PoolAsset, SwapResult,
};

// ---------------------------------------------------------------------------
// Trade sizes for brute-force optimal-sizing
// ---------------------------------------------------------------------------

/// Predefined trade sizes (in uclaw-scale micro units) evaluated when
/// searching for the most profitable arb input amount.
const TRADE_SIZES: [u128; 12] = [
    1_000,
    5_000,
    10_000,
    50_000,
    100_000,
    500_000,
    1_000_000,
    5_000_000,
    10_000_000,
    50_000_000,
    100_000_000,
    500_000_000,
];

// ---------------------------------------------------------------------------
// Strategy struct
// ---------------------------------------------------------------------------

/// The main strategy object. Holds configuration, cached pool state, and a
/// pair-index for fast lookups.
pub struct ClawDexArbStrategy {
    /// Strategy configuration.
    pub config: ClawDexConfig,
    /// Cached pool states (refreshed each poll cycle).
    pub pools: Vec<ClawDexPool>,
    /// Maps `(denom_a, denom_b)` to indices into `self.pools`.
    pub pair_index: HashMap<(String, String), Vec<usize>>,
    /// All unique denominations seen across pools.
    pub known_denoms: Vec<String>,
}

impl ClawDexArbStrategy {
    /// Create a new strategy instance from the given configuration.
    pub fn new(config: ClawDexConfig) -> Self {
        Self {
            config,
            pools: Vec::new(),
            pair_index: HashMap::new(),
            known_denoms: Vec::new(),
        }
    }

    /// Discover pools and load their on-chain state.
    ///
    /// This is the initial sync step. Call it once before entering the poll
    /// loop.
    pub async fn sync_pools(&mut self) -> Result<()> {
        self.pools = fetch_pools(&self.config).await?;
        self.rebuild_index();
        info!(
            "synced {} pools, {} unique denoms",
            self.pools.len(),
            self.known_denoms.len()
        );
        Ok(())
    }

    /// Refresh reserve data for all tracked pools.
    pub async fn refresh_pools(&mut self) -> Result<()> {
        let addresses: Vec<String> = self.pools.iter().map(|p| p.pair_address.clone()).collect();
        let fee_rate = self.config.fee_rate;
        let rest_url = self.config.rest_url.clone();

        let mut handles = Vec::new();
        for addr in addresses {
            let url = rest_url.clone();
            handles.push(tokio::spawn(async move {
                fetch_pool(&url, &addr, fee_rate).await
            }));
        }

        let mut refreshed = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(Ok(pool)) => refreshed.push(pool),
                Ok(Err(e)) => warn!("refresh failed for pool: {}", e),
                Err(e) => warn!("refresh task panicked: {}", e),
            }
        }

        self.pools = refreshed;
        self.rebuild_index();
        Ok(())
    }

    /// Rebuild the pair index and denom list from the current pool set.
    fn rebuild_index(&mut self) {
        self.pair_index = build_pair_index(&self.pools);
        let mut denoms: Vec<String> = self
            .pair_index
            .keys()
            .map(|(d, _)| d.clone())
            .collect();
        denoms.sort();
        denoms.dedup();
        self.known_denoms = denoms;
    }

    // -----------------------------------------------------------------------
    // Two-leg arb detection
    // -----------------------------------------------------------------------

    /// Scan all pool pairs for two-leg arbitrage opportunities.
    ///
    /// A two-leg arb exists when two pools trade the same pair (denom_a,
    /// denom_b) but at different effective prices. We buy the underpriced
    /// asset in one pool and sell it in the other.
    pub fn find_two_leg_arbs(&self) -> Vec<ArbOpportunity> {
        let mut opportunities: Vec<ArbOpportunity> = Vec::new();

        // Iterate over each unique *ordered* pair that has >1 pool.
        let mut seen_pairs: std::collections::HashSet<(String, String)> =
            std::collections::HashSet::new();

        for ((d0, d1), pool_indices) in &self.pair_index {
            // Canonical ordering to avoid processing both (A,B) and (B,A).
            let key = if d0 <= d1 {
                (d0.clone(), d1.clone())
            } else {
                (d1.clone(), d0.clone())
            };
            if !seen_pairs.insert(key) {
                continue;
            }

            if pool_indices.len() < 2 {
                continue;
            }

            // Compare every pair of pools.
            for i in 0..pool_indices.len() {
                for j in (i + 1)..pool_indices.len() {
                    let pool_a = &self.pools[pool_indices[i]];
                    let pool_b = &self.pools[pool_indices[j]];

                    if let Some(opp) = self.best_two_leg_arb(pool_a, pool_b, d0) {
                        if opp.net_profit > 0 {
                            opportunities.push(opp);
                        }
                    }
                }
            }
        }

        opportunities.sort_by(|a, b| b.net_profit.cmp(&a.net_profit));
        opportunities
    }

    /// Evaluate the best two-leg arb between two pools for a given base denom.
    ///
    /// Tries multiple trade sizes in both directions and returns the single
    /// most profitable opportunity (or `None` if none exceed min_profit).
    fn best_two_leg_arb(
        &self,
        pool_a: &ClawDexPool,
        pool_b: &ClawDexPool,
        base_denom: &str,
    ) -> Option<ArbOpportunity> {
        let gas_cost = self.config.two_leg_gas_cost();
        let max_trade = self.config.max_trade_uclaw as u128;
        let min_profit = self.config.min_profit_uclaw as i128 + gas_cost as i128;

        // Find the "other" denom in both pools.
        let other_a = pool_a
            .assets
            .iter()
            .find(|a| a.denom != base_denom)?;
        let other_b = pool_b
            .assets
            .iter()
            .find(|a| a.denom != base_denom)?;

        // Both pools must trade the same other denom.
        if other_a.denom != other_b.denom {
            return None;
        }

        let bridge_denom = &other_a.denom;
        let mut best: Option<ArbOpportunity> = None;
        let mut best_net: i128 = 0;

        for &input in &TRADE_SIZES {
            if input > max_trade {
                continue;
            }

            // Forward: buy bridge in pool_a, sell in pool_b.
            if let Some(opp) = self.eval_two_leg(
                pool_a, pool_b, base_denom, bridge_denom, input, gas_cost,
            ) {
                if opp.net_profit > min_profit && opp.net_profit > best_net {
                    best_net = opp.net_profit;
                    best = Some(opp);
                }
            }

            // Reverse: buy bridge in pool_b, sell in pool_a.
            if let Some(opp) = self.eval_two_leg(
                pool_b, pool_a, base_denom, bridge_denom, input, gas_cost,
            ) {
                if opp.net_profit > min_profit && opp.net_profit > best_net {
                    best_net = opp.net_profit;
                    best = Some(opp);
                }
            }
        }

        best
    }

    /// Simulate a single two-leg path: base -> bridge (pool_buy) -> base (pool_sell).
    fn eval_two_leg(
        &self,
        pool_buy: &ClawDexPool,
        pool_sell: &ClawDexPool,
        base_denom: &str,
        bridge_denom: &str,
        input: u128,
        gas_cost: u64,
    ) -> Option<ArbOpportunity> {
        let leg1 = simulate_swap(pool_buy, base_denom, input)?;
        if leg1.return_amount == 0 {
            return None;
        }

        let leg2 = simulate_swap(pool_sell, bridge_denom, leg1.return_amount)?;
        if leg2.return_amount == 0 {
            return None;
        }

        let gross_profit = leg2.return_amount as i128 - input as i128;
        let net_profit = gross_profit - gas_cost as i128;

        Some(ArbOpportunity {
            label: format!(
                "2-leg {}->{}->{}",
                base_denom, bridge_denom, base_denom
            ),
            legs: vec![
                ArbLeg {
                    pair_address: pool_buy.pair_address.clone(),
                    offer_denom: base_denom.to_string(),
                    offer_amount: input,
                    expected_return: leg1.return_amount,
                    return_denom: bridge_denom.to_string(),
                },
                ArbLeg {
                    pair_address: pool_sell.pair_address.clone(),
                    offer_denom: bridge_denom.to_string(),
                    offer_amount: leg1.return_amount,
                    expected_return: leg2.return_amount,
                    return_denom: base_denom.to_string(),
                },
            ],
            base_denom: base_denom.to_string(),
            input_amount: input,
            expected_output: leg2.return_amount,
            gross_profit,
            gas_cost,
            net_profit,
            net_profit_pct: if input > 0 {
                (net_profit as f64 / input as f64) * 100.0
            } else {
                0.0
            },
        })
    }

    // -----------------------------------------------------------------------
    // Three-leg (triangular) arb detection
    // -----------------------------------------------------------------------

    /// Scan for three-leg triangular arbitrage opportunities.
    ///
    /// A triangular arb exists when three pools connect three denominations
    /// in a cycle: `A -> B -> C -> A`, and the composite exchange rate
    /// yields more A than was put in.
    pub fn find_three_leg_arbs(&self) -> Vec<ArbOpportunity> {
        if !self.config.enable_three_leg {
            return Vec::new();
        }

        let mut opportunities: Vec<ArbOpportunity> = Vec::new();
        let denoms = &self.known_denoms;

        // Enumerate all triples (A, B, C) where A < B < C lexicographically.
        for i in 0..denoms.len() {
            for j in (i + 1)..denoms.len() {
                for k in (j + 1)..denoms.len() {
                    let a = &denoms[i];
                    let b = &denoms[j];
                    let c = &denoms[k];

                    // Try all 2 cyclic orderings: A->B->C->A and A->C->B->A.
                    if let Some(opp) = self.best_three_leg_arb(a, b, c) {
                        if opp.net_profit > 0 {
                            opportunities.push(opp);
                        }
                    }
                    if let Some(opp) = self.best_three_leg_arb(a, c, b) {
                        if opp.net_profit > 0 {
                            opportunities.push(opp);
                        }
                    }
                }
            }
        }

        opportunities.sort_by(|a, b| b.net_profit.cmp(&a.net_profit));
        opportunities
    }

    /// Evaluate the best three-leg arb for a given cycle: d0 -> d1 -> d2 -> d0.
    fn best_three_leg_arb(
        &self,
        d0: &str,
        d1: &str,
        d2: &str,
    ) -> Option<ArbOpportunity> {
        // Need pools for each leg.
        let pools_01 = self.pair_index.get(&(d0.to_string(), d1.to_string()))?;
        let pools_12 = self.pair_index.get(&(d1.to_string(), d2.to_string()))?;
        let pools_20 = self.pair_index.get(&(d2.to_string(), d0.to_string()))?;

        let gas_cost = self.config.three_leg_gas_cost();
        let max_trade = self.config.max_trade_uclaw as u128;
        let min_profit = self.config.min_profit_uclaw as i128 + gas_cost as i128;

        let mut best: Option<ArbOpportunity> = None;
        let mut best_net: i128 = 0;

        // Try the best pool for each leg (the one with the deepest liquidity
        // in the direction we need).
        for &p0 in pools_01 {
            for &p1 in pools_12 {
                for &p2 in pools_20 {
                    for &input in &TRADE_SIZES {
                        if input > max_trade {
                            continue;
                        }
                        if let Some(opp) = self.eval_three_leg(
                            &self.pools[p0],
                            &self.pools[p1],
                            &self.pools[p2],
                            d0,
                            d1,
                            d2,
                            input,
                            gas_cost,
                        ) {
                            if opp.net_profit > min_profit && opp.net_profit > best_net {
                                best_net = opp.net_profit;
                                best = Some(opp);
                            }
                        }
                    }
                }
            }
        }

        best
    }

    /// Simulate a three-leg path: d0 -> d1 (pool1) -> d2 (pool2) -> d0 (pool3).
    fn eval_three_leg(
        &self,
        pool1: &ClawDexPool,
        pool2: &ClawDexPool,
        pool3: &ClawDexPool,
        d0: &str,
        d1: &str,
        d2: &str,
        input: u128,
        gas_cost: u64,
    ) -> Option<ArbOpportunity> {
        let leg1 = simulate_swap(pool1, d0, input)?;
        if leg1.return_amount == 0 {
            return None;
        }

        let leg2 = simulate_swap(pool2, d1, leg1.return_amount)?;
        if leg2.return_amount == 0 {
            return None;
        }

        let leg3 = simulate_swap(pool3, d2, leg2.return_amount)?;
        if leg3.return_amount == 0 {
            return None;
        }

        let gross_profit = leg3.return_amount as i128 - input as i128;
        let net_profit = gross_profit - gas_cost as i128;

        Some(ArbOpportunity {
            label: format!("3-leg {}->{}->{}->{}",  d0, d1, d2, d0),
            legs: vec![
                ArbLeg {
                    pair_address: pool1.pair_address.clone(),
                    offer_denom: d0.to_string(),
                    offer_amount: input,
                    expected_return: leg1.return_amount,
                    return_denom: d1.to_string(),
                },
                ArbLeg {
                    pair_address: pool2.pair_address.clone(),
                    offer_denom: d1.to_string(),
                    offer_amount: leg1.return_amount,
                    expected_return: leg2.return_amount,
                    return_denom: d2.to_string(),
                },
                ArbLeg {
                    pair_address: pool3.pair_address.clone(),
                    offer_denom: d2.to_string(),
                    offer_amount: leg2.return_amount,
                    expected_return: leg3.return_amount,
                    return_denom: d0.to_string(),
                },
            ],
            base_denom: d0.to_string(),
            input_amount: input,
            expected_output: leg3.return_amount,
            gross_profit,
            gas_cost,
            net_profit,
            net_profit_pct: if input > 0 {
                (net_profit as f64 / input as f64) * 100.0
            } else {
                0.0
            },
        })
    }

    // -----------------------------------------------------------------------
    // Unified scan
    // -----------------------------------------------------------------------

    /// Run a full scan: discover all two-leg and (optionally) three-leg arbs,
    /// returning them sorted by descending net profit.
    pub fn scan(&self) -> Vec<ArbOpportunity> {
        let mut all = self.find_two_leg_arbs();

        if self.config.enable_three_leg {
            let mut three_leg = self.find_three_leg_arbs();
            all.append(&mut three_leg);
        }

        all.sort_by(|a, b| b.net_profit.cmp(&a.net_profit));
        all
    }

    /// Log a human-readable summary of the current pool prices.
    pub fn log_price_summary(&self) {
        for pool in &self.pools {
            let d0 = &pool.assets[0].denom;
            let d1 = &pool.assets[1].denom;
            let price = if pool.assets[0].amount > 0 {
                pool.assets[1].amount as f64 / pool.assets[0].amount as f64
            } else {
                0.0
            };
            info!(
                "pool {} | {}/{} = {:.6} | reserves: {} {} / {} {}",
                pool.pair_address,
                d1,
                d0,
                price,
                pool.assets[0].amount,
                d0,
                pool.assets[1].amount,
                d1,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Convenience re-exports for backwards compatibility
// ---------------------------------------------------------------------------

/// Legacy constant-product swap output calculation (u64 interface).
///
/// Prefer [`pool::simulate_swap`] for new code.
pub fn calculate_swap_output(
    input_amount: u64,
    input_reserve: u64,
    output_reserve: u64,
    fee_rate: f64,
) -> u64 {
    if input_reserve == 0 || output_reserve == 0 {
        return 0;
    }
    let input_after_fee = (input_amount as f64) * (1.0 - fee_rate);
    let numerator = input_after_fee * (output_reserve as f64);
    let denominator = (input_reserve as f64) + input_after_fee;
    if denominator == 0.0 {
        return 0;
    }
    (numerator / denominator) as u64
}
