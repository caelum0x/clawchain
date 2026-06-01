# AI Model Token Market — Integrator Guide

_How to issue, deploy, trade, and earn on tokenized AI models on ClawChain._
_Companion to the design plan: `docs/plans/2026-06-01-ai-model-tokens.md`. Testnet-only
until the legal review in `docs/legal-compliance-launch-review.md`._

This guide ties together the surfaces shipped for the **AI Model Tokens** track: the
`ModelVault` CosmWasm contract, the `clawd model-vault` / `model-token` / `model-index`
CLI groups, the `@clawchain/sdk` clients, and the web dashboard pages.

## The pieces

| Layer | What it does | Where |
|---|---|---|
| `ModelVault` contract | reserve-backed bonding curve + revenue/dividend pool | `contracts/model-vault/` |
| `clawd model-token` | issue a model token (tokenfactory denom) + optional DEX seed | `cmd/clawd/src/commands/model-token.ts` |
| `clawd model-vault` | drive a vault: deploy/fund/buy/sell/stake/unstake/claim/distribute + watch/arb/portfolio | `cmd/clawd/src/commands/model-vault.ts` |
| `clawd model-index` | compute + publish per-model fundamentals (oracle index) | `cmd/clawd/src/commands/model-index.ts` |
| `@clawchain/sdk` | `ModelVaultClient`, `ModelMarket`, `ModelPortfolio`, `ModelVaultDeployer`, wagmi actions | `sdk/src/model-*.ts` |
| web dashboard | Model Exchange, AI Stock Exchange (markets), Model Portfolio, Vault Inspector | `web/src/pages/` |

## End-to-end flow

### 1. Issue a model token (P0)

```bash
# Issue a tokenfactory denom factory/<issuer>/<subdenom> for a model, mint supply,
# and (optionally) seed a CLAW/model-token DEX pair.
clawd model-token catalog                       # real OpenRouter-backed presets
clawd model-token issue --preset claude-opus-4.8 --supply 1000000 \
  [--dex-factory <addr> --base-amount 10000 --model-amount 10000]
```

### 2. Deploy a ModelVault for that token (P2)

The vault holds a CLAW reserve and a model-token inventory and prices buy/sell on a
constant-product curve; it also runs the staking/dividend pool.

```bash
# Store the optimized wasm (once), instantiate, and seed the curve in one command.
# Use the cosmwasm/optimizer artifact — a raw cargo wasm is rejected by wasmvm.
clawd model-vault deploy \
  --model-denom factory/<issuer>/<subdenom> \
  --wasm contracts/model-vault/artifacts/model_vault.wasm \
  --seed-reserve 1000000 --seed-inventory 1000000 \
  [--reserve-denom uclaw --fee-bps 30 --owner <addr>]
# -> prints store tx (code_id), instantiate tx (vault address), and fund tx.
```

Or do issuance **and** vault deploy in one signed flow:

```bash
clawd model-token launch --preset claude-opus-4.8 --supply 1000000 \
  --wasm contracts/model-vault/artifacts/model_vault.wasm \
  --seed-reserve 1000000 --seed-inventory 500000 [--dex-factory <addr>] --json
# -> consolidated summary: model_denom, code_id, vault address, and every tx hash.
```

### 3. Trade on the curve

```bash
clawd model-vault buy  --contract <vault> --amount 200000          # send uclaw, receive model tokens
clawd model-vault sell --contract <vault> --amount 150000          # send model tokens, receive uclaw
clawd model-vault quote --contract <vault> --side buy --amount 200000   # dry quote, no state change
clawd model-vault pool --contract <vault>                          # reserve / inventory (spot = reserve/inventory)
clawd model-vault watch --contract <vault> --interval-ms 5000      # supervised live price monitor
clawd model-vault history --contract <vault> --samples 12 --csv    # sampled price series + stats (CSV/JSON)
clawd model-vault alert --contract <vault> --threshold 1.5 --direction above   # fire when spot crosses a level
```

Keep the curve and the DEX pair aligned with the arbitrage helper (dry-run by default):

```bash
clawd model-vault arb --contract <vault> --dex-pair <pair> --threshold-bps 50 [--execute]
```

### 4. Earn dividends (revenue pool)

Inference fees (and any revenue) distributed to the vault are shared pro-rata among
stakers via a per-token reward index.

