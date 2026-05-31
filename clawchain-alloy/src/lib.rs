//! # clawchain-alloy
//!
//! An **alloy-style** provider for ClawChain.
//!
//! ## Why this is not "just point alloy at the chain"
//!
//! ClawChain is a **pure Cosmos SDK chain** — there is no `x/evm`, no Ethermint,
//! and no Ethereum JSON-RPC (`eth_*`) endpoint. The vendored `alloy/` crate is an
//! Ethereum client and **cannot talk to ClawChain as-is**. This crate therefore
//! implements **Option B** of `docs/plans/2026-05-31-vendored-integration.md`:
//! keep alloy's familiar `Provider` ergonomics, but back the read path with
//! **Tendermint RPC + Cosmos REST**, and contract reads with **CosmWasm smart
//! queries** — not `eth_call`.
//!
//! This crate is intentionally standalone, **outside** the vendored `alloy/`
//! workspace, which is a read-only reference.
//!
//! ## Scope: READ provider only
//!
//! Implemented here (see [`ClawProvider`]):
//! - [`ClawProvider::chain_id`] / [`ClawProvider::block_number`] from Tendermint
//!   `GET {rpc}/status`.
//! - [`ClawProvider::get_balance`] from Cosmos `GET {rest}/cosmos/bank/v1beta1/balances/{addr}`.
//! - [`ClawProvider::query_contract`] from CosmWasm
//!   `GET {rest}/cosmwasm/wasm/v1/contract/{contract}/smart/{base64(msg)}`.
//!
//! ## Write path (signing & tx submission)
//!
//! The V3 follow-up is now implemented: this crate can build, sign, and broadcast
//! Cosmos transactions backed by [`cosmrs`].
//! - [`ClawSigner`] wraps a secp256k1 key (32-byte hex) bound to the `claw`
//!   bech32 prefix and exposes its address.
//! - [`ClawProvider::send`] builds a bank `MsgSend`, signs with SIGN_MODE_DIRECT,
//!   and broadcasts.
//! - [`ClawProvider::execute_contract`] builds a CosmWasm `MsgExecuteContract`
//!   and broadcasts.
//!
//! Account number + sequence come from `GET {rest}/cosmos/auth/v1beta1/accounts/{addr}`,
//! the chain id from `/status`, and broadcast goes to Tendermint `/broadcast_tx_sync`.
//! Tx **building + signing** lives in pure functions in [`tx`]
//! ([`tx::build_sign_doc`], [`tx::sign_tx`], [`tx::encode_tx_bytes`],
//! [`tx::compute_fee`]) that take `chain_id`/`account_number`/`sequence`/fee as
//! plain params and return bytes/structs — **no network**, so the signing tests
//! run fully offline with a fixed key + fixed chain context.
//!
//! ## HTTP-agnostic seam
//!
//! All URL building and response parsing lives in [`query`] as pure functions
//! ([`query::parse_status`], [`query::parse_balance`], [`query::balance_query_path`],
//! [`query::smart_query_path`], ...). They are unit-tested **offline** with fixture
//! JSON — the test suite never hits the network. [`provider`] only adds the thin
//! `reqwest` blocking transport on top.
//!
//! ## Example
//!
//! ```no_run
//! use clawchain_alloy::ClawProvider;
//!
//! let provider = ClawProvider::new("http://localhost:26657", "http://localhost:1317");
//! let chain_id = provider.chain_id()?;
//! let height = provider.block_number()?;
//! let balance = provider.get_balance("claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h", "uclaw")?;
//! let cfg = provider.query_contract("claw1contract...", r#"{"config":{}}"#)?;
//! # Ok::<(), clawchain_alloy::ClawError>(())
//! ```

pub mod error;
pub mod provider;
pub mod query;
pub mod signer;
pub mod tx;

pub use error::{ClawError, ClawResult};
pub use provider::ClawProvider;
pub use query::{
    account_query_path, balance_query_path, broadcast_tx_sync_path, parse_account, parse_balance,
    parse_broadcast_sync, parse_smart_query, parse_status, smart_query_path, status_path,
    AccountInfo, Coin, StatusInfo,
};
pub use signer::{ClawSigner, CLAW_PREFIX};
pub use tx::{
    build_and_sign, build_msg_execute, build_msg_send, build_sign_doc, compute_fee,
    encode_tx_bytes, sign_tx, TxContext,
};
