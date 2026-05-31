# Devnet Launch Plan

_Status: 2026-05-31. Local devnet, seeded demo state, optional 2-chain IBC devnet, Docker devnet stack override, and CI smoke wiring are implemented and verified locally._

## Goal

A throwaway, fast-iterating developer network that any contributor can stand up
and reset locally. It is not public, persistent, or secure; it is optimized for
iteration speed and parity with the chain module set.

## Completed Local Devnet

- `scripts/local-dev.sh --devnet`
  - Uses chain ID `clawchain-devnet`.
  - Uses isolated home `.devnet-node/`, separate from `.local-node/`.
  - Builds `build/clawchaind`.
  - Funds the reproducible `dev-account`.
  - Creates an oracle feeder key.
  - Enables REST/gRPC/CORS.
  - Configures permissionless CosmWasm upload.
  - Generates insecure dev privacy pk/vk keys.
  - Applies fast devnet gov/staking/slashing params.
  - Starts the node and writes `.devnet-node/.clawchaind.pid`.
- `scripts/devnet-reset.sh`
  - Stops the devnet node and wipes `.devnet-node/`.
- `scripts/devnet-smoke.sh`
  - Verifies block production, bank send, tokenfactory create+mint, privacy
    shield, oracle commit-reveal, agent+marketplace, and governance submit+vote.
- Make targets:
  - `make devnet-up`
  - `make devnet-smoke`
  - `make devnet-ci`
  - `make devnet-compose`
  - `make devnet-seed-demo`
  - `make devnet-seed-dex`
  - `make devnet-ibc`
  - `make devnet-stack-up`
  - `make devnet-stack-down`
  - `make devnet-reset`
- `scripts/devnet-ci.sh`
  - Resets the devnet, boots `scripts/local-dev.sh --devnet`, runs
    `scripts/devnet-smoke.sh`, and tears the node down on exit.
- `docker-compose.devnet.yml`
  - Runs the same CI-style devnet gate inside a disposable Docker profile.
- `scripts/devnet-seed-demo.sh`
  - Seeds funded demo accounts, a tokenfactory denom, a marketplace skill, a
    registered agent, a privacy note, and an oracle commit-reveal.
  - Writes a generated local artifact to `artifacts/devnet/demo-state.json`
    (ignored by git because it is environment-specific output).
- `scripts/devnet-seed-dex.sh`
  - Deploys prebuilt Astroport DEX contracts, registers native coin metadata,
    and creates an initial CLAW/ATOM pool.
  - Writes generated local deployment artifacts under `artifacts/code-ids.json`
    and `artifacts/contract-addresses.json`.
- `scripts/devnet-ibc.sh`
  - Builds the current binary and runs the optional two-chain IBC devnet driver
    based on `scripts/ibc-two-chain-test.sh`.
- `docker-compose.devnet-stack.yml`
  - Overrides the root Docker stack with `clawchain-devnet` IDs, devnet-fast
    chain params, a funded local faucet mnemonic, and browser-local web/explorer
    endpoints.
- `.github/workflows/devnet-smoke.yml`
  - Runs the ephemeral devnet smoke gate on `main` pushes and pull requests.

Latest live verification:

```bash
bash scripts/devnet-ci.sh
```

Result: 7 passed / 0 failed.

Additional local verification:

- `bash scripts/devnet-seed-demo.sh`: 9 passed / 0 failed.
- `bash scripts/devnet-seed-dex.sh`: DEX contracts deployed and one pair registered.
- `bash scripts/devnet-ibc.sh`: 6 passed / 0 failed in manual relayer mode.
- `FAUCET_MNEMONIC=... docker compose -f docker-compose.yml -f docker-compose.devnet-stack.yml config -q`: passed.

## Active Remaining Work

- None for local devnet readiness.
- Future enhancement only: install/configure a real IBC relayer (`rly` or the
  Informal Systems Hermes binary) in developer environments to exercise packet
  relay instead of the current manual message-construction path when unavailable.

## Target Shape

| Property | Devnet |
|---|---|
| Validators | 1 by default; optional 2-chain mode for IBC dev |
| Chain ID | `clawchain-devnet` |
| Persistence | Ephemeral; wipe `.devnet-node/` freely |
| Keys | `test` keyring and reproducible dev account |
| Privacy ZK keys | Insecure `privacy gen-dev-keys` pk/vk |
| Faucet | Open local faucet in Docker devnet stack |
| Tokenomics | Inflated dev supply; gas price `0.025uclaw` |

## Acceptance Criteria

- `scripts/local-dev.sh --devnet` boots a producing local chain.
- `scripts/devnet-smoke.sh` passes against a fresh devnet.
- `scripts/devnet-reset.sh` returns the devnet to a clean slate.
- `scripts/devnet-ci.sh` boots a clean devnet, runs live drivers, and tears down.
- Docker profile validates and runs the same devnet CI gate.
- CI devnet job is wired to the live devnet gate.
- `scripts/devnet-seed-demo.sh` seeds demo accounts/module state and writes a
  generated local artifact.
- `scripts/devnet-seed-dex.sh` deploys DEX contracts and creates the initial
  demo pool.
- `scripts/devnet-ibc.sh` runs the optional two-chain IBC devnet driver.
- Full Docker stack override validates with devnet defaults.

## References

- Local devnet boot: `scripts/local-dev.sh --devnet`
- Reset: `scripts/devnet-reset.sh`
- Smoke: `scripts/devnet-smoke.sh`
- Seed demo state: `scripts/devnet-seed-demo.sh`
- Seed DEX fixture: `scripts/devnet-seed-dex.sh`, `scripts/deploy-dex.sh`
- Docker full-stack devnet override: `docker-compose.devnet-stack.yml`
- IBC base: `scripts/ibc-two-chain-test.sh`, `scripts/ibc-relay-rly.sh`
- Live drivers: `cmd/clawd/scripts/live-shield-check.ts`,
  `cmd/clawd/scripts/live-oracle-check.ts`,
  `cmd/clawd/scripts/live-modules-check.ts`
