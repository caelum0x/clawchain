//! Trade execution — building and broadcasting CosmWasm swap transactions.
//!
//! This module constructs Cosmos SDK transaction bodies containing one or more
//! `MsgExecuteContract` messages for ClawDEX swaps.  It supports:
//!
//! - Single-swap messages (one pool)
//! - Two-leg arbitrage (buy in pool A, sell in pool B)
//! - Three-leg triangular arbitrage (A -> B -> C -> A)
//! - Multi-hop swaps via the ClawDEX router contract
//!
//! Transactions are returned as JSON values ready for signing and broadcast.

use anyhow::{Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::config::ClawDexConfig;

// ---------------------------------------------------------------------------
// Swap message builder
// ---------------------------------------------------------------------------

/// Build a CosmWasm `MsgExecuteContract` JSON for a native-token ClawDEX swap.
///
/// The returned value is a Cosmos SDK tx message object.
pub fn build_swap_msg(
    sender: &str,
    pair_contract: &str,
    offer_denom: &str,
    offer_amount: u128,
    max_spread: f64,
) -> serde_json::Value {
    let inner_msg = serde_json::json!({
        "swap": {
            "offer_asset": {
                "info": { "native_token": { "denom": offer_denom } },
                "amount": offer_amount.to_string()
            },
            "max_spread": format!("{:.4}", max_spread),
            "belief_price": null
        }
    });

    let encoded_msg = base64::engine::general_purpose::STANDARD
        .encode(serde_json::to_string(&inner_msg).unwrap());

    serde_json::json!({
        "@type": "/cosmwasm.wasm.v1.MsgExecuteContract",
        "sender": sender,
        "contract": pair_contract,
        "msg": encoded_msg,
        "funds": [{
            "denom": offer_denom,
            "amount": offer_amount.to_string()
        }]
    })
}

// ---------------------------------------------------------------------------
// Router multi-hop message builder
// ---------------------------------------------------------------------------

/// A single hop in a multi-hop route.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteHop {
    /// Pair contract address for this hop.
    pub pair_address: String,
    /// Denomination offered into this hop.
    pub offer_denom: String,
}

/// Build a multi-hop swap message via the ClawDEX router contract.
///
/// The router executes a chain of swaps atomically, returning the final
/// output to the sender.
pub fn build_router_swap_msg(
    sender: &str,
    router_contract: &str,
    offer_denom: &str,
    offer_amount: u128,
    hops: &[RouteHop],
    min_output: u128,
) -> serde_json::Value {
    let operations: Vec<serde_json::Value> = hops
        .iter()
        .map(|hop| {
            serde_json::json!({
                "astro_swap": {
                    "offer_asset_info": {
                        "native_token": { "denom": &hop.offer_denom }
                    },
                    "ask_asset_info": {
                        "native_token": { "denom": "" }
                    }
                }
            })
        })
        .collect();

    let inner_msg = serde_json::json!({
        "execute_swap_operations": {
            "operations": operations,
            "minimum_receive": min_output.to_string(),
            "max_spread": "0.01"
        }
    });

    let encoded_msg = base64::engine::general_purpose::STANDARD
        .encode(serde_json::to_string(&inner_msg).unwrap());

    serde_json::json!({
        "@type": "/cosmwasm.wasm.v1.MsgExecuteContract",
        "sender": sender,
        "contract": router_contract,
        "msg": encoded_msg,
        "funds": [{
            "denom": offer_denom,
            "amount": offer_amount.to_string()
        }]
    })
}

// ---------------------------------------------------------------------------
// Arb opportunity descriptor
// ---------------------------------------------------------------------------

/// Describes a detected arbitrage opportunity (two-leg or three-leg).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbOpportunity {
    /// Human-readable label (e.g. "2-leg uclaw->uatom->uclaw").
    pub label: String,
    /// Ordered list of (pool_address, offer_denom, offer_amount) for each leg.
    pub legs: Vec<ArbLeg>,
    /// The denomination we start and end with.
    pub base_denom: String,
    /// Amount sent into the first leg.
    pub input_amount: u128,
    /// Expected amount returned after the final leg.
    pub expected_output: u128,
    /// Gross profit before gas (expected_output - input_amount).
    pub gross_profit: i128,
    /// Estimated gas cost in uclaw.
    pub gas_cost: u64,
    /// Net profit after gas.
    pub net_profit: i128,
    /// Net profit as a percentage of input_amount.
    pub net_profit_pct: f64,
}

/// A single leg (swap) in an arb route.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbLeg {
    /// Pool contract address.
    pub pair_address: String,
    /// Denomination offered into this pool.
    pub offer_denom: String,
    /// Amount offered (computed during simulation).
    pub offer_amount: u128,
    /// Expected return from this leg.
    pub expected_return: u128,
    /// Denomination returned.
    pub return_denom: String,
}

// ---------------------------------------------------------------------------
// Transaction body builders
// ---------------------------------------------------------------------------

