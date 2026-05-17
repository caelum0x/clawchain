//! CosmWasm Contract Inspector for ClawChain
//!
//! Analyzes CosmWasm smart contract WASM binaries and provides:
//! - Contract metadata extraction (entry points, exports)
//! - Size analysis and optimization suggestions
//! - ABI extraction from contract schema
//! - Checksum computation for deploy verification
//! - Interface compatibility checking

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[cfg(test)]
mod tests;

/// Metadata extracted from a CosmWasm WASM binary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractMetadata {
    pub checksum: String,
    pub size_bytes: usize,
    pub size_formatted: String,
    pub exports: Vec<String>,
    pub has_instantiate: bool,
    pub has_execute: bool,
    pub has_query: bool,
    pub has_migrate: bool,
    pub has_sudo: bool,
    pub has_reply: bool,
    pub has_ibc_channel_open: bool,
    pub has_ibc_channel_connect: bool,
    pub has_ibc_channel_close: bool,
    pub has_ibc_packet_receive: bool,
    pub has_ibc_packet_ack: bool,
    pub has_ibc_packet_timeout: bool,
    pub memory_pages: u32,
    pub is_optimized: bool,
    pub warnings: Vec<String>,
}

/// Contract interface definition (from JSON schema)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractInterface {
    pub instantiate_msg: Option<serde_json::Value>,
    pub execute_msg: Option<serde_json::Value>,
    pub query_msg: Option<serde_json::Value>,
    pub migrate_msg: Option<serde_json::Value>,
}

/// Known CosmWasm entry points
const COSMWASM_EXPORTS: &[&str] = &[
    "instantiate",
    "execute",
    "query",
    "migrate",
    "sudo",
    "reply",
    "ibc_channel_open",
    "ibc_channel_connect",
    "ibc_channel_close",
    "ibc_packet_receive",
    "ibc_packet_ack",
    "ibc_packet_timeout",
];

/// Common non-standard exports found in CosmWasm contracts
const EXTRA_EXPORTS: &[&str] = &[
    "allocate",
    "deallocate",
    "interface_version_8",
    "requires_staking",
    "requires_stargate",
];

/// Convert a byte slice to a lowercase hex string
fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Compute SHA-256 checksum of WASM bytes (standard CosmWasm checksum).
///
/// This produces the same checksum that `wasmd` uses when storing a contract,
/// allowing local verification against on-chain code IDs.
pub fn checksum(wasm_bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(wasm_bytes);
    bytes_to_hex(&hasher.finalize())
}

