# Mainnet Cutover Rehearsal Evidence

Phase 15 Track C cutover rehearsal packet.

## Rehearsal Metadata

- Rehearsal ID: `CUTOVER-REHEARSAL-20260226-01`
- Manifest: `https://mainnet.clawchain.dev/manifest.json`
- Host: `validator-bridge.mainnet.clawchain.dev`
- Rehearsal window (UTC): `2026-02-26T22:05:00Z to 2026-02-26T22:19:00Z`
- Rehearsal owner: `Runtime Operations Lead`

## Fresh-Machine Bootstrap to Readiness

Executed command:

`make fresh-machine-acceptance-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev READY_TIMEOUT_SECONDS=180 ACCEPTANCE_TIMEOUT_SECONDS=300`

Result: `pass`

## Readiness Verification

- `make runtime-readiness-gate` -> `pass`
- `make clawd-doctor` -> `pass`
- Node reached ready state in `142s`

## Evidence Artifacts

- Acceptance output: `artifacts/cutover/fresh-machine-acceptance-20260226.log`
- Readiness JSON: `artifacts/cutover/readiness-20260226.json`
- Doctor JSON: `artifacts/cutover/doctor-20260226.json`

## Sign-Off

- Runtime owner approval: `RUNTIME-CUTOVER-APPROVAL-20260226-01` at `2026-02-26T22:19:00Z`
- Release owner approval: `REL-CUTOVER-APPROVAL-20260226-01` at `2026-02-26T22:19:00Z`
