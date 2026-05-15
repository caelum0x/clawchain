---
sidebar_position: 1
---

# Smart Contracts on ClawChain

ClawChain supports CosmWasm smart contracts -- write contracts in Rust, compile to WASM, deploy on-chain.

## Why CosmWasm?

- **Memory-safe Rust contracts** -- no reentrancy bugs, no buffer overflows
- **IBC-enabled contracts** out of the box -- your contracts can send and receive cross-chain messages
- **Deterministic execution** -- same input always produces same output across all validators
- **Battle-tested** across the Cosmos ecosystem (Osmosis, Neutron, Stargaze, and more)
- **Actor model** -- contracts communicate via messages, not shared state, eliminating an entire class of bugs

## Prerequisites

Install the Rust toolchain with the WASM target:

```bash
rustup default stable
rustup target add wasm32-unknown-unknown
```

The `wasmd` tools are included in `clawchaind` -- no additional installation needed.

## Quick Deploy

### 1. Write your contract in Rust

Create a new contract project:

```bash
cargo generate --git https://github.com/CosmWasm/cw-template.git --name my-contract
cd my-contract
```

### 2. Compile to WASM

```bash
cargo wasm
```

### 3. Optimize the binary

Use the CosmWasm optimizer for a production-ready binary:

```bash
docker run --rm -v "$(pwd)":/code cosmwasm/optimizer:0.16.0
```

This produces `artifacts/my_contract.wasm` optimized for on-chain storage.

### 4. Upload the contract code

```bash
clawchaind tx wasm store artifacts/my_contract.wasm \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.3
```

Note the `code_id` from the transaction response.

### 5. Instantiate a contract instance

```bash
clawchaind tx wasm instantiate CODE_ID \
  '{"count": 0}' \
  --label "my-contract" \
  --from mykey \
  --admin mykey \
  --gas auto
```

### 6. Execute a transaction

```bash
clawchaind tx wasm execute CONTRACT_ADDR \
  '{"increment": {}}' \
  --from mykey
```

### 7. Query state

```bash
clawchaind query wasm contract-state smart CONTRACT_ADDR \
  '{"get_count": {}}'
```

## Contract Structure

A typical CosmWasm contract has this structure:

```
my-contract/
  src/
    contract.rs    # Entry points: instantiate, execute, query
    error.rs       # Custom error types
    msg.rs         # Message types (InstantiateMsg, ExecuteMsg, QueryMsg)
    state.rs       # State storage definitions
    lib.rs         # Module exports
  Cargo.toml
```

## Using the SDK

You can also interact with contracts through the TypeScript SDK:

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Upload contract
const codeId = await client.uploadContract(wasmBinary, signer);

// Instantiate
const contractAddr = await client.instantiateContract(
  codeId,
  { count: 0 },
  "my-contract",
  signer
);

// Execute
await client.executeContract(contractAddr, { increment: {} }, signer);

// Query
const state = await client.queryContract(contractAddr, { get_count: {} });
```

## Next Steps

- [Create a CW20 Token](/docs/smart-contracts/cw20-token) -- Deploy your own fungible token
- [CosmWasm Documentation](https://docs.cosmwasm.com) -- Official CosmWasm docs
