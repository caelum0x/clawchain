//! Pool abstraction and on-chain querying.
//!
//! Provides [`ClawDexPool`] — a local representation of a CosmWasm XYK pair
//! contract — along with functions to discover pools from the factory and to
//! fetch / refresh their reserves via the chain LCD endpoint.

use std::collections::HashMap;
use std::time::Duration;

use anyhow::{Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::config::ClawDexConfig;

// ---------------------------------------------------------------------------
// Pool types
// ---------------------------------------------------------------------------

/// An asset held inside a pool.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PoolAsset {
    /// Native token denomination (e.g. `uclaw`, `uatom`).
    pub denom: String,
    /// Current reserve amount.
    pub amount: u128,
}

/// Local representation of a ClawDEX XYK pair contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClawDexPool {
    /// Bech32 contract address of the pair.
    pub pair_address: String,
    /// The two assets in the pool (index 0 and 1).
    pub assets: [PoolAsset; 2],
    /// Total LP token supply (informational).
    pub total_share: u128,
    /// Swap fee rate (fraction, e.g. 0.003 = 0.3%).
    pub fee_rate: f64,
}

/// Factory query response: list of pair addresses.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FactoryPairsResponse {
    pairs: Vec<PairInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PairInfo {
    contract_addr: String,
    #[serde(default)]
    asset_infos: Vec<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// HTTP client helper
// ---------------------------------------------------------------------------

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("failed to build HTTP client")
}

// ---------------------------------------------------------------------------
// Pool discovery (factory query)
// ---------------------------------------------------------------------------

/// Discover all pair contract addresses from the ClawDEX factory.
///
/// Issues paginated `{"pairs":{"start_after":..., "limit":30}}` queries until
/// no more pairs are returned.
pub async fn fetch_pool_addresses_from_factory(
    rest_url: &str,
    factory_address: &str,
) -> Result<Vec<String>> {
    let client = http_client();
    let mut all_addresses: Vec<String> = Vec::new();
    let mut start_after: Option<Vec<serde_json::Value>> = None;
    let page_limit = 30u32;

    loop {
        let query = if let Some(ref sa) = start_after {
            serde_json::json!({
                "pairs": {
                    "start_after": sa,
                    "limit": page_limit
                }
            })
        } else {
            serde_json::json!({
                "pairs": {
                    "limit": page_limit
                }
            })
        };

        let query_b64 =
            base64::engine::general_purpose::STANDARD.encode(serde_json::to_string(&query)?);

        let url = format!(
            "{}/cosmwasm/wasm/v1/contract/{}/smart/{}",
            rest_url.trim_end_matches('/'),
            factory_address,
            query_b64,
        );

        debug!("factory query: {}", url);

        let resp = client.get(&url).send().await.context("factory query")?;
        let body: serde_json::Value = resp.json().await.context("factory response parse")?;

        let pairs = match body.get("data").and_then(|d| d.get("pairs")) {
            Some(p) => p,
            None => {
                // Some factory implementations return the pairs at the top level
                match body.get("pairs") {
                    Some(p) => p,
                    None => break,
                }
            }
        };

        let pairs_arr = match pairs.as_array() {
            Some(a) => a,
            None => break,
        };

        if pairs_arr.is_empty() {
            break;
        }

        for pair in pairs_arr {
            if let Some(addr) = pair
                .get("contract_addr")
                .and_then(|v| v.as_str())
            {
                all_addresses.push(addr.to_string());
            }
        }

        // Set up start_after for next page using the last pair's asset_infos.
        if let Some(last) = pairs_arr.last() {
            start_after = last
                .get("asset_infos")
                .and_then(|v| v.as_array())
                .cloned();
        }

        if pairs_arr.len() < page_limit as usize {
            break;
        }
    }

    info!("discovered {} pairs from factory {}", all_addresses.len(), factory_address);
    Ok(all_addresses)
}

// ---------------------------------------------------------------------------
// Pool state fetching
// ---------------------------------------------------------------------------

/// Query a single pool's on-chain state and return a [`ClawDexPool`].
///
/// Sends a `{"pool":{}}` smart query to the pair contract and parses the
/// response into reserves and total share.
pub async fn fetch_pool(
    rest_url: &str,
    pair_address: &str,
    fee_rate: f64,
) -> Result<ClawDexPool> {
    let client = http_client();

    let query_json = serde_json::to_string(&serde_json::json!({"pool": {}}))?;
    let query_b64 = base64::engine::general_purpose::STANDARD.encode(&query_json);

    let url = format!(
        "{}/cosmwasm/wasm/v1/contract/{}/smart/{}",
        rest_url.trim_end_matches('/'),
        pair_address,
        query_b64,
    );

    let resp = client.get(&url).send().await.context("pool query")?;
    let body: serde_json::Value = resp.json().await.context("pool response parse")?;

    let pool_data = body
        .get("data")
        .unwrap_or(&body);

    let assets_raw = pool_data
        .get("assets")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    if assets_raw.len() < 2 {
        anyhow::bail!(
            "pool {} returned {} assets (expected 2)",
            pair_address,
            assets_raw.len()
        );
    }

    let parse_asset = |val: &serde_json::Value| -> PoolAsset {
        let denom = val
            .get("info")
            .and_then(|i| i.get("native_token"))
            .and_then(|n| n.get("denom"))
            .and_then(|d| d.as_str())
            .unwrap_or("unknown")
            .to_string();
        let amount: u128 = val
            .get("amount")
            .and_then(|a| a.as_str())
            .unwrap_or("0")
            .parse()
            .unwrap_or(0);
        PoolAsset { denom, amount }
    };

    let asset0 = parse_asset(&assets_raw[0]);
    let asset1 = parse_asset(&assets_raw[1]);

    let total_share: u128 = pool_data
        .get("total_share")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);

    Ok(ClawDexPool {
        pair_address: pair_address.to_string(),
        assets: [asset0, asset1],
        total_share,
        fee_rate,
    })
}