/// Wrap a set of swap messages into a full unsigned Cosmos SDK transaction body.
fn wrap_tx_body(
    messages: Vec<serde_json::Value>,
    gas_limit: u64,
    gas_price: f64,
) -> serde_json::Value {
    let fee_amount = (gas_price * gas_limit as f64).ceil() as u64;

    serde_json::json!({
        "body": {
            "messages": messages,
            "memo": "clawdex-arb",
            "timeout_height": "0",
            "extension_options": [],
            "non_critical_extension_options": []
        },
        "auth_info": {
            "signer_infos": [],
            "fee": {
                "amount": [{ "denom": "uclaw", "amount": fee_amount.to_string() }],
                "gas_limit": gas_limit.to_string(),
                "payer": "",
                "granter": ""
            }
        },
        "signatures": []
    })
}

/// Build an unsigned transaction for a two-leg arb opportunity.
pub fn build_two_leg_arb_tx(
    config: &ClawDexConfig,
    opp: &ArbOpportunity,
) -> serde_json::Value {
    assert!(opp.legs.len() == 2, "two-leg arb must have exactly 2 legs");

    let msg1 = build_swap_msg(
        &config.sender_address,
        &opp.legs[0].pair_address,
        &opp.legs[0].offer_denom,
        opp.legs[0].offer_amount,
        config.max_slippage,
    );
    let msg2 = build_swap_msg(
        &config.sender_address,
        &opp.legs[1].pair_address,
        &opp.legs[1].offer_denom,
        opp.legs[1].offer_amount,
        config.max_slippage,
    );

    wrap_tx_body(vec![msg1, msg2], config.gas_limit_two_leg, config.gas_price)
}

/// Build an unsigned transaction for a three-leg arb opportunity.
pub fn build_three_leg_arb_tx(
    config: &ClawDexConfig,
    opp: &ArbOpportunity,
) -> serde_json::Value {
    assert!(opp.legs.len() == 3, "three-leg arb must have exactly 3 legs");

    let messages: Vec<serde_json::Value> = opp
        .legs
        .iter()
        .map(|leg| {
            build_swap_msg(
                &config.sender_address,
                &leg.pair_address,
                &leg.offer_denom,
                leg.offer_amount,
                config.max_slippage,
            )
        })
        .collect();

    wrap_tx_body(messages, config.gas_limit_three_leg, config.gas_price)
}

/// Build an unsigned transaction for an arb opportunity of any leg count.
pub fn build_arb_tx(
    config: &ClawDexConfig,
    opp: &ArbOpportunity,
) -> serde_json::Value {
    let gas_limit = if opp.legs.len() <= 2 {
        config.gas_limit_two_leg
    } else {
        config.gas_limit_three_leg
    };

    let messages: Vec<serde_json::Value> = opp
        .legs
        .iter()
        .map(|leg| {
            build_swap_msg(
                &config.sender_address,
                &leg.pair_address,
                &leg.offer_denom,
                leg.offer_amount,
                config.max_slippage,
            )
        })
        .collect();

    wrap_tx_body(messages, gas_limit, config.gas_price)
}

// ---------------------------------------------------------------------------
// Broadcast (placeholder — real signing requires a keyring)
// ---------------------------------------------------------------------------

/// Broadcast a signed transaction to the chain via the REST endpoint.
///
/// In production, the transaction must be signed before calling this.
/// This function is a placeholder that shows the expected REST endpoint.
pub async fn broadcast_tx(rest_url: &str, signed_tx: &serde_json::Value) -> Result<BroadcastResponse> {
    let client = reqwest::Client::new();

    let url = format!(
        "{}/cosmos/tx/v1beta1/txs",
        rest_url.trim_end_matches('/')
    );

    let body = serde_json::json!({
        "tx_bytes": base64::engine::general_purpose::STANDARD
            .encode(serde_json::to_string(signed_tx)?),
        "mode": "BROADCAST_MODE_SYNC"
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .context("broadcast request")?;

    let data: serde_json::Value = resp.json().await.context("broadcast response parse")?;

    let code = data
        .get("tx_response")
        .and_then(|r| r.get("code"))
        .and_then(|c| c.as_u64())
        .unwrap_or(1);

    let txhash = data
        .get("tx_response")
        .and_then(|r| r.get("txhash"))
        .and_then(|h| h.as_str())
        .unwrap_or("")
        .to_string();

    let raw_log = data
        .get("tx_response")
        .and_then(|r| r.get("raw_log"))
        .and_then(|l| l.as_str())
        .unwrap_or("")
        .to_string();

    if code != 0 {
        warn!("tx broadcast failed: code={}, log={}", code, raw_log);
    } else {
        info!("tx broadcast success: txhash={}", txhash);
    }

    Ok(BroadcastResponse {
        code,
        txhash,
        raw_log,
    })
}

/// Response from a transaction broadcast.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastResponse {
    /// 0 = success, non-zero = error.
    pub code: u64,
    /// Transaction hash.
    pub txhash: String,
    /// Raw log (error details when code != 0).
    pub raw_log: String,
}
