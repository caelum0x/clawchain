# Devnet Launch Plan

_Plan only — no code yet. Status: 2026-05-31. Owner: TBD._

## Goal

A throwaway, fast-iterating **developer network** that any contributor (or CI) can
stand up in minutes and tear down freely. Not public, not persistent, not secure —
optimized for iteration speed and parity with the real chain's module set.

## Shape

| Property | Devnet |
|---|---|
| Validators | 1 (single-node) or 2–3 local (IBC dev) |
| Chain ID | `clawchain-devnet` (vs `clawchain-local` for one-off) |
| Persistence | Ephemeral — wipe `.devnet-node/` freely |
| Keys | `test` keyring; well-known dev mnemonics committed for reproducibility |
| Privacy ZK keys | `clawchaind privacy gen-dev-keys` (insecure dev pk+vk, auto-seeded) |
| Faucet | Open, unlimited (`cmd/claw-faucet`) |
| Tokenomics | Inflated dev supply; gas price `0.025uclaw` |

## Steps

1. **Reuse `scripts/local-dev.sh` as the base** — it already does init → fund dev +
   feeder keys → genesis params → gentx → `privacy gen-dev-keys` (now emits pk+vk) →
   start with API/gRPC enabled. Add a `--devnet` flag that sets `CHAIN_ID=clawchain-devnet`
   and a separate home (`.devnet-node/`) so it doesn't collide with `clawchain-local`.
2. **Docker path** — extend the root `docker-compose.yml` with a `devnet` profile that
   brings up: chain, faucet (open), explorer (devnet config), web, optionally a 2nd
   chain + relayer for IBC dev. Reuse the validated `golang:1.24-bookworm` base.
3. **Seeded state** — optional `scripts/devnet-seed.sh` that, after boot, exercises a
   canonical fixture set (register an agent, list a skill, shield→unshield, create a
   tokenfactory denom, deploy the local Astroport build) so a fresh devnet has
   demo-ready data. Reuse `cmd/clawd/scripts/*` drivers.
4. **CI ephemeral devnet** — a CI job that boots the devnet in Docker, runs the
   `cmd/clawd/scripts` live drivers (shield/unshield, oracle, dex, ibc), asserts the
   expected tx codes, then tears down. This is the integration gate.
5. **Reset command** — `scripts/devnet-reset.sh` = stop + `rm -rf .devnet-node/` +
   re-run boot. One command back to clean slate.

## Acceptance criteria

- `scripts/local-dev.sh --devnet` boots a producing chain in < 60s on a dev laptop.
- A fresh devnet passes the full live-flow driver set (privacy, oracle, CosmWasm,
  DEX, IBC) with no manual key swap (relies on the Gap A `gen-dev-keys` pk+vk fix).
- `docker compose --profile devnet up` brings the whole stack healthy.
- CI devnet job runs the live drivers and is green.

## Open decisions

- 1-node vs 2–3-node default (IBC needs ≥2). Recommend: 1-node default, `--ibc` opt-in
  for the 2-chain + `rly` setup (`scripts/ibc-two-chain-test.sh` is the proven base).
- Whether to commit dev mnemonics (reproducible, but never reuse on testnet/mainnet).

## Dependencies / references

- `scripts/local-dev.sh`, `scripts/ibc-two-chain-test.sh`, `scripts/ibc-relay-rly.sh`
- `cmd/clawd/scripts/{roundtrip-shield,roundtrip-unshield,live-oracle-check,live-modules-check}.ts`
- `scripts/dex-local-swap.sh`, `cmd/claw-faucet`
- Builds on: testnet-launch (devnet is the rehearsal for it).
