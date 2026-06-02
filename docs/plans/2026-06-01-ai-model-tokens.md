# AI Model Tokens on ClawChain — Tokenizing AI Models Like Stocks

_Plan / design + P0/P1 CLI slice. Status: 2026-06-01. Owner: TBD. NOT financial advice; testnet-only until legal review._

## Implementation status (2026-06-01)

P0 has a live-accepted `clawd` implementation slice:

- `clawd model-token issue --model <slug> --supply <amount>` registers model metadata in
  `x/modelregistry`, creates `factory/<issuer>/<subdenom>` through `x/tokenfactory`,
  and mints the initial model-token supply to the issuer in one signed transaction.
  The CLI normalizes model IDs to tokenfactory-safe subdenoms using lowercase
  alphanumerics, `_`, and `/`.
- `clawd model-token catalog` lists real OpenRouter-backed presets, starting with
  `anthropic/claude-opus-4.8` and `qwen/qwen3.7-max`; `clawd model-token issue
  --preset <id>` fills real model metadata and stores `openrouter:<model-id>` in
  modelregistry.
- Optional DEX seeding is built into the same command: `--dex-factory <addr>` submits an
  Astroport `create_pair` for `CLAW/model-token`, and `--base-amount` +
  `--model-amount` seeds initial native-token liquidity when the pair address is emitted.
- The command uses the shared `clawd` custom protobuf registry so
  `/clawchain.modelregistry.v1.*`, `/osmosis.tokenfactory.v1beta1.*`, and
  `/cosmwasm.wasm.v1.MsgExecuteContract` messages are actually encodable by CosmJS.
- The chain-side `x/modelregistry` app module now mounts its msg/query services through
  the app's service registrar shape used by the other modules; this fixed the live
  `no message handler found for *types.MsgRegisterModel` acceptance blocker.
- Focused tests cover subdenom normalization, modelregistry/tokenfactory message shapes,
  Astroport create-pair/liquidity execute messages, event extraction, CLI JSON output,
  and the issue + optional DEX transaction sequence.
- P1 has a first holder-capable redemption bridge:
  `clawd model-token redeem --model-id <id> --amount <n> --input <prompt>` burns an
  AI model token through `MsgBurn` and submits `MsgSubmitInferenceJob` in the
  same signed transaction. The token denom can be passed with `--denom` or derived from
  `--model/--symbol`.
- `clawd model-token inference-setup --model-id <id>` sets model inference pricing
  through `MsgSetInferencePricing` and can register the owner wallet as an online
  inference provider with `MsgRegisterInferenceProvider`. This makes a newly issued
  model token immediately redeemable on a dev/test chain once the owner knows the
  model ID.
- `clawd model-token start-job --job-id <id>` and
  `clawd model-token complete-job --job-id <id> --output <text> --tokens-used <n>`
  let the assigned provider drive the modelregistry job lifecycle through running and
  completed states. These provider lifecycle transactions use explicit gas fees derived
  from configured gas price after live acceptance showed auto gas could under-estimate
  `MsgStartInferenceJob`.
- `clawd model-token serve-once` is the first provider automation loop: it queries
  assigned active jobs, starts pending jobs, completes pending/running jobs, supports
  deterministic output templates for testnet workflows, and can call OpenRouter with
  `--openrouter-model` when `OPENROUTER_API_KEY` is configured.
- `clawd model-token serve-loop` turns that one-shot path into a supervised provider
  loop with `--interval-ms` and `--max-cycles`; `--max-cycles 0` keeps serving until
  the operator stops it.
- `x/tokenfactory` now supports holder self-burn for registered factory denoms while
  preserving admin burn behavior. This lets non-admin holders redeem their own model
  tokens without giving them authority to burn another account's balance.
- Full holder UX still belongs in the planned ModelVault/vault-mediated flow, where
  token budgeting, revenue accounting, and provider settlement can be enforced in one
  place.
