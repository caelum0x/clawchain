# ModelVault

A standalone CosmWasm contract that gives an AI **model token** a bonding-curve market
so it can be traded "like a stock" against a CLAW reserve. This is phase **P2** of
`docs/plans/2026-06-01-ai-model-tokens.md` (ModelVault bonding curve).

The vault trades a native **tokenfactory** model-token coin (`factory/<issuer>/<subdenom>`)
against a native **reserve** coin (`uclaw` by default) using a constant-product market.
There is no cw20 and no custom message type — only standard `cosmwasm-std` features, so it
deploys under the chain's wasm capability set (`BuiltInCapabilities + token_factory`).

## Mechanics (constant product)

The pool tracks two amounts in state: `reserve` (reserve_denom) and `inventory`
(model_denom). The invariant is `k = reserve * inventory`. Each trade keeps `k` constant
(v0 has no swap fee):

- **Buy** — attach `reserve_denom`. `tokens_out = inventory - k / (reserve + amount_in)`;
  the contract sends `tokens_out` of `model_denom` to the buyer. Reserve goes up,
  inventory goes down, so the model-token price (`reserve / inventory`) **rises**.
- **Sell** — attach `model_denom`. `reserve_out = reserve - k / (inventory + amount_in)`;
  the contract sends `reserve_out` of `reserve_denom` to the seller. Price **falls**.

Reserve/inventory are tracked **explicitly in state** and updated on every trade. They are
NOT read from the live contract balance — during `execute`, attached funds are already
credited to the contract's bank balance, so a `query_balance` would double-count the
incoming coins. Tracking state directly avoids that classic gotcha.

> Rounding note: an integer constant-product market is not strictly arbitrage-free at the
> rounding level (a buy-then-sell round trip can drift by a dust amount even before the
> swap fee). The `round_trip_returns_close_to_principal` test documents and bounds this on
> a zero-fee vault.

## Dividend pool (P2): stake the model token, earn pro-rata revenue

Model-token holders can **stake** their tokens into a dividend pool and earn a pro-rata
share of revenue (paid in `reserve_denom`) that flows into the vault. Revenue arrives from
two sources:

1. **Swap fee** — a configurable `fee_bps` (default **30 bps = 0.30%**) skimmed from every
   `Buy`/`Sell` and routed to stakers. This is the "earn from the model's usage" linkage:
   the more the model token trades, the more its stakers earn.
2. **`DistributeRevenue`** — anyone may push `reserve_denom` directly into the pool (e.g.
   the model owner sharing inference revenue).

### Reward-index accrual (Synthetix pattern)

Paying every staker on each revenue event would be O(n) and unbounded in gas. Instead we
use a single global accumulator and settle each staker lazily, so **every operation is
O(1)** regardless of staker count:

- Global state (`Dividend`): `reward_per_token_stored` (a scaled `Uint256` index) and
  `total_staked` (`Uint128`).
- Per-staker state (`Map<&Addr, Stake>`): `{ staked, reward_index_snapshot, pending }`.
- On revenue of `amount` reserve across `total_staked` tokens, the global index rises by
  `delta = amount * SCALE / total_staked` (`SCALE = 1e18`, fixed-point, computed in
  `Uint256` to avoid precision loss).
- On **any** stake / unstake / claim, the staker is first **settled**:
  `pending += staked * (reward_per_token_stored - reward_index_snapshot) / SCALE`, then the
  snapshot is advanced to the current global index. New tokens therefore never retroactively
  earn past revenue, and unstaked tokens keep what they already earned.

The pure index math lives in [`src/rewards.rs`](src/rewards.rs) with unit tests covering the
settlement formula, two-staker pro-rata split, snapshot-excludes-prior-revenue, large-value
precision via `Uint256`, and floor-rounding dust.

### Reward-index invariant

