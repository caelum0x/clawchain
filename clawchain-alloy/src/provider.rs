//! The alloy-style [`ClawProvider`]: a thin blocking HTTP wrapper that wires the
//! pure builders/parsers in [`crate::query`] to live Tendermint RPC + Cosmos REST.

use crate::error::{ClawError, ClawResult};
use crate::query::{
    balance_query_path, parse_balance, parse_smart_query, parse_status, smart_query_path,
    status_path, StatusInfo,
};

/// A ClawChain-native provider with an alloy-flavored read API.
///
/// Construct with [`ClawProvider::new`] (Tendermint RPC base + Cosmos REST base),
/// then call [`chain_id`](Self::chain_id), [`block_number`](Self::block_number),
/// [`get_balance`](Self::get_balance), or [`query_contract`](Self::query_contract).
#[derive(Debug, Clone)]
pub struct ClawProvider {
    rpc_base: String,
    rest_base: String,
    client: reqwest::blocking::Client,
}

impl ClawProvider {
    /// Build a provider from a Tendermint RPC base URL (e.g. `http://localhost:26657`)
    /// and a Cosmos REST/LCD base URL (e.g. `http://localhost:1317`).
    pub fn new(rpc_base: impl Into<String>, rest_base: impl Into<String>) -> Self {
        Self {
            rpc_base: rpc_base.into(),
            rest_base: rest_base.into(),
            client: reqwest::blocking::Client::new(),
        }
    }

    /// Build a provider with a caller-supplied reqwest client (timeouts, proxies, etc.).
    pub fn with_client(
        rpc_base: impl Into<String>,
        rest_base: impl Into<String>,
        client: reqwest::blocking::Client,
    ) -> Self {
        Self {
            rpc_base: rpc_base.into(),
            rest_base: rest_base.into(),
            client,
        }
    }

    fn get(&self, url: &str) -> ClawResult<String> {
        let resp = self
            .client
            .get(url)
            .send()
            .map_err(|e| ClawError::Http(e.to_string()))?;
        let resp = resp
            .error_for_status()
            .map_err(|e| ClawError::Http(e.to_string()))?;
        resp.text().map_err(|e| ClawError::Http(e.to_string()))
    }

    /// Fetch and parse the full Tendermint status (chain id + head height).
    pub fn status(&self) -> ClawResult<StatusInfo> {
        let body = self.get(&status_path(&self.rpc_base))?;
        parse_status(&body)
    }

    /// The chain id (alloy `Provider::get_chain_id` analogue), e.g. `clawchain-local`.
    pub fn chain_id(&self) -> ClawResult<String> {
        Ok(self.status()?.chain_id)
    }

    /// The latest committed block height (alloy `Provider::get_block_number` analogue).
    pub fn block_number(&self) -> ClawResult<u64> {
        Ok(self.status()?.block_number)
    }

    /// The balance of `addr` in `denom` (e.g. `uclaw`), as a decimal string.
    /// Returns `"0"` when the address holds none of that denom.
    pub fn get_balance(&self, addr: &str, denom: &str) -> ClawResult<String> {
        let body = self.get(&balance_query_path(&self.rest_base, addr))?;
        parse_balance(&body, denom)
    }

    /// Run a CosmWasm smart query against `contract` with a JSON message string,
    /// returning the contract's `data` payload as a [`serde_json::Value`].
    ///
    /// This is the Cosmos analogue of an alloy `eth_call` read — there is no EVM
    /// bytecode or ABI encoding involved; the message is a CosmWasm query schema.
    pub fn query_contract(
        &self,
        contract: &str,
        msg_json: &str,
    ) -> ClawResult<serde_json::Value> {
        let body = self.get(&smart_query_path(&self.rest_base, contract, msg_json))?;
        parse_smart_query(&body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Construction is offline; these assert the seam without touching the network.
    #[test]
    fn constructs_and_is_clonable() {
        let p = ClawProvider::new("http://localhost:26657", "http://localhost:1317");
        let _ = p.clone();
    }
}