- `scripts/testnet/model-token-holder-redeem.sh` captures the live P1 workflow:
  fund owner/holder, issue model token, set inference pricing/provider readiness,
  transfer model tokens to a non-admin holder, holder self-burns, provider runs
  `serve-loop`, and final on-chain job status is asserted as `completed`.

P2 has a built ModelVault contract + CLI + web surface (bonding curve and
revenue/dividend pool):

- `contracts/model-vault/` is a CosmWasm contract implementing the reserve-backed
  bonding curve and the pro-rata revenue pool. Pricing math lives in `src/curve.rs`
  (buy = send CLAW → mint model tokens against the reserve; sell = burn model tokens →
  receive CLAW), and the per-token reward-index accrual lives in `src/rewards.rs`
  (`Stake`/`Unstake`/`ClaimRewards`, with `DistributeRevenue` crediting the pool so
  stakers earn pro-rata inference fees). `msg.rs` exposes execute `Buy`/`Sell`/`Fund`/
  `Stake`/`Unstake`/`ClaimRewards`/`DistributeRevenue` and queries `Config`/`Pool`/
  `PoolInfo`/`Quote`/`StakeInfo`.
- `clawd model-vault` (`cmd/clawd/src/commands/model-vault.ts`) drives the contract from
  the CLI: `fund`/`buy`/`sell` (curve), `stake`/`unstake`/`claim`/`distribute` (revenue
  pool), and `quote`/`stake-info`/`pool-info`/`config`/`pool` (queries). Messages route
  through the shared `clawd` custom registry as `MsgExecuteContract`; query keys are
  decoded back to JSON and asserted to match the contract's snake_case `msg.rs` exactly.
- The web AI Model Exchange page now has a `StakeEarnPanel`
  (`web/src/components/StakeEarnPanel.tsx`, backed by `web/src/lib/model-vault.ts`) that
  queries `pool-info`/`stake-info` and exposes stake/claim actions, completing the
  user-facing dividend-pool loop on the web side.
- Remaining P2 work is live on-chain acceptance against a real testnet (wasm packaging /
  store-instantiate, then a buy-moves-price-on-the-curve + holder-claims-non-zero-revenue
  run), and wagmi hooks so a React dApp can drive the vault (currently P4).

Verification:

```bash
cd cmd/clawd && npm test -- --run src/commands/__tests__/model-token.test.ts src/lib/registry.test.ts src/commands/__tests__/model.test.ts
cd cmd/clawd && npm test
cd cmd/clawd && npm run build
cd cmd/clawd && node dist/main.js model-token catalog --json
cd cmd/clawd && node dist/main.js model-token issue --help
cd cmd/clawd && node dist/main.js model-token redeem --help
cd cmd/clawd && node dist/main.js model-token start-job --help
cd cmd/clawd && node dist/main.js model-token complete-job --help
cd cmd/clawd && node dist/main.js model-token serve-once --help
cd cmd/clawd && node dist/main.js model-token serve-loop --help
bash -n scripts/testnet/model-token-holder-redeem.sh
bash -n scripts/testnet/model-token-real-models.sh
go test -count=1 ./x/modelregistry/... ./x/tokenfactory/...
go build -o build/clawchaind ./cmd/clawchaind/
# P2 ModelVault (offline):
cd contracts/model-vault && cargo test                 # 35 tests (15 unit curve/rewards + 20 integration)
cd cmd/clawd && npx vitest run src/commands/__tests__/model-vault.test.ts   # 11 tests
cd web && npx tsc --noEmit && npx vitest run src/components/__tests__/StakeEarnPanel.test.tsx src/lib/__tests__/model-vault.test.ts  # 17 tests
```

P2 offline acceptance passed 2026-06-01: model-vault contract `cargo test` 35/35
(bonding-curve pricing + reward-index accrual), `clawd model-vault` 11/11 (execute
message + decoded snake_case query-key shapes), and the web Stake & Earn panel 17/17
with `tsc --noEmit` clean. Live store-instantiate + on-chain curve/revenue acceptance is
the remaining P2 step.

