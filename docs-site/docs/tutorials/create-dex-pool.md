---
sidebar_position: 3
---

# Create a DEX Trading Pool

This tutorial walks you through creating a trading pair on ClawDEX, the Astroport-based decentralized exchange built into ClawChain. You will create an XYK liquidity pool, add liquidity, execute swaps, query prices, and automate trading with the TypeScript SDK.

## Prerequisites

- A funded ClawChain wallet (see [Getting Started](/docs/tutorials/getting-started))
- `clawchaind` and `clawd` installed
- Familiarity with [smart contract basics](/docs/tutorials/deploy-contract)

## Understanding the DEX architecture

ClawDEX consists of four core contracts, each deployed as separate CosmWasm instances:

```
+-------------------+
|    Factory        |  Creates and registers new trading pairs
+--------+----------+
         |
         | create_pair
         v
+-------------------+     +-------------------+
|    Pair (XYK)     |     |    Oracle         |
|    Pair (Stable)  |     |    (TWAP prices)  |
+--------+----------+     +-------------------+
         |
         | swap / provide_liquidity
         v
+-------------------+
|    Router         |  Multi-hop swap routing
+-------------------+
```

| Contract | Role |
|----------|------|
| **Factory** | Creates new pair contracts, stores pair configs and fee settings |
| **Pair** | Holds liquidity for a specific asset pair, executes swaps and LP operations |
| **Router** | Routes multi-hop swaps through multiple pairs for best execution |
| **Oracle** | Tracks time-weighted average prices (TWAP) for each pair |

The pair types available are:

- **XYK** -- Constant-product AMM (x * y = k), best for most token pairs
- **Stable** -- StableSwap curve optimized for pegged assets (stablecoins)
- **Concentrated** -- Concentrated liquidity for capital-efficient trading

## Step 1: Configure DEX addresses

Before interacting with the DEX, tell `clawd` where the factory and router contracts live:

```bash
clawd dex config --factory claw1factoryaddr... --router claw1routeraddr...
```

Expected output:

```
DEX config saved.

DEX Configuration

  Factory: claw1factoryaddr...
  Router:  claw1routeraddr...
```

On testnet, the factory and router addresses are:

```bash
# Testnet addresses (example)
clawd dex config \
  --factory claw1wfz5kvkggqxw0g0sdxexa5dklaqpurz8l3efhq \
  --router  claw1j0e2v8hkrnm3t6avsqyj9rqz5yysgn8hf0qpk
```

To view the current config:

```bash
clawd dex config
```

## Step 2: Create a new XYK pool

Use the factory contract to create a new trading pair. In this example we create a `uclaw` / `uatom` pool:

```bash
clawchaind tx wasm execute claw1factoryaddr... '{
  "create_pair": {
    "pair_type": {"xyk": {}},
    "asset_infos": [
      {"native_token": {"denom": "uclaw"}},
      {"native_token": {"denom": "uatom"}}
    ]
  }
}' \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.5 \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

Expected output:

```yaml
code: 0
txhash: G7H8I9J0K1L2...
logs:
  - events:
    - type: wasm
      attributes:
        - key: action
          value: create_pair
        - key: pair_contract_addr
          value: "claw1pairaddr..."
        - key: liquidity_token_addr
          value: "factory/claw1pairaddr.../astroport/share"
```

Note the `pair_contract_addr` -- this is the address you will use for all pool operations.

### Create a pool with a CW20 token

If one of your assets is a CW20 token (e.g., from the [deploy tutorial](/docs/tutorials/deploy-contract)):

```bash
clawchaind tx wasm execute claw1factoryaddr... '{
  "create_pair": {
    "pair_type": {"xyk": {}},
    "asset_infos": [
      {"native_token": {"denom": "uclaw"}},
      {"token": {"contract_addr": "claw1tokencontract..."}}
    ]
  }
}' \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.5 \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

## Step 3: Add initial liquidity

Provide both assets to the pool. The ratio you provide sets the initial price:

