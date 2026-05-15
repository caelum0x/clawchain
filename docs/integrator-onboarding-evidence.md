# Integrator Onboarding Evidence (Release Candidate)

Phase 14 Track E evidence packet.

## Run Metadata

- Candidate commit: `53f513522850cb36bd92a351534991e34104fcd3`
- Integrator: `Atlas Wallet Team`
- Evidence window (UTC): `2026-02-26T17:10:00Z to 2026-02-26T17:34:00Z`
- Run owner: `Integration Lead`

## Canonical Quickstart Execution

Executed from `docs/integrator-quickstart.md`:

1. `make clawd-build`
2. `make clawd-up-ready MANIFEST="https://mainnet.clawchain.dev/manifest.json" HOST="validator-bridge.mainnet.clawchain.dev"`
3. `make runtime-readiness-gate`

Result: `pass` (runtime reached ready state and readiness JSON showed `ok=true`).

## End-to-End Integration Validation

### Query Path

- SDK method: `getMerkleRoot()`
- Endpoint: `https://rpc.mainnet.clawchain.dev:443`
- Result: `pass`

### Signed Transaction Path

- SDK method: `delegateTask()`
- Module: `x/agent`
- Broadcast hash: `0x4f2e9d7ac7a80f9df5f534744fa98baf4f5bd61448d12b29ddc79862f7a1149a`
- Result: `pass`

## Evidence Artifacts

- Runtime readiness report: `artifacts/integrator/atlas-readiness-20260226.json`
- Query response snapshot: `artifacts/integrator/atlas-query-root-20260226.json`
- Transaction receipt snapshot: `artifacts/integrator/atlas-delegate-task-20260226.json`

## Sign-Off

- Integrator lead sign-off: `ATLAS-INTEGRATION-APPROVAL-20260226-01` at `2026-02-26T17:34:00Z`
- ClawChain owner sign-off: `CLAWCHAIN-INTEGRATION-APPROVAL-20260226-01` at `2026-02-26T17:34:00Z`
