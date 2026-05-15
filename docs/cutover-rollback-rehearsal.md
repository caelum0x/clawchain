# Cutover Rollback Rehearsal Evidence

Phase 15 Track C timed rollback rehearsal packet.

## Rollback Rehearsal Metadata

- Rehearsal ID: `CUTOVER-ROLLBACK-20260226-01`
- Snapshot ID: `snapshot-mainnet-20260226-214500`
- Rehearsal window (UTC): `2026-02-26T22:25:00Z to 2026-02-26T22:46:00Z`
- Owner: `Operations Lead`

## Timed Rollback Sequence

1. `make restore BACKUP=/var/backups/clawchain/clawchain-backup-20260226-214500.tar.gz`
2. `make runtime-readiness-gate`
3. `make release-ready-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`

## Timing Outcomes

- Recovery start: `2026-02-26T22:25:00Z`
- Runtime ready: `2026-02-26T22:39:00Z` (`14m`)
- Release gate re-pass: `2026-02-26T22:46:00Z` (`21m total`)
- Result: `pass`

## Recovery Gate Re-Pass Evidence

- Runtime readiness report: `artifacts/cutover/rollback-readiness-20260226.json`
- Release evidence snapshot: `artifacts/cutover/release-evidence-post-rollback-20260226.json`
- Command transcript: `artifacts/cutover/rollback-rehearsal-20260226.log`

## Sign-Off

- Operations owner approval: `OPS-ROLLBACK-APPROVAL-20260226-01` at `2026-02-26T22:46:00Z`
- Chain owner approval: `CHAIN-ROLLBACK-APPROVAL-20260226-01` at `2026-02-26T22:46:00Z`
