//! ClawChain / Cosmos SDK event data extraction
//!
//! Extracts ABCI events from CometBFT block results, with optional
//! filtering by ClawChain module (agent, privacy, marketplace, etc.).
//!
//! Events are flattened into [`CosmosEventRow`] structs where each row
//! represents one event, and the key-value attributes are stored as a
//! JSON-encoded string for maximum flexibility.

use serde::{Deserialize, Serialize};
use std::fmt;

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

/// A single row in the `cosmos_events` dataset.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CosmosEventRow {
    /// Block height the event was emitted in.
    pub height: u64,
    /// Hex-encoded transaction hash (empty for begin/end-block events).
    pub tx_hash: String,
    /// ABCI event type (e.g. `transfer`, `register_agent`, `shield`).
    pub event_type: String,
    /// Inferred source module (e.g. `agent`, `privacy`, `bank`).
    pub module: String,
    /// JSON-encoded key-value attributes.
    pub attributes: String,
}

// ---------------------------------------------------------------------------
// Event filter
// ---------------------------------------------------------------------------

/// Filter events by ClawChain module category.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CosmosEventFilter {
    /// No filtering; return all events.
    All,
    /// Agent module events: `agent_action`, `register_agent`, `deregister_agent`,
    /// `delegate_task`, `accept_task`, `complete_task`, `agent_heartbeat`,
    /// `submit_intent`, `respond_intent`, `finalize_intent`.
    Agent,
    /// Privacy module events: `shield`, `unshield`, `private_transfer`,
    /// `batch_private_transfer`, `register_view_key`.
    Privacy,
    /// Marketplace module events: `list_skill`, `purchase_skill`,
    /// `create_escrow`, `release_escrow`, `dispute_escrow`.
    Marketplace,
    /// Staking events: `delegate`, `unbond`, `redelegate`,
    /// `create_validator`, `edit_validator`.
    Staking,
    /// Governance events: `submit_proposal`, `vote`, `deposit`.
    Governance,
    /// DEX / CosmWasm swap events: `wasm`, `execute`, `instantiate`.
    Dex,
}

impl fmt::Display for CosmosEventFilter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::All => write!(f, "all"),
            Self::Agent => write!(f, "agent"),
            Self::Privacy => write!(f, "privacy"),
            Self::Marketplace => write!(f, "marketplace"),
            Self::Staking => write!(f, "staking"),
            Self::Governance => write!(f, "governance"),
            Self::Dex => write!(f, "dex"),
        }
    }
}

impl CosmosEventFilter {
    /// Return the set of event type prefixes that belong to this filter.
    pub fn event_types(&self) -> &[&str] {
        match self {
            Self::All => &[],
            Self::Agent => &[
                "agent_action",
                "register_agent",
                "deregister_agent",
                "delegate_task",
                "accept_task",
                "complete_task",
                "agent_heartbeat",
                "submit_intent",
                "respond_intent",
                "finalize_intent",
            ],
            Self::Privacy => &[
                "shield",
                "unshield",
                "private_transfer",
                "batch_private_transfer",
                "register_view_key",
            ],
            Self::Marketplace => &[
                "list_skill",
                "purchase_skill",
                "create_escrow",
                "release_escrow",
                "dispute_escrow",
            ],
            Self::Staking => &[
                "delegate",
                "unbond",
                "redelegate",
                "create_validator",
                "edit_validator",
            ],
            Self::Governance => &[
                "submit_proposal",
                "vote",
                "deposit",
            ],
            Self::Dex => &[
                "wasm",
                "execute",
                "instantiate",
            ],
        }
    }

    /// Check whether a given event type passes this filter.
    pub fn matches(&self, event_type: &str) -> bool {
        match self {
            Self::All => true,
            _ => self.event_types().iter().any(|&t| event_type == t),
        }
    }
}

// ---------------------------------------------------------------------------
// CometBFT block_results response types
// ---------------------------------------------------------------------------

/// Top-level wrapper for `/block_results?height=N`.
#[derive(Debug, Deserialize)]
pub struct CometBlockResultsResponse {
    /// JSON-RPC result payload.
    pub result: CometBlockResultsInner,
}

/// Inner block results containing begin-block, end-block, and tx-level events.
#[derive(Debug, Deserialize)]
pub struct CometBlockResultsInner {
    /// Block height (string-encoded).
    pub height: String,
    /// Transaction results (each carries its own events).
    #[serde(default)]
    pub txs_results: Option<Vec<CometTxResultEvents>>,
    /// Events emitted at begin-block.
    #[serde(default)]
    pub begin_block_events: Option<Vec<CometAbciEvent>>,
    /// Events emitted at end-block (CometBFT < 0.38 used `end_block_events`;
    /// 0.38+ uses `finalize_block_events`; we try both).
    #[serde(default)]
    pub end_block_events: Option<Vec<CometAbciEvent>>,
    /// Finalize-block events (CometBFT >= 0.38).
    #[serde(default)]
    pub finalize_block_events: Option<Vec<CometAbciEvent>>,
}

/// Per-transaction result with events.
#[derive(Debug, Deserialize)]
pub struct CometTxResultEvents {
    /// Result code.
    #[serde(default)]
    pub code: u32,
    /// ABCI events for this transaction.
    #[serde(default)]
    pub events: Vec<CometAbciEvent>,
}

