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

> No-fee note: a fee-less integer constant-product market is not strictly arbitrage-free
> at the rounding level (a buy-then-sell round trip can drift by a dust amount). Adding a
> swap fee in a later version closes that gap. The `round_trip_returns_close_to_principal`
> test documents and bounds this behaviour.

## Messages

`InstantiateMsg { model_denom, reserve_denom?, owner?, initial_reserve?, initial_inventory? }`
— `reserve_denom` defaults to `uclaw`, `owner` defaults to the instantiator. The optional
initial amounts seed the curve state (attach matching funds at instantiate time).

`ExecuteMsg`:
- `Fund {}` — owner-only. Attach `model_denom` and/or `reserve_denom`; the matching state
  amounts increase.
- `Buy {}` — attach exactly one `reserve_denom` coin.
- `Sell {}` — attach exactly one `model_denom` coin.

`QueryMsg`:
- `Config {}` -> `{ model_denom, reserve_denom, owner }`
- `Pool {}` -> `{ reserve, inventory }`
- `Quote { side, amount }` -> `{ amount_out, denom_in, denom_out }` (pure math, no state
  change)

## Build & test

```bash
# native build + cw-multi-test integration tests + curve unit tests
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