/// Format bytes into human-readable size
pub fn format_size(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

/// Analyze a WASM binary to extract CosmWasm metadata.
///
/// This performs a simplified analysis by scanning for known export names
/// in the WASM binary. A full analysis would parse the WASM module format,
/// but string scanning catches the export names reliably for CosmWasm
/// contracts compiled with standard tooling.
pub fn analyze_wasm(wasm_bytes: &[u8]) -> ContractMetadata {
    let checksum_hex = checksum(wasm_bytes);
    let size = wasm_bytes.len();

    // Scan for export name strings in the WASM binary
    let wasm_str = String::from_utf8_lossy(wasm_bytes);
    let mut exports = Vec::new();

    for export_name in COSMWASM_EXPORTS {
        if wasm_str.contains(export_name) {
            exports.push((*export_name).to_string());
        }
    }

    // Also check for common non-standard exports
    for name in EXTRA_EXPORTS {
        if wasm_str.contains(name) {
            exports.push((*name).to_string());
        }
    }

    let mut warnings = Vec::new();

    // Size warnings
    if size > 800_000 {
        warnings.push(format!(
            "Contract is large ({}) -- consider optimization with wasm-opt",
            format_size(size)
        ));
    }

    // Check for required entry points
    if !exports.contains(&"instantiate".to_string()) {
        warnings.push(
            "Missing 'instantiate' export -- contract cannot be instantiated".to_string(),
        );
    }

    let is_optimized = size < 500_000 && wasm_str.contains("interface_version");

    ContractMetadata {
        checksum: checksum_hex,
        size_bytes: size,
        size_formatted: format_size(size),
        exports: exports.clone(),
        has_instantiate: exports.contains(&"instantiate".to_string()),
        has_execute: exports.contains(&"execute".to_string()),
        has_query: exports.contains(&"query".to_string()),
        has_migrate: exports.contains(&"migrate".to_string()),
        has_sudo: exports.contains(&"sudo".to_string()),
        has_reply: exports.contains(&"reply".to_string()),
        has_ibc_channel_open: exports.contains(&"ibc_channel_open".to_string()),
        has_ibc_channel_connect: exports.contains(&"ibc_channel_connect".to_string()),
        has_ibc_channel_close: exports.contains(&"ibc_channel_close".to_string()),
        has_ibc_packet_receive: exports.contains(&"ibc_packet_receive".to_string()),
        has_ibc_packet_ack: exports.contains(&"ibc_packet_ack".to_string()),
        has_ibc_packet_timeout: exports.contains(&"ibc_packet_timeout".to_string()),
        memory_pages: 0, // Would need proper WASM parsing
        is_optimized,
        warnings,
    }
}

/// Parse a CosmWasm contract's JSON schema interface.
///
/// Expects a JSON object with optional keys: `instantiate`, `execute`,
/// `query`, and `migrate`, each containing the corresponding message schema.
pub fn parse_interface(schema_json: &str) -> anyhow::Result<ContractInterface> {
    let schema: serde_json::Value = serde_json::from_str(schema_json)?;

    Ok(ContractInterface {
        instantiate_msg: schema.get("instantiate").cloned(),
        execute_msg: schema.get("execute").cloned(),
        query_msg: schema.get("query").cloned(),
        migrate_msg: schema.get("migrate").cloned(),
    })
}

/// Compare two contract checksums to verify deployment.
///
/// Comparison is case-insensitive since hex encoding may vary.
pub fn verify_deployment(local_checksum: &str, on_chain_checksum: &str) -> bool {
    local_checksum.to_lowercase() == on_chain_checksum.to_lowercase()
}

/// Generate a human-readable deployment summary for a contract.
pub fn deployment_summary(metadata: &ContractMetadata) -> String {
    let separator = "=".repeat(40);
    let check = |present: bool| if present { "yes" } else { "no" };

    let mut summary = String::new();
    summary.push_str("Contract Analysis\n");
    summary.push_str(&separator);
    summary.push('\n');
    summary.push_str(&format!("Checksum:  {}\n", metadata.checksum));
    summary.push_str(&format!("Size:      {}\n", metadata.size_formatted));
    summary.push_str(&format!(
        "Optimized: {}\n",
        if metadata.is_optimized { "Yes" } else { "No" }
    ));
    summary.push_str("\nEntry Points:\n");
    summary.push_str(&format!(
        "  instantiate: {}\n",
        check(metadata.has_instantiate)
    ));
    summary.push_str(&format!("  execute:     {}\n", check(metadata.has_execute)));
    summary.push_str(&format!("  query:       {}\n", check(metadata.has_query)));
    summary.push_str(&format!("  migrate:     {}\n", check(metadata.has_migrate)));

    let ibc_exports: Vec<&str> = metadata
        .exports
        .iter()
        .filter(|e| e.starts_with("ibc_"))
        .map(|e| e.as_str())
        .collect();

    if !ibc_exports.is_empty() {
        summary.push_str(&format!("\nIBC Exports: {}\n", ibc_exports.join(", ")));
    }

    if !metadata.warnings.is_empty() {
        summary.push_str("\nWarnings:\n");
        for w in &metadata.warnings {
            summary.push_str(&format!("  ! {w}\n"));
        }
    }

    summary
}
