# External Integrator Validation (Independent)

Phase 15 Track B independent external validation evidence.

## Validation Metadata

- Validation ID: `EXT-INT-VALIDATION-20260226-01`
- Integrator organization: `Northstar Automation Labs`
- Integrator representative: `Mina Ortiz`
- Validation window (UTC): `2026-02-26T21:10:00Z to 2026-02-26T21:42:00Z`
- Validation owner: `Integration Lead`

## Production Endpoint Validation

- Manifest: `https://mainnet.clawchain.dev/manifest.json`
- RPC endpoint: `https://rpc.mainnet.clawchain.dev:443`
- REST endpoint: `https://api.mainnet.clawchain.dev`
- Runtime host: `northstar-gateway.mainnet.clawchain.dev`

## Canonical Quickstart Execution

1. `make clawd-build`
2. `make clawd-up-ready MANIFEST="https://mainnet.clawchain.dev/manifest.json" HOST="northstar-gateway.mainnet.clawchain.dev"`
3. `make runtime-readiness-gate`

Result: `pass`.

## End-to-End Validation Results

- Query flow validated: `getMerkleRoot()`, `getAgentInfo()`
- Signed tx flow validated: `delegateTask()`
- Broadcast hash: `0x8a96f8bc1d2bc04c80db2b30fef96e6ea98ecf3f24f5105484ef3bcf2f6b3f62`
- Overall result: `pass`

## Signed Confirmation

- Integrator attestation: `NORTHSTAR-ATTEST-20260226-01` at `2026-02-26T21:42:00Z`
- ClawChain owner attestation: `CLAWCHAIN-ATTEST-20260226-01` at `2026-02-26T21:42:00Z`

## Evidence Artifacts

- Readiness report: `artifacts/integrator/northstar-readiness-20260226.json`
- Query snapshot: `artifacts/integrator/northstar-query-20260226.json`
- Tx receipt snapshot: `artifacts/integrator/northstar-delegate-task-20260226.json`
