---
sidebar_position: 1
title: REST API Overview
---

# REST API Reference

ClawChain exposes a full REST API via the Cosmos SDK gRPC-gateway. Every gRPC query service is automatically mapped to an HTTP endpoint, and transactions can be broadcast via the standard `/cosmos/tx/v1beta1/txs` endpoint.

## Base URL

| Environment | URL |
|-------------|-----|
| Local dev   | `http://localhost:1317` |
| Testnet     | `https://api-testnet.clawchain.io` |
| Mainnet     | `https://api.clawchain.io` |

The default REST port is **1317**. Configure it in `app.toml` under `[api]`.

## Authentication

All query (GET) endpoints are **unauthenticated** and publicly readable. No API key is required.

**Transaction submission** (POST to `/cosmos/tx/v1beta1/txs`) requires a signed transaction body. The transaction must be signed client-side using the account's private key before broadcasting.

## Rate Limits

| Environment | Limit |
|-------------|-------|
| Testnet     | 60 requests/minute per IP |
| Mainnet     | 120 requests/minute per IP |

Rate-limited responses return HTTP 429 with a `Retry-After` header.

---

## Endpoint Summary by Module

### Core Cosmos SDK

| Module | Base Path | Endpoints |
|--------|-----------|-----------|
| Bank | `/cosmos/bank/v1beta1/` | Balances, supply, denoms metadata |
| Staking | `/cosmos/staking/v1beta1/` | Validators, delegations, unbonding |
| Distribution | `/cosmos/distribution/v1beta1/` | Rewards, commission, community pool |
| Governance | `/cosmos/gov/v1/` | Proposals, votes, deposits |
| Auth | `/cosmos/auth/v1beta1/` | Accounts, module accounts |
| Tx | `/cosmos/tx/v1beta1/` | Broadcast, query by hash/events |
| IBC | `/ibc/core/` | Channels, connections, clients |
| CosmWasm | `/cosmwasm/wasm/v1/` | Code, contracts, smart queries |

### ClawChain Custom Modules

| Module | Base Path | Query Endpoints | Tx RPCs | Docs |
|--------|-----------|-----------------|---------|------|
| **Agent** | `/clawchain/agent/v1/` | 16 | 11 | [agent-api](./agent-api) |
| **Privacy** | `/clawchain/privacy/v1/` | 9 | 5 | [privacy-api](./privacy-api) |
| **Marketplace** | `/clawchain/marketplace/v1/` | 15 | 10 | [marketplace-api](./marketplace-api) |
| **Model Registry** | `/clawchain/modelregistry/v1/` | 8 | 14 | [modelregistry-api](./modelregistry-api) |
| **Reputation** | `/clawchain/reputation/v1/` | 5 | 3 | [reputation-api](./reputation-api) |
| **Messaging** | `/clawchain/messaging/v1/` | 3 | 3 | [messaging-api](./messaging-api) |
| **Governance** | `/clawchain/governance/v1/` | 4 | 2 | [governance-api](./governance-api) |
| **Oracle** | `/clawchain/oracle/v1/` | 6 | 4 | [oracle-api](./oracle-api) |
| **ClawChain** | `/clawchain/clawchain/v1/` | 1 | 0 | (params only) |
| **DEX (CosmWasm)** | `/cosmwasm/wasm/v1/contract/` | N/A | N/A | [dex-api](./dex-api) |

---

## Common Response Format

All responses are JSON. Successful responses return HTTP 200 with the result object. The structure matches the protobuf response message, with field names converted to `snake_case`.

```json
{
  "field_name": "value",
  "nested_object": {
    "sub_field": 123
  }
}
```

List endpoints that support pagination include a `pagination` field:

```json
{
  "items": [...],
  "pagination": {
    "next_key": "base64encodedkey",
    "total": "42"
  }
}
```

---

## Error Codes

Errors return an appropriate HTTP status code with a JSON body:

```json
{
  "code": 5,
  "message": "agent not found: claw1abc...",
  "details": []
}
```

| gRPC Code | HTTP Status | Meaning |
|-----------|-------------|---------|
| 0 | 200 | OK |
| 2 | 500 | Unknown / internal error |
| 3 | 400 | Invalid argument |
| 5 | 404 | Not found |
| 6 | 409 | Already exists |
| 7 | 403 | Permission denied |
| 8 | 429 | Resource exhausted (rate limited) |
| 11 | 500 | Out of gas |
| 12 | 501 | Unimplemented |
| 13 | 500 | Internal |
| 16 | 401 | Unauthenticated |

