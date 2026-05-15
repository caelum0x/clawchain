# Governance + Operations Decision Policy

Phase 13 Track F ownership and decision model for ship/rollback/emergency-halt.

## Decision Roles

| Role | Responsibility | Default Holder |
|------|---------------|----------------|
| Ship Authority | Approves release candidate promotion to production | Core maintainer(s) |
| Rollback Authority | Executes rollback decision during incidents | On-call operator |
| Emergency Halt Authority | Coordinates halt/restart with validator set | Lead validator operator |
| Communications Owner | Publishes public incident/decision updates | Community lead |

## Decision Types

### Ship

Promotes a release candidate to production validator binary.

**Prerequisites:**
- All CI gates green (`make prd-build`)
- E2E demo passes (`make e2e-demo`)
- Load test passes (`make load-test`)
- Upgrade validation passes (`make validate-upgrade`)
- Security review checklist signed off (see `docs/security-review-checklist.md`)
- Minimum 48h soak on testnet with no critical alerts

**Process:**
1. Ship Authority tags the commit: `git tag v1.x.x`
2. Build deterministic binary and publish checksum
3. Notify validators via coordination channel
4. Validators upgrade within the governance-approved upgrade window

### Rollback

Reverts the chain binary to a previous known-good version.

**Triggers:**
- Consensus failure (chain halted > 5 minutes with no recovery)
- State corruption detected
- Critical security vulnerability actively exploited

**Process:**
1. Rollback Authority declares rollback via coordination channel
2. Export current state: `make backup`
3. Validators revert binary to previous tag
4. If state is corrupted: restore from last clean backup (`make restore BACKUP=<tarball>`)
5. Restart chain with `--halt-height` if needed to coordinate

### Halt

Emergency chain stop to prevent further damage.

**Triggers:**
- Active exploit draining funds
- Consensus bug causing invalid state transitions
- Critical vulnerability with no immediate patch

**Process:**
1. Emergency Halt Authority broadcasts halt signal
2. Validators stop their nodes: `systemctl stop clawchaind`
3. Communications Owner posts public advisory
4. Core team diagnoses and patches
5. Resume via coordinated restart at agreed block height

### Resume

Restart chain after a halt.

**Prerequisites:**
- Root cause identified and patched (or mitigated)
- New binary built and validated
- Minimum 2/3 validator set confirms readiness

**Process:**
1. Distribute patched binary with checksum
2. Validators verify binary hash
3. Coordinated restart at UTC time agreed in advance
4. Monitor for 30 minutes post-restart before declaring stable

## Required Decision Records

Each production decision must record:

| Field | Description |
|-------|-------------|
| `candidate` | Commit hash or version tag |
| `timestamp` | UTC ISO-8601 timestamp |
| `type` | `ship` / `rollback` / `halt` / `resume` |
| `authority` | Who approved the decision |
| `sign_off` | References to approval (PR, message link, etc.) |
| `rationale` | Why this decision was made |
| `follow_up` | Required post-decision actions |

Example record:
```json
{
  "candidate": "v1.2.1 (abc1234)",
  "timestamp": "2026-02-27T14:00:00Z",
  "type": "ship",
  "authority": "core-team",
  "sign_off": "PR #142 approved by 3/3 maintainers",
  "rationale": "All gates green, 72h testnet soak clean",
  "follow_up": ["monitor alerting for 24h", "update operator quickstart"]
}
```

## Blocking Rules

1. If ownership or sign-off is unclear for a production decision, rollout is **blocked**
2. No ship without all CI gates passing
3. No ship without security checklist sign-off
4. No resume without 2/3 validator readiness confirmation
5. Rollback requires at minimum one authority sign-off and a recorded rationale

## Escalation Path

```
Operator detects issue
  → On-call operator (Rollback Authority)
    → If rollback insufficient → Emergency Halt Authority
      → If halt needed → Communications Owner notifies community
        → Core team patches → Ship Authority approves resume
```

## Incident Response SLAs

| Severity | Detection | Response | Resolution |
|----------|-----------|----------|------------|
| P0 (chain halted / exploit) | < 5 min | < 15 min | < 4 hours |
| P1 (degraded performance) | < 15 min | < 1 hour | < 24 hours |
| P2 (non-critical bug) | < 1 hour | < 4 hours | Next release cycle |

## Post-Mortem Requirement

Every P0 and P1 incident must produce a post-mortem within 72 hours using the template at `docs/post-mortem-template.md`.
