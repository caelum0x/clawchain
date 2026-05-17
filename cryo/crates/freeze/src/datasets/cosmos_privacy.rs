//! ClawChain privacy pool data extraction
//!
//! Queries the ClawChain REST API `/clawchain/privacy/v1/tree_stats`
//! endpoint to retrieve Merkle tree statistics from the shielded pool
//! and maps the response into a flat [`CosmosPrivacyRow`] suitable for
//! Parquet/CSV/JSON export.
//!
//! The privacy module implements shielded transfers on ClawChain using
//! a commitment-nullifier scheme backed by a Merkle tree. This dataset
//! captures the current state of the privacy pool: how many commitments
//! exist, how many nullifiers have been spent, the current Merkle root,
//! and the tree depth.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_privacy` dataset.
///
/// Each row represents a snapshot of the privacy pool's Merkle tree
/// statistics at the time of the query.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosPrivacyRow {
    /// Total number of commitments inserted into the Merkle tree.
    pub commitment_count: u64,
    /// Total number of nullifiers that have been revealed (spent notes).
    pub nullifier_count: u64,
    /// Hex-encoded current Merkle root hash.
    pub merkle_root: String,
    /// Depth of the Merkle tree (e.g. 20 for a 2^20 capacity tree).
    pub tree_depth: u32,
}

// ---------------------------------------------------------------------------
// REST API response types
// ---------------------------------------------------------------------------

/// Top-level response from `GET /clawchain/privacy/v1/tree_stats`.
#[derive(Debug, Deserialize)]
pub struct PrivacyTreeStatsResponse {
    /// Tree statistics payload.
    pub stats: Option<PrivacyTreeStats>,
}

/// Inner tree statistics from the REST response.
#[derive(Debug, Deserialize)]
pub struct PrivacyTreeStats {
    /// Commitment count (string-encoded from protobuf uint64).
    #[serde(default)]
    pub commitment_count: String,
    /// Nullifier count (string-encoded).
    #[serde(default)]
    pub nullifier_count: String,
    /// Hex-encoded Merkle root.
    #[serde(default)]
    pub merkle_root: String,
    /// Tree depth (string-encoded).
    #[serde(default)]
    pub tree_depth: String,
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/// Fetch privacy pool tree statistics from the ClawChain REST API.
///
/// Returns a single-element vector on success (one snapshot), or an
/// empty vector if the `stats` field is absent from the response.
///
/// # Arguments
/// * `api_url` - Base URL of the Cosmos LCD/REST endpoint
///   (e.g. `http://localhost:1317`).
///
/// # Errors
/// Returns an error if the HTTP request fails or the response cannot be
/// deserialized.
pub async fn fetch_cosmos_privacy(
    api_url: &str,
) -> anyhow::Result<Vec<CosmosPrivacyRow>> {
    let url = format!(
        "{}/clawchain/privacy/v1/tree_stats",
        api_url.trim_end_matches('/')
    );
    let client = reqwest::Client::new();
    let resp: PrivacyTreeStatsResponse = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?
        .json()
        .await?;

    match resp.stats {
        Some(stats) => Ok(vec![privacy_stats_to_row(&stats)]),
        None => {
            tracing::warn!("Privacy tree stats response contained no stats field");
            Ok(Vec::new())
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Convert REST API tree stats into a flat [`CosmosPrivacyRow`].
fn privacy_stats_to_row(stats: &PrivacyTreeStats) -> CosmosPrivacyRow {
    CosmosPrivacyRow {
        commitment_count: stats.commitment_count.parse().unwrap_or(0),
        nullifier_count: stats.nullifier_count.parse().unwrap_or(0),
        merkle_root: stats.merkle_root.clone(),
        tree_depth: stats.tree_depth.parse().unwrap_or(0),
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosPrivacyRow`] as a CSV string (with header row).
pub fn privacy_to_csv(rows: &[CosmosPrivacyRow]) -> String {
    let mut output =
        String::from("commitment_count,nullifier_count,merkle_root,tree_depth\n");
    for row in rows {
        output.push_str(&format!(
            "{},{},{},{}\n",
            row.commitment_count, row.nullifier_count, row.merkle_root, row.tree_depth,
        ));
    }
    output
}
