//! The alloy-style [`ClawProvider`]: a thin blocking HTTP wrapper that wires the
//! pure builders/parsers in [`crate::query`] to live Tendermint RPC + Cosmos REST.

use crate::error::{ClawError, ClawResult};
use crate::query::{
    account_query_path, balance_query_path, broadcast_rpc_body, parse_account, parse_balance,
    parse_broadcast_result, parse_smart_query, parse_status, smart_query_path, status_path,
    AccountInfo, BroadcastMode, StatusInfo,
};
use crate::signer::ClawSigner;
use crate::tx::{build_and_sign, build_msg_execute, build_msg_send, compute_fee, TxContext};

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
    pub fn query_contract(&self, contract: &str, msg_json: &str) -> ClawResult<serde_json::Value> {
        let body = self.get(&smart_query_path(&self.rest_base, contract, msg_json))?;
        parse_smart_query(&body)
    }

    // --- Write path -------------------------------------------------------

    /// Fetch an account's number + sequence from Cosmos auth REST.
    pub fn account(&self, addr: &str) -> ClawResult<AccountInfo> {
        let body = self.get(&account_query_path(&self.rest_base, addr))?;
        parse_account(&body)
    }

    /// Assemble the on-chain [`TxContext`] for `signer`: chain id from Tendermint
    /// status, account number + sequence from auth REST, and the fee computed
    /// from `gas_limit` * `gas_price` (e.g. `"0.0001uclaw"`).
    ///
    /// This is the single network-touching step before the pure build/sign path.
    fn tx_context(
        &self,
        signer: &ClawSigner,
        gas_limit: u64,
        gas_price: &str,
        memo: &str,
    ) -> ClawResult<TxContext> {
        let chain_id = self.chain_id()?;
        let acct = self.account(&signer.address())?;
        let (fee_amount, fee_denom) = compute_fee(gas_limit, gas_price)?;
        Ok(TxContext {
            chain_id,
            account_number: acct.account_number,
            sequence: acct.sequence,
            gas_limit,
            fee_amount,
            fee_denom,
            memo: memo.to_string(),
        })
    }

    /// POST a JSON-RPC body to the RPC root and return the response text.
    fn post_rpc(&self, body: String) -> ClawResult<String> {
        let resp = self
            .client
            .post(self.rpc_base.trim_end_matches('/'))
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .map_err(|e| ClawError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| ClawError::Http(e.to_string()))?;
        resp.text().map_err(|e| ClawError::Http(e.to_string()))
    }

    /// Broadcast signed tx bytes in the given mode via JSON-RPC POST (no URL-length
    /// limit — safe for large txs like a CosmWasm `store`). Returns the tx hash.
    pub fn broadcast_with_mode(&self, tx_bytes: &[u8], mode: BroadcastMode) -> ClawResult<String> {
        let body = self.post_rpc(broadcast_rpc_body(mode, tx_bytes))?;
        parse_broadcast_result(&body)
    }

    /// Default broadcast: JSON-RPC POST in `Sync` mode (waits for CheckTx admission).
    fn broadcast(&self, tx_bytes: &[u8]) -> ClawResult<String> {
        self.broadcast_with_mode(tx_bytes, BroadcastMode::Sync)
    }

    /// Sign and broadcast a bank `MsgSend` (`signer` -> `to`, `amount` of `denom`).
    ///
    /// Uses SIGN_MODE_DIRECT. `gas_limit` and `gas_price` (e.g. `"0.0001uclaw"`)
    /// drive the fee. Returns the broadcast tx hash on success.
    pub fn send(
        &self,
        signer: &ClawSigner,
        to: &str,
        amount: u128,
        denom: &str,
        gas_limit: u64,
        gas_price: &str,
    ) -> ClawResult<String> {
        let ctx = self.tx_context(signer, gas_limit, gas_price, "")?;
        let msg = build_msg_send(signer.account_id(), to, amount, denom)?;
        let bytes = build_and_sign(signer, msg, &ctx)?;
        self.broadcast(&bytes)
    }

    /// Sign and broadcast a CosmWasm `MsgExecuteContract`.
    ///
    /// `msg_json` is the execute message; `funds` optionally attaches a single
    /// coin `(amount, denom)`. Returns the broadcast tx hash on success.
    pub fn execute_contract(
        &self,
        signer: &ClawSigner,
        contract: &str,
        msg_json: &str,
        funds: Option<(u128, &str)>,
        gas_limit: u64,
        gas_price: &str,
    ) -> ClawResult<String> {
        let ctx = self.tx_context(signer, gas_limit, gas_price, "")?;
        let msg = build_msg_execute(signer.account_id(), contract, msg_json, funds)?;
        let bytes = build_and_sign(signer, msg, &ctx)?;
        self.broadcast(&bytes)
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
