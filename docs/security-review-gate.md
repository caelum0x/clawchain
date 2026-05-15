# Security Review Gate Requirements

This gate is mandatory before mainnet launch decisions.

## Required Security Artifacts

1. Threat model:
- attack surfaces for runtime, chain modules, key paths, and network ingress.
2. Key custody policy:
- operator key generation/storage/recovery guidance and prohibited handling patterns.
3. Abuse controls:
- anti-spam, economic policy hooks, and incident isolation/recovery commands.

## Minimum Checklist

All must be satisfied:

- documented threat model exists and is linked in release memo
- key custody policy is documented with clear operator responsibilities
- abuse-control surfaces are enabled and validated by existing gates:
  - `make security-economic-policy-gate`
  - `make runtime-readiness-gate`
  - incident controls documented in `docs/incident-runbook.md`

## Blocking Rule

If any artifact is missing or stale for the release candidate commit, launch is blocked.
