# Phase 16 Operator UX Hardening

Track C evidence for operator-focused post-launch UX improvements.

## One-Command Weekly Maintenance

Canonical command:

`make weekly-maintenance MANIFEST=https://mainnet.clawchain.dev/manifest.json WEEK_ID=20260302 DAY_UTC=20260302`

Expected outputs:

- `artifacts/stabilization/weekly-maintenance-readiness-20260302.json`
- `artifacts/stabilization/weekly-maintenance-peers-20260302.json`
- `artifacts/stabilization/weekly-maintenance-doctor-20260302.json`
- `artifacts/stabilization/weekly-maintenance-summary-20260302.json`

## Release Gate State Summary

Operator-facing command:

`cd cmd/clawd && node ./dist/main.js release-summary --json`

This summarizes all release gates from `artifacts/release-evidence.json` and supports `--failed-only`.

## Doctor Remediation Hints

Operator-facing command:

`cd cmd/clawd && node ./dist/main.js doctor --json`

Each failed check now includes `remediationHint` guidance for top failure categories.

## Sign-Off

- Runtime owner approval: `RUNTIME-UX-20260302-01` at `2026-03-02T19:00:00Z`
- Operations owner approval: `OPS-UX-20260302-01` at `2026-03-02T19:00:00Z`
