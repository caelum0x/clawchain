# ClawDEX Arbitrage Strategy

A cross-pool arbitrage strategy for ClawDEX, the CosmWasm-based AMM on ClawChain. It discovers pools from the factory contract, monitors their reserves via the chain REST API, detects both two-leg and three-leg (triangular) price discrepancies, and constructs multi-message CosmWasm swap transactions to capture the spread.

## Architecture

```
+-----------+     +-------------+     +---------------+     +------------+
| Discovery |---->| Price       |---->| Arb Detection |---->| Executor   |
| (factory  |     | Monitoring  |     | (2-leg &      |     | (build tx, |
|  query)   |     | (poll LCD)  |     |  3-leg scan)  |     |  broadcast)|
+-----------+     +-------------+     +---------------+     +------------+
```

### Modules

| Module       | File           | Purpose                                            |
|--------------|----------------|-----------------------------------------------------|
| `config`     | `src/config.rs`   | All tunables: endpoints, thresholds, gas, slippage |
| `pool`       | `src/pool.rs`     | Pool types, factory discovery, state fetching, AMM math |
| `executor`   | `src/executor.rs` | Swap msg construction, router multi-hop, tx broadcast  |
| `lib`        | `src/lib.rs`      | `ClawDexArbStrategy` struct, 2-leg & 3-leg detection   |
| `tests`      | `src/tests.rs`    | Unit tests for math, detection, messages               |

## How it works

1. **Discover** pools from the ClawDEX factory contract (paginated `pairs` query) and/or an explicit address list.
2. **Fetch** pool reserves via `/cosmwasm/wasm/v1/contract/{addr}/smart/` queries.
3. **Build pair index** mapping `(denom_a, denom_b)` to pool indices for O(1) lookup.
4. **Two-leg scan** — for each pair traded by 2+ pools, try predefined trade sizes in both directions. Select the most profitable.
5. **Three-leg scan** (optional) — enumerate all denom triples `(A, B, C)`, find pools for each edge, simulate `A->B->C->A` cycle.
6. **Profit calculation** — gross profit minus estimated gas cost; filter by `min_profit_uclaw`.
7. **Build transaction** — `MsgExecuteContract` messages for each leg, wrapped in an unsigned Cosmos SDK tx body.

## Configuration

| Field                | Default                  | Description                               |
|----------------------|--------------------------|-------------------------------------------|
| `rest_url`           | `http://localhost:1317`  | ClawChain LCD endpoint                    |
| `rpc_url`            | `http://localhost:26657` | ClawChain RPC endpoint                    |
| `factory_address`    | `""`                     | ClawDEX factory contract address          |
| `router_address`     | `""`                     | ClawDEX router contract address           |
| `pool_addresses`     | `[]`                     | Explicit pool addresses to monitor        |
| `sender_address`     | `""`                     | Signer bech32 address                     |
| `min_profit_uclaw`   | `1000`                   | Minimum net profit threshold (uclaw)      |
| `max_trade_uclaw`    | `1000000000`             | Maximum single-trade size (uclaw)         |
| `gas_price`          | `0.025`                  | Gas price in uclaw per unit               |
| `gas_limit_two_leg`  | `400000`                 | Gas budget for two-leg arb                |
| `gas_limit_three_leg`| `600000`                 | Gas budget for three-leg arb              |
| `max_slippage`       | `0.01`                   | Max slippage tolerance (1%)               |
| `fee_rate`           | `0.003`                  | Pool swap fee (0.3%)                      |
| `poll_interval_ms`   | `1000`                   | Polling interval                          |
| `dry_run`            | `true`                   | Compute but do not broadcast              |
| `enable_three_leg`   | `false`                  | Enable triangular arb scanning            |

## Usage

```rust
use clawdex_arb::{ClawDexConfig, ClawDexArbStrategy, build_arb_tx};

let config = ClawDexConfig {
    rest_url: "http://localhost:1317".into(),
    factory_address: "claw1factory...".into(),
    min_profit_uclaw: 5000,
    sender_address: "claw1myaddr...".into(),
    dry_run: false,
    enable_three_leg: true,
    ..Default::default()
};

let mut strategy = ClawDexArbStrategy::new(config.clone());

// Initial sync
strategy.sync_pools().await?;

// Scan for opportunities
let opportunities = strategy.scan();
for opp in &opportunities {
    println!("{}: net_profit={} uclaw ({:.2}%)", opp.label, opp.net_profit, opp.net_profit_pct);
    let tx = build_arb_tx(&config, opp);
    // Sign and broadcast tx...
}
```

## Running tests

```sh
cargo test -p clawdex-arb
```
