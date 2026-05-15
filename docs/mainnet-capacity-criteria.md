# Mainnet Capacity Acceptance Criteria

This document defines minimum acceptance criteria for runtime + chain integration capacity before mainnet go-live.

## Scope

- OpenClaw runtime startup/readiness stability
- `clawd` integrated runtime + node bootstrap behavior
- chain transaction path responsiveness under expected operator load

## Acceptance Thresholds

Use these as hard go/no-go thresholds for release candidate validation:

1. Runtime readiness latency:
- `openclaw up --require-ready` reaches ready within `<= 180s` on reference VPS profile.
2. Fresh-machine acceptance:
- `make fresh-machine-acceptance-gate` passes end-to-end in `<= 300s`.
3. Startup determinism:
- Two consecutive `clawd up --require-ready` runs with same manifest/host produce no readiness blockers.
4. Peer baseline:
- `clawd peers verify` reports no critical peer configuration errors.
5. Chain responsiveness:
- Query paths (`privacy`, `agent`, `marketplace`, `reputation`, `messaging`) complete without transport errors in smoke flow.

## Evidence Requirements

Capture and retain:

- `artifacts/release-evidence.json`
- readiness JSON output from `clawd readiness --json`
- fresh-machine acceptance gate console logs

If any threshold fails, the release is blocked until corrective action and rerun evidence are attached.