/// Fetch the state of multiple pools in parallel, skipping any that fail.
pub async fn fetch_pools(config: &ClawDexConfig) -> Result<Vec<ClawDexPool>> {
    // Collect pool addresses: explicit list + factory discovery.
    let mut addresses = config.pool_addresses.clone();

    if !config.factory_address.is_empty() {
        match fetch_pool_addresses_from_factory(&config.rest_url, &config.factory_address).await {
            Ok(discovered) => {
                for addr in discovered {
                    if !addresses.contains(&addr) {
                        addresses.push(addr);
                    }
                }
            }
            Err(e) => {
                warn!("factory discovery failed (will use explicit list only): {}", e);
            }
        }
    }

    info!("fetching state for {} pools", addresses.len());

    let mut handles = Vec::new();
    for addr in addresses {
        let rest_url = config.rest_url.clone();
        let fee_rate = config.fee_rate;
        handles.push(tokio::spawn(async move {
            fetch_pool(&rest_url, &addr, fee_rate).await
        }));
    }

    let mut pools = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(Ok(pool)) => pools.push(pool),
            Ok(Err(e)) => {
                warn!("skipping pool: {}", e);
            }
            Err(e) => {
                warn!("pool fetch task panicked: {}", e);
            }
        }
    }

    info!("successfully fetched {} pools", pools.len());
    Ok(pools)
}

// ---------------------------------------------------------------------------
// AMM math
// ---------------------------------------------------------------------------

/// Constant-product (x * y = k) swap output calculation.
///
/// Given an `offer_amount` of one asset, computes how much of the other asset
/// the trader receives after deducting the pool fee.
///
/// Formula:
///   `output = (offer * (1 - fee) * ask_reserve) / (offer_reserve + offer * (1 - fee))`
///
/// Uses `u128` internally to avoid overflow on large reserves.
pub fn simulate_swap(pool: &ClawDexPool, offer_denom: &str, offer_amount: u128) -> Option<SwapResult> {
    let (offer_idx, ask_idx) = if pool.assets[0].denom == offer_denom {
        (0, 1)
    } else if pool.assets[1].denom == offer_denom {
        (1, 0)
    } else {
        return None;
    };

    let offer_reserve = pool.assets[offer_idx].amount;
    let ask_reserve = pool.assets[ask_idx].amount;

    if offer_reserve == 0 || ask_reserve == 0 || offer_amount == 0 {
        return Some(SwapResult {
            return_amount: 0,
            spread_amount: 0,
            commission_amount: 0,
            ask_denom: pool.assets[ask_idx].denom.clone(),
        });
    }

    let fee_rate = pool.fee_rate;

    // Use f64 for the calculation (sufficient precision for MEV sizing).
    let offer_f = offer_amount as f64;
    let offer_reserve_f = offer_reserve as f64;
    let ask_reserve_f = ask_reserve as f64;

    let offer_after_fee = offer_f * (1.0 - fee_rate);
    let return_amount_f = (offer_after_fee * ask_reserve_f) / (offer_reserve_f + offer_after_fee);

    // Ideal price output (without fees or slippage).
    let ideal_output = (offer_f * ask_reserve_f) / offer_reserve_f;
    let spread = ideal_output - return_amount_f;
    let commission = offer_f * fee_rate * ask_reserve_f / (offer_reserve_f + offer_f);

    Some(SwapResult {
        return_amount: return_amount_f as u128,
        spread_amount: spread.max(0.0) as u128,
        commission_amount: commission.max(0.0) as u128,
        ask_denom: pool.assets[ask_idx].denom.clone(),
    })
}

/// The result of simulating a swap through a single pool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapResult {
    /// Amount of the ask asset returned.
    pub return_amount: u128,
    /// Price impact (spread) in ask-asset units.
    pub spread_amount: u128,
    /// Fee deducted (in ask-asset units).
    pub commission_amount: u128,
    /// Denomination of the returned asset.
    pub ask_denom: String,
}

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

/// Compute the effective spot price of asset A in terms of asset B.
///
/// Returns `reserve_B / reserve_A` (i.e. how many B you get per 1 A before fees).
pub fn spot_price(pool: &ClawDexPool, base_denom: &str) -> Option<f64> {
    let (base_idx, quote_idx) = if pool.assets[0].denom == base_denom {
        (0, 1)
    } else if pool.assets[1].denom == base_denom {
        (1, 0)
    } else {
        return None;
    };

    let base_reserve = pool.assets[base_idx].amount as f64;
    let quote_reserve = pool.assets[quote_idx].amount as f64;

    if base_reserve == 0.0 {
        return None;
    }

    Some(quote_reserve / base_reserve)
}

/// Build a map of `(denom_a, denom_b) -> Vec<pool_index>` for quick lookup
/// of which pools trade a given pair.
pub fn build_pair_index(pools: &[ClawDexPool]) -> HashMap<(String, String), Vec<usize>> {
    let mut index: HashMap<(String, String), Vec<usize>> = HashMap::new();
    for (i, pool) in pools.iter().enumerate() {
        let d0 = &pool.assets[0].denom;
        let d1 = &pool.assets[1].denom;
        // Store in both orderings so lookups work regardless of direction.
        index.entry((d0.clone(), d1.clone())).or_default().push(i);
        index.entry((d1.clone(), d0.clone())).or_default().push(i);
    }
    index
}
