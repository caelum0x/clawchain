---
sidebar_position: 9
---

# Oracle Module (x/oracle)

The oracle module provides decentralized price feeds for ClawChain by aggregating exchange rate votes from validators. It uses a prevote/vote commit-reveal scheme to prevent front-running, computes time-weighted average prices (TWAP), and enforces slashing penalties for validators that fail to submit timely votes.

## Key Features

- **Prevote/vote commit-reveal** -- validators commit a hash of their exchange rates before revealing, preventing front-running
- **TWAP calculation** -- time-weighted average prices computed from validator submissions for robust pricing
- **Price history** -- historical price records stored on-chain for DeFi integrations and analytics
- **Miss counting** -- tracks how often validators fail to vote; excessive misses trigger slashing
- **Feeder delegation** -- validators can delegate price submission to a separate feeder address
- **Whitelist** -- governance-configurable list of supported denom pairs
- **Slashing enforcement** -- validators that miss too many vote windows are penalized

## Concepts

### Prevote/Vote Cycle

The oracle uses a two-phase commit-reveal scheme to prevent validators from copying each other's votes:

```
Phase 1: Prevote (commit)
    Validator submits hash(salt + exchange_rates + validator_addr)
            |
            v
Phase 2: Vote (reveal)
    Validator reveals salt + exchange_rates
    Chain verifies hash matches the prevote
            |
            v
EndBlock: Aggregate
    Compute weighted median of all revealed rates
    Update on-chain prices and TWAP
    Increment miss counter for non-voters
```

Each vote period lasts `VotePeriod` blocks (default 5). Validators must submit a prevote in one period and reveal the vote in the following period.

### Vote Aggregation

At the end of each vote period, the module:

1. Collects all valid vote reveals that match their prevotes
2. Computes the **weighted median** price using each validator's voting power as weight
3. Discards votes outside the `RewardBand` from the median
4. Updates the canonical on-chain price for each denom pair
5. Updates the TWAP using exponential moving average

### Time-Weighted Average Price (TWAP)

The TWAP smooths out short-term price volatility by maintaining a running weighted average:

```
TWAP_new = (TWAP_old * (window - 1) + spot_price) / window
```

This provides a manipulation-resistant reference price suitable for DeFi applications like liquidations, collateral valuation, and DEX pricing.

### Price History

The module stores historical price records indexed by denom pair and block height. Each record includes:

- **Spot price** -- the weighted median from the current vote period
- **TWAP** -- the time-weighted average at that block
- **Block height** -- when the price was recorded
- **Timestamp** -- UTC time of the block

History can be queried with a configurable limit for charting, analytics, and audit trails.

### Miss Counting and Slashing

Validators are expected to submit votes every period. When a validator misses a vote:

1. Their **miss counter** is incremented
2. At the end of each `SlashWindow`, the module checks if misses exceed the threshold
3. If `misses > SlashWindow * (1 - MinValidPerWindow)`, the validator is slashed by `SlashFraction`
4. The miss counter resets after each slash window

This ensures validators maintain reliable price feeds or face economic penalties.

### Feeder Delegation

Validators can delegate the price submission duty to a separate **feeder address**. This allows:

- The validator key to remain in cold storage (HSM/air-gapped)
- A hot wallet to submit frequent prevote/vote transactions
- Operational separation between consensus and oracle duties

Only the validator can set or change its feeder address via `MsgDelegateFeeder`.

## Messages

| Message | Description |
|---------|-------------|
| `MsgAggregateExchangeRatePrevote` | Submit a hash commitment of exchange rates (phase 1) |
| `MsgAggregateExchangeRateVote` | Reveal exchange rates matching a previous prevote (phase 2) |
| `MsgDelegateFeeder` | Delegate oracle vote submission to a feeder address |
| `MsgUpdateParams` | Governance-only: update oracle module parameters |

### MsgAggregateExchangeRatePrevote

Submits a hash of the exchange rates the validator intends to vote for. The hash is computed as:

```
hash = SHA256(salt + ":" + exchange_rates + ":" + validator_address)
```

Where `exchange_rates` is a comma-separated list of `denom:rate` pairs (e.g., `uclaw/uusd:1.5,uclaw/uatom:0.08`).

