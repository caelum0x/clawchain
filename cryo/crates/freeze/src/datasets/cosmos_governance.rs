//! ClawChain governance proposals data extraction
//!
//! Queries the ClawChain REST API `/clawchain/governance/v1/proposals`
//! endpoint to retrieve governance proposals and maps each entry into a
//! flat [`CosmosGovernanceRow`] suitable for Parquet/CSV/JSON export.
//!
//! The governance module on ClawChain extends the standard Cosmos SDK
//! governance with support for agent-economy parameter changes,
//! marketplace fee adjustments, and privacy-pool configuration updates.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_governance` dataset.
///
/// Each row represents one governance proposal on the ClawChain network.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosGovernanceRow {
    /// Unique proposal identifier (uint64).
    pub id: u64,
    /// Proposal title.
    pub title: String,
    /// Proposal status string (e.g. `PROPOSAL_STATUS_VOTING_PERIOD`,
    /// `PROPOSAL_STATUS_PASSED`, `PROPOSAL_STATUS_REJECTED`).
    pub status: String,
    /// Bech32 address of the proposal submitter.
    pub proposer: String,
    /// Total "yes" vote tally (decimal string).
    pub yes_votes: String,
    /// Total "no" vote tally (decimal string).
    pub no_votes: String,
    /// Total "no with veto" vote tally (decimal string).
    pub veto_votes: String,
}

// ---------------------------------------------------------------------------
// REST API response types
// ---------------------------------------------------------------------------

/// Top-level response from `GET /clawchain/governance/v1/proposals`.
#[derive(Debug, Deserialize)]
pub struct GovernanceProposalsResponse {
    /// List of proposal entries.
    #[serde(default)]
    pub proposals: Vec<GovernanceProposalEntry>,
    /// Cosmos SDK pagination response.
    pub pagination: Option<GovernancePaginationResponse>,
}

/// A single proposal entry from the REST response.
#[derive(Debug, Deserialize)]
pub struct GovernanceProposalEntry {
    /// Proposal ID (string-encoded from protobuf uint64).
    #[serde(default)]
    pub id: String,
    /// Proposal title.
    #[serde(default)]
    pub title: String,
    /// Status string.
    #[serde(default)]
    pub status: String,
    /// Proposer bech32 address.
    #[serde(default)]
    pub proposer: String,
    /// Final tally result (may be absent before voting ends).
    pub final_tally_result: Option<GovernanceTallyResult>,
}

/// Vote tally result from a governance proposal.
#[derive(Debug, Deserialize)]
pub struct GovernanceTallyResult {
    /// Yes votes (decimal string).
    #[serde(default)]
    pub yes_count: String,
    /// No votes (decimal string).
    #[serde(default)]
    pub no_count: String,
    /// No-with-veto votes (decimal string).
    #[serde(default)]
    pub no_with_veto_count: String,
    /// Abstain votes (decimal string).
    #[serde(default)]
    pub abstain_count: String,
}

/// Cosmos SDK pagination response envelope for governance queries.
#[derive(Debug, Deserialize)]
pub struct GovernancePaginationResponse {
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

/// Fetch all governance proposals from the ClawChain REST API.
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
pub async fn fetch_cosmos_governance(
    api_url: &str,
) -> anyhow::Result<Vec<CosmosGovernanceRow>> {
    let client = reqwest::Client::new();
    let base = api_url.trim_end_matches('/');
    let mut all_rows = Vec::new();
    let mut next_key: Option<String> = None;

    loop {
        let url = match &next_key {
            Some(key) if !key.is_empty() => {
                format!(
                    "{}/clawchain/governance/v1/proposals?pagination.key={}",
                    base, key
                )
            }
            _ => format!("{}/clawchain/governance/v1/proposals", base),
        };

        let resp: GovernanceProposalsResponse = client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await?
            .json()
            .await?;

        for entry in &resp.proposals {
            all_rows.push(governance_entry_to_row(entry));
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

/// Convert a REST API proposal entry into a flat [`CosmosGovernanceRow`].
fn governance_entry_to_row(entry: &GovernanceProposalEntry) -> CosmosGovernanceRow {
    let (yes_votes, no_votes, veto_votes) = match &entry.final_tally_result {
        Some(tally) => (
            tally.yes_count.clone(),
            tally.no_count.clone(),
            tally.no_with_veto_count.clone(),
        ),
        None => (String::from("0"), String::from("0"), String::from("0")),
    };

    CosmosGovernanceRow {
        id: entry.id.parse().unwrap_or(0),
        title: entry.title.clone(),
        status: entry.status.clone(),
        proposer: entry.proposer.clone(),
        yes_votes,
        no_votes,
        veto_votes,
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosGovernanceRow`] as a CSV string (with header row).
pub fn governance_to_csv(rows: &[CosmosGovernanceRow]) -> String {
    let mut output =
        String::from("id,title,status,proposer,yes_votes,no_votes,veto_votes\n");
    for row in rows {
        let title_escaped = row.title.replace('"', "\"\"");
        output.push_str(&format!(
            "{},\"{}\",{},{},{},{},{}\n",
            row.id,
            title_escaped,
            row.status,
            row.proposer,
            row.yes_votes,
            row.no_votes,
            row.veto_votes,
        ));
    }
    output
}
