---
sidebar_position: 9
title: DEX / CosmWasm API
---

# DEX / CosmWasm Smart Query API

ClawChain integrates CosmWasm for smart contracts, including DEX (decentralized exchange) functionality. DEX contracts are queried via the standard CosmWasm smart query endpoint, with query messages encoded as base64 JSON.

---

## CosmWasm Base Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cosmwasm/wasm/v1/code` | List all uploaded Wasm code |
| GET | `/cosmwasm/wasm/v1/code/{code_id}` | Get code details (checksum, creator) |
| GET | `/cosmwasm/wasm/v1/code/{code_id}/contracts` | List contract instances for a code ID |
| GET | `/cosmwasm/wasm/v1/contract/{address}` | Get contract info (code ID, admin, label) |
| GET | `/cosmwasm/wasm/v1/contract/{address}/smart/{query}` | Query contract state (base64 JSON) |
| GET | `/cosmwasm/wasm/v1/contract/{address}/raw/{key}` | Get raw contract state by key |
| GET | `/cosmwasm/wasm/v1/contract/{address}/state` | Iterate all contract state |

---

## Smart Query Encoding

All smart contract queries use the endpoint:

```
GET /cosmwasm/wasm/v1/contract/{contract_address}/smart/{query_base64}
```

The `{query_base64}` path parameter is a **base64-encoded JSON query message**. To construct a query:

1. Write the JSON query message
2. Base64-encode it
3. Use as the path parameter

### Example

Query message:
```json
{"get_count":{}}
```

Base64-encoded:
```
eyJnZXRfY291bnQiOnt9fQ==
```

Full URL:
```
/cosmwasm/wasm/v1/contract/claw1contract.../smart/eyJnZXRfY291bnQiOnt9fQ==
```

### Shell Helper

```bash
# Encode a query
QUERY=$(echo -n '{"get_count":{}}' | base64)

# Execute
curl "https://api.clawchain.io/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${QUERY}"
```

---

## DEX Factory Contract Queries

The factory contract manages the creation and registration of trading pairs.

### Query: Pairs List

Returns all trading pairs registered in the factory.

```json
{"pairs":{"start_after":null,"limit":30}}
```

**Base64:** `eyJwYWlycyI6eyJzdGFydF9hZnRlciI6bnVsbCwibGltaXQiOjMwfX0=`

**Response:**

```json
{
  "data": {
    "pairs": [
      {
        "asset_infos": [
          {"native_token":{"denom":"uclaw"}},
          {"token":{"contract_addr":"claw1tokencontract..."}}
        ],
        "contract_addr": "claw1paircontract...",
        "liquidity_token": "claw1lptoken..."
      }
    ]
  }
}
```

### Query: Pair

Returns info for a specific trading pair.

```json
{
  "pair":{
    "asset_infos":[
      {"native_token":{"denom":"uclaw"}},
      {"token":{"contract_addr":"claw1tokencontract..."}}
    ]
  }
}
```

### Query: Config

Returns the factory configuration (owner, pair code ID, fee settings).

```json
{"config":{}}
```

**Response:**

```json
{
  "data": {
    "owner": "claw1admin...",
    "pair_code_id": 2,
    "token_code_id": 3,
    "default_fee_bps": 30
  }
}
```

---

## DEX Pair Contract Queries

Each trading pair has its own contract that manages the liquidity pool and swap operations.

### Query: Pool State

Returns the current state of the liquidity pool.

```json
{"pool":{}}
```

**Base64:** `eyJwb29sIjp7fX0=`

**Response:**

```json
{
  "data": {
    "assets": [
      {
        "info": {"native_token":{"denom":"uclaw"}},
        "amount": "1000000000"
      },
      {
        "info": {"token":{"contract_addr":"claw1token..."}},
        "amount": "5000000"
      }
    ],
    "total_share": "70710678"
  }
}
```

### Query: Simulation

Simulates a swap to get the expected return amount, spread, and commission.

