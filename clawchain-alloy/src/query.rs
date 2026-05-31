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

/// Cosmos auth REST endpoint returning an account's `account_number` + `sequence`.
pub fn account_query_path(rest_base: &str, addr: &str) -> String {
    format!(
        "{}/cosmos/auth/v1beta1/accounts/{}",
        rest_base.trim_end_matches('/'),
        addr
    )
}

/// Tendermint RPC synchronous broadcast endpoint. The signed tx bytes are sent
/// base64-encoded as the `tx` query param (`/broadcast_tx_sync?tx="..."`).
pub fn broadcast_tx_sync_path(rpc_base: &str, tx_bytes: &[u8]) -> String {
    let encoded = BASE64.encode(tx_bytes);
    format!(
        "{}/broadcast_tx_sync?tx=%22{}%22",
        rpc_base.trim_end_matches('/'),
        // base64 may contain '+' and '/'; percent-encode the few unsafe chars.
        encoded
            .replace('+', "%2B")
            .replace('/', "%2F")
            .replace('=', "%3D")
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

/// An account's number and sequence, parsed from the Cosmos auth REST endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountInfo {
    /// The on-chain account number (fixed at account creation).
    pub account_number: u64,
    /// The current sequence (nonce), incremented per tx.
    pub sequence: u64,
}

/// Parse a Cosmos `cosmos/auth/v1beta1/accounts/{addr}` response into account
/// number + sequence. Both are JSON-string-quoted integers under `account`.
///
/// Handles the common `BaseAccount` shape directly and also digs through a
/// `base_account` wrapper used by module/vesting accounts.
pub fn parse_account(body: &str) -> ClawResult<AccountInfo> {
    let env: serde_json::Value =
        serde_json::from_str(body).map_err(|e| ClawError::Parse(e.to_string()))?;
    let account = env
        .get("account")
        .ok_or_else(|| ClawError::Field("account".into()))?;
    // Some account types nest the canonical fields under `base_account`.
    let core = account.get("base_account").unwrap_or(account);

    let read_u64 = |key: &str| -> ClawResult<u64> {
        let v = core
            .get(key)
            .ok_or_else(|| ClawError::Field(format!("account.{key}")))?;
        // Field is normally a quoted string; tolerate a bare number too.
        if let Some(s) = v.as_str() {
            s.parse::<u64>()
                .map_err(|_| ClawError::Field(format!("account.{key} not numeric")))
        } else if let Some(n) = v.as_u64() {
            Ok(n)
        } else {
            Err(ClawError::Field(format!("account.{key} not numeric")))
        }
    };

    Ok(AccountInfo {
        account_number: read_u64("account_number")?,
        sequence: read_u64("sequence")?,
    })
}

/// Parse a Tendermint `/broadcast_tx_sync` response into the tx hash.
///
/// Returns an error when CheckTx rejected the tx (`result.code != 0`), surfacing
/// the chain's `log` so callers see why. On success returns the uppercase tx hash.
pub fn parse_broadcast_sync(body: &str) -> ClawResult<String> {
    let env: serde_json::Value =
        serde_json::from_str(body).map_err(|e| ClawError::Parse(e.to_string()))?;
    // JSON-RPC level error.
    if let Some(err) = env.get("error") {
        return Err(ClawError::Field(format!("broadcast rpc error: {err}")));
    }
    let result = env
        .get("result")
        .ok_or_else(|| ClawError::Field("result".into()))?;
    let code = result.get("code").and_then(|c| c.as_u64()).unwrap_or(0);
    if code != 0 {
        let log = result
            .get("log")
            .and_then(|l| l.as_str())
            .unwrap_or("unknown");
        return Err(ClawError::Field(format!(
            "tx rejected by CheckTx (code {code}): {log}"
        )));
    }
    let hash = result
        .get("hash")
        .and_then(|h| h.as_str())
        .ok_or_else(|| ClawError::Field("result.hash".into()))?;
    Ok(hash.to_string())
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
        let body =
            r#"{"result":{"node_info":{"network":"x"},"sync_info":{"latest_block_height":"abc"}}}"#;
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
        assert!(matches!(parse_smart_query(body), Err(ClawError::Field(_))));
    }

    #[test]
    fn builds_account_path() {
        assert_eq!(
            account_query_path("http://localhost:1317", "claw1abc"),
            "http://localhost:1317/cosmos/auth/v1beta1/accounts/claw1abc"
        );
    }

    #[test]
    fn parses_base_account_number_and_sequence() {
        let body = r#"{
            "account": {
                "@type": "/cosmos.auth.v1beta1.BaseAccount",
                "address": "claw1abc",
                "pub_key": null,
                "account_number": "42",
                "sequence": "9"
            }
        }"#;
        let info = parse_account(body).unwrap();
        assert_eq!(info.account_number, 42);
        assert_eq!(info.sequence, 9);
    }

    #[test]
    fn parses_nested_base_account() {
        let body = r#"{
            "account": {
                "@type": "/cosmos.vesting.v1beta1.ContinuousVestingAccount",
                "base_account": { "account_number": "5", "sequence": "1" }
            }
        }"#;
        let info = parse_account(body).unwrap();
        assert_eq!(info.account_number, 5);
        assert_eq!(info.sequence, 1);
    }

    #[test]
    fn parse_account_missing_field_is_error() {
        let body = r#"{"account":{"account_number":"1"}}"#;
        assert!(matches!(parse_account(body), Err(ClawError::Field(_))));
    }

    #[test]
    fn builds_broadcast_path_with_encoded_tx() {
        let path = broadcast_tx_sync_path("http://localhost:26657/", &[0xff, 0x00]);
        assert!(path.starts_with("http://localhost:26657/broadcast_tx_sync?tx=%22"));
        assert!(path.ends_with("%22"));
    }

    #[test]
    fn parses_broadcast_success_hash() {
        let body = r#"{"jsonrpc":"2.0","id":-1,"result":{"code":0,"data":"","log":"","codespace":"","hash":"ABCDEF123"}}"#;
        assert_eq!(parse_broadcast_sync(body).unwrap(), "ABCDEF123");
    }

    #[test]
    fn parses_broadcast_checktx_failure() {
        let body = r#"{"result":{"code":5,"log":"insufficient funds","hash":"X"}}"#;
        let err = parse_broadcast_sync(body).unwrap_err();
        assert!(matches!(err, ClawError::Field(_)));
        assert!(err.to_string().contains("insufficient funds"));
    }

    #[test]
    fn parses_broadcast_rpc_error() {
        let body = r#"{"jsonrpc":"2.0","error":{"code":-32600,"message":"bad"}}"#;
        assert!(matches!(
            parse_broadcast_sync(body),
            Err(ClawError::Field(_))
        ));
    }
}
