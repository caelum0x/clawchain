---
sidebar_position: 9
title: Oracle Module API
---

# Oracle Module API

The Oracle module provides decentralized price feeds from validator-submitted exchange rates, using a prevote/vote commit-reveal scheme with weighted median aggregation and miss-count slashing.

**Proto package:** `terra.oracle.v1beta1`
**Base path:** `/clawchain/oracle/v1beta1`

> Forked from Terra Classic v4.0.0. Proto package retains `terra.oracle.v1beta1` for wire compatibility.

---

## Denom Queries

### GET /clawchain/oracle/v1beta1/denoms/\{denom\}/exchange_rate

Returns the current exchange rate for a specific denom.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `denom` | string | The denom identifier (e.g., `uusd`) |

**Response:**

```json
{
  "exchange_rate": "1.500000000000000000"
}
```

---

### GET /clawchain/oracle/v1beta1/denoms/exchange_rates

Returns all active exchange rates.

**Response:**

```json
{
  "exchange_rates": [
    { "denom": "uusd", "exchange_rate": "1.500000000000000000" },
    { "denom": "uatom", "exchange_rate": "0.080000000000000000" },
    { "denom": "uusdt", "exchange_rate": "1.001000000000000000" },
    { "denom": "uusdc", "exchange_rate": "0.999800000000000000" },
    { "denom": "ubtc", "exchange_rate": "0.000015000000000000" },
    { "denom": "ueth", "exchange_rate": "0.000400000000000000" }
  ]
}
```

---

### GET /clawchain/oracle/v1beta1/denoms/\{denom\}/tobin_tax

Returns the Tobin tax (spread fee) for a specific denom.

**Response:**

```json
{
  "tobin_tax": "0.002500000000000000"
}
```

---

### GET /clawchain/oracle/v1beta1/denoms/tobin_taxes

Returns Tobin taxes for all whitelisted denoms.

**Response:**

```json
{
  "tobin_taxes": [
    { "denom": "uusd", "tobin_tax": "0.002500000000000000" },
    { "denom": "uatom", "tobin_tax": "0.002500000000000000" },
    { "denom": "ubtc", "tobin_tax": "0.010000000000000000" }
  ]
}
```

---

### GET /clawchain/oracle/v1beta1/denoms/actives

Returns the list of active denominations with exchange rates.

**Response:**

```json
{
  "actives": ["uusd", "uatom", "uusdt", "uusdc", "ubtc", "ueth"]
}
```

---

### GET /clawchain/oracle/v1beta1/denoms/vote_targets

Returns the list of denominations validators should vote on.

**Response:**

```json
{
  "vote_targets": ["uusd", "uatom", "uusdt", "uusdc", "ubtc", "ueth"]
}
```

---

## Validator Queries

### GET /clawchain/oracle/v1beta1/validators/\{validator_addr\}/feeder

Returns the delegated feeder address for a validator.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `validator_addr` | string | Validator operator address (`clawvaloper1...`) |

**Response:**

```json
{
  "feeder_addr": "claw1feeder..."
}
```

---

### GET /clawchain/oracle/v1beta1/validators/\{validator_addr\}/miss

Returns the miss counter for a validator in the current slash window.

**Response:**

```json
{
  "miss_counter": "5"
}
```

---

### GET /clawchain/oracle/v1beta1/validators/\{validator_addr\}/aggregate_prevote

Returns the pending aggregate prevote for a validator.

**Response:**

```json
{
  "aggregate_prevote": {
    "hash": "a1b2c3d4...",
    "voter": "clawvaloper1...",
    "submit_block": "12345"
  }
}
```

---

### GET /clawchain/oracle/v1beta1/validators/aggregate_prevotes

Returns all pending aggregate prevotes.

**Response:**

```json
{
  "aggregate_prevotes": [
    {
      "hash": "a1b2c3d4...",
      "voter": "clawvaloper1...",
      "submit_block": "12345"
    }
  ]
}
```

---

### GET /clawchain/oracle/v1beta1/validators/\{validator_addr\}/aggregate_vote

Returns the aggregate vote for a validator.

**Response:**

```json
{
  "aggregate_vote": {
    "exchange_rate_tuples": [
      { "denom": "uusd", "exchange_rate": "1.500000000000000000" },
      { "denom": "uatom", "exchange_rate": "0.080000000000000000" }
    ],
    "voter": "clawvaloper1..."
  }
}
```

---

### GET /clawchain/oracle/v1beta1/validators/aggregate_votes

Returns all aggregate votes.

---

## Parameters

### GET /clawchain/oracle/v1beta1/params

Returns the oracle module parameters.

**Response:**

```json
{
  "params": {
    "vote_period": "6",
    "vote_threshold": "0.500000000000000000",
    "reward_band": "0.020000000000000000",
    "reward_distribution_window": "6307200",
    "whitelist": [
      { "name": "uusd", "tobin_tax": "0.002500000000000000" },
      { "name": "uatom", "tobin_tax": "0.002500000000000000" },
      { "name": "uusdt", "tobin_tax": "0.002500000000000000" },
      { "name": "uusdc", "tobin_tax": "0.002500000000000000" },
      { "name": "ubtc", "tobin_tax": "0.010000000000000000" },
      { "name": "ueth", "tobin_tax": "0.010000000000000000" }
    ],
    "slash_fraction": "0.000100000000000000",
    "slash_window": "120960",
    "min_valid_per_window": "0.050000000000000000"
  }
}
```

---

## Transaction Messages

### MsgAggregateExchangeRatePrevote

Submit a hash commitment of exchange rates (phase 1 of commit-reveal).

```json
{
  "@type": "/terra.oracle.v1beta1.MsgAggregateExchangeRatePrevote",
  "hash": "sha256_hex_string",
  "feeder": "claw1...",
  "validator": "clawvaloper1..."
}
```

### MsgAggregateExchangeRateVote

Reveal exchange rates matching a previous prevote (phase 2).

```json
{
  "@type": "/terra.oracle.v1beta1.MsgAggregateExchangeRateVote",
  "salt": "random_salt",
  "exchange_rates": "1.5uusd,0.08uatom,1.001uusdt",
  "feeder": "claw1...",
  "validator": "clawvaloper1..."
}
```

### MsgDelegateFeedConsent

Delegate oracle vote submission rights to a feeder address.

```json
{
  "@type": "/terra.oracle.v1beta1.MsgDelegateFeedConsent",
  "operator": "clawvaloper1...",
  "delegate": "claw1feeder..."
}
```
