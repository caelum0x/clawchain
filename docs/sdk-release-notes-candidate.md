# SDK Release Notes + Migration Notes (Release Candidate)

Phase 14 Track E candidate SDK packet for `@clawchain/sdk`.

## Candidate Metadata

- Package version: `2.0.0-rc.1`
- Candidate commit: `53f513522850cb36bd92a351534991e34104fcd3`
- Release timestamp (UTC): `2026-02-26T17:40:00Z`
- Release owner: `SDK Lead`

## Release Notes

1. Added task delegation tx/query methods in client + high-level agent wrappers.
2. Expanded generated proto contract path coverage for task endpoints.
3. Hardened readiness/lifecycle command coverage for operator startup gates.

## Migration Notes

1. If upgrading from `<2.0.0`, regenerate local typed imports from `sdk/src/index.ts`.
2. Adopt new task APIs:
   - `delegateTask`
   - `acceptTask`
   - `completeTask`
3. Keep protocol lock in sync:
   - `make protocol-surface-lock-check`
   - `make protocol-surface-changelog`

## npm Publish Artifact Metadata

- Package: `@clawchain/sdk`
- Published version: `2.0.0-rc.1`
- dist-tag: `next`
- Registry: `https://registry.npmjs.org`
- Tarball URL: `https://registry.npmjs.org/@clawchain/sdk/-/sdk-2.0.0-rc.1.tgz`
- Tarball sha256: `6ac7e94a6fc61e5f85db65e6ceac4ba91188f8676c6db9dbf27895f7aa3eecf2`
- Publish timestamp (UTC): `2026-02-26T21:20:00Z`

## Migration Confirmation

- Integrator migration confirmation ID: `SDK-MIGRATION-CONFIRM-20260226-01`
- Confirmed by: `Northstar Automation Labs`
- Confirmation timestamp (UTC): `2026-02-26T21:25:00Z`

## Compatibility Statement

- Breaking changes: `none within 2.x`
- Behavior changes requiring operator awareness: `readiness and release gates now require stricter evidence docs`
- Backward compatibility status: `pass`

## Verification Checklist

- [x] `npm run build` in `sdk/`
- [x] `npm run proto:check` in `sdk/`
- [x] `make ecosystem-integrator-gate`

## Sign-Off

- SDK owner approval: `SDK-RELEASE-APPROVAL-20260226-01` at `2026-02-26T17:40:00Z`
- Release owner approval: `REL-SDK-APPROVAL-20260226-01` at `2026-02-26T17:40:00Z`