Live P0 acceptance passed on a fresh 4-validator local testnet with deployed DEX
contracts:

- Issued model `opus-4-6-live-1780270277` as denom
  `factory/claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h/opus_4_6_live_1780270277`.
- Seeded pair `claw1fzm6gzyccl8jvdv3qq6hp9vs6ylaruervs4m06c7k0ntzn2f8faqmw95md`
  with 10,000 `uclaw` + 10,000 model tokens.
- Swapped 1,000 `uclaw` through the pair, returning 907 model tokens; swap tx
  `DBA0DB4DBAB998524CA2D95779D5BC3EA21DB717F2981D94AEFC36FF99763DCB` landed at
  height 208 with code 0.

Live tx hashes: issue
`B7A03A62DDB1878A1D4539740360390E22FE16C7A72427A6B0D037B30A70038E`, pair
`4ABA3D5728F0433649456C37BA98D5861B206445AFF1E08521C1D22652BAF333`, liquidity
`C5CF37C27635F7E8E58392A46BD9D46082EA3A2571F260D0A6CDCA5DC0392E53`.

Live P1 holder-redemption completion workflow also passed on the local 4-validator
testnet:

- Owner `claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk` issued model
  `holder-redeem-1780272590` as denom
  `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/holder_redeem_1780272590`.
- The owner configured zero-minimum inference pricing and registered as provider
  `clawchain://owner-provider`.
- Non-admin holder `claw19rl4cm2hmr8afy4kldpxz3fka4jguq0akhr68a` received 100 model
  token base units, self-burned them with `clawd model-token redeem`, and created
  inference job `1`.
- The registered provider ran `clawd model-token serve-loop --max-cycles 1`, which started and
  completed job `1`; the workflow queried `modelregistry inference-job 1` and asserted
  final status `completed`.
- Tx hashes: issue `783864C479AEA32DDB8DEA7088C0BF6E8AF2FD0833D038E0FC451C2E4B86D91F`,
  setup `57C45282EA5AE7E57A31E0BA1466818F1522E623EF52AB7347D6432F9C7DCA9F`,
  transfer `F1A5BE7DC86E65912FE8D10EB68532A8B9D23F207406182F3B292BBBBEF2E73D`,
  redeem `08780A8AB017CC6B7F0581E2F758C366126AD630B7C81A95E9B9460B9F401740`,
  start `8EBAC54E6A42B920E26637F9117328FBA1A73DF57827C4452E9084162127D9C3`,
  complete `CAB3F55D61C06A7D00A763E1BF10D95F80687206ADAC5154583099E3E90B2F06`.

Live real-model registration workflow also passed on the local 4-validator testnet:

- OpenRouter's public models endpoint returned both `anthropic/claude-opus-4.8` and
  `qwen/qwen3.7-max` as present before chain registration.
- Issued Claude Opus 4.8 as denom
  `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/claude_opus_4_8` with
  modelregistry storage URI `openrouter:anthropic/claude-opus-4.8`.
- Issued Qwen3.7 Max as denom
  `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/qwen3_7_max` with
  modelregistry storage URI `openrouter:qwen/qwen3.7-max`.
- Tx hashes: fund `1BE6FDD52191755BEA747118339A9CCBBE6597ED7410C190CB3F5521E9447BD4`,
  Claude issue `91F431355034EF63DE51CFA9A65115A3184BE08DA2FE86146A23D7E97E07E733`,
  Qwen issue `F168F2398AC3EB58F78F5AE6F8A246ABC2351F7D4FA773F9F236C99F127C4F78`.

## The idea (the pun made literal)

"AI models have tokens (the LLM unit of inference) and blockchains have tokens (assets)."
This plan unifies them: **every AI model gets a tradeable on-chain token**, e.g.
`OPUS46`, `GPT5`, `LLAMA4`, that is simultaneously:

