//! ClawChain oracle price feed data extraction
//!
//! Queries the ClawChain REST API `/clawchain/oracle/v1/prices` and
//! `/clawchain/oracle/v1/price_history/{pair}` endpoints to retrieve
//! on-chain price data and maps each entry into a flat
//! [`CosmosOracleRow`] suitable for Parquet/CSV/JSON export.
//!
//! The oracle module provides decentralized price feeds used by the
//! marketplace, DEX, and agent economy to value assets and compute
//! rewards in real-time.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_oracle` dataset.
///
/// Each row represents one price observation for a denomination pair
/// at a specific block height.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosOracleRow {
    /// Denomination pair (e.g. `CLAW/USD`, `ATOM/CLAW`).
    pub denom_pair: String,
    /// Price as a decimal string (e.g. `"0.0125"`).
    pub price: String,
    /// Block height at which this price was recorded.
    pub block_height: u64,
    /// RFC 3339 timestamp of the price observation.
    pub timestamp: String,
}

// ---------------------------------------------------------------------------
// REST API response types
// ---------------------------------------------------------------------------

/// Top-level response from `GET /clawchain/oracle/v1/prices`.
#[derive(Debug, Deserialize)]
pub struct OraclePricesResponse {
    /// List of current prices across all tracked pairs.
    #[serde(default)]
    pub prices: Vec<OraclePriceEntry>,
}

/// A single current price entry from the prices endpoint.
#[derive(Debug, Deserialize)]
pub struct OraclePriceEntry {
    /// Denomination pair string.
    #[serde(default)]
    pub denom_pair: String,
    /// Price as a decimal string.
    #[serde(default)]
    pub price: String,
    /// Block height (string-encoded from protobuf uint64).
    #[serde(default)]
    pub block_height: String,
    /// RFC 3339 timestamp.
    #[serde(default)]
    pub timestamp: String,
}

/// Top-level response from `GET /clawchain/oracle/v1/price_history/{pair}`.
#[derive(Debug, Deserialize)]
pub struct OraclePriceHistoryResponse {
    /// Historical price entries for the requested pair.
    #[serde(default)]
    pub history: Vec<OraclePriceEntry>,
    /// Cosmos SDK pagination response.
    pub pagination: Option<OraclePaginationResponse>,
}

/// Cosmos SDK pagination response envelope for oracle queries.
#[derive(Debug, Deserialize)]
pub struct OraclePaginationResponse {
    /// Base64-encoded key for the next page.
    #[serde(default)]
    pub next_key: Option<String>,
    /// Total records (string-encoded).
    #[serde(default)]
    pub total: String,
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/// Fetch all current oracle prices from the ClawChain REST API.
///
/// # Arguments
/// * `api_url` - Base URL of the Cosmos LCD/REST endpoint
///   (e.g. `http://localhost:1317`).
///
/// # Errors
/// Returns an error if the HTTP request fails or the response cannot be
/// deserialized.
pub async fn fetch_cosmos_oracle_prices(
    api_url: &str,
) -> anyhow::Result<Vec<CosmosOracleRow>> {
    let url = format!(
        "{}/clawchain/oracle/v1/prices",
        api_url.trim_end_matches('/')
    );
    let client = reqwest::Client::new();
    let resp: OraclePricesResponse = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?
        .json()
        .await?;

    let rows = resp
        .prices
        .iter()
        .map(|entry| oracle_entry_to_row(entry))
        .collect();

    Ok(rows)
}

/// Fetch historical price data for a specific denomination pair.
///
/// Automatically follows pagination until all pages are consumed.
///
/// # Arguments
/// * `api_url` - Base URL of the Cosmos LCD/REST endpoint.
/// * `pair`    - Denomination pair to query (e.g. `CLAW/USD`). The value
///   is URL-encoded before being included in the request path.
///
/// # Errors
/// Returns an error if the HTTP request fails or deserialization fails.
pub async fn fetch_cosmos_oracle_history(
    api_url: &str,
    pair: &str,
) -> anyhow::Result<Vec<CosmosOracleRow>> {
    let client = reqwest::Client::new();
    let base = api_url.trim_end_matches('/');
    let encoded_pair = urlencoding::encode(pair);
    let mut all_rows = Vec::new();
    let mut next_key: Option<String> = None;

    loop {
        let url = match &next_key {
            Some(key) if !key.is_empty() => {
                format!(
                    "{}/clawchain/oracle/v1/price_history/{}?pagination.key={}",
                    base, encoded_pair, key
                )
            }
            _ => format!(
                "{}/clawchain/oracle/v1/price_history/{}",
                base, encoded_pair
            ),
        };

        let resp: OraclePriceHistoryResponse = client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await?
            .json()
            .await?;

        for entry in &resp.history {
            all_rows.push(oracle_entry_to_row(entry));
        }

        // Check pagination
        match &resp.pagination {
            Some(p) => match &p.next_key {
                Some(key) if !key.is_empty() => {
                    next_key = Some(key.clone());
                }
                _ => break,
            },
            None => break,
        }
    }

    Ok(all_rows)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Convert a REST API oracle price entry into a flat [`CosmosOracleRow`].
fn oracle_entry_to_row(entry: &OraclePriceEntry) -> CosmosOracleRow {
    CosmosOracleRow {
        denom_pair: entry.denom_pair.clone(),
        price: entry.price.clone(),
        block_height: entry.block_height.parse().unwrap_or(0),
        timestamp: entry.timestamp.clone(),
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosOracleRow`] as a CSV string (with header row).
pub fn oracle_to_csv(rows: &[CosmosOracleRow]) -> String {
    let mut output = String::from("denom_pair,price,block_height,timestamp\n");
    for row in rows {
        output.push_str(&format!(
            "{},{},{},{}\n",
            row.denom_pair, row.price, row.block_height, row.timestamp,
        ));
    }
    output
}
