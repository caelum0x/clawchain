//! ClawChain / Cosmos SDK block data extraction
//!
//! Fetches block data from CometBFT RPC endpoints and formats
//! into tabular rows compatible with Cryo's output pipeline.
//!
//! CometBFT exposes a JSON-RPC interface at `/block?height=N` that returns
//! the full block header, transaction list, and last commit metadata.
//! This module deserializes those responses into flat [`CosmosBlockRow`] structs
//! suitable for Parquet/CSV/JSON export.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_blocks` dataset.
///
/// Fields are intentionally kept as simple scalars so that downstream
/// writers (Parquet, CSV, JSON) can consume them without extra conversion.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosBlockRow {
    /// Block height (1-indexed).
    pub height: u64,
    /// RFC 3339 timestamp of block creation.
    pub time: String,
    /// Hex-encoded block hash (from `block_id`).
    pub hash: String,
    /// Hex-encoded proposer address.
    pub proposer_address: String,
    /// Number of transactions included in the block.
    pub num_txs: u32,
    /// Total gas consumed (requires a separate `block_results` query;
    /// populated as 0 when only the `/block` endpoint is used).
    pub gas_used: u64,
    /// Total gas requested.
    pub gas_wanted: u64,
    /// Chain identifier (e.g. `clawchain-1`).
    pub chain_id: String,
    /// Hex-encoded application state hash after this block.
    pub app_hash: String,
    /// Hex-encoded hash of the previous block's commit.
    pub last_commit_hash: String,
}

// ---------------------------------------------------------------------------
// CometBFT JSON-RPC response types
// ---------------------------------------------------------------------------

/// Top-level wrapper returned by `GET /block?height=N`.
#[derive(Debug, Deserialize)]
pub struct CometBlockResponse {
    /// The `result` field of the JSON-RPC envelope.
    pub result: CometBlockResult,
}

/// Inner result containing the block and its ID.
#[derive(Debug, Deserialize)]
pub struct CometBlockResult {
    /// Full block data.
    pub block: CometBlock,
    /// Block identifier (contains the block hash).
    pub block_id: CometBlockId,
}

/// CometBFT block structure.
#[derive(Debug, Deserialize)]
pub struct CometBlock {
    /// Block header with chain metadata.
    pub header: CometBlockHeader,
    /// Block data section (transactions).
    pub data: CometBlockData,
    /// Last commit information (opaque; kept as raw JSON).
    pub last_commit: Option<serde_json::Value>,
}

/// Block header fields we care about.
#[derive(Debug, Deserialize)]
pub struct CometBlockHeader {
    /// Chain ID string.
    pub chain_id: String,
    /// Block height as a string (CometBFT encodes numbers as strings).
    pub height: String,
    /// RFC 3339 timestamp.
    pub time: String,
    /// Hex-encoded proposer validator address.
    pub proposer_address: String,
    /// Application state hash.
    pub app_hash: String,
    /// Hash of the previous commit (may be empty at genesis).
    pub last_commit_hash: Option<String>,
}

/// Transaction data section.
#[derive(Debug, Deserialize)]
pub struct CometBlockData {
    /// Base64-encoded transactions; `None` or empty when the block has no txs.
    pub txs: Option<Vec<String>>,
}

/// Block identifier.
#[derive(Debug, Deserialize)]
pub struct CometBlockId {
    /// Hex-encoded block hash.
    pub hash: String,
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/// Fetch a single block from a CometBFT RPC endpoint.
///
/// # Arguments
/// * `rpc_url` - Base URL of the CometBFT RPC (e.g. `http://localhost:26657`).
/// * `height`  - Block height to fetch.
///
/// # Errors
/// Returns an error if the HTTP request fails, the response cannot be
/// deserialized, or the height string cannot be parsed.
pub async fn fetch_cosmos_block(rpc_url: &str, height: u64) -> anyhow::Result<CosmosBlockRow> {
    let url = format!("{}/block?height={}", rpc_url.trim_end_matches('/'), height);
    let client = reqwest::Client::new();
    let resp: CometBlockResponse = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?
        .json()
        .await?;

    let header = &resp.result.block.header;
    let num_txs = resp
        .result
        .block
        .data
        .txs
        .as_ref()
        .map_or(0, |txs| txs.len() as u32);

    Ok(CosmosBlockRow {
        height: header.height.parse()?,
        time: header.time.clone(),
        hash: resp.result.block_id.hash.clone(),
        proposer_address: header.proposer_address.clone(),
        num_txs,
        gas_used: 0,    // requires /block_results query
        gas_wanted: 0,  // requires /block_results query
        chain_id: header.chain_id.clone(),
        app_hash: header.app_hash.clone(),
        last_commit_hash: header.last_commit_hash.clone().unwrap_or_default(),
    })
}

/// Fetch a contiguous range of blocks (inclusive on both ends).
///
/// Blocks that fail to fetch are skipped with a warning via `tracing`.
pub async fn fetch_cosmos_blocks(
    rpc_url: &str,
    from: u64,
    to: u64,
) -> anyhow::Result<Vec<CosmosBlockRow>> {
    let mut rows = Vec::with_capacity((to.saturating_sub(from) + 1) as usize);
    for height in from..=to {
        match fetch_cosmos_block(rpc_url, height).await {
            Ok(row) => rows.push(row),
            Err(e) => tracing::warn!("Failed to fetch block {}: {}", height, e),
        }
    }
    Ok(rows)
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosBlockRow`] as a CSV string (with header row).
pub fn blocks_to_csv(rows: &[CosmosBlockRow]) -> String {
    let mut output = String::from(
        "height,time,hash,proposer_address,num_txs,gas_used,gas_wanted,chain_id,app_hash,last_commit_hash\n",
    );
    for row in rows {
        output.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            row.height,
            row.time,
            row.hash,
            row.proposer_address,
            row.num_txs,
            row.gas_used,
            row.gas_wanted,
            row.chain_id,
            row.app_hash,
            row.last_commit_hash,
        ));
    }
    output
}
