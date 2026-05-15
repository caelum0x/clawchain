---
sidebar_position: 2
---

# Deploy Your First Smart Contract

This tutorial walks you through writing, compiling, uploading, and interacting with a CosmWasm smart contract on ClawChain. You will deploy a CW20 fungible token and interact with it via the CLI, `clawd`, and the TypeScript SDK.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | >= 1.75 | Compile contracts |
| wasm32-unknown-unknown target | -- | WASM compilation target |
| Docker | >= 24 | Run the CosmWasm optimizer |
| clawchaind | latest | Upload and interact with contracts |
| clawd | latest | Query contract state |
| cargo-generate (optional) | >= 0.18 | Scaffold new contracts |

### Install Rust and the WASM target

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Set stable as default and add the WASM target
rustup default stable
rustup target add wasm32-unknown-unknown
```

### Install cargo-generate (optional)

```bash
cargo install cargo-generate
```

## Step 1: Create a CW20 token contract

You have two options: use the official CosmWasm template or clone the `cw-plus` contracts.

### Option A: Scaffold from template

```bash
cargo generate --git https://github.com/CosmWasm/cw-template.git --name my-token
cd my-token
```

### Option B: Use the cw20-base contract directly

```bash
git clone https://github.com/CosmWasm/cw-plus.git
cd cw-plus/contracts/cw20-base
```

For this tutorial we will use Option B, which gives you a production-ready CW20 token.

## Step 2: Understand the contract structure

A CosmWasm contract has four key files:

```
src/
  contract.rs    # Entry points: instantiate, execute, query, migrate
  error.rs       # Custom error types
  msg.rs         # Message types (InstantiateMsg, ExecuteMsg, QueryMsg)
  state.rs       # State storage definitions
  lib.rs         # Module exports and entry_point macros
Cargo.toml       # Dependencies and features
```

The three entry points are:

- **`instantiate`** -- Called once when the contract is created. Sets up initial state.
- **`execute`** -- Called for state-changing operations (transfers, mints, burns).
- **`query`** -- Called for read-only operations (balance checks, token info). No gas cost for queries.

## Step 3: Compile to WASM

Build the contract in release mode with the WASM target:

```bash
cargo wasm
```

This is an alias (defined in `.cargo/config`) for:

```bash
RUSTFLAGS='-C link-arg=-s' cargo build --release --target wasm32-unknown-unknown
```

The compiled binary is at `target/wasm32-unknown-unknown/release/cw20_base.wasm`.

Check the size:

```bash
ls -lh target/wasm32-unknown-unknown/release/cw20_base.wasm
```

Expected output:

```
-rwxr-xr-x 1 user staff 1.8M Mar  9 12:00 cw20_base.wasm
```

:::tip Unoptimized binaries are large
The raw WASM binary is typically 1-2 MB. The optimizer in the next step reduces it to ~200 KB, which saves significant gas on upload.
:::

## Step 4: Optimize with the CosmWasm optimizer

The CosmWasm optimizer produces a deterministic, stripped binary suitable for on-chain deployment:

```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.16.0
```

This creates `artifacts/cw20_base.wasm`:

```bash
ls -lh artifacts/cw20_base.wasm
```

Expected output:

```
-rw-r--r-- 1 user staff 207K Mar  9 12:01 artifacts/cw20_base.wasm
```

The optimizer also generates `artifacts/checksums.txt` for reproducible builds:

```bash
cat artifacts/checksums.txt
```

```
a1b2c3d4...  cw20_base.wasm
```

## Step 5: Upload the contract code

Upload the optimized WASM binary to ClawChain. This stores the bytecode on-chain and assigns it a `code_id`:

```bash
clawchaind tx wasm store artifacts/cw20_base.wasm \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.3 \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

Expected output:

```yaml
code: 0
txhash: D4E5F6A7B8C9...
logs:
  - events:
    - type: store_code
      attributes:
        - key: code_id
          value: "1"
        - key: code_checksum
          value: "a1b2c3d4..."
```

Note the `code_id` (in this example, `1`). You will need it for instantiation.

### Verify the upload

```bash
clawchaind query wasm code 1 \
  --node https://rpc.testnet.clawchain.io:26657
```

Or using `clawd`:

```bash
clawd wasm code-info 1
```

Expected output:

```
Code #1

  Creator:                claw1abc123...
  Data Hash:              a1b2c3d4e5f6...
  Instantiate Permission: Everybody
```

## Step 6: Instantiate the contract

Create an instance of your CW20 token. The instantiation message configures the token name, symbol, decimals, initial supply, and optional minting authority:

```bash
clawchaind tx wasm instantiate 1 '{
  "name": "ClawCoin",
  "symbol": "CCOIN",
  "decimals": 6,
  "initial_balances": [
    {
      "address": "claw1abc123def456ghi789jkl012mno345pqr678st",
      "amount": "1000000000000"
    }
  ],
  "mint": {
    "minter": "claw1abc123def456ghi789jkl012mno345pqr678st",
    "cap": "10000000000000"
  }
}' \
  --label "clawcoin-v1" \
  --from mykey \
  --admin claw1abc123def456ghi789jkl012mno345pqr678st \
  --gas auto \
  --gas-adjustment 1.3 \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

Expected output:

```yaml
code: 0
txhash: E5F6A7B8C9D0...
logs:
  - events:
    - type: instantiate
      attributes:
        - key: _contract_address
          value: "claw1contractaddr..."
        - key: code_id
          value: "1"
```

Note the `_contract_address` from the events -- this is your deployed contract address.

### Verify the contract

```bash
clawd wasm contract claw1contractaddr...
```

Expected output:

```
Contract claw1contractaddr...

  Address:  claw1contractaddr...
  Code ID:  1
  Creator:  claw1abc123...
  Admin:    claw1abc123...
  Label:    clawcoin-v1
```

## Step 7: Query contract state

### Query token info

```bash
clawchaind query wasm contract-state smart claw1contractaddr... \
  '{"token_info": {}}' \
  --node https://rpc.testnet.clawchain.io:26657
```

Expected output:

```json
{
  "data": {
    "name": "ClawCoin",
    "symbol": "CCOIN",
    "decimals": 6,
    "total_supply": "1000000000000"
  }
}
```

### Query a balance

```bash
clawchaind query wasm contract-state smart claw1contractaddr... \
  '{"balance": {"address": "claw1abc123def456ghi789jkl012mno345pqr678st"}}' \
  --node https://rpc.testnet.clawchain.io:26657
```

Expected output:

```json
{
  "data": {
    "balance": "1000000000000"
  }
}
```

### Using clawd to query

```bash
clawd wasm query claw1contractaddr... '{"token_info": {}}'
```

Expected output:

```
Query Result:

{
  "name": "ClawCoin",
  "symbol": "CCOIN",
  "decimals": 6,
  "total_supply": "1000000000000"
}
```

## Step 8: Execute messages

### Transfer tokens

```bash
clawchaind tx wasm execute claw1contractaddr... '{
  "transfer": {
    "recipient": "claw1recipient...",
    "amount": "1000000"
  }
}' \
  --from mykey \
  --gas auto \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

### Mint new tokens (if you are the minter)

```bash
clawchaind tx wasm execute claw1contractaddr... '{
  "mint": {
    "recipient": "claw1abc123...",
    "amount": "500000000000"
  }
}' \
  --from mykey \
  --gas auto \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

### Set an allowance

```bash
clawchaind tx wasm execute claw1contractaddr... '{
  "increase_allowance": {
    "spender": "claw1spender...",
    "amount": "100000000",
    "expires": {
      "at_height": 200000
    }
  }
}' \
  --from mykey \
  --gas auto \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

### Burn tokens

```bash
clawchaind tx wasm execute claw1contractaddr... '{
  "burn": {
    "amount": "50000000"
  }
}' \
  --from mykey \
  --gas auto \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

## Step 9: Use clawd wasm commands

The `clawd` CLI provides read-only wasm query commands that are simpler than raw `clawchaind` queries.

### List all uploaded codes

```bash
clawd wasm list-code
```

Expected output:

```
Uploaded Contract Codes

  Code ID  Creator          Data Hash          Instantiate Permission
  1        claw1abc1...     a1b2c3d4e5f6...    Everybody
```

### List contracts for a code ID

```bash
clawd wasm list-contracts 1
```

Expected output:

```
Contracts for Code ID 1

  #  Contract Address
  1  claw1contractaddr...
