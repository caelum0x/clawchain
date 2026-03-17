---
sidebar_position: 9
title: Oracle Module API
---

# Oracle Module API

The Oracle module provides decentralized price feeds from validator-submitted exchange rates, using a prevote/vote commit-reveal scheme with TWAP calculation and miss-count slashing.

**Proto package:** `clawchain.oracle.v1`
**Base path:** `/clawchain/oracle/v1`

---

## Query Endpoints

### GET /clawchain/oracle/v1/price/\{denom_pair\}

Returns the current spot price and TWAP for a specific denom pair.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `denom_pair` | string | The denom pair identifier (e.g., `uclaw/uusd`) |

**Response:**

```json
{
  "price": {
    "denom_pair": "uclaw/uusd",
    "exchange_rate": "1.500000000000000000",
    "twap": "1.498500000000000000",
    "block_height": "12345",
    "timestamp": "2026-03-17T12:00:00Z"
  }
}
```

**Errors:**

| Code | Description |
|------|-------------|
| 400 | Invalid denom pair format |
| 404 | Denom pair not found or not whitelisted |

---

### GET /clawchain/oracle/v1/prices

Returns current prices for all whitelisted denom pairs.

**Response:**

```json
{
  "prices": [
    {
      "denom_pair": "uclaw/uusd",
      "exchange_rate": "1.500000000000000000",
      "twap": "1.498500000000000000",
      "block_height": "12345",
      "timestamp": "2026-03-17T12:00:00Z"
    },
    {
      "denom_pair": "uclaw/uatom",
      "exchange_rate": "0.080000000000000000",
      "twap": "0.079800000000000000",
      "block_height": "12345",
      "timestamp": "2026-03-17T12:00:00Z"
    }
  ]
}
```

---

### GET /clawchain/oracle/v1/price_history/\{denom_pair\}

Returns historical price records for a denom pair, ordered by block height descending.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `denom_pair` | string | The denom pair identifier (e.g., `uclaw/uusd`) |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | uint64 | 100 | Maximum number of records to return |

**Response:**

```json
{
  "history": [
    {
      "denom_pair": "uclaw/uusd",
      "exchange_rate": "1.500000000000000000",
      "twap": "1.498500000000000000",
      "block_height": "12345",
      "timestamp": "2026-03-17T12:00:00Z"
    },
    {
      "denom_pair": "uclaw/uusd",
      "exchange_rate": "1.495000000000000000",
      "twap": "1.497000000000000000",
      "block_height": "12340",
      "timestamp": "2026-03-17T11:59:30Z"
    }
  ]
}
```

**Errors:**

| Code | Description |
|------|-------------|
| 400 | Invalid denom pair format |
| 404 | Denom pair not found or no history available |

---

### GET /clawchain/oracle/v1/params

Returns the oracle module parameters.

**Response:**

```json
{
  "params": {
    "vote_period": "5",
    "vote_threshold": "0.500000000000000000",
    "reward_band": "0.020000000000000000",
    "slash_fraction": "0.000100000000000000",
    "slash_window": "100800",
    "min_valid_per_window": "0.050000000000000000",
    "whitelist": [
      { "name": "uclaw/uusd" },
      { "name": "uclaw/uatom" }
    ]
  }
}
```

---

### GET /clawchain/oracle/v1/feeder/\{validator\}

Returns the delegated feeder address for a validator. If no feeder has been delegated, the validator's own operator address is returned.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `validator` | string | Validator operator address (e.g., `clawvaloper1abc...`) |

**Response:**

```json
{
  "feeder_address": "claw1feeder..."
}
```

**Errors:**

| Code | Description |
|------|-------------|
| 400 | Invalid validator address |
| 404 | Validator not found |

---

### GET /clawchain/oracle/v1/miss/\{validator\}

Returns the miss counter for a validator in the current slash window. The counter resets at the end of each slash window.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `validator` | string | Validator operator address (e.g., `clawvaloper1abc...`) |

**Response:**

```json
{
  "miss_counter": "42"
}
```

**Errors:**

| Code | Description |
|------|-------------|
| 400 | Invalid validator address |
| 404 | Validator not found |

---

## Transaction Messages

### MsgAggregateExchangeRatePrevote

