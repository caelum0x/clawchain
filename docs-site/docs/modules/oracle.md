---
sidebar_position: 9
---

# Oracle Module (x/oracle)

> Forked from [Terra Classic](https://github.com/classic-terra/core) v4.0.0 `x/oracle` (Apache 2.0). Price feeder forked from [Ojo](https://github.com/ojo-network/price-feeder) (Apache 2.0).

The oracle module provides decentralized price feeds for ClawChain by aggregating exchange rate votes from validators. It uses a prevote/vote commit-reveal scheme to prevent front-running, computes weighted median prices, and enforces slashing penalties for validators that fail to submit timely votes.

## Key Features

- **Prevote/vote commit-reveal** -- validators commit a hash of their exchange rates before revealing, preventing front-running
- **Weighted median aggregation** -- exchange rates computed as power-weighted median of all validator votes
- **Cross exchange rates** -- prices derived from a reference denom for accurate cross-pair pricing
- **Miss counting & slashing** -- tracks how often validators fail to vote; excessive misses trigger slashing and jailing
- **Feeder delegation** -- validators can delegate price submission to a separate hot-wallet feeder address
- **Tobin tax** -- configurable spread fee per denom pair
- **Reward distribution** -- oracle reward pool distributed to faithful voters proportional to voting power
- **Whitelist** -- governance-configurable list of supported denominations

## Default Whitelist

| Denom | Description | Tobin Tax |
|-------|-------------|-----------|
| `uusd` | CLAW/USD | 0.25% |
| `uatom` | CLAW/ATOM | 0.25% |
| `uusdt` | CLAW/USDT | 0.25% |
| `uusdc` | CLAW/USDC | 0.25% |
| `ubtc` | CLAW/BTC | 1.0% |
| `ueth` | CLAW/ETH | 1.0% |

## Concepts

### Prevote/Vote Cycle

The oracle uses a two-phase commit-reveal scheme:

```
Phase 1: Prevote (commit)
    Validator submits hash(salt + exchange_rates + validator_addr)
            |
            v   (wait 1 VotePeriod)
Phase 2: Vote (reveal)
    Validator reveals salt + exchange_rates
    Chain verifies hash matches the prevote
            |
            v
EndBlock: Aggregate
    Compute weighted median of all revealed rates
    Update on-chain exchange rates
    Distribute rewards to accurate voters
    Increment miss counter for non-voters
```

Each vote period lasts `VotePeriod` blocks (default 6 blocks = ~30 seconds). Validators must submit a prevote in one period and reveal the vote in the following period.

### Vote Aggregation & Cross Exchange Rates

At the end of each vote period, the module:

1. Selects a **reference denom** -- the denom with the highest ballot voting power
2. Computes the **weighted median** price for the reference denom
3. Derives **cross exchange rates** for all other denoms relative to the reference
4. Filters votes outside the `RewardBand` from the median
5. Updates canonical on-chain exchange rates
6. Distributes rewards from the oracle reward pool

### Miss Counting and Slashing

Validators are expected to submit votes every period. When a validator misses a vote:

1. Their **miss counter** is incremented
2. At the end of each `SlashWindow` (~1 week), the module checks if misses exceed the threshold
3. If `misses > SlashWindow/VotePeriod * (1 - MinValidPerWindow)`, the validator is **slashed** and **jailed**
4. Miss counters reset after each slash window

### Feeder Delegation

Validators can delegate price submission to a separate **feeder address**:

- The validator key remains in cold storage (HSM/air-gapped)
- A hot wallet submits frequent prevote/vote transactions
- Only the validator can set or change its feeder via `MsgDelegateFeedConsent`

### Tobin Tax

Each whitelisted denom has a configurable Tobin tax (spread fee). This is used by market operations to add a small fee on exchange rate conversions.

## Messages

| Message | Description |
|---------|-------------|
| `MsgAggregateExchangeRatePrevote` | Submit hash commitment of exchange rates (phase 1) |
| `MsgAggregateExchangeRateVote` | Reveal exchange rates matching a previous prevote (phase 2) |
| `MsgDelegateFeedConsent` | Delegate oracle vote submission to a feeder address |

## Queries

| Query | REST Endpoint | Description |
|-------|---------------|-------------|
| ExchangeRate | `GET /clawchain/oracle/v1beta1/denoms/{denom}/exchange_rate` | Current price for a denom |
| ExchangeRates | `GET /clawchain/oracle/v1beta1/denoms/exchange_rates` | All active exchange rates |
| TobinTax | `GET /clawchain/oracle/v1beta1/denoms/{denom}/tobin_tax` | Tobin tax for a denom |
| TobinTaxes | `GET /clawchain/oracle/v1beta1/denoms/tobin_taxes` | All Tobin taxes |
| Actives | `GET /clawchain/oracle/v1beta1/denoms/actives` | Active denom list |
| VoteTargets | `GET /clawchain/oracle/v1beta1/denoms/vote_targets` | Vote target list |
| FeederDelegation | `GET /clawchain/oracle/v1beta1/validators/{addr}/feeder` | Feeder address for a validator |
| MissCounter | `GET /clawchain/oracle/v1beta1/validators/{addr}/miss` | Miss counter for a validator |
| AggregatePrevote | `GET /clawchain/oracle/v1beta1/validators/{addr}/aggregate_prevote` | Pending prevote |
| AggregatePrevotes | `GET /clawchain/oracle/v1beta1/validators/aggregate_prevotes` | All pending prevotes |
| AggregateVote | `GET /clawchain/oracle/v1beta1/validators/{addr}/aggregate_vote` | Aggregate vote |
| AggregateVotes | `GET /clawchain/oracle/v1beta1/validators/aggregate_votes` | All aggregate votes |
| Params | `GET /clawchain/oracle/v1beta1/params` | Oracle module parameters |

## REST API Examples

### Get all exchange rates

```bash
curl http://localhost:1317/clawchain/oracle/v1beta1/denoms/exchange_rates
```

```json
{
  "exchange_rates": [
    { "denom": "uusd", "exchange_rate": "1.500000000000000000" },
    { "denom": "uatom", "exchange_rate": "0.080000000000000000" }
  ]
}
```

### Get oracle parameters

```bash
curl http://localhost:1317/clawchain/oracle/v1beta1/params
```

```json
{
  "params": {
    "vote_period": "6",
    "vote_threshold": "0.500000000000000000",
    "reward_band": "0.020000000000000000",
    "reward_distribution_window": "6307200",
    "whitelist": [
      { "name": "uusd", "tobin_tax": "0.002500000000000000" },
      { "name": "uatom", "tobin_tax": "0.002500000000000000" }
    ],
    "slash_fraction": "0.000100000000000000",
    "slash_window": "120960",
    "min_valid_per_window": "0.050000000000000000"
  }
}
```

### Get miss counter

```bash
curl http://localhost:1317/clawchain/oracle/v1beta1/validators/clawvaloper1.../miss
```

```json
{
  "miss_counter": "5"
}
```

## CLI Commands

### clawd CLI (operator)

```bash
# Query exchange rates
clawd oracle price uusd              # Single denom
clawd oracle prices                  # All rates
clawd oracle actives                 # Active denom list
clawd oracle vote-targets            # Vote target list
clawd oracle params                  # Module parameters

# Validator oracle status
clawd oracle feeder <validator>      # Feeder delegation
clawd oracle miss <validator>        # Miss counter
clawd oracle prevote <validator>     # Pending prevote
clawd oracle vote <validator>        # Aggregate vote

# Tobin tax
clawd oracle tobin-tax <denom>       # Tax for one denom
clawd oracle tobin-taxes             # All taxes
```

### clawchaind CLI (chain)

```bash
# Query
clawchaind query oracle exchange-rate uusd
clawchaind query oracle exchange-rates
clawchaind query oracle params

# Transactions
clawchaind tx oracle set-feeder <feeder_addr> --from <validator>
clawchaind tx oracle aggregate-prevote <hash> --from <feeder>
clawchaind tx oracle aggregate-vote <salt> <rates> <validator> --from <feeder>
```

## SDK Usage

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Exchange rates
const rate = await client.getOracleExchangeRate("uusd");
const rates = await client.getOracleExchangeRates();

// Active denoms
const actives = await client.getOracleActives();
const targets = await client.getOracleVoteTargets();

// Validator oracle status
const feeder = await client.getOracleFeederDelegation("clawvaloper1...");
const misses = await client.getOracleMissCounter("clawvaloper1...");
const prevote = await client.getOracleAggregatePrevote("clawvaloper1...");
const vote = await client.getOracleAggregateVote("clawvaloper1...");

// Parameters & Tobin tax
const params = await client.getOracleParams();
const taxes = await client.getOracleTobinTaxes();
```

## Operator Guide: Running an Oracle Feeder

### Prerequisites

- A running ClawChain validator node
- The `claw-price-feeder` binary (built from `cmd/claw-price-feeder/`)
- API keys are NOT needed -- the feeder fetches prices from public exchange APIs

### Step 1: Create a feeder key

```bash
clawchaind keys add oracle-feeder --keyring-backend test
```

Save the address (e.g., `claw1feeder...`).

### Step 2: Fund the feeder

The feeder needs gas to submit transactions:

```bash
clawchaind tx bank send <your-validator-account> <feeder-address> 10000000uclaw \
  --chain-id clawchain-1 --keyring-backend test -y
```

### Step 3: Delegate feed consent

```bash
clawchaind tx oracle set-feeder <feeder-address> \
  --from <your-validator-account> \
  --chain-id clawchain-1 --keyring-backend test -y
```

### Step 4: Configure the price feeder

```bash
cp cmd/claw-price-feeder/price-feeder.example.toml price-feeder.toml
```

Edit `price-feeder.toml`:

```toml
[account]
address = "<feeder-address>"
chain_id = "clawchain-1"
validator = "<your-clawvaloper-address>"

[keyring]
backend = "test"
dir = "/home/clawchain/.clawchain"
```

### Step 5: Start the feeder

```bash
claw-price-feeder price-feeder.toml
```

Or use systemd:

```bash
sudo cp deploy/systemd/claw-price-feeder.service /etc/systemd/system/
sudo systemctl enable claw-price-feeder
sudo systemctl start claw-price-feeder
```

### Step 6: Verify

```bash
# Check feeder delegation
clawd oracle feeder <your-clawvaloper-address>

# Check miss counter (should stay low)
clawd oracle miss <your-clawvaloper-address>

# Check exchange rates are being updated
clawd oracle prices
```

## Prometheus Metrics

The oracle module exposes 11 custom metrics on the CometBFT Prometheus endpoint (`:26660/metrics`):

| Metric | Type | Description |
|--------|------|-------------|
| `clawchain_oracle_vote_periods_total` | Counter | Completed vote periods |
| `clawchain_oracle_active_exchange_rates` | Gauge | Active denom count |
| `clawchain_oracle_voting_validators` | Gauge | Validators in vote set |
| `clawchain_oracle_total_miss_counter` | Gauge | Accumulated misses |
| `clawchain_oracle_miss_counter` | Counter | Monotonic miss events |
| `clawchain_oracle_slashes_total` | Counter | Oracle slashes |
| `clawchain_oracle_rewards_distributed_uclaw` | Gauge | Rewards per period |
| `clawchain_oracle_exchange_rate{denom}` | GaugeVec | Per-denom price |
| `clawchain_oracle_ballot_power_total` | Gauge | Ballot voting power |
| `clawchain_oracle_last_update_height` | Gauge | Last price update block |
| `clawchain_oracle_active_feeders` | Gauge | Active feeder count |

A pre-built Grafana dashboard is available at `monitoring/grafana/dashboards/oracle.json`.

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `vote_period` | 6 | Blocks per oracle vote window (~30s) |
| `vote_threshold` | 0.50 | Minimum voting power fraction for valid price |
| `reward_band` | 0.02 | Max deviation from median for reward eligibility (2%) |
| `reward_distribution_window` | 6,307,200 | Window for reward distribution (~1 year) |
| `slash_fraction` | 0.0001 | Stake slashed per violation (0.01%) |
| `slash_window` | 120,960 | Window for miss counting (~1 week) |
| `min_valid_per_window` | 0.05 | Minimum vote participation rate (5%) |
| `whitelist` | 6 denoms | Supported denom pairs with Tobin tax |

## Architecture

```
Price Feeder (off-chain)          Validators
  19 exchange providers    ───>   Submit prevote/vote TXs
  (Binance, Coinbase, ...)        every VotePeriod blocks
        |                               |
        v                               v
  ┌─────────────────────────────────────────┐
  │              x/oracle EndBlocker        │
  │                                         │
  │  1. Select reference denom (most power) │
  │  2. Compute weighted median prices      │
  │  3. Derive cross exchange rates         │
  │  4. Update on-chain exchange rates      │
  │  5. Distribute rewards to voters        │
  │  6. Increment miss counters             │
  │  7. Slash + jail at SlashWindow end     │
  │  8. Emit Prometheus metrics             │
  └─────────────────────────────────────────┘
        |
        v
  Exchange rates available to:
  DEX, marketplace, agent economy, SDK, dashboard
```

## Related Pages

- [Agent Module](/docs/modules/agent) -- Agents can use oracle prices for task pricing
- [Marketplace Module](/docs/modules/marketplace) -- GPU compute pricing references oracle feeds
- [Governance Module](/docs/modules/governance) -- Oracle parameters are governed on-chain
