# AI Model Tokens on ClawChain — Tokenizing AI Models Like Stocks

_Plan / design. Status: 2026-06-01. Owner: TBD. NOT financial advice; testnet-only until legal review._

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
  Astroport + modelregistry). **First deliverable.**
- **P1 — Redeem for inference:** wire `redeem` → SubmitInferenceJob → OpenClaw/OpenRouter
  provider → CompleteInferenceJob, burning the spent tokens. Closes the utility loop end
  to end (token → real Claude/GPT/Llama output).
- **P2 — ModelVault bonding curve (CosmWasm):** reserve-backed mint/burn pricing +
  revenue pool + pro-rata holder claims. Deterministic liquidity + dividends.
- **P3 — Oracle model index:** publish per-model fundamentals; reference in the vault/UI.
- **P4 — Harden:** provider attestation + dispute/slash for inference settlement; an
  `x/modeltoken` module if the CosmWasm vault outgrows contract limits; web dashboard
  "AI stock exchange" page; wagmi hooks so a React dApp can trade model tokens.

## Acceptance (per phase)

- **P0:** `clawd model-token issue --model opus-4-6 --supply N` creates a live
  `factory/<iss>/opus-4-6` denom, seeds a DEX pool, and a swap CLAW→OPUS46 returns code 0
  on the local testnet.
- **P1:** redeeming OPUS46 burns tokens and returns a real model completion (live, gated
  by `OPENROUTER_API_KEY`), with the inference job marked Complete on-chain.
- **P2:** buy/sell against the vault reserve moves price on the curve; a holder claims a
  non-zero revenue share after inference fees accrue.

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