> **INVARIANT.** `reward_per_token_stored` is monotonically non-decreasing. The contract's
> `reserve_denom` balance always covers `pool.reserve + Σ(stakers' settleable rewards)`, and
> its `model_denom` balance always covers `pool.inventory + total_staked`. Staked tokens are
> **escrowed** (held by the contract, outside the curve) and never feed the constant-product
> math; dividends are paid from the contract's reserve balance. Because the index uses floor
> division, the pool never pays out more than it received — any sub-unit remainder is left as
> dust until enough revenue accumulates. `total_staked` is recomputed from explicit state on
> every stake/unstake, never inferred from live bank balances.

### No-stakers fallback (funds never stranded)

- `DistributeRevenue` **errors** (`NoStakers`) when `total_staked == 0`, so a caller can
  never push revenue into an empty pool and lose it.
- A **swap fee** that accrues while `total_staked == 0` cannot raise the index either, so it
  is instead **left in the curve reserve** (added back to `pool.reserve`). The fee is never
  lost — it simply benefits the curve until there are stakers to receive it.

## Messages

`InstantiateMsg { model_denom, reserve_denom?, owner?, initial_reserve?, initial_inventory?, fee_bps? }`
— `reserve_denom` defaults to `uclaw`, `owner` defaults to the instantiator, `fee_bps`
defaults to `30` (0.30%) and must be `<= 10000`. The optional initial amounts seed the curve
state (attach matching funds at instantiate time).

`ExecuteMsg`:
- `Fund {}` — owner-only. Attach `model_denom` and/or `reserve_denom`; the matching state
  amounts increase.
- `Buy {}` — attach exactly one `reserve_denom` coin. The `fee_bps` portion is skimmed off
  the input and routed to the dividend pool; the net feeds the curve.
- `Sell {}` — attach exactly one `model_denom` coin. The `fee_bps` portion is skimmed off the
  gross reserve output; the seller receives the net.
- `Stake {}` — attach exactly one `model_denom` coin to escrow it into the dividend pool.
- `Unstake { amount }` — settle, decrease the stake, and return `amount` `model_denom`.
- `ClaimRewards {}` — settle and pay out accrued `reserve_denom` dividends, zeroing pending.
- `DistributeRevenue {}` — attach exactly one `reserve_denom` coin to distribute pro-rata
  across current stakers (errors if `total_staked == 0`).

`QueryMsg`:
- `Config {}` -> `{ model_denom, reserve_denom, owner, fee_bps }`
- `Pool {}` -> `{ reserve, inventory }`
- `Quote { side, amount }` -> `{ amount_out, denom_in, denom_out }` (pure curve math, no
  state change; reported gross of the swap fee)
- `StakeInfo { address }` -> `{ staked, claimable }` (`claimable` is computed live: settled
  `pending` + accrual since the staker's last settlement)
- `PoolInfo {}` -> `{ total_staked, reward_per_token_stored }`

## Build & test

```bash
# native build + cw-multi-test integration tests + pure-math unit tests
# (curve + reward-index math in src/curve.rs and src/rewards.rs)
cargo build
cargo test

# deployable wasm artifact
cargo build --target wasm32-unknown-unknown --release
# -> target/wasm32-unknown-unknown/release/model_vault.wasm
```

## Demo

`scripts/testnet/model-vault-demo.sh` (best-effort) stores + instantiates the vault on a
local testnet, issues a model token, funds the vault, buys with CLAW, and sells back,
printing PASS/FAIL. It requires a running local multinode testnet and `clawd` /
`clawchaind` on PATH.

## Deploying on-chain (wasm packaging)

A raw `cargo build --target wasm32-unknown-unknown --release` artifact is **not**
chain-loadable: modern rustc emits post-MVP wasm (bulk-memory/sign-ext) that the
chain's wasmvm rejects (`bulk memory support is not enabled` / deserialization error).
Produce a chain-loadable, MVP-compatible artifact with the CosmWasm optimizer:

```bash
docker run --rm -v "$PWD":/code -w /code/contracts/model-vault cosmwasm/optimizer:0.16.0
# -> contracts/model-vault/artifacts/model_vault.wasm  (deploy this)
```

The contract logic is fully verified offline via cw-multi-test (`cargo test`); the
optimizer is only a packaging step for on-chain deployment.
