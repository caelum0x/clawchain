# Final Cutover Runbook (Revision)

Phase 15 Track C final runbook revision.

## Revision Metadata

- Revision: `v1.0`
- Revised at (UTC): `2026-02-26T22:55:00Z`
- Based on rehearsals: `CUTOVER-REHEARSAL-20260226-01`, `CUTOVER-ROLLBACK-20260226-01`

## Accountable Owners

- Release Owner: `Release Manager`
- Runtime Owner: `Runtime Operations Lead`
- Chain Owner: `Chain Operations Lead`
- Rollback Authority: `Operations Lead`

## Final Cutover Command Flow

1. `make fresh-machine-acceptance-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`
2. `make runtime-readiness-gate`
3. `make mainnet-readiness-gate`
4. `make release-ready-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`

## Rollback Command Flow

1. `make restore BACKUP=/var/backups/clawchain/<latest-backup>.tar.gz`
2. `make runtime-readiness-gate`
3. `make release-ready-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`

## Evidence Links

- Fresh-machine rehearsal: `docs/mainnet-cutover-rehearsal.md`
- Timed rollback rehearsal: `docs/cutover-rollback-rehearsal.md`
- Incident drill baseline: `docs/incident-rollback-drill-log.md`

## Phase 19 Launch Control Handoff Windows

### T-24h (pre-launch lock)

1. `make nightly-ops-pack DAY_UTC=$(date -u +%Y%m%d) MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`
2. `make weekly-incident-drill-pack WEEK_ID=$(date -u +%G-W%V)`
3. `make monthly-governance-pack MONTH_ID=$(date -u +%Y-%m)`
4. `make phase18-continuous-ops-gate`
5. `make launch-execution-pack`
6. `make phase19-launch-execution-gate`

### T-1h (go-live decision window)

1. `make release-ready-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`
2. `make product-complete-gate`
3. `make go-live-packet`
4. `make support-handoff-snapshot`
5. `make launch-execution-pack`
6. `make phase19-launch-execution-gate`

### T+1h (post-launch stabilization handoff)

1. `make support-handoff-snapshot`
2. `make nightly-ops-pack DAY_UTC=$(date -u +%Y%m%d) MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev`
3. `make weekly-incident-drill-closure-gate`
4. `make monthly-governance-closure-gate`
5. `make phase18-continuous-ops-gate`
6. `make launch-execution-pack`

## Phase 20 Launch-Stabilized Promotion Criteria

Run this exact command sequence before promoting the network status to "launch stabilized":

1. `make post-launch-weekly-executive-summary`
2. `make post-launch-weekly-executive-summary-gate`
3. `make post-launch-executive-trend-7d`
4. `make phase20-ops-signal-gate`
5. `make post-launch-remediation-checklist`
6. `make post-launch-remediation-bundle`
7. `make phase20-recovery-loop-gate`
8. `make ops-maturity-packet`
9. `make phase20-product-complete-gate`

Required artifact paths for sign-off packet:

- `artifacts/launch-control/post-launch-weekly-executive-summary-latest.json`
- `artifacts/launch-control/executive-trend-7d-latest.json`
- `artifacts/launch-control/ops-remediation-checklist-latest.json`
- `artifacts/launch-control/ops-remediation-bundle-latest.json`
- `artifacts/launch-control/ops-maturity-packet-latest.json`
- `artifacts/release-evidence.json`

## Phase 21 Weekly Closure Sequence

Run this sequence once per weekly operations cycle before publishing closure outputs:

1. `make weekly-handoff-pack`
2. `make weekly-closure-bundle`
3. `make phase21-program-closure-gate`

Required weekly closure artifacts:

- `artifacts/launch-control/ops-artifact-index-latest.json`
- `artifacts/launch-control/weekly-publication-packet-latest.json`
- `artifacts/launch-control/weekly-handoff-note-latest.md`
- `artifacts/launch-control/weekly-closure-bundle-latest.json`

## Phase 22 Weekly Closeout Sequence

Run this sequence to produce deterministic weekly closeout outputs:

1. `make phase22-weekly-closeout`
2. `make phase22-program-closeout-gate`

Required Phase 22 closeout artifacts:

- `artifacts/launch-control/weekly-closure-digest-pack-latest.json`
- `artifacts/launch-control/operator-status-snapshot-latest.json`
- `artifacts/launch-control/operator-status-snapshot-latest.md`

## Phase 23 Weekly Finalization Sequence

Run this sequence for final weekly attestation and history continuity outputs:

1. `make phase23-weekly-finalize`
2. `make phase23-program-finalize-gate`

Required Phase 23 finalization artifacts:

- `artifacts/launch-control/weekly-closeout-attestation-latest.json`
- `artifacts/launch-control/weekly-history-rollup-latest.json`

## Phase 24 Weekly Certification Sequence

Run this sequence for weekly audit and signoff certification outputs:

1. `make phase24-weekly-certify`
2. `make phase24-program-certify-gate`

Required Phase 24 certification artifacts:

- `artifacts/launch-control/weekly-audit-log-latest.json`
- `artifacts/launch-control/weekly-signoff-manifest-latest.json`
- `artifacts/launch-control/weekly-signoff-manifest-latest.md`

## Phase 25 Weekly Notarization Sequence

Run this sequence for deterministic weekly notarization outputs:

1. `make phase25-weekly-notarize`
2. `make phase25-program-notarize-gate`

Required Phase 25 notarization artifacts:

- `artifacts/launch-control/weekly-notarization-ledger-latest.json`
- `artifacts/launch-control/weekly-immutable-snapshot-latest.json`
- `artifacts/launch-control/weekly-notarization-receipt-latest.md`

## Owner Sign-Off

- Release owner sign-off: `REL-FINAL-CUTOVER-RUNBOOK-20260226-01` at `2026-02-26T22:55:00Z`
- Runtime owner sign-off: `RUNTIME-FINAL-CUTOVER-RUNBOOK-20260226-01` at `2026-02-26T22:55:00Z`
- Chain owner sign-off: `CHAIN-FINAL-CUTOVER-RUNBOOK-20260226-01` at `2026-02-26T22:55:00Z`
