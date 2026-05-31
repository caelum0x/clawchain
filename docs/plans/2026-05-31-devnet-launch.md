# Devnet Launch Plan

_Status: 2026-05-31. Local single-node devnet, Docker devnet profile, and CI smoke wiring are implemented and verified._

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
  - `make devnet-reset`
- `scripts/devnet-ci.sh`
  - Resets the devnet, boots `scripts/local-dev.sh --devnet`, runs
    `scripts/devnet-smoke.sh`, and tears the node down on exit.
- `docker-compose.devnet.yml`
  - Runs the same CI-style devnet gate inside a disposable Docker profile.
- `.github/workflows/devnet-smoke.yml`
  - Runs the ephemeral devnet smoke gate on `main` pushes and pull requests.

Latest live verification:

```bash
bash scripts/devnet-ci.sh
```

Result: 7 passed / 0 failed.

## Active Remaining Work

- Add optional seeded demo state for heavier UI demos:
  agent, skill, privacy note, tokenfactory denom, and DEX fixture.
- Decide whether to commit fixed dev mnemonics beyond the existing reproducible
  `dev-account` mnemonic.
- Add optional 2-chain IBC devnet mode using `scripts/ibc-two-chain-test.sh` as the
  base.
- Expand the Docker profile from the current smoke gate into a full UI stack
  profile if/when faucet, explorer, and web need one-command Docker parity.

## Target Shape

| Property | Devnet |
|---|---|
| Validators | 1 by default; optional 2-chain mode for IBC dev |
| Chain ID | `clawchain-devnet` |
| Persistence | Ephemeral; wipe `.devnet-node/` freely |
| Keys | `test` keyring and reproducible dev account |
| Privacy ZK keys | Insecure `privacy gen-dev-keys` pk/vk |
| Faucet | Open local faucet once Docker profile is wired |
| Tokenomics | Inflated dev supply; gas price `0.025uclaw` |

## Acceptance Criteria

- `scripts/local-dev.sh --devnet` boots a producing local chain.
- `scripts/devnet-smoke.sh` passes against a fresh devnet.
- `scripts/devnet-reset.sh` returns the devnet to a clean slate.
- `scripts/devnet-ci.sh` boots a clean devnet, runs live drivers, and tears down.
- Docker profile validates and runs the same devnet CI gate.
- CI devnet job is wired to the live devnet gate.

## References

- Local devnet boot: `scripts/local-dev.sh --devnet`
- Reset: `scripts/devnet-reset.sh`
- Smoke: `scripts/devnet-smoke.sh`
- IBC base: `scripts/ibc-two-chain-test.sh`, `scripts/ibc-relay-rly.sh`
- Live drivers: `cmd/clawd/scripts/live-shield-check.ts`,
  `cmd/clawd/scripts/live-oracle-check.ts`,
  `cmd/clawd/scripts/live-modules-check.ts`
