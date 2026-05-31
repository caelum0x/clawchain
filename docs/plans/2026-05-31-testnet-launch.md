# Testnet Launch Plan

_Status: 2026-05-31. Local readiness is complete; public deployment is blocked on hosts, DNS/TLS, and external participants._

## Goal

A public, persistent, multi-validator testnet that external integrators,
validators, explorer, and wallets can connect to. It is a mainnet dry run with
valueless tokens, public endpoints, and an upgrade cadence.

## Current State

Local work that can be completed without VPS or additional people is done and is
no longer part of the active launch checklist.

Run the local readiness gate:

```bash
bash scripts/testnet/public-readiness-gate.sh
```

Latest local result:

- 13 local checks passed.
- 0 local checks failed.
- 2 live checks skipped by default: full-module smoke and upgrade rehearsal, both
  already have committed live evidence.
- 8 items remain blocked by public infrastructure or external participation.

## Completed Local Evidence

- Local 4-validator network: `scripts/testnet/local-multinode.sh`.
  Verified 4 validators reached lockstep consensus with REST enabled.
- Full-module local smoke: `scripts/testnet/smoke-multinode.sh`.
  Verified bank, tokenfactory, privacy shield->unshield with real ZK proof,
  oracle commit-reveal, agent+marketplace, and governance submit/vote
  (6 passed / 0 failed).
- Governance upgrade rehearsal: `scripts/testnet/rehearse-gov-upgrade.sh`.
  Verified a two-binary `MsgSoftwareUpgrade` flow: pre-upgrade binary halted at
  height 134, post-upgrade binary applied `testnet-v1-rehearsal` at height 134,
  and all 4 validators produced post-upgrade blocks (10 passed / 0 failed).
- External-validator genesis ceremony simulation:
  `scripts/testnet/simulate-genesis-ceremony.sh`.
  Verified 4 isolated validator homes can generate gentxs and the coordinator
  flow collects them into a valid final genesis.
- Static launch config preflight:
  Docker compose config, nginx template, monitoring configs, explorer testnet
  config, public env template, public status schema, and local artifact scripts
  are present/parseable.

## Active Public Launch Checklist

These are the only remaining launch tasks.

- Provision validator and sentry hosts.
- Configure public DNS and TLS for RPC, REST, gRPC, faucet, explorer, Grafana,
  Prometheus, and the static testnet artifact site.
- Replace placeholder seed IDs and endpoint values in public artifacts.
- Run the real external-validator genesis ceremony and collect signed-off gentxs.
- Decide and execute the testnet privacy trusted setup. Default recommendation:
  small multi-party ceremony; acceptable fallback is single-party setup clearly
  labelled insecure-for-value.
- Deploy the public validator stack, faucet, explorer, monitoring, and static
  artifact endpoint.
- Smoke all Phase 1 flows against public endpoints, not localhost.
- Run a 7-day public soak.
- Rehearse one public gov-driven upgrade after external validators join.
- Onboard at least one external validator and one external integrator.
- Publish public status/on-call communications.
- Establish IBC connections to partner testnets where available.

## Target Shape

| Property | Testnet |
|---|---|
| Chain ID | `clawchain-testnet-1` (bump suffix per relaunch) |
| Validators | 4-8, mixing core and external validators |
| Persistence | Persistent; state survives; upgrades via gov + `upgrade-runbook.md` |
| Keys | Real per-validator keys; HSM optional |
| Privacy ZK keys | Dedicated testnet setup; never dev keys or mainnet MPC output |
| Faucet | Rate-limited public faucet |
| Endpoints | Public RPC/REST/gRPC behind TLS and rate limits |

## Acceptance Criteria

- At least 4 validators producing public blocks with `catching_up: false`.
- Public RPC/REST/gRPC reachable over TLS.
- Full module smoke passes against public endpoints.
- Faucet, explorer, and monitoring are live and healthy.
- One public gov-driven chain upgrade rehearsal succeeds after external validators
  join.
- At least 1 external validator and 1 external integrator are onboarded.

## References

- Local readiness: `scripts/testnet/public-readiness-gate.sh`
- Local multinode: `scripts/testnet/local-multinode.sh`
- Local module smoke: `scripts/testnet/smoke-multinode.sh`
- Local upgrade rehearsal: `scripts/testnet/rehearse-gov-upgrade.sh`
- Local ceremony simulation: `scripts/testnet/simulate-genesis-ceremony.sh`
- Public artifact publishing: `testnet/publish-public-testnet.sh`
- Deploy preset: `testnet/deploy-hetzner-public.sh`
- Upgrade policy: `docs/upgrade-runbook.md`, `docs/testnet-upgrade-cadence.md`
