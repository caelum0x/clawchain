# Governance Decision Log

Signed operational policy decisions for ClawChain. Each entry follows the schema defined in `docs/governance-operations-policy.md`.

## Decision Format

```json
{
  "id": "GDL-NNNN",
  "candidate": "<commit hash or version tag>",
  "timestamp": "<ISO-8601 UTC>",
  "type": "ship | rollback | halt | resume | policy_change",
  "authority": "<role or name>",
  "sign_off": "<reference to approval>",
  "rationale": "<why this decision was made>",
  "follow_up": ["<action items>"]
}
```

---

## Decisions

### GDL-0001: Initial Testnet Launch

```json
{
  "id": "GDL-0001",
  "candidate": "v1.0.0-rc1 (53f5135)",
  "timestamp": "2026-02-27T00:00:00Z",
  "type": "ship",
  "authority": "core-team",
  "sign_off": "Initial development — single maintainer approval",
  "rationale": "All Phase 1-15 gates passed. E2E demo 23/23, Go build clean, SDK compiles, integration tests pass.",
  "follow_up": [
    "Monitor chain health for 48h",
    "Run incident drill",
    "Complete Phase 16 post-launch hardening"
  ]
}
```

---

*Add new decisions above this line. Use the next sequential GDL-NNNN ID.*