/// A single ABCI event.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CometAbciEvent {
    /// Event type string.
    #[serde(rename = "type")]
    pub event_type: String,
    /// Key-value attributes.
    #[serde(default)]
    pub attributes: Vec<CometAbciAttribute>,
}

/// A key-value attribute inside an ABCI event.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CometAbciAttribute {
    /// Attribute key.
    pub key: String,
    /// Attribute value.
    #[serde(default)]
    pub value: String,
}

// ---------------------------------------------------------------------------
// Fetch + transform
// ---------------------------------------------------------------------------

/// Fetch all events from `/block_results` at a given height.
///
/// Returns one [`CosmosEventRow`] per ABCI event found (begin-block,
/// end-block / finalize-block, and per-transaction events).
pub async fn fetch_cosmos_events(
    rpc_url: &str,
    height: u64,
) -> anyhow::Result<Vec<CosmosEventRow>> {
    let url = format!(
        "{}/block_results?height={}",
        rpc_url.trim_end_matches('/'),
        height
    );
    let client = reqwest::Client::new();
    let resp: CometBlockResultsResponse = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?
        .json()
        .await?;

    let parsed_height: u64 = resp.result.height.parse().unwrap_or(height);
    let mut rows = Vec::new();

    // Begin-block events
    if let Some(events) = &resp.result.begin_block_events {
        for event in events {
            rows.push(abci_event_to_row(parsed_height, "", event));
        }
    }

    // Per-transaction events
    if let Some(tx_results) = &resp.result.txs_results {
        for (idx, tx_result) in tx_results.iter().enumerate() {
            let tx_hash = format!("tx_{}", idx); // Real hash requires cross-referencing /block
            for event in &tx_result.events {
                rows.push(abci_event_to_row(parsed_height, &tx_hash, event));
            }
        }
    }

    // End-block / finalize-block events
    let end_events = resp
        .result
        .end_block_events
        .as_deref()
        .or(resp.result.finalize_block_events.as_deref());
    if let Some(events) = end_events {
        for event in events {
            rows.push(abci_event_to_row(parsed_height, "", event));
        }
    }

    Ok(rows)
}

/// Fetch events across a range of block heights.
pub async fn fetch_cosmos_events_range(
    rpc_url: &str,
    from: u64,
    to: u64,
) -> anyhow::Result<Vec<CosmosEventRow>> {
    let mut all_rows = Vec::new();
    for height in from..=to {
        match fetch_cosmos_events(rpc_url, height).await {
            Ok(rows) => all_rows.extend(rows),
            Err(e) => tracing::warn!("Failed to fetch events at height {}: {}", height, e),
        }
    }
    Ok(all_rows)
}

/// Filter a collection of event rows by a [`CosmosEventFilter`].
pub fn filter_events(rows: &[CosmosEventRow], filter: CosmosEventFilter) -> Vec<CosmosEventRow> {
    if matches!(filter, CosmosEventFilter::All) {
        return rows.to_vec();
    }
    rows.iter()
        .filter(|row| filter.matches(&row.event_type))
        .cloned()
        .collect()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Convert one ABCI event into a [`CosmosEventRow`].
fn abci_event_to_row(height: u64, tx_hash: &str, event: &CometAbciEvent) -> CosmosEventRow {
    let module = infer_module(&event.event_type);
    let attrs: Vec<(&str, &str)> = event
        .attributes
        .iter()
        .map(|a| (a.key.as_str(), a.value.as_str()))
        .collect();
    let attributes_json =
        serde_json::to_string(&attrs).unwrap_or_else(|_| "[]".to_string());

    CosmosEventRow {
        height,
        tx_hash: tx_hash.to_string(),
        event_type: event.event_type.clone(),
        module: module.to_string(),
        attributes: attributes_json,
    }
}

/// Best-effort mapping from event type to source module name.
fn infer_module(event_type: &str) -> &str {
    if CosmosEventFilter::Agent.matches(event_type) {
        return "agent";
    }
    if CosmosEventFilter::Privacy.matches(event_type) {
        return "privacy";
    }
    if CosmosEventFilter::Marketplace.matches(event_type) {
        return "marketplace";
    }
    if CosmosEventFilter::Staking.matches(event_type) {
        return "staking";
    }
    if CosmosEventFilter::Governance.matches(event_type) {
        return "governance";
    }
    if CosmosEventFilter::Dex.matches(event_type) {
        return "dex";
    }
    // Common Cosmos SDK events
    match event_type {
        "transfer" | "coin_spent" | "coin_received" => "bank",
        "message" | "tx" => "sdk",
        _ => "unknown",
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/// Render a slice of [`CosmosEventRow`] as a CSV string (with header row).
pub fn events_to_csv(rows: &[CosmosEventRow]) -> String {
    let mut output =
        String::from("height,tx_hash,event_type,module,attributes\n");
    for row in rows {
        let attrs_escaped = row.attributes.replace('"', "\"\"");
        output.push_str(&format!(
            "{},{},{},{},\"{}\"\n",
            row.height, row.tx_hash, row.event_type, row.module, attrs_escaped,
        ));
    }
    output
}
