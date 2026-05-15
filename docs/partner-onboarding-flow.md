# Partner + Integrator Onboarding Flow

Phase 13 Track E onboarding and support ownership policy.

## Ownership

- Integration Owner: `Integration Lead`
- SDK Owner: `SDK Lead`
- Runtime Ops Owner: `Runtime Operations Lead`
- Support Owner: `Partner Support Lead`

## Onboarding Steps

1. Share integrator package:
- `docs/integrator-quickstart.md`
- `docs/reference-integrations.md`
- `docs/sdk-versioning-policy.md`
2. Run guided startup + readiness:
- `make clawd-up-ready MANIFEST=<manifest> HOST=<host>`
- `make runtime-readiness-gate`
3. Validate one signed tx path + one query path in partner environment.
4. Confirm support escalation channel and owner contacts.

## Support SLA

- P1 integration blockers: response within 4 hours.
- P2 integration issues: response within 1 business day.
- Migration guidance for breaking updates: published before release rollout.

## Escalation Contacts

- Primary Slack channel: `#clawd-integrator-support`
- Escalation alias: `integrator-escalation@clawchain.ops`
- Incident bridge owner: `Runtime Operations Lead`
