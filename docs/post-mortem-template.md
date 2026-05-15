# Post-Mortem: [INCIDENT TITLE]

**Date:** YYYY-MM-DD
**Severity:** P0 / P1
**Duration:** HH:MM
**Author:** [name]
**Status:** Draft / Reviewed / Final

---

## Summary

One-paragraph description of what happened, the impact, and the resolution.

## Timeline (UTC)

| Time | Event |
|------|-------|
| HH:MM | First alert / detection |
| HH:MM | On-call operator acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | All-clear declared |

## Impact

- **Chain availability:** Was the chain halted? For how long?
- **Transactions affected:** How many transactions failed or were delayed?
- **Funds at risk:** Were any funds at risk or lost?
- **Users affected:** Approximate number of affected validators/operators/end-users

## Root Cause

Detailed technical explanation of what caused the incident.

## Detection

How was the incident detected? (Alerting rule, user report, manual observation)

Was detection timely? If not, what delayed it?

## Response

What actions were taken to mitigate and resolve the incident?

Were there any complications during the response?

## Decision Record

```json
{
  "candidate": "",
  "timestamp": "",
  "type": "rollback | halt | resume",
  "authority": "",
  "sign_off": "",
  "rationale": "",
  "follow_up": []
}
```

## What Went Well

- [Item]

## What Went Wrong

- [Item]

## Action Items

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Fix / improvement] | [name] | YYYY-MM-DD | Open |

## Lessons Learned

Key takeaways that should inform future operations.

## Appendix

Links to logs, alerts, dashboards, or other supporting materials.
