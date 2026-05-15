# Upgrade Runbook

This runbook defines the canonical upgrade/migration lifecycle for ClawChain operators.

## Consensus Version Ledger

Current module consensus versions (snapshot date: 2026-02-25):

- `x/agent`: `ConsensusVersion = 4`
- `x/privacy`: `ConsensusVersion = 1`
- `x/marketplace`: `ConsensusVersion = 2`
- `x/reputation`: `ConsensusVersion = 3`
- `x/messaging`: `ConsensusVersion = 2`

Any state/schema-breaking change must increment module `ConsensusVersion()` and document migration/rollback notes in this file before release.

## Module Migration + Version Plan

This plan is mandatory for `x/agent`, `x/privacy`, `x/marketplace`, `x/reputation`, and `x/messaging`.

| Module | Current `ConsensusVersion` | Migration Trigger | Required Operator Notes |
| --- | --- | --- | --- |
| `x/agent` | `4` | Params/store/schema changes, task lifecycle state changes | update ledger + upgrade notice + rollback impact |
| `x/privacy` | `1` | Merkle tree/nullifier/view-key store changes | update ledger + proof compatibility callout |
| `x/marketplace` | `2` | Skill/escrow/dispute state layout changes | update ledger + escrow reconciliation notes |
| `x/reputation` | `3` | score/decay/SLA field changes | update ledger + recomputation expectations |
| `x/messaging` | `2` | message storage/index/ack flow changes | update ledger + message replay expectations |

For each release candidate:

1. Record old/new consensus versions for every module in release notes.
2. Declare whether state migration is required (`yes/no`) per module.
3. Record backward/forward compatibility assumptions for one upgrade window.
4. Link rollback checkpoint height/snapshot ID in operator release memo.

## Versioned Migration Checklist

Use this checklist for each testnet/mainnet upgrade window.

1. Record target release commit and module version deltas versus current deployment.
2. Verify migration surfaces are stable:
- `make protocol-sanity`
- `make upgrade-readiness-gate`
3. Validate release path inputs:
- `make testnet-public-env` (if needed)
- `make release-ready-gate MANIFEST=<manifest-url-or-path> HOST=<public-host>`
4. Capture and retain release evidence:
- `make release-evidence-pack MANIFEST=<manifest-url-or-path> HOST=<public-host>`
5. Freeze deployment window and broadcast operator notice with exact UTC start/end times.
6. Apply upgrade in maintenance window and confirm post-upgrade health:
- `openclaw doctor runtime --json`
- `cd cmd/clawd && node ./dist/main.js readiness --json`

## Pre-Upgrade State Compatibility Checks

Run this sequence before approving any upgrade rollout:

```bash
make protocol-surface-lock-check
make pre-upgrade-compatibility-gate
make upgrade-readiness-gate
```

`pre-upgrade-compatibility-gate` enforces:

- module files expose explicit `ConsensusVersion()` values
- runbook ledger values match source module versions
- migration/version plan section exists for all five core modules
- rollback and cadence docs are present for operator execution

No upgrade window starts until all three commands pass.

## Rollback Playbook

If upgrade fails, run this rollback sequence immediately.

1. Halt runtime and node services on affected hosts.
2. Restore the last known-good binary and configuration bundle.
3. Restore chain state snapshot from pre-upgrade backup point.
4. Re-join peers using the last stable `manifest.json`.
5. Verify health and connectivity:
- `node ./dist/main.js doctor --json`
- `node ./dist/main.js peers verify`
6. Publish rollback incident summary with:
- failed release commit
- rollback commit
- recovery timestamp (UTC)
- operator action log

Detailed operator command flow is in [testnet/rollback-upgrade-playbook.md](/Users/arhansubasi/new-blokchain/testnet/rollback-upgrade-playbook.md).

## Testnet Upgrade Cadence (Frozen Policy)

Frozen schedule and release stages are defined in:

- [docs/testnet-upgrade-cadence.md](/Users/arhansubasi/new-blokchain/docs/testnet-upgrade-cadence.md)

Any cadence change requires:

1. PR update to the cadence doc.
2. Operator announcement with concrete UTC dates.
3. Updated release memo link in the next upgrade window.

## Release Evidence Policy

Artifact conventions:

- Primary artifact path: `artifacts/release-evidence.json`
- Optional archived copies: `artifacts/release-evidence-<YYYYMMDD-HHMMSS>.json`

## Release Artifact Provenance Checklist

Before publishing a release, generate and validate provenance artifacts:

```bash
make release-artifact-provenance-pack
make release-artifact-provenance-gate
```

Required provenance files:

- `artifacts/provenance/clawchaind.provenance.json` (node binary)
- `artifacts/provenance/openclaw-runtime.provenance.json` (OpenClaw runtime package)

Each file must contain:

- `artifact.name`
- `artifact.kind`
- `artifact.path`
- `artifact.sha256` (64 lowercase hex)
- `build.timestamp_utc`
- `build.git_commit`
- `build.git_branch`

Retention policy:

- Keep at least the latest 20 release evidence files, or 90 days of evidence, whichever is greater.
- Keep all evidence tied to incident/rollback windows until incident closure is signed off.
