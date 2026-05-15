# ClawDEX — ClawChain Decentralized Exchange

Multi pool type automated market-maker (AMM) protocol for ClawChain.
Forked from [Astroport Core](https://github.com/astroport-fi/astroport-core) and customized for the ClawChain ecosystem.

## Contracts

### Core

| Name                                               | Description                                                         |
|----------------------------------------------------|---------------------------------------------------------------------|
| [`factory`](contracts/factory)                     | Pool creation factory                                               |
| [`pair`](contracts/pair)                           | Pair with x*y=k curve (constant product AMM)                        |
| [`pair_stable`](contracts/pair_stable)             | Pair with stableswap invariant curve                                |
| [`pair_concentrated`](contracts/pair_concentrated) | Passive Concentrated Liquidity pair (Curve v2 inspired)             |
| [`pair_transmuter`](contracts/pair_transmuter)     | Constant sum pair for 1:1 pegged assets                             |
| [`pair_xyk_sale_tax`](contracts/pair_xyk_sale_tax) | XYK pair with buy and sell taxes                                    |
| [`router`](contracts/router)                       | Multi-hop trade router                                              |
| [`whitelist`](contracts/whitelist)                 | CW1 whitelist contract (treasury)                                   |

### Tokenomics

| Name                                                | Description                                                         |
|-----------------------------------------------------|---------------------------------------------------------------------|
| [`incentives`](contracts/tokenomics/incentives)     | Rewards distributor for liquidity providers                         |
| [`maker`](contracts/tokenomics/maker)               | Fee collector and swapper                                           |
| [`staking`](contracts/tokenomics/staking)           | xCLAW staking contract                                              |
| [`vesting`](contracts/tokenomics/vesting)           | Token distributor for incentive rewards                             |

## Building

Requires Rust 1.68+ with `wasm32-unknown-unknown` target.

```bash
# Compile all contracts
cargo build --release --target wasm32-unknown-unknown

# Run tests
cargo test

# Production build (optimized + compressed)
./scripts/build_release.sh
# Output: artifacts/
```

## Deployment to ClawChain

```bash
# Store factory contract
clawchaind tx wasm store artifacts/astroport_factory.wasm \
  --from validator --chain-id clawchain-1 --gas auto --gas-adjustment 1.4 -y

# Instantiate factory (adjust code IDs from store results)
clawchaind tx wasm instantiate <factory_code_id> '{
  "owner": "claw1...",
  "pair_configs": [{"pair_type":{"xyk":{}},"code_id":<pair_code_id>,"total_fee_bps":30,"maker_fee_bps":10,"is_disabled":false}],
  "token_code_id": <token_code_id>,
  "whitelist_code_id": <whitelist_code_id>,
  "coin_registry_address": "claw1..."
}' --label "ClawDEX Factory" --admin claw1... --from validator -y

# Create a pool
clawchaind tx wasm execute <factory_addr> '{
  "create_pair": {
    "pair_type": {"xyk": {}},
    "asset_infos": [
      {"native_token": {"denom": "uclaw"}},
      {"native_token": {"denom": "uatom"}}
    ]
  }
}' --from validator -y
```

## Attribution

Based on Astroport Core, licensed under Apache-2.0.