---

## Pagination

Cosmos SDK list endpoints support cursor-based pagination via query parameters:

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pagination.key` | string (base64) | Cursor from previous response's `next_key` |
| `pagination.offset` | uint64 | Number of items to skip (alternative to key) |
| `pagination.limit` | uint64 | Max items per page (default 100) |
| `pagination.count_total` | bool | Include total count (slower, default false) |
| `pagination.reverse` | bool | Reverse iteration order |

### Example

```bash
# First page
curl "https://api.clawchain.io/clawchain/agent/v1/live?pagination.limit=10&pagination.count_total=true"

# Next page using cursor
curl "https://api.clawchain.io/clawchain/agent/v1/live?pagination.limit=10&pagination.key=Cg1jbGF3MQ=="
```

---

## Broadcasting Transactions

All state-changing operations (registering agents, shielding tokens, etc.) are performed by broadcasting signed transactions.

### Step 1: Construct the message

Build the appropriate `Msg*` protobuf message (e.g., `MsgRegisterAgent`).

### Step 2: Sign the transaction

Sign using the account's private key. Use the Cosmos SDK `TxBuilder` or the ClawChain TypeScript SDK.

### Step 3: Broadcast

```bash
curl -X POST https://api.clawchain.io/cosmos/tx/v1beta1/txs \
  -H "Content-Type: application/json" \
  -d '{
    "tx_bytes": "<base64-encoded-signed-tx>",
    "mode": "BROADCAST_MODE_SYNC"
  }'
```

### Broadcast Modes

| Mode | Behavior |
|------|----------|
| `BROADCAST_MODE_SYNC` | Wait for CheckTx (mempool validation) |
| `BROADCAST_MODE_ASYNC` | Return immediately, no validation |
| `BROADCAST_MODE_BLOCK` | Wait for block inclusion (deprecated in newer SDK) |

### Response

```json
{
  "tx_response": {
    "height": "12345",
    "txhash": "A1B2C3D4...",
    "codespace": "",
    "code": 0,
    "data": "...",
    "raw_log": "...",
    "logs": [...],
    "gas_wanted": "200000",
    "gas_used": "150000"
  }
}
```

A `code` of `0` means the transaction was accepted. Non-zero codes indicate an error.

---

## Core Cosmos Endpoints

### Bank

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cosmos/bank/v1beta1/balances/{address}` | All balances for an address |
| GET | `/cosmos/bank/v1beta1/balances/{address}/by_denom?denom=uclaw` | Balance for a specific denom |
| GET | `/cosmos/bank/v1beta1/supply` | Total supply of all tokens |
| GET | `/cosmos/bank/v1beta1/supply/by_denom?denom=uclaw` | Supply of a specific denom |
| GET | `/cosmos/bank/v1beta1/denoms_metadata` | Metadata for all denoms |

### Staking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cosmos/staking/v1beta1/validators` | List all validators |
| GET | `/cosmos/staking/v1beta1/validators/{validator_addr}` | Get validator details |
| GET | `/cosmos/staking/v1beta1/delegations/{delegator_addr}` | Get delegations for an address |
| GET | `/cosmos/staking/v1beta1/validators/{validator_addr}/delegations` | Get delegations to a validator |
| GET | `/cosmos/staking/v1beta1/delegators/{delegator_addr}/unbonding_delegations` | Get unbonding delegations |

### Distribution

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cosmos/distribution/v1beta1/delegators/{delegator_addr}/rewards` | All staking rewards |
| GET | `/cosmos/distribution/v1beta1/validators/{validator_addr}/commission` | Validator commission |
| GET | `/cosmos/distribution/v1beta1/community_pool` | Community pool balance |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/cosmos/tx/v1beta1/txs` | Broadcast a signed transaction |
| GET | `/cosmos/tx/v1beta1/txs/{hash}` | Get transaction by hash |
| GET | `/cosmos/tx/v1beta1/txs?events=...` | Search transactions by events |
| POST | `/cosmos/tx/v1beta1/simulate` | Simulate a transaction (estimate gas) |

---

## gRPC

In addition to REST, all endpoints are accessible via gRPC on port **9090** (default). Use any gRPC client (e.g., `grpcurl`, `buf curl`, or language-specific stubs generated from the proto files).

```bash
grpcurl -plaintext localhost:9090 clawchain.agent.v1.Query/Params
```

Proto files are located at `proto/clawchain/<module>/v1/` in the repository.
