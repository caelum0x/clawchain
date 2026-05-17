# cosmwasm-inspector

CosmWasm contract analysis and inspection module for ClawChain.

## Overview

This crate provides tooling to analyze CosmWasm smart contract WASM binaries
without executing them. It complements Solar's Solidity compilation capabilities
by offering inspection and validation for the CosmWasm contract ecosystem.

## Features

- **Checksum computation** -- SHA-256 checksums matching `wasmd` on-chain format
- **Export detection** -- identifies entry points (instantiate, execute, query, migrate, IBC hooks)
- **Size analysis** -- reports binary size with optimization suggestions
- **Schema parsing** -- extracts contract interface from JSON schema
- **Deploy verification** -- compares local vs on-chain checksums

## Usage

```rust
use cosmwasm_inspector::{analyze_wasm, deployment_summary};

let wasm_bytes = std::fs::read("contract.wasm").unwrap();
let metadata = analyze_wasm(&wasm_bytes);
println!("{}", deployment_summary(&metadata));
```