```bash
clawchaind tx wasm execute claw1pairaddr... '{
  "provide_liquidity": {
    "assets": [
      {
        "info": {"native_token": {"denom": "uclaw"}},
        "amount": "10000000000"
      },
      {
        "info": {"native_token": {"denom": "uatom"}},
        "amount": "1000000000"
      }
    ],
    "slippage_tolerance": "0.01"
  }
}' \
  --amount 10000000000uclaw,1000000000uatom \
  --from mykey \
  --gas auto \
  --gas-adjustment 1.3 \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

:::info Initial price
The ratio of assets you provide determines the initial exchange rate. In this example: 10,000 CLAW to 1,000 ATOM means 1 ATOM = 10 CLAW.
:::

Using `clawd`:

```bash
clawd dex add-liquidity \
  --pair claw1pairaddr... \
  --assets "uclaw:10000000000,uatom:1000000000" \
  --slippage 1
```

Expected output:

```
Providing liquidity to claw1pair...
  10000000000 uclaw
  1000000000 uatom
  Slippage Tolerance: 1%

Liquidity provided successfully.
  TxHash: H8I9J0K1L2M3...
```

## Step 4: Execute a swap

Swap 100 CLAW for ATOM through the pair:

### Using clawchaind

```bash
clawchaind tx wasm execute claw1pairaddr... '{
  "swap": {
    "offer_asset": {
      "info": {"native_token": {"denom": "uclaw"}},
      "amount": "100000000"
    },
    "max_spread": "0.005"
  }
}' \
  --amount 100000000uclaw \
  --from mykey \
  --gas auto \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

### Using clawd

```bash
clawd dex swap \
  --pair claw1pairaddr... \
  --offer-asset uclaw \
  --amount 100000000 \
  --max-spread 0.5
```

Expected output:

```
Swap Simulation:
  Expected Return: 9900990
  Spread:          99010
  Commission:      29703

Executing swap on claw1pair...
  Offer:      100000000 uclaw
  Max Spread: 0.5%

Swap executed successfully.
  TxHash:     I9J0K1L2M3N4...
  Return:     9900990
  Spread:     99010
  Commission: 29703
```

### Simulate before swapping

To see the expected return without executing:

```bash
clawd dex simulate claw1pairaddr... \
  --offer-denom uclaw \
  --offer-amount 100000000
```

Expected output:

```
Swap Simulation (forward)

  Pair:       claw1pairaddr...
  Offer:      100000000 uclaw

  Return Amount:         9900990
  Spread Amount:         99010
  Commission Amount:     29703
```

Reverse simulation (how much do I need to offer to get a specific amount?):

```bash
clawd dex simulate claw1pairaddr... \
  --offer-denom uatom \
  --offer-amount 10000000 \
  --reverse
```

## Step 5: Query price and pool state

### Query pool state

```bash
clawd dex pool claw1pairaddr...
```

Expected output:

```
Pool Details: claw1pairaddr...

  Pool Type:    xyk

  Reserves:
    Asset 1: uclaw
      Amount: 10100000000
    Asset 2: uatom
      Amount: 990099010

  LP Token Supply: 3162277660
```

### Query current price

```bash
clawd dex price claw1pairaddr...
```

Expected output:

```
Price for claw1pairaddr...

  uclaw -> uatom:
    Price:      1 uclaw = 0.098030 uatom
    Spread:     99
    Commission: 29

  uatom -> uclaw:
    Price:      1 uatom = 10.202030 uclaw
    Spread:     1010
    Commission: 303
```

### List all pools

```bash
clawd dex pools --factory claw1factoryaddr...
```

Expected output:

```
DEX Trading Pools

  #  Pair Address       Asset A   Asset B   Pool Type  Total Liquidity
  1  claw1pair1...      uclaw     uatom     xyk        3162277660
  2  claw1pair2...      uclaw     uusdc     stable     50000000000
```

## Step 6: Remove liquidity

To withdraw your LP tokens and receive both underlying assets:

```bash
clawd dex remove-liquidity \
  --pair claw1pairaddr... \
  --lp-amount 1000000000
```

Expected output:

```
Removing liquidity from claw1pair...
  LP Tokens: 1000000000
  LP Token Contract: claw1lptoken...

Liquidity removed successfully.
  TxHash: J0K1L2M3N4O5...
```

## Step 7: Use the SDK for programmatic trading

The `@clawchain/sdk` provides high-level methods for all DEX operations.

### Install

```bash
npm install @clawchain/sdk
```

### Connect and configure

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connectWithMnemonic(
  "https://rpc.testnet.clawchain.io:26657",
  process.env.MNEMONIC!,
);