1. **Redeemable for real inference** on that model (1 model-token ≈ a budget of LLM
   tokens of that model's output), and
2. **A market asset** whose price floats with the model's demand, usage, quality, and
   revenue — so you can hold/trade it like a stock, and
3. **Revenue-bearing** — holders earn a pro-rata share of the inference fees the model
   earns on-chain (dividend-like).

So buying `OPUS46` is like buying a share in Claude Opus 4.6's on-chain usage: you can
*spend* it to run the model, *hold* it as the model's usage/revenue grows, or *trade*
it on the DEX. Nobody has tokenized AI-model capacity + revenue as a single redeemable,
tradeable, dividend-bearing asset before — this is the novel surface.

## Why ClawChain can actually do this (existing primitives)

This is NOT greenfield — it composes modules ClawChain already has (all live-verified):

| Need | Existing primitive |
|---|---|
| Per-model fungible token | `x/tokenfactory` — `factory/<issuer>/<modelid>` denom (create-denom/mint/burn proven) |
| Model identity + inference lifecycle | `x/modelregistry` — RegisterModel, RegisterInferenceProvider, SetInferencePricing, SubmitInferenceJob → Start → Complete/Fail, ProviderHeartbeat, RateModel |
| Actual inference execution | OpenClaw `extensions/clawchain/src/inference-tools.ts` (OpenRouter bridge) wired into SkillExecutor |
| Price / index oracle | `x/oracle` (commit-reveal exchange rates, live-proven) |
| Trading market ("the exchange") | DEX (local Astroport build) — model-token/CLAW pairs |
| Reputation / quality signal | `x/reputation` (RateAgent/EndorseAgent), modelregistry RateModel |
| Client + tooling | `@clawchain/sdk`, `clawd`, the viem/wagmi adapters |

The only genuinely new on-chain logic is the **bonding + revenue-distribution** glue,
which can start as a CosmWasm contract (no chain upgrade) and later harden into a module.

## What a "model token" represents (the three models, and the hybrid)

- **A. Utility (inference credits):** 1 token = a fixed budget of model output tokens.
  Spend → burns the token, triggers a real inference job. Pure prepaid-API-as-an-asset.
- **B. Index ("stock"):** price tracks a model's fundamentals (job volume, latency,
  rating) published by the oracle. Speculate on which models win. No redemption.
- **C. Equity (dividends):** holding entitles you to pro-rata inference fees the model
  earns. Aligns holders with real usage and rewards hosting/improving the model.

**Recommended hybrid (A + C, with B as the oracle-fed reference):** the token is a
fungible claim that is *both* redeemable for inference *and* accrues a share of the
model's on-chain inference revenue, with a market price discovered by a bonding curve
and/or the DEX, and an oracle index as a published "fundamental." This gives utility
(real demand sink), a reason to hold (dividends), and a tradeable market (the "stock").

## Architecture

```
        issue/mint                          buy/sell
 issuer ──────────▶ tokenfactory denom  ◀───────────▶  DEX pair (TOKEN/CLAW)   ← traders
                    factory/<iss>/OPUS46          ▲
                          │                       │ price reference
        redeem (burn) ────┤                       │
                          ▼                  x/oracle model index
                 ModelVault (CosmWasm v0 / x/modeltoken v1)
                    • CLAW reserve  • bonding curve  • revenue pool
                          │                    ▲
            inference job │                    │ fees
                          ▼                    │
                 x/modelregistry  ──▶ inference provider ──▶ OpenClaw/OpenRouter (real call)
```

### Token issuance
- An issuer registers the model in `x/modelregistry` (RegisterModel) and mints a
  tokenfactory denom `factory/<issuer>/<modelid>` — the model token. Metadata
  (model id, OpenRouter slug, output-tokens-per-claw-token, fee bps) is recorded in a
  `ModelVault` keyed by the denom.

### Price discovery — bonding curve + DEX
- **v0:** a `ModelVault` CosmWasm contract holds a CLAW reserve and mints/burns model
  tokens against it on a bonding curve (e.g. constant-product or linear), so price is
  deterministic and always has liquidity. Buy = send CLAW → mint tokens; sell = burn
  tokens → receive CLAW.
