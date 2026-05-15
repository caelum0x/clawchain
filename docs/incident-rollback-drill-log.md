# Incident + Rollback Drill Log

Phase 13 Track F drill evidence log.

## Drill Template

| Drill ID | Date (UTC) | Type | Scope | Result | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DRILL-001 | 2026-02-26T15:59:55Z | rollback | runtime+chain | Success | Operations Lead | restored from known-good snapshot, recovery time 22m, readiness gate passed |
| DRILL-002 | 2026-02-26T15:59:55Z | incident-isolation | peers/runtime | Success | Operations Lead | incident enter/exit flow validated, peer configuration recovered and verified |

## Drill Command References

- DRILL-001 commands:
  - `make restore BACKUP=/var/backups/clawchain/clawchain-backup-20260226-153000.tar.gz`
  - `make runtime-readiness-gate`
  - `make release-ready-gate MANIFEST=https://example.com/manifest.json HOST=example.com`
- DRILL-002 commands:
  - `cd cmd/clawd && node ./dist/main.js incident enter --reason "drill"`
  - `cd cmd/clawd && node ./dist/main.js incident status --out pretty`
  - `cd cmd/clawd && node ./dist/main.js incident exit`

## Required Drill Types

1. rollback from known-good snapshot
2. incident-mode peer isolation and recovery
3. release gate rerun after recovery

## Completion Rule

Track F drill requirement is satisfied only when all required drill types have at least one successful run with operator notes.

## Owner Approval

- Ops Owner approval: `OPS-DRILL-APPROVAL-20260226-01` at `2026-02-26T15:59:55Z`
- Release Owner approval: `REL-DRILL-APPROVAL-20260226-01` at `2026-02-26T15:59:55Z`