const sender = client.signerAddress!;
const FACTORY = "claw1factoryaddr...";
```

### Create a pool

```typescript
const { pairAddress, transactionHash } = await client.createPool(
  sender,
  FACTORY,
  [
    { native_token: { denom: "uclaw" } },
    { native_token: { denom: "uatom" } },
  ],
  { xyk: {} },
);

console.log("New pair:", pairAddress);
console.log("Tx:", transactionHash);
```

### Query pool state

```typescript
const pool = await client.queryPoolState(pairAddress);
console.log("Reserves:", pool.assets);
console.log("LP Supply:", pool.total_share);
```

### Simulate a swap

```typescript
const sim = await client.simulateSwap(pairAddress, {
  info: { native_token: { denom: "uclaw" } },
  amount: "100000000",
});

console.log("Expected return:", sim.return_amount);
console.log("Spread:", sim.spread_amount);
console.log("Commission:", sim.commission_amount);
```

### Execute a swap

```typescript
const swapResult = await client.dexSwap(
  sender,
  pairAddress,
  "uclaw",          // offer asset denom
  "100000000",      // amount (100 CLAW in uclaw)
  "0.005",          // max spread (0.5%)
);

console.log("Swap tx:", swapResult.transactionHash);
```

### Provide liquidity

```typescript
const lpResult = await client.dexProvideLiquidity(
  sender,
  pairAddress,
  [
    { denom: "uclaw", amount: "5000000000" },
    { denom: "uatom", amount: "500000000" },
  ],
  "0.01",  // slippage tolerance (1%)
);

console.log("LP tx:", lpResult.transactionHash);
```

### Remove liquidity

```typescript
const removeTx = await client.dexRemoveLiquidity(
  sender,
  pairAddress,
  "claw1lptoken...",  // LP token address
  "500000000",        // LP amount to withdraw
);

console.log("Remove tx:", removeTx.transactionHash);
```

### Full trading bot example

Here is a simple price-monitoring script:

```typescript
import { ClawChainClient } from "@clawchain/sdk";

async function monitorPrice() {
  const client = await ClawChainClient.connectWithMnemonic(
    "https://rpc.testnet.clawchain.io:26657",
    process.env.MNEMONIC!,
  );

  const PAIR = "claw1pairaddr...";

  setInterval(async () => {
    try {
      const sim = await client.simulateSwap(PAIR, {
        info: { native_token: { denom: "uclaw" } },
        amount: "1000000",  // 1 CLAW
      });

      const price = Number(sim.return_amount) / 1_000_000;
      console.log(
        `[${new Date().toISOString()}] 1 CLAW = ${price.toFixed(6)} ATOM`,
      );
    } catch (err) {
      console.error("Price query failed:", err);
    }
  }, 10_000);  // every 10 seconds
}

monitorPrice();
```

## Multi-hop swaps via the router

For tokens without a direct pair, use the router for multi-hop swaps:

```bash
clawchaind tx wasm execute claw1routeraddr... '{
  "execute_swap_operations": {
    "operations": [
      {
        "astro_swap": {
          "offer_asset_info": {"native_token": {"denom": "uclaw"}},
          "ask_asset_info": {"native_token": {"denom": "uatom"}}
        }
      },
      {
        "astro_swap": {
          "offer_asset_info": {"native_token": {"denom": "uatom"}},
          "ask_asset_info": {"native_token": {"denom": "uusdc"}}
        }
      }
    ],
    "minimum_receive": "9500000"
  }
}' \
  --amount 100000000uclaw \
  --from mykey \
  --gas auto \
  --chain-id clawchain-testnet-1 \
  --node https://rpc.testnet.clawchain.io:26657
```

This swaps `uclaw -> uatom -> uusdc` in a single transaction.

## Understanding fees

| Fee type | Default | Description |
|----------|---------|-------------|
| Trade commission | 0.3% | Charged on every swap, paid to LP providers |
| Maker fee | 0% | Optional fee sent to protocol treasury |
| Slippage | Variable | Price impact from trade size relative to pool depth |

You can query the fee configuration for any pair:

```bash
clawd wasm query claw1pairaddr... '{"config": {}}'
```

## What's next?

- [Build an Agent Skill](/docs/tutorials/build-agent-skill) -- Create a marketable agent skill
- [Marketplace Module](/docs/modules/marketplace) -- List skills and GPU compute jobs
- [Smart Contracts Overview](/docs/smart-contracts/overview) -- CosmWasm architecture reference
- [TypeScript SDK](/docs/sdk/overview) -- Full SDK documentation
