# Go-Live Decision Policy

This policy defines explicit launch/no-launch criteria and accountable ownership.

## Decision Owners

- Release Owner: final release candidate coordinator
- Security Owner: security gate sign-off authority
- Operations Owner: runtime/operator readiness sign-off authority
- Chain Owner: chain module/state compatibility sign-off authority

All four owners must sign the release memo for launch approval.

## Launch Criteria (All Required)

1. `make release-ready-gate` passes for target manifest/host.
2. `make mainnet-readiness-gate` passes.
3. Release evidence exists at `artifacts/release-evidence.json` with overall status `passed`.
4. No unresolved blocker incidents are open for the candidate commit.

## No-Launch Criteria (Any One Blocks)

- security review gate failed or incomplete artifacts
- capacity acceptance thresholds not met
- upgrade/rollback compatibility gate failed
- missing ownership sign-offs

## Decision Record

Each launch decision must record:

- candidate commit hash
- decision timestamp (UTC)
- decision outcome (`launch` or `no-launch`)
- owner sign-off list
- blocker list (if no-launch)
