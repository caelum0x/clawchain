//! ClawChain / Cosmos SDK transaction data extraction
//!
//! Queries the CometBFT `/tx_search` endpoint to retrieve transactions
//! at a given block height and maps each result into a flat
//! [`CosmosTxRow`] suitable for Parquet/CSV/JSON export.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_txs` dataset.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosTxRow {
    /// Block height that includes this transaction.
    pub height: u64,
    /// Hex-encoded transaction hash.
    pub tx_hash: String,
    /// Cosmos SDK message type URL (e.g. `/cosmos.bank.v1beta1.MsgSend`).
    pub msg_type: String,
    /// Bech32 sender address (first signer).
    pub sender: String,
    /// Gas actually consumed.
    pub gas_used: u64,
    /// Gas limit requested.
    pub gas_wanted: u64,
    /// Fee amount as a decimal string.
    pub fee_amount: String,
    /// Fee denomination (e.g. `uclaw`).
    pub fee_denom: String,
    /// Whether the transaction succeeded (`code == 0`).
    pub success: bool,
    /// Transaction memo field.
    pub memo: String,
    /// Raw log string (may be JSON).
    pub raw_log: String,
}

// ---------------------------------------------------------------------------
// CometBFT tx_search response types
// ---------------------------------------------------------------------------

/// Top-level wrapper for `/tx_search` responses.
#[derive(Debug, Deserialize)]
pub struct CometTxSearchResponse {
    /// The `result` payload.
    pub result: CometTxSearchResult,
}

/// Inner result with a list of matching transactions.
#[derive(Debug, Deserialize)]
pub struct CometTxSearchResult {
    /// Individual transaction results.
    pub txs: Vec<CometTxResult>,
    /// Total number of matching transactions (for pagination).
    pub total_count: String,
}

/// A single transaction result from tx_search.
#[derive(Debug, Deserialize)]
pub struct CometTxResult {
    /// Hex-encoded transaction hash.
    pub hash: String,
    /// Block height (string-encoded).
    pub height: String,
    /// Transaction delivery result.
    pub tx_result: CometTxDeliverResult,
    /// Base64-encoded raw transaction bytes.
    pub tx: String,
}

/// Delivery result attached to each transaction.
#[derive(Debug, Deserialize)]
pub struct CometTxDeliverResult {
    /// Result code; 0 means success.
    pub code: u32,
    /// Gas actually consumed.
    #[serde(default)]
    pub gas_used: String,
    /// Gas limit requested.
    #[serde(default)]
    pub gas_wanted: String,
    /// Raw log (may be empty or JSON).
    #[serde(default)]
    pub log: String,
    /// ABCI events emitted during execution.
    #[serde(default)]
    pub events: Vec<CometTxEvent>,
}

/// An ABCI event attached to a transaction result.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CometTxEvent {
    /// Event type string (e.g. `transfer`, `message`).
    #[serde(rename = "type")]
    pub event_type: String,
    /// Key-value attributes.
    pub attributes: Vec<CometTxEventAttribute>,
}

/// A single key-value attribute inside an ABCI event.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CometTxEventAttribute {
    /// Attribute key (may be base64-encoded depending on CometBFT version).
    pub key: String,
    /// Attribute value.
    #[serde(default)]
    pub value: String,
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/// Fetch all transactions at a given block height via `/tx_search`.
///
/// # Arguments
/// * `rpc_url` - CometBFT RPC base URL.
/// * `height`  - Block height to query.
///
/// # Notes
/// The function extracts `msg_type` and `sender` from ABCI events with
/// type `message` (standard Cosmos SDK behaviour). If the events are
/// missing, the fields fall back to empty strings.
pub async fn fetch_cosmos_txs(
    rpc_url: &str,
    height: u64,
) -> anyhow::Result<Vec<CosmosTxRow>> {
    let url = format!(
        "{}/tx_search?query=\"tx.height={}\"&per_page=100",
        rpc_url.trim_end_matches('/'),
        height
    );
    let client = reqwest::Client::new();
    let resp: CometTxSearchResponse = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?
        .json()
        .await?;

    let mut rows = Vec::with_capacity(resp.result.txs.len());
    for tx in &resp.result.txs {
        let (msg_type, sender) = extract_msg_type_and_sender(&tx.tx_result.events);
        let (fee_amount, fee_denom) = extract_fee(&tx.tx_result.events);

        rows.push(CosmosTxRow {
            height: tx.height.parse().unwrap_or(height),
            tx_hash: tx.hash.clone(),
            msg_type,
            sender,
            gas_used: tx.tx_result.gas_used.parse().unwrap_or(0),
            gas_wanted: tx.tx_result.gas_wanted.parse().unwrap_or(0),
            fee_amount,
            fee_denom,
            success: tx.tx_result.code == 0,
            memo: String::new(), // memo requires decoding the raw tx bytes
            raw_log: tx.tx_result.log.clone(),
        });
    }
    Ok(rows)
}

/// Fetch transactions across a range of block heights.
pub async fn fetch_cosmos_txs_range(
    rpc_url: &str,
    from: u64,
    to: u64,
) -> anyhow::Result<Vec<CosmosTxRow>> {
    let mut all_rows = Vec::new();
    for height in from..=to {
        match fetch_cosmos_txs(rpc_url, height).await {
            Ok(rows) => all_rows.extend(rows),
            Err(e) => tracing::warn!("Failed to fetch txs at height {}: {}", height, e),
        }
    }
    Ok(all_rows)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Extract `action` (msg_type) and `sender` from the standard Cosmos SDK
/// `message` event.
fn extract_msg_type_and_sender(events: &[CometTxEvent]) -> (String, String) {
    let mut msg_type = String::new();
    let mut sender = String::new();
    for event in events {
        if event.event_type == "message" {
            for attr in &event.attributes {
                if attr.key == "action" {
                    msg_type = attr.value.clone();
                }
                if attr.key == "sender" {
                    sender = attr.value.clone();
                }
            }
        }
    }
    (msg_type, sender)
}

/// Extract fee amount and denom from a `tx` event (Cosmos SDK standard).
fn extract_fee(events: &[CometTxEvent]) -> (String, String) {
    for event in events {
        if event.event_type == "tx" {
            for attr in &event.attributes {
                if attr.key == "fee" {
                    // Fee values look like "1000uclaw"
                    let val = &attr.value;
                    let split_pos = val
                        .find(|c: char| c.is_alphabetic())
                        .unwrap_or(val.len());
                    let amount = val[..split_pos].to_string();
                    let denom = val[split_pos..].to_string();
                    return (amount, denom);
                }
            }
        }
    }
    (String::new(), String::new())
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosTxRow`] as a CSV string (with header row).
pub fn txs_to_csv(rows: &[CosmosTxRow]) -> String {
    let mut output = String::from(
        "height,tx_hash,msg_type,sender,gas_used,gas_wanted,fee_amount,fee_denom,success,memo,raw_log\n",
    );
    for row in rows {
        // Escape fields that may contain commas or newlines
        let raw_log_escaped = row.raw_log.replace('"', "\"\"");
        let memo_escaped = row.memo.replace('"', "\"\"");
        output.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},\"{}\",\"{}\"\n",
            row.height,
            row.tx_hash,
            row.msg_type,
            row.sender,
            row.gas_used,
            row.gas_wanted,
            row.fee_amount,
            row.fee_denom,
            row.success,
            memo_escaped,
            raw_log_escaped,
        ));
    }
    output
}