```bash
clawd model-vault stake      --contract <vault> --amount 500000    # escrow model tokens into the pool
clawd model-vault distribute --contract <vault> --amount 300000    # split uclaw revenue across stakers
clawd model-vault stake-info --contract <vault> --address <addr>   # staked + live claimable
clawd model-vault claim      --contract <vault>                    # withdraw accrued dividends
clawd model-vault unstake    --contract <vault> --amount 500000
```

A holder's positions across many vaults:

```bash
clawd model-vault portfolio --address <addr> --vaults <vaultA>,<vaultB>,<vaultC> --json
```

### 5. Redeem for real inference (P1)

```bash
clawd model-token redeem --model-id <id> --amount 100 --input "your prompt"
# burns model tokens + opens an inference job; a registered provider serves it:
clawd model-token serve-loop --max-cycles 1
clawd model-token job-status --job-id <id> --watch   # track a redeemed job until completed/failed
```

### 6. Publish model fundamentals (P3)

```bash
clawd model-index compute --model-id <id> --json   # job volume, completion rate, latency, rating, providers
clawd model-index publish --model-id <id> --validator <clawvaloper1...>   # oracle commit-reveal vote
clawd model-index leaderboard --top 10 --json      # rank all registered models by composite index
```

## SDK usage (`@clawchain/sdk`)

```ts
import {
  createModelVaultClient, createModelMarket, createModelPortfolio, createModelVaultDeployer,
} from "@clawchain/sdk";

// Single vault — reads + signed writes.
const vault = createModelVaultClient({ rpcUrl, contract, mnemonic });
await vault.connect();
const pool = await vault.pool();                    // { reserve, inventory }
await vault.buy("200000");                          // send uclaw, receive model tokens
await vault.stake("500000", modelDenom);
const pos = await vault.stakeInfo(vault.getAddress());   // { staked, claimable }

// Aggregate market view (curve + optional DEX premium/discount).
const market = createModelMarket({ rpcUrl, contract });
const snap = await market.snapshot();               // curveSpotPrice, quotes, dexMidPrice, curveVsDexBps

// Holder portfolio across vaults.
const portfolio = createModelPortfolio({ rpcUrl, vaults: [vaultA, vaultB] });
const overview = await portfolio.snapshot(address);  // positions[], totalClaimableByDenom
```

A runnable example lives at `sdk/examples/model-vault.ts`. wagmi-style hooks/actions for
React dApps are in `sdk/src/wagmi-model-vault.ts`.

## Web dashboard

- **Model Exchange** (`/model-exchange`) — per-model view with the Stake & Earn panel and
  the fundamentals card.
- **AI Stock Exchange** (`/model-markets`) — sortable markets overview of all model tokens
  (spot price, volume, rating, providers, premium/discount-vs-curve).
- **Model Portfolio** (`/model-portfolio`) — a holder's stakes + claimable dividends across
  vaults (vault list persisted to localStorage).
- **Vault Inspector** (`/vault-inspector`) — deep read-only view of any vault by address,
  with a quote calculator, an embedded Stake & Earn panel, and a live session price sparkline.
- **Launch Model** (`/launch-model`) — guided wizard that generates the exact `clawd`
  issue/deploy command for a new model token.
- **Leaderboard** (`/model-leaderboard`) — all model tokens ranked by their composite
  fundamentals index.
- **Watchlist** (`/watchlist`) — pin model tokens and compare them side by side.
- **Trade Simulator** (`/trade-simulator`) — model a buy/sell or target-price move on the curve.
- **Redeem for Inference** (`/redeem-inference`) — generate the redeem command and track the
  inference job to completion (the P1 utility loop).

## Verification

The contract is verified offline with `cw-multi-test` (`cd contracts/model-vault && cargo
test`, 35 tests). Live acceptance scripts:

- `scripts/testnet/model-vault-demo.sh` — store/instantiate/fund + buy-raises-price /
  sell-lowers-price on the curve.
- `scripts/testnet/model-vault-revenue-accept.sh` — stake → distribute_revenue →
  non-zero claimable → claim → claimable resets (the dividend-pool half of P2 acceptance).

Both need a running local testnet (`scripts/testnet/local-multinode.sh up 4`) and a
chain-loadable wasm (cosmwasm/optimizer artifact).
