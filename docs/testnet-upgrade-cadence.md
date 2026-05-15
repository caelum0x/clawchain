# Testnet Upgrade Cadence

This document freezes the default upgrade cadence for clawd public testnet releases.

## Fixed Cadence

- Cadence: bi-weekly (every 14 days)
- Upgrade window day: Tuesday
- Upgrade window start: 18:00 UTC
- Upgrade window max duration: 90 minutes
- Emergency hotfix window: ad-hoc, incident-approved only

## Release Stages Per Window

1. `T-5 days`: freeze feature scope for the target window.
2. `T-3 days`: finalize `contracts/protocol-surface.lock` and publish changelog.
3. `T-2 days`: run operator rehearsal with `fresh-machine-acceptance-gate`.
4. `T-1 day`: publish operator memo (commit, modules, expected downtime, rollback point).
5. `T`: execute upgrade in the fixed UTC window.
6. `T+1 day`: publish post-upgrade verification summary.

## Gate Requirements Per Window

The following must pass before rollout:

- `make protocol-sanity`
- `make pre-upgrade-compatibility-gate`
- `make upgrade-readiness-gate`
- `make release-ready-gate MANIFEST=<manifest> HOST=<host>`

## Rollback Requirement

Every window must include a declared rollback checkpoint:

- pre-upgrade snapshot identifier
- last known-good release commit
- operator owner for rollback decision

If these are not documented in the operator memo, the window is blocked.