### MsgAggregateExchangeRateVote

Reveals the exchange rates and salt from the previous prevote. The chain verifies the hash matches. If the reveal does not match the committed prevote, the vote is rejected.

### MsgDelegateFeeder

Allows a validator to authorize a separate address to submit prevotes and votes on its behalf. Only the validator operator can call this message.

### MsgUpdateParams

Governance-controlled parameter update. Requires authority (typically the governance module account).

## Queries

| Query | Description |
|-------|-------------|
| `QueryPrice` | Get the current price for a specific denom pair |
| `QueryPrices` | Get current prices for all whitelisted denom pairs |
| `QueryPriceHistory` | Get historical price records for a denom pair |
| `QueryParams` | Get oracle module parameters |
| `QueryFeederDelegation` | Get the feeder address for a validator |
| `QueryMissCounter` | Get the miss counter for a validator |

## REST API Endpoints

### GET /clawchain/oracle/v1/price/{denom_pair}

Returns the current spot price and TWAP for a specific denom pair.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `denom_pair` | string | The denom pair (e.g., `uclaw/uusd`) |

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

### GET /clawchain/oracle/v1/price_history/{denom_pair}?limit=N

Returns historical price records for a denom pair, ordered by block height descending.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `denom_pair` | string | The denom pair (e.g., `uclaw/uusd`) |

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

### GET /clawchain/oracle/v1/feeder/{validator}

Returns the delegated feeder address for a validator.

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

### GET /clawchain/oracle/v1/miss/{validator}

Returns the miss counter for a validator in the current slash window.

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

## State Keys

| Key Prefix | Type | Description |
|------------|------|-------------|
| `p_oracle` | `Map[string, ExchangeRate]` | Current prices by denom pair |
| `pv_oracle` | `Map[string, AggregateExchangeRatePrevote]` | Pending prevotes by validator |
| `v_oracle` | `Map[string, AggregateExchangeRateVote]` | Pending votes by validator |
| `fd_oracle` | `Map[string, string]` | Feeder delegation (validator to feeder address) |
| `mc_oracle` | `Map[string, uint64]` | Miss counters by validator |
| `tw_oracle` | `Map[string, DecCoin]` | TWAP values by denom pair |
| `h_oracle` | `Map[string, PriceHistory]` | Historical price records |

## CLI Commands

The `clawd oracle` command group provides access to all oracle queries and transactions.

### Query Commands

```bash
# Get current price for a denom pair
clawd oracle price uclaw/uusd

# Get all current prices
clawd oracle prices

# Get price history with limit
clawd oracle history uclaw/uusd --limit 50

# Get oracle parameters
clawd oracle params

# Get feeder delegation for a validator
clawd oracle feeder clawvaloper1abc...

# Get miss counter for a validator
clawd oracle miss clawvaloper1abc...
```

### Transaction Commands

```bash
# Submit a prevote (typically done by automated feeder software)
clawd oracle prevote \
  --exchange-rates "uclaw/uusd:1.5,uclaw/uatom:0.08" \
  --salt "random_salt_string" \
  --validator clawvaloper1abc... \
  --from myfeeder

# Submit a vote (reveal phase)
clawd oracle vote \
  --exchange-rates "uclaw/uusd:1.5,uclaw/uatom:0.08" \
  --salt "random_salt_string" \
  --validator clawvaloper1abc... \
  --from myfeeder
```

### Native Chain CLI

```bash
# Query price via clawchaind
clawchaind query oracle price uclaw/uusd

# Query all prices
clawchaind query oracle prices

# Query price history
clawchaind query oracle price-history uclaw/uusd --limit 50

# Query oracle params
clawchaind query oracle params

# Delegate feeder
clawchaind tx oracle delegate-feeder claw1feeder... --from myvalidator

# Submit prevote
clawchaind tx oracle aggregate-exchange-rate-prevote \
  "hash_value" \
  --from myfeeder

# Submit vote
clawchaind tx oracle aggregate-exchange-rate-vote \
  "uclaw/uusd:1.5,uclaw/uatom:0.08" \
  "random_salt_string" \
  clawvaloper1abc... \
  --from myfeeder
```

