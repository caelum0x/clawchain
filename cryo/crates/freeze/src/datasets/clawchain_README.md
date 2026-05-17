# ClawChain Data Extraction for Cryo

This directory contains Cosmos SDK / CometBFT dataset definitions that extend
Cryo with support for ClawChain data extraction.

## Datasets

| Dataset               | File                     | Description                                              |
|-----------------------|--------------------------|----------------------------------------------------------|
| `cosmos_blocks`       | `cosmos_blocks.rs`       | Block headers, proposer, tx count, chain ID              |
| `cosmos_txs`          | `cosmos_txs.rs`          | Transactions with msg type, sender, gas, fees            |
| `cosmos_events`       | `cosmos_events.rs`       | ABCI events with module-level filtering                  |
| `cosmos_agents`       | `cosmos_agents.rs`       | Agent registry: addresses, capabilities, reputation      |
| `cosmos_oracle`       | `cosmos_oracle.rs`       | Oracle price feeds and historical prices                 |
| `cosmos_privacy`      | `cosmos_privacy.rs`      | Privacy pool Merkle tree statistics                      |
| `cosmos_marketplace`  | `cosmos_marketplace.rs`  | Marketplace skill listings and ratings                   |
| `cosmos_governance`   | `cosmos_governance.rs`   | Governance proposals and vote tallies                    |

## Architecture

Unlike Ethereum datasets that use alloy providers and the `CollectByBlock` /
`CollectByTransaction` traits, these modules communicate directly with
CometBFT JSON-RPC endpoints and ClawChain REST API endpoints:

### CometBFT RPC (default port 26657)

- `/block?height=N` for block data
- `/tx_search?query="tx.height=N"` for transaction data
- `/block_results?height=N` for ABCI events

### ClawChain REST / LCD (default port 1317)

- `/clawchain/agent/v1/agents` for agent registry data
- `/clawchain/oracle/v1/prices` for current oracle prices
- `/clawchain/oracle/v1/price_history/{pair}` for historical price data
- `/clawchain/privacy/v1/tree_stats` for privacy pool statistics
- `/clawchain/marketplace/v1/skills` for marketplace skill listings
- `/clawchain/governance/v1/proposals` for governance proposals

Each module exposes:
1. **Row types** (`CosmosBlockRow`, `CosmosTxRow`, `CosmosEventRow`,
   `CosmosAgentRow`, `CosmosOracleRow`, `CosmosPrivacyRow`,
   `CosmosMarketplaceRow`, `CosmosGovernanceRow`) as serde-serializable structs.
2. **Fetch functions** that query CometBFT RPC or ClawChain REST and return
   vectors of rows. Paginated endpoints are followed automatically.
3. **CSV helpers** for quick text output.

## Module Filtering

`cosmos_events` supports filtering by ClawChain module:

- `Agent` - agent registration, task delegation, heartbeats, intents
- `Privacy` - shield, unshield, private transfers
- `Marketplace` - skill listings, escrows
- `Staking` - delegation, unbonding, redelegation
- `Governance` - proposals, votes, deposits
- `Dex` - CosmWasm execute / instantiate / wasm events

## RPC Endpoints

| Endpoint             | Default Port | Used By                                        |
|----------------------|--------------|------------------------------------------------|
| CometBFT RPC         | 26657        | `cosmos_blocks`, `cosmos_txs`, `cosmos_events` |
| Cosmos LCD / REST    | 1317         | `cosmos_agents`, `cosmos_oracle`, `cosmos_privacy`, `cosmos_marketplace`, `cosmos_governance` |

## Entry Point

The module declaration file is `cosmos_mod.rs`, which re-exports all eight
dataset modules.
