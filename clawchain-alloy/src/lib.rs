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
//! ## Out of scope (follow-up): signing & tx submission
//!
//! This is a **read-provider slice**. Signing and broadcasting transactions
//! (bank `MsgSend`, CosmWasm `MsgExecuteContract`) is deliberately **NOT**
//! implemented here. Cosmos tx signing in Rust — SIGN_MODE_DIRECT, protobuf
//! `Any` packing, secp256k1 over the canonical sign-bytes, account/sequence
//! fetch, fee/gas estimation, and broadcast — is a substantial surface and is
//! left as an explicit follow-up. Do not assume a write path exists.
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

pub use error::{ClawError, ClawResult};
pub use provider::ClawProvider;
pub use query::{
    balance_query_path, parse_balance, parse_smart_query, parse_status, smart_query_path,
    status_path, Coin, StatusInfo,
};