```json
{
  "simulation":{
    "offer_asset":{
      "info":{"native_token":{"denom":"uclaw"}},
      "amount":"1000000"
    }
  }
}
```

**Response:**

```json
{
  "data": {
    "return_amount": "4985",
    "spread_amount": "10",
    "commission_amount": "15"
  }
}
```

### Query: Reverse Simulation

Given a desired output amount, calculates how much input is required.

```json
{
  "reverse_simulation":{
    "ask_asset":{
      "info":{"token":{"contract_addr":"claw1token..."}},
      "amount":"5000"
    }
  }
}
```

**Response:**

```json
{
  "data": {
    "offer_amount": "1003010",
    "spread_amount": "10",
    "commission_amount": "15"
  }
}
```

### Query: Pair Config

Returns the pair-specific configuration.

```json
{"config":{}}
```

**Response:**

```json
{
  "data": {
    "asset_infos": [...],
    "factory_addr": "claw1factory...",
    "liquidity_token": "claw1lptoken...",
    "fee_bps": 30,
    "owner": "claw1admin..."
  }
}
```

---

## DEX Router Contract Queries

The router contract handles multi-hop swaps across multiple trading pairs.

### Query: Router Config

Returns the router configuration.

```json
{"config":{}}
```

**Response:**

```json
{
  "data": {
    "factory_addr": "claw1factory...",
    "owner": "claw1admin..."
  }
}
```

### Query: Simulate Multi-Hop Swap

Simulates a multi-hop swap through multiple pairs.

```json
{
  "simulate_swap_operations":{
    "offer_amount":"1000000",
    "operations":[
      {
        "terra_swap":{
          "offer_asset_info":{"native_token":{"denom":"uclaw"}},
          "ask_asset_info":{"token":{"contract_addr":"claw1tokenA..."}}
        }
      },
      {
        "terra_swap":{
          "offer_asset_info":{"token":{"contract_addr":"claw1tokenA..."}},
          "ask_asset_info":{"token":{"contract_addr":"claw1tokenB..."}}
        }
      }
    ]
  }
}
```

**Response:**

```json
{
  "data": {
    "amount": "9850"
  }
}
```

---

## CW20 Token Queries

CW20 tokens on ClawChain can be queried through their contract addresses.

### Query: Balance

```json
{"balance":{"address":"claw1user..."}}
```

**Response:**

```json
{
  "data": {
    "balance": "5000000"
  }
}
```

### Query: Token Info

```json
{"token_info":{}}
```

**Response:**

```json
{
  "data": {
    "name": "ClawSwap Token",
    "symbol": "CSWP",
    "decimals": 6,
    "total_supply": "1000000000000"
  }
}
```

### Query: Allowance

```json
{"allowance":{"owner":"claw1owner...","spender":"claw1spender..."}}
```

---

## Transaction: Execute Contract

CosmWasm transactions (swaps, provide liquidity, etc.) are sent via the standard Cosmos tx broadcast with a `MsgExecuteContract` message.

```json
{
  "@type": "/cosmwasm.wasm.v1.MsgExecuteContract",
  "sender": "claw1user...",
  "contract": "claw1paircontract...",
  "msg": "<base64-encoded-execute-msg>",
  "funds": [
    {
      "denom": "uclaw",
      "amount": "1000000"
    }
  ]
}
```

### Example: Swap

Execute message (before base64 encoding):
```json
{
  "swap":{
    "offer_asset":{
      "info":{"native_token":{"denom":"uclaw"}},
      "amount":"1000000"
    },
    "max_spread":"0.01",
    "belief_price":"0.005"
  }
}
```

### Example: Provide Liquidity

```json
{
  "provide_liquidity":{
    "assets":[
      {
        "info":{"native_token":{"denom":"uclaw"}},
        "amount":"1000000"
      },
      {
        "info":{"token":{"contract_addr":"claw1token..."}},
        "amount":"5000"
      }
    ],
    "slippage_tolerance":"0.02"
  }
}
```