```

### View contract history

```bash
clawd wasm history claw1contractaddr...
```

Expected output:

```
Contract History: claw1contractaddr...

  Operation    Code ID  Message
  CONTRACT_CODE_HISTORY_OPERATION_TYPE_INIT  1  {"name":"ClawCoin","symbol":"CCOIN"...
```

## Step 10: Use the SDK programmatically

The `@clawchain/sdk` provides full wasm support for TypeScript applications.

### Install the SDK

```bash
npm install @clawchain/sdk
```

### Upload a contract

```typescript
import { ClawChainClient } from "@clawchain/sdk";
import { readFileSync } from "fs";

const client = await ClawChainClient.connectWithMnemonic(
  "https://rpc.testnet.clawchain.io:26657",
  "your mnemonic words here...",
);

// Read the optimized WASM binary
const wasmBytecode = new Uint8Array(readFileSync("artifacts/cw20_base.wasm"));

// Upload
const uploadResult = await client.uploadContract(
  client.signerAddress!,
  wasmBytecode,
);

console.log("Code ID:", uploadResult.codeId);
console.log("Tx Hash:", uploadResult.transactionHash);
```

### Instantiate a contract

```typescript
const initMsg = {
  name: "ClawCoin",
  symbol: "CCOIN",
  decimals: 6,
  initial_balances: [
    {
      address: client.signerAddress!,
      amount: "1000000000000",
    },
  ],
  mint: {
    minter: client.signerAddress!,
    cap: "10000000000000",
  },
};

const instantiateResult = await client.instantiateContract(
  client.signerAddress!,
  uploadResult.codeId,
  initMsg,
  "clawcoin-v1",
  { admin: client.signerAddress! },
);

console.log("Contract Address:", instantiateResult.contractAddress);
```

### Query contract state

```typescript
// Query token info (no gas cost)
const tokenInfo = await client.queryContract(
  instantiateResult.contractAddress,
  { token_info: {} },
);
console.log("Token Info:", tokenInfo);
// { name: "ClawCoin", symbol: "CCOIN", decimals: 6, total_supply: "1000000000000" }

// Query balance
const balance = await client.queryContract(
  instantiateResult.contractAddress,
  { balance: { address: client.signerAddress! } },
);
console.log("Balance:", balance);
// { balance: "1000000000000" }
```

### Execute a transfer

```typescript
const execResult = await client.executeContract(
  client.signerAddress!,
  instantiateResult.contractAddress,
  {
    transfer: {
      recipient: "claw1recipient...",
      amount: "5000000",
    },
  },
);

console.log("Transfer Tx:", execResult.transactionHash);
console.log("Gas Used:", execResult.gasUsed);
```

### Full working example

Here is a complete script that deploys and interacts with a CW20 token:

```typescript
import { ClawChainClient } from "@clawchain/sdk";
import { readFileSync } from "fs";

async function main() {
  // 1. Connect
  const client = await ClawChainClient.connectWithMnemonic(
    "https://rpc.testnet.clawchain.io:26657",
    process.env.MNEMONIC!,
  );
  const sender = client.signerAddress!;
  console.log("Connected as:", sender);

  // 2. Upload
  const wasm = new Uint8Array(readFileSync("artifacts/cw20_base.wasm"));
  const { codeId } = await client.uploadContract(sender, wasm);
  console.log("Uploaded code ID:", codeId);

  // 3. Instantiate
  const { contractAddress } = await client.instantiateContract(
    sender,
    codeId,
    {
      name: "ClawCoin",
      symbol: "CCOIN",
      decimals: 6,
      initial_balances: [{ address: sender, amount: "1000000000" }],
    },
    "clawcoin-sdk-demo",
  );
  console.log("Contract:", contractAddress);

  // 4. Query
  const info = await client.queryContract(contractAddress, { token_info: {} });
  console.log("Token:", info);

  // 5. Transfer
  const tx = await client.executeContract(sender, contractAddress, {
    transfer: { recipient: "claw1recipient...", amount: "100000" },
  });
  console.log("Transfer tx:", tx.transactionHash);

  // 6. Verify
  const bal = await client.queryContract(contractAddress, {
    balance: { address: sender },
  });
  console.log("Remaining balance:", bal);
}

main().catch(console.error);
```

Run it:

```bash
MNEMONIC="your mnemonic here" npx tsx deploy-token.ts
```

## Common issues

### "out of gas"

Increase the gas adjustment when uploading large contracts:

```bash
clawchaind tx wasm store contract.wasm \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices 0.025uclaw
```

### "wasm32-unknown-unknown target not found"

Install the WASM target:

```bash
rustup target add wasm32-unknown-unknown
```

### "contract is not admin"

Only the contract admin can migrate or update admin. Set `--admin` during instantiation:

```bash
clawchaind tx wasm instantiate CODE_ID '{}' \
  --label "my-contract" \
  --from mykey \
  --admin $(clawchaind keys show mykey -a)
```

### "instantiate permission denied"

The code uploader can restrict who can instantiate. By default, anyone can. If restricted, only the uploader or governance can instantiate.

## What's next?

- [Create a DEX Pool](/docs/tutorials/create-dex-pool) -- Use your CW20 token in a trading pair
- [Smart Contracts Overview](/docs/smart-contracts/overview) -- CosmWasm architecture on ClawChain
- [CW20 Token Reference](/docs/smart-contracts/cw20-token) -- Full CW20 parameter reference
- [TypeScript SDK](/docs/sdk/overview) -- Complete SDK documentation