## SDK Usage

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Get current price for a denom pair
const price = await client.getOraclePrice("uclaw/uusd");
console.log(`Spot: ${price.exchangeRate}, TWAP: ${price.twap}`);

// Get all current prices
const prices = await client.getOraclePrices();
prices.forEach((p) => {
  console.log(`${p.denomPair}: ${p.exchangeRate}`);
});

// Get price history
const history = await client.getOraclePriceHistory("uclaw/uusd", { limit: 50 });
history.forEach((h) => {
  console.log(`Block ${h.blockHeight}: ${h.exchangeRate}`);
});

// Get oracle parameters
const params = await client.getOracleParams();
console.log(`Vote period: ${params.votePeriod} blocks`);

// Get miss counter for a validator
const misses = await client.getOracleMissCounter("clawvaloper1abc...");
console.log(`Missed votes: ${misses}`);

// Get feeder delegation
const feeder = await client.getOracleFeederDelegation("clawvaloper1abc...");
console.log(`Feeder address: ${feeder}`);
```

## Parameters

All parameters are governance-configurable via `MsgUpdateParams`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `vote_period` | 5 | Number of blocks per oracle vote window (~30 seconds at 6s blocks) |
| `vote_threshold` | 0.50 | Minimum fraction of voting power required for a valid price |
| `reward_band` | 0.02 | Maximum deviation from the median for a vote to be rewarded (2%) |
| `slash_fraction` | 0.0001 | Fraction of validator stake slashed per violation (0.01%) |
| `slash_window` | 100,800 | Window in blocks for miss counting (~1 week at 6s blocks) |
| `min_valid_per_window` | 0.05 | Minimum fraction of vote periods a validator must participate in (5%) |
| `whitelist` | `["uclaw/uusd", "uclaw/uatom"]` | Supported denom pairs for price feeds |

### Parameter Rationale

- **VotePeriod (5 blocks)** -- short enough for timely price updates, long enough for validator coordination
- **VoteThreshold (50%)** -- ensures prices represent majority validator consensus
- **RewardBand (2%)** -- filters outlier votes while allowing normal market spread
- **SlashFraction (0.01%)** -- mild penalty that incentivizes participation without being punitive
- **SlashWindow (~1 week)** -- gives validators ample time to fix operational issues
- **MinValidPerWindow (5%)** -- very lenient minimum; validators must vote in at least 5% of periods

## Architecture

```
Validators / Feeders
        |
        |  MsgAggregateExchangeRatePrevote (Phase 1)
        |  MsgAggregateExchangeRateVote    (Phase 2)
        v
+-------------------+
|   x/oracle        |
|   Prevote Store   |-----> EndBlocker
|   Vote Store      |       |
|   Feeder Registry |       +--> Aggregate votes (weighted median)
|   Miss Counters   |       +--> Update prices + TWAP
|   Price Store     |       +--> Record price history
|   Price History   |       +--> Increment miss counters
+-------------------+       +--> Slash if window exceeded
        |
        v
  QueryPrice / QueryPrices / QueryPriceHistory
        |
        v
  DeFi modules, DEX, SDK clients, dashboards
```

## Security Considerations

- **Commit-reveal prevents front-running** -- validators cannot see others' votes before committing their own
- **Weighted median resists manipulation** -- an attacker would need >50% of voting power to manipulate prices
- **TWAP smoothing** -- time-weighted averaging prevents single-block price manipulation
- **Slashing enforcement** -- economic penalties ensure validators maintain reliable oracle infrastructure
- **Feeder delegation** -- validator keys can stay in cold storage while a hot wallet handles frequent voting
- **Whitelist governance** -- only governance-approved denom pairs are tracked, preventing spam

## Related Pages

- [Agent Module](/docs/modules/agent) -- Agents can use oracle prices for task pricing
- [Marketplace Module](/docs/modules/marketplace) -- GPU compute pricing can reference oracle feeds
- [Governance Module](/docs/modules/governance) -- Oracle parameters are governed on-chain
- [REST API Reference](/docs/api/rest-api) -- HTTP endpoints for oracle queries
