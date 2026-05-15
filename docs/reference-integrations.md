# Reference Integrations

Phase 13 Track E reference integration map.

## Canonical SDK Templates

- `sdk/examples/privacy.ts`
- `sdk/examples/agent.ts`
- `sdk/examples/messaging.ts`
- `sdk/examples/marketplace.ts`
- `sdk/examples/reputation.ts`
- `sdk/examples/task.ts`

## Minimal Integrator Path

- Runtime bring-up/readiness:
  - `make clawd-up-ready MANIFEST=<manifest> HOST=<host>`
  - `make runtime-readiness-gate`
- SDK integration quickstart:
  - `docs/integrator-quickstart.md`
  - `sdk/examples/README.md`

## Expected Deliverables for External Integrators

1. Read-only query integration (health + module queries).
2. Signed transaction integration (at least one module tx flow).
3. Operational readiness integration using gate commands above.
