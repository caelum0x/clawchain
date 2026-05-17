//! ClawChain marketplace skills data extraction
//!
//! Queries the ClawChain REST API `/clawchain/marketplace/v1/skills`
//! endpoint to retrieve listed skills and maps each entry into a flat
//! [`CosmosMarketplaceRow`] suitable for Parquet/CSV/JSON export.
//!
//! The marketplace module enables agents to advertise composable skills
//! (e.g. "image-classification", "code-review") that other agents or
//! users can discover and purchase. Each skill carries pricing, category
//! metadata, purchase counts, and a community rating.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_marketplace` dataset.
///
/// Each row represents one skill listing on the ClawChain marketplace.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosMarketplaceRow {
    /// Unique skill identifier (uint64).
    pub id: u64,
    /// Human-readable skill name.
    pub name: String,
    /// Bech32 address of the skill owner / listing creator.
    pub owner: String,
    /// Price in base denom with denomination (e.g. `1000uclaw`).
    pub price: String,
    /// Category tag (e.g. `ai`, `data`, `infra`).
    pub category: String,
    /// Total number of times this skill has been purchased.
    pub purchase_count: u64,
    /// Average community rating (decimal string, 0.0 - 5.0).
    pub rating: String,
}

// ---------------------------------------------------------------------------
// REST API response types
// ---------------------------------------------------------------------------

/// Top-level response from `GET /clawchain/marketplace/v1/skills`.
#[derive(Debug, Deserialize)]
pub struct MarketplaceSkillsResponse {
    /// List of skill entries.
    #[serde(default)]
    pub skills: Vec<MarketplaceSkillEntry>,
    /// Cosmos SDK pagination response.
    pub pagination: Option<MarketplacePaginationResponse>,
}

/// A single skill entry from the REST response.
#[derive(Debug, Deserialize)]
pub struct MarketplaceSkillEntry {
    /// Skill ID (string-encoded from protobuf uint64).
    #[serde(default)]
    pub id: String,
    /// Skill name.
    #[serde(default)]
    pub name: String,
    /// Owner bech32 address.
    #[serde(default)]
    pub owner: String,
    /// Price coin.
    pub price: Option<MarketplaceCoinEntry>,
    /// Category tag.
    #[serde(default)]
    pub category: String,
    /// Purchase count (string-encoded).
    #[serde(default)]
    pub purchase_count: String,
    /// Average rating (decimal string).
    #[serde(default)]
    pub rating: String,
}

/// A Cosmos SDK coin (amount + denom) for marketplace prices.
#[derive(Debug, Deserialize)]
pub struct MarketplaceCoinEntry {
    /// Amount as a string.
    #[serde(default)]
    pub amount: String,
    /// Denomination string (e.g. `uclaw`).
    #[serde(default)]
    pub denom: String,
}

/// Cosmos SDK pagination response envelope for marketplace queries.
#[derive(Debug, Deserialize)]
pub struct MarketplacePaginationResponse {
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

/// Fetch all marketplace skill listings from the ClawChain REST API.
///
/// Automatically follows pagination until all pages are consumed.
///
/// # Arguments
/// * `api_url` - Base URL of the Cosmos LCD/REST endpoint
///   (e.g. `http://localhost:1317`).
///
/// # Errors
/// Returns an error if the HTTP request fails or the response cannot be
/// deserialized.
pub async fn fetch_cosmos_marketplace(
    api_url: &str,
) -> anyhow::Result<Vec<CosmosMarketplaceRow>> {
    let client = reqwest::Client::new();
    let base = api_url.trim_end_matches('/');
    let mut all_rows = Vec::new();
    let mut next_key: Option<String> = None;

    loop {
        let url = match &next_key {
            Some(key) if !key.is_empty() => {
                format!(
                    "{}/clawchain/marketplace/v1/skills?pagination.key={}",
                    base, key
                )
            }
            _ => format!("{}/clawchain/marketplace/v1/skills", base),
        };

        let resp: MarketplaceSkillsResponse = client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await?
            .json()
            .await?;

        for entry in &resp.skills {
            all_rows.push(marketplace_entry_to_row(entry));
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

/// Convert a REST API skill entry into a flat [`CosmosMarketplaceRow`].
fn marketplace_entry_to_row(entry: &MarketplaceSkillEntry) -> CosmosMarketplaceRow {
    let price = entry
        .price
        .as_ref()
        .map(|c| format!("{}{}", c.amount, c.denom))
        .unwrap_or_default();

    CosmosMarketplaceRow {
        id: entry.id.parse().unwrap_or(0),
        name: entry.name.clone(),
        owner: entry.owner.clone(),
        price,
        category: entry.category.clone(),
        purchase_count: entry.purchase_count.parse().unwrap_or(0),
        rating: entry.rating.clone(),
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosMarketplaceRow`] as a CSV string (with header row).
pub fn marketplace_to_csv(rows: &[CosmosMarketplaceRow]) -> String {
    let mut output =
        String::from("id,name,owner,price,category,purchase_count,rating\n");
    for row in rows {
        let name_escaped = row.name.replace('"', "\"\"");
        output.push_str(&format!(
            "{},\"{}\",{},{},{},{},{}\n",
            row.id,
            name_escaped,
            row.owner,
            row.price,
            row.category,
            row.purchase_count,
            row.rating,
        ));
    }
    output
}