Submit a hash commitment of exchange rates (phase 1 of the commit-reveal scheme).

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `hash` | string | SHA256 hash: `SHA256(salt + ":" + exchange_rates + ":" + validator_address)` |
| `feeder` | string | Address of the feeder submitting the prevote |
| `validator` | string | Validator operator address being voted for |

**Example:**

```json
{
  "@type": "/clawchain.oracle.v1.MsgAggregateExchangeRatePrevote",
  "hash": "a1b2c3d4e5f6...",
  "feeder": "claw1feeder...",
  "validator": "clawvaloper1abc..."
}
```

---

### MsgAggregateExchangeRateVote

Reveal exchange rates matching a previous prevote (phase 2).

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `salt` | string | The salt used in the prevote hash |
| `exchange_rates` | string | Comma-separated `denom:rate` pairs (e.g., `uclaw/uusd:1.5,uclaw/uatom:0.08`) |
| `feeder` | string | Address of the feeder submitting the vote |
| `validator` | string | Validator operator address |

**Example:**

```json
{
  "@type": "/clawchain.oracle.v1.MsgAggregateExchangeRateVote",
  "salt": "random_salt_string",
  "exchange_rates": "uclaw/uusd:1.5,uclaw/uatom:0.08",
  "feeder": "claw1feeder...",
  "validator": "clawvaloper1abc..."
}
```

---

### MsgDelegateFeeder

Delegate oracle vote submission rights to a feeder address.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `validator` | string | Validator operator address (must be the signer) |
| `feeder_address` | string | Address authorized to submit prevotes and votes |

**Example:**

```json
{
  "@type": "/clawchain.oracle.v1.MsgDelegateFeeder",
  "validator": "clawvaloper1abc...",
  "feeder_address": "claw1feeder..."
}
```

---

### MsgUpdateParams

Update oracle module parameters. Restricted to the governance module authority.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `authority` | string | Governance module address |
| `params` | Params | Complete parameter object |

**Example:**

```json
{
  "@type": "/clawchain.oracle.v1.MsgUpdateParams",
  "authority": "claw10d07y265gmmuvt4z0w9aw880jnsr700j4zf3jf",
  "params": {
    "vote_period": "5",
    "vote_threshold": "0.500000000000000000",
    "reward_band": "0.020000000000000000",
    "slash_fraction": "0.000100000000000000",
    "slash_window": "100800",
    "min_valid_per_window": "0.050000000000000000",
    "whitelist": [
      { "name": "uclaw/uusd" },
      { "name": "uclaw/uatom" }
    ]
  }
}
```

---

## gRPC Service

```protobuf
service Query {
  rpc Price(QueryPriceRequest) returns (QueryPriceResponse);
  rpc Prices(QueryPricesRequest) returns (QueryPricesResponse);
  rpc PriceHistory(QueryPriceHistoryRequest) returns (QueryPriceHistoryResponse);
  rpc Params(QueryParamsRequest) returns (QueryParamsResponse);
  rpc FeederDelegation(QueryFeederDelegationRequest) returns (QueryFeederDelegationResponse);
  rpc MissCounter(QueryMissCounterRequest) returns (QueryMissCounterResponse);
}

service Msg {
  rpc AggregateExchangeRatePrevote(MsgAggregateExchangeRatePrevote) returns (MsgAggregateExchangeRatePrevoteResponse);
  rpc AggregateExchangeRateVote(MsgAggregateExchangeRateVote) returns (MsgAggregateExchangeRateVoteResponse);
  rpc DelegateFeeder(MsgDelegateFeeder) returns (MsgDelegateFeederResponse);
  rpc UpdateParams(MsgUpdateParams) returns (MsgUpdateParamsResponse);
}
```

**gRPC endpoint:** `localhost:9090`

```bash
# Query current prices via grpcurl
grpcurl -plaintext localhost:9090 clawchain.oracle.v1.Query/Prices

# Query price for a specific pair
grpcurl -plaintext -d '{"denom_pair": "uclaw/uusd"}' \
  localhost:9090 clawchain.oracle.v1.Query/Price

# Query oracle params
grpcurl -plaintext localhost:9090 clawchain.oracle.v1.Query/Params
```
