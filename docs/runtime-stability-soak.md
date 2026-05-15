# Runtime Stability Soak Criteria

Phase 13 Track D runtime hardening criteria for OpenClaw + clawd integration.

## Soak Scope

- `openclaw up --require-ready` stability under continuous operation
- `clawd up --require-ready` restart stability
- runtime health checks (`doctor`, `readiness`, peer summary) over soak window

## Acceptance Targets

1. Soak duration baseline: `24h` continuous run for release candidates.
2. No critical readiness blockers throughout soak.
3. No unrecoverable runtime crash loops.
4. Service restart remains within readiness timeout (`<= 180s` target).

## Required Command Path

```bash
make openclaw-up-ready MANIFEST=<manifest> HOST=<host>
make clawd-up-ready MANIFEST=<manifest> HOST=<host>
make runtime-readiness-gate
```

## Evidence

- readiness JSON snapshots at start/mid/end of soak
- incident notes for any degraded windows and recovery actions