- **v1:** also list `TOKEN/CLAW` on the DEX for free-market price; the bonding curve
  becomes the issuer's primary market / backstop. Arbitrage keeps them aligned.

### Redemption → real inference (the hard, novel part)
- Holder calls `redeem(amount, prompt)` → vault **burns** the tokens, opens a
  `SubmitInferenceJob` in `x/modelregistry` priced from the token's output-tokens budget.
- A registered **inference provider** (modelregistry) executes via the OpenClaw
  OpenRouter bridge, then `CompleteInferenceJob` with the result + a usage attestation
  (output token count). The job fee (in CLAW or burned-token value) flows to the
  model's **revenue pool**.
- **Trust boundary (must be designed explicitly):** inference runs off-chain. v0 trusts
  registered providers + ProviderHeartbeat + RateModel slashing of bad providers.
  v1 adds attestation (signed usage receipts, optionally TEE/zkML later) and a
  dispute/slash path so a provider can't claim completion without delivering. This is
  the same provider-trust model the GPU/DanteGPU side already uses.

### Revenue / dividends
- Inference fees accrue per model into the vault's revenue pool. Holders claim
  pro-rata (reuse the staking/distribution accrual pattern: per-token reward index,
  claim on transfer). Optional: a cut to the model issuer and to providers.

### Oracle index ("fundamentals")
- `x/oracle` publishes a per-model index from on-chain signals (completed-job volume,
  avg latency from job timestamps, RateModel score, provider count). Traders and the
  bonding curve can reference it; it makes the "stock" have a visible fundamental.

## Phased build plan

- **P0 — Issue & trade (composition only, buildable NOW, no chain change):**
  SDK `ModelToken` + `clawd model-token` commands that: RegisterModel → create-denom +
  mint the model token → seed a DEX `TOKEN/CLAW` pool → buy/sell on the DEX. Proves the
  "AI model as a tradeable token" surface using only proven primitives (tokenfactory +
  Astroport + modelregistry). **CLI issue + optional DEX seed slice implemented and
  live swap acceptance passed on local 4-validator testnet.**
- **P1 — Redeem for inference:** wire `redeem` → SubmitInferenceJob → OpenClaw/OpenRouter
  provider → CompleteInferenceJob, burning the spent tokens. Closes the utility loop end
  to end (token → real Claude/GPT/Llama output). **CLI bridge implemented: holder
  self-burn + SubmitInferenceJob in one tx, provider start/complete commands, and
  `serve-once`/`serve-loop` provider automation with optional OpenRouter execution, with
  a live testnet workflow asserting final job status `completed`. Remaining P1 work is
  vault UX/accounting and a production supervisor/daemon wrapper.**
- **P2 — ModelVault bonding curve (CosmWasm):** reserve-backed mint/burn pricing +
  revenue pool + pro-rata holder claims. Deterministic liquidity + dividends.
  **Contract (`contracts/model-vault/`), `clawd model-vault` command group, and the web
  Stake & Earn panel implemented and offline-verified (35 + 11 + 17 tests). Remaining:
  live store-instantiate + on-chain curve/revenue acceptance.**
- **P3 — Oracle model index:** publish per-model fundamentals; reference in the vault/UI.
  **Built (offline): `clawd model-index compute|publish` derives a weighted composite
  index from x/modelregistry (job volume, completion rate, latency, rating, provider
  count) and publishes it through the oracle commit-reveal path under a synthetic
  `idx:model:<id>` denom; the web `ModelFundamentals` panel surfaces the same fundamentals
  on the AI Model Exchange page. Remaining: a chain-side aggregation query so the index
  isn't recomputed client-side, and live oracle-vote acceptance.**
