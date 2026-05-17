//! ClawChain agent registry data extraction
//!
//! Queries the ClawChain REST API `/clawchain/agent/v1/agents` endpoint
//! to retrieve registered agents and maps each result into a flat
//! [`CosmosAgentRow`] suitable for Parquet/CSV/JSON export.
//!
//! The agent module is a core ClawChain primitive that tracks autonomous
//! agents, their capabilities, reputation scores, and task history.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_agents` dataset.
///
/// Each row represents one registered agent on the ClawChain network.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosAgentRow {
    /// Bech32 address of the agent (e.g. `claw1...`).
    pub address: String,
    /// Human-readable agent name.
    pub name: String,
    /// Agent status string (e.g. `ACTIVE`, `INACTIVE`, `JAILED`).
    pub status: String,
    /// Agent's service endpoint URL.
    pub endpoint: String,
    /// Comma-separated list of agent capabilities.
    pub capabilities: String,
    /// Reputation score (integer, higher is better).
    pub reputation_score: u64,
    /// Total number of tasks completed by this agent.
    pub tasks_completed: u64,
    /// Deposit amount in base denom (uclaw).
    pub deposit_amount: String,
    /// RFC 3339 timestamp of the agent's last heartbeat.
    pub last_heartbeat: String,
}

// ---------------------------------------------------------------------------
// REST API response types
// ---------------------------------------------------------------------------

/// Top-level response from `GET /clawchain/agent/v1/agents`.
#[derive(Debug, Deserialize)]
pub struct AgentListResponse {
    /// List of agent entries.
    #[serde(default)]
    pub agents: Vec<AgentEntry>,
    /// Cosmos SDK pagination response.
    pub pagination: Option<PaginationResponse>,
}

/// A single agent entry from the REST response.
#[derive(Debug, Deserialize)]
pub struct AgentEntry {
    /// Bech32 address.
    #[serde(default)]
    pub address: String,
    /// Human-readable name.
    #[serde(default)]
    pub name: String,
    /// Status string.
    #[serde(default)]
    pub status: String,
    /// Service endpoint URL.
    #[serde(default)]
    pub endpoint: String,
    /// List of capability strings.
    #[serde(default)]
    pub capabilities: Vec<String>,
    /// Reputation score (string-encoded from protobuf uint64).
    #[serde(default)]
    pub reputation_score: String,
    /// Tasks completed count (string-encoded).
    #[serde(default)]
    pub tasks_completed: String,
    /// Deposit amount with denom.
    pub deposit: Option<CoinEntry>,
    /// Last heartbeat timestamp.
    #[serde(default)]
    pub last_heartbeat: String,
}

/// A Cosmos SDK coin (amount + denom).
#[derive(Debug, Deserialize)]
pub struct CoinEntry {
    /// Amount as a string.
    #[serde(default)]
    pub amount: String,
    /// Denomination string (e.g. `uclaw`).
    #[serde(default)]
    pub denom: String,
}

/// Cosmos SDK pagination response envelope.
#[derive(Debug, Deserialize)]
pub struct PaginationResponse {
    /// Base64-encoded key for the next page (empty or absent when done).
    #[serde(default)]
    pub next_key: Option<String>,
    /// Total number of records (string-encoded; may be "0" if not computed).
    #[serde(default)]
    pub total: String,
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/// Fetch all registered agents from the ClawChain REST API.
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
pub async fn fetch_cosmos_agents(api_url: &str) -> anyhow::Result<Vec<CosmosAgentRow>> {
    let client = reqwest::Client::new();
    let base = api_url.trim_end_matches('/');
    let mut all_rows = Vec::new();
    let mut next_key: Option<String> = None;

    loop {
        let url = match &next_key {
            Some(key) if !key.is_empty() => {
                format!(
                    "{}/clawchain/agent/v1/agents?pagination.key={}",
                    base, key
                )
            }
            _ => format!("{}/clawchain/agent/v1/agents", base),
        };

        let resp: AgentListResponse = client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await?
            .json()
            .await?;

        for entry in &resp.agents {
            all_rows.push(agent_entry_to_row(entry));
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

/// Convert a REST API agent entry into a flat [`CosmosAgentRow`].
fn agent_entry_to_row(entry: &AgentEntry) -> CosmosAgentRow {
    let deposit_amount = entry
        .deposit
        .as_ref()
        .map(|c| format!("{}{}", c.amount, c.denom))
        .unwrap_or_default();

    CosmosAgentRow {
        address: entry.address.clone(),
        name: entry.name.clone(),
        status: entry.status.clone(),
        endpoint: entry.endpoint.clone(),
        capabilities: entry.capabilities.join(","),
        reputation_score: entry.reputation_score.parse().unwrap_or(0),
        tasks_completed: entry.tasks_completed.parse().unwrap_or(0),
        deposit_amount,
        last_heartbeat: entry.last_heartbeat.clone(),
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosAgentRow`] as a CSV string (with header row).
pub fn agents_to_csv(rows: &[CosmosAgentRow]) -> String {
    let mut output = String::from(
        "address,name,status,endpoint,capabilities,reputation_score,tasks_completed,deposit_amount,last_heartbeat\n",
    );
    for row in rows {
        // Escape fields that may contain commas
        let caps_escaped = row.capabilities.replace('"', "\"\"");
        let name_escaped = row.name.replace('"', "\"\"");
        let endpoint_escaped = row.endpoint.replace('"', "\"\"");
        output.push_str(&format!(
            "{},\"{}\",{},\"{}\",\"{}\",{},{},{},{}\n",
            row.address,
            name_escaped,
            row.status,
            endpoint_escaped,
            caps_escaped,
            row.reputation_score,
            row.tasks_completed,
            row.deposit_amount,
            row.last_heartbeat,
        ));
    }
    output
}
