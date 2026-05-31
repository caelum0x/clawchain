//! Pure, HTTP-agnostic URL builders and response parsers.
//!
//! Everything here is deliberately free of any network I/O so it can be
//! unit-tested OFFLINE with fixture JSON strings. The [`crate::provider`]
//! module wires these together with `reqwest`.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Deserialize;

use crate::error::{ClawError, ClawResult};

// --- URL builders ---------------------------------------------------------

/// Tendermint RPC status endpoint (chain id + latest height live here).
pub fn status_path(rpc_base: &str) -> String {
    format!("{}/status", rpc_base.trim_end_matches('/'))
}

/// Cosmos bank REST endpoint listing all balances for an address.
pub fn balance_query_path(rest_base: &str, addr: &str) -> String {
    format!(
        "{}/cosmos/bank/v1beta1/balances/{}",
        rest_base.trim_end_matches('/'),
        addr
    )
}

/// CosmWasm smart-query REST endpoint. The query message JSON is base64-encoded
/// into the path segment, exactly as the `wasmd` LCD route expects.
pub fn smart_query_path(rest_base: &str, contract: &str, msg_json: &str) -> String {
    let encoded = BASE64.encode(msg_json.as_bytes());
    format!(
        "{}/cosmwasm/wasm/v1/contract/{}/smart/{}",
        rest_base.trim_end_matches('/'),
        contract,
        encoded
    )
}

// --- Response parsers -----------------------------------------------------

/// Chain identity and head height, parsed from a Tendermint `/status` response.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusInfo {
    /// The chain id (Tendermint `node_info.network`), e.g. `clawchain-local`.
    pub chain_id: String,
    /// The latest committed block height (`sync_info.latest_block_height`).
    pub block_number: u64,
}

#[derive(Deserialize)]
struct StatusEnvelope {
    result: StatusResult,
}

#[derive(Deserialize)]
struct StatusResult {
    node_info: NodeInfo,
    sync_info: SyncInfo,
}

#[derive(Deserialize)]
struct NodeInfo {
    network: String,
}

#[derive(Deserialize)]
struct SyncInfo {
    // Tendermint serializes height as a string-quoted integer.
    latest_block_height: String,
}

/// Parse a Tendermint `/status` JSON body into a [`StatusInfo`].
pub fn parse_status(body: &str) -> ClawResult<StatusInfo> {
    let env: StatusEnvelope =
        serde_json::from_str(body).map_err(|e| ClawError::Parse(e.to_string()))?;
    let block_number = env
        .result
        .sync_info
        .latest_block_height
        .parse::<u64>()
        .map_err(|_| ClawError::Field("sync_info.latest_block_height".into()))?;
    Ok(StatusInfo {
        chain_id: env.result.node_info.network,
        block_number,
    })
}

/// A single coin balance.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Coin {
    /// The token denomination, e.g. `uclaw`.
    pub denom: String,
    /// The amount, kept as a string to preserve precision (Cosmos `Int`).
    pub amount: String,
}

#[derive(Deserialize)]
struct BalancesEnvelope {
    balances: Vec<Coin>,
}

/// Parse a Cosmos bank `balances` JSON body and return the amount for `denom`.
///
/// Returns `"0"` when the address holds no balance in that denom (the LCD omits
/// zero-balance coins), matching the read semantics callers expect.
pub fn parse_balance(body: &str, denom: &str) -> ClawResult<String> {
    let env: BalancesEnvelope =
        serde_json::from_str(body).map_err(|e| ClawError::Parse(e.to_string()))?;
    let amount = env
        .balances
        .into_iter()
        .find(|c| c.denom == denom)
        .map(|c| c.amount)
        .unwrap_or_else(|| "0".to_string());
    Ok(amount)
}

/// Parse a CosmWasm smart-query response, returning the raw `data` JSON value.
///
/// The LCD wraps the contract's response under a top-level `data` key.
pub fn parse_smart_query(body: &str) -> ClawResult<serde_json::Value> {
    let env: serde_json::Value =
        serde_json::from_str(body).map_err(|e| ClawError::Parse(e.to_string()))?;
    env.get("data")
        .cloned()
        .ok_or_else(|| ClawError::Field("data".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_status_path_trimming_trailing_slash() {
        assert_eq!(
            status_path("http://localhost:26657/"),
            "http://localhost:26657/status"
        );
        assert_eq!(
            status_path("http://localhost:26657"),
            "http://localhost:26657/status"
        );
    }

    #[test]
    fn builds_balance_path() {
        assert_eq!(
            balance_query_path("http://localhost:1317", "claw1abc"),
            "http://localhost:1317/cosmos/bank/v1beta1/balances/claw1abc"
        );
    }

    #[test]
    fn builds_smart_query_path_with_base64_msg() {
        let path = smart_query_path("http://localhost:1317", "claw1contract", r#"{"config":{}}"#);
        // base64 of {"config":{}}
        let expected_b64 = BASE64.encode(r#"{"config":{}}"#.as_bytes());
        assert_eq!(
            path,
            format!(
                "http://localhost:1317/cosmwasm/wasm/v1/contract/claw1contract/smart/{}",
                expected_b64
            )
        );
    }

    #[test]
    fn parses_status_fixture() {
        let body = r#"{
            "jsonrpc": "2.0",
            "id": -1,
            "result": {
                "node_info": { "network": "clawchain-local", "moniker": "node0" },
                "sync_info": {
                    "latest_block_hash": "ABC",
                    "latest_block_height": "12345",
                    "catching_up": false
                }
            }
        }"#;
        let info = parse_status(body).unwrap();
        assert_eq!(info.chain_id, "clawchain-local");
        assert_eq!(info.block_number, 12345);
    }

    #[test]
    fn parse_status_rejects_non_numeric_height() {
        let body = r#"{"result":{"node_info":{"network":"x"},"sync_info":{"latest_block_height":"abc"}}}"#;
        let err = parse_status(body).unwrap_err();
        assert!(matches!(err, ClawError::Field(_)));
    }

    #[test]
    fn parse_status_rejects_garbage() {
        assert!(matches!(parse_status("not json"), Err(ClawError::Parse(_))));
    }

    #[test]
    fn parses_balance_for_denom() {
        let body = r#"{
            "balances": [
                { "denom": "uatom", "amount": "10" },
                { "denom": "uclaw", "amount": "9000000" }
            ],
            "pagination": { "next_key": null, "total": "2" }
        }"#;
        assert_eq!(parse_balance(body, "uclaw").unwrap(), "9000000");
        assert_eq!(parse_balance(body, "uatom").unwrap(), "10");
    }

    #[test]
    fn parses_balance_missing_denom_as_zero() {
        let body = r#"{"balances":[],"pagination":{"next_key":null,"total":"0"}}"#;
        assert_eq!(parse_balance(body, "uclaw").unwrap(), "0");
    }

    #[test]
    fn parses_smart_query_data() {
        let body = r#"{"data":{"count":7,"owner":"claw1abc"}}"#;
        let data = parse_smart_query(body).unwrap();
        assert_eq!(data.get("count").unwrap().as_i64().unwrap(), 7);
        assert_eq!(data.get("owner").unwrap().as_str().unwrap(), "claw1abc");
    }

    #[test]
    fn smart_query_missing_data_is_field_error() {
        let body = r#"{"oops":true}"#;
        assert!(matches!(
            parse_smart_query(body),
            Err(ClawError::Field(_))
        ));
    }
}