- **P4 — Harden:** provider attestation + dispute/slash for inference settlement; an
  `x/modeltoken` module if the CosmWasm vault outgrows contract limits; web dashboard
  "AI stock exchange" page; wagmi hooks so a React dApp can trade model tokens.
  **Partially built (offline): wagmi-style hooks (`sdk/src/wagmi-model-vault.ts`), the web
  "AI Stock Exchange" markets-overview page (`web/src/pages/ModelMarkets.tsx`), a typed
  `ModelVaultClient` + `ModelMarket` aggregate in `@clawchain/sdk`, `clawd model-vault
  watch`/`arb` curve-vs-DEX tooling, and a holder portfolio surface (SDK `ModelPortfolio`,
  `clawd model-vault portfolio`, web Portfolio page). Remaining: the trust-boundary
  hardening — provider usage attestation + dispute/slash on inference settlement — and the
  optional `x/modeltoken` module migration. These are the genuinely chain-side P4 items.**
  **UPDATE (2026-06-02): proto/generated drift RECONCILED (`4388d0a5`) — `make proto-gen`
  idempotent, proto sources now version-tracked (gitignore trap fixed), build+tests green
  (see `docs/known-issues/proto-generated-drift.md`). Provider usage attestation LANDED:
  `MsgSubmitUsageAttestation` in `x/modelregistry` (`6eea59de`) records a completed job's
  attestation (provider-only, status-gated) with a keeper test. Remaining P4: the dispute
  path (`MsgDisputeInferenceJob`) + reputation slashing hook, and the optional `x/modeltoken`
  module migration.**

## Acceptance (per phase)

- **P0:** `clawd model-token issue --model opus-4-6 --supply N` creates a live
  `factory/<iss>/opus_4_6` denom, seeds a DEX pool, and a swap CLAW→OPUS46 returns code 0
  on the local testnet. **Passed 2026-06-01.**
- **P1:** redeeming OPUS46 burns tokens and returns a real model completion (live, gated
  by `OPENROUTER_API_KEY`), with the inference job marked Complete on-chain.
- **P2:** buy/sell against the vault reserve moves price on the curve; a holder claims a
  non-zero revenue share after inference fees accrue. **Offline-proven in the contract
  integration tests (`contracts/model-vault/tests/integration.rs`) + CLI/web suites
  (2026-06-01); live on-chain acceptance pending wasm store-instantiate.**

## Risks & open questions (must address before mainnet)

- **Securities/regulatory:** a revenue-bearing, tradeable token tied to an asset's
  performance looks like a security in many jurisdictions. Testnet-only; explicit legal
  review (`docs/legal-compliance-launch-review.md`) before any value-bearing launch.
- **Inference-settlement trust:** off-chain execution is the core trust gap — providers
  could claim completion without delivering. Mitigate with attestations, RateModel +
  slashing, disputes; TEE/zkML is the long-term answer. Do NOT pretend on-chain verifies
  the LLM output in v0 — be explicit it's provider-trust.
- **Oracle manipulation:** usage/quality metrics feeding the index can be gamed (sybil
  jobs to pump a model). Reuse the oracle's staker-weighted commit-reveal + reputation.
- **Model identity & IP:** anyone can mint a `factory/<iss>/opus-4-6`; the denom is
  issuer-scoped, so "official" model tokens need issuer verification (modelregistry
  ownership + a verified-issuer registry) to avoid impersonation.
- **Peg/reserve:** redemption value vs market price can diverge; the bonding-curve
  reserve and a redemption oracle price need careful mechanism design.

## Dependencies / references

- `x/tokenfactory`, `x/modelregistry`, `x/oracle`, DEX (local Astroport build),
  `x/reputation`, `@clawchain/sdk`, `cmd/clawd`, `clawchain-alloy`.
- OpenClaw OpenRouter bridge: `openclaw/extensions/clawchain/src/inference-tools.ts`.
- Related: `docs/plans/2026-03-09-open-source-forks-design.md` (ClawArtemis DEX exec via
  `@clawchain/sdk` — the same compose-existing-primitives pattern P0 uses).
