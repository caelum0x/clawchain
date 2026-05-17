//! ClawChain / Cosmos SDK dataset modules for Cryo.
//!
//! Provides eight datasets that pull data from CometBFT RPC and
//! ClawChain REST API endpoints rather than Ethereum JSON-RPC:
//!
//! - [`cosmos_blocks`]      - Block headers and metadata (CometBFT RPC).
//! - [`cosmos_txs`]         - Transactions with message types and gas info (CometBFT RPC).
//! - [`cosmos_events`]      - ABCI events with module-level filtering (CometBFT RPC).
//! - [`cosmos_agents`]      - Agent registry: addresses, capabilities, reputation (REST).
//! - [`cosmos_oracle`]      - Oracle price feeds and historical prices (REST).
//! - [`cosmos_privacy`]     - Privacy pool Merkle tree statistics (REST).
//! - [`cosmos_marketplace`] - Marketplace skill listings and ratings (REST).
//! - [`cosmos_governance`]  - Governance proposals and vote tallies (REST).

pub mod cosmos_agents;
pub mod cosmos_blocks;
pub mod cosmos_events;
pub mod cosmos_governance;
pub mod cosmos_marketplace;
pub mod cosmos_oracle;
pub mod cosmos_privacy;
pub mod cosmos_txs;

#[cfg(test)]
mod cosmos_tests;

pub use cosmos_agents::*;
pub use cosmos_blocks::*;
pub use cosmos_events::*;
pub use cosmos_governance::*;
pub use cosmos_marketplace::*;
pub use cosmos_oracle::*;
pub use cosmos_privacy::*;
pub use cosmos_txs::*;
