---
sidebar_position: 2
---

# Create a CW20 Token

CW20 is the Cosmos equivalent of ERC-20. Deploy your own fungible token on ClawChain.

## Overview

The CW20 standard defines a common interface for fungible tokens on CosmWasm chains. It supports:

- Token transfers
- Allowances (approve/transfer-from pattern)
- Minting and burning
- Token metadata (name, symbol, decimals)

## Steps

### 1. Clone the cw20-base contract

```bash
git clone https://github.com/CosmWasm/cw-plus.git
cd cw-plus/contracts/cw20-base
```

### 2. Compile the contract

```bash
cargo wasm
```

Or use the optimizer for production:

```bash
docker run --rm -v "$(pwd)":/code cosmwasm/optimizer:0.16.0
```

### 3. Upload the contract code

```bash
clawchaind tx wasm store artifacts/cw20_base.wasm \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.3
```

### 4. Instantiate your token

Configure the token name, symbol, decimals, and initial balances:

```bash
clawchaind tx wasm instantiate CODE_ID '{
  "name": "My Token",
  "symbol": "MYT",
  "decimals": 6,
  "initial_balances": [
    {
      "address": "claw1...",
      "amount": "1000000000000"
    }
  ],
  "mint": {
    "minter": "claw1...",
    "cap": "10000000000000"
  }
}' --label "my-token" --from mykey --admin mykey
```

### 5. Interact with your token

**Check balance:**

```bash
clawchaind query wasm contract-state smart CONTRACT_ADDR \
  '{"balance": {"address": "claw1..."}}'
```

**Transfer tokens:**

```bash
clawchaind tx wasm execute CONTRACT_ADDR '{
  "transfer": {
    "recipient": "claw1recipient...",
    "amount": "1000000"
  }
}' --from mykey
```

**Set allowance:**

```bash
clawchaind tx wasm execute CONTRACT_ADDR '{
  "increase_allowance": {
    "spender": "claw1spender...",
    "amount": "500000"
  }
}' --from mykey
```

**Query token info:**

```bash
clawchaind query wasm contract-state smart CONTRACT_ADDR \
  '{"token_info": {}}'
```

## Using the SDK

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Query CW20 balance
const balance = await client.queryContract(tokenAddr, {
  balance: { address: "claw1..." },
});

// Transfer CW20 tokens
await client.executeContract(
  tokenAddr,
  {
    transfer: {
      recipient: "claw1recipient...",
      amount: "1000000",
    },
  },
  signer
);
```

## Token Parameters Reference

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Human-readable token name |
| `symbol` | string | Token ticker symbol (3-12 chars) |
| `decimals` | number | Decimal places (typically 6) |
| `initial_balances` | array | List of `{address, amount}` pairs |
| `mint.minter` | string | Address allowed to mint new tokens |
| `mint.cap` | string | Maximum total supply (optional) |
