# Hosting + Cost Profile (VPS / Mac mini / Local)

Phase 13 Track B production infrastructure cost baseline.

## Profiles

| Profile | Target Use | Baseline Spec | Monthly Cost Target | Notes |
| --- | --- | --- | --- | --- |
| VPS Standard | Public full node / light operator | 4 vCPU, 16 GB RAM, 500 GB NVMe | `$80-$180` | Recommended for internet-facing nodes |
| VPS Validator | Validator with sentry architecture | 8 vCPU, 32 GB RAM, 1 TB NVMe | `$200-$500` | Includes validator + sentry overhead |
| Mac mini | Home/lab persistent operator | Apple Silicon, 16-32 GB RAM, 512 GB+ SSD | Capex + power | Good for sovereign local-first ops |
| Local Dev | Developer/test profile | 4 cores, 8 GB RAM, 100 GB disk | Existing hardware | Not production SLA target |

## Capacity + Cost Assumptions

- Endpoint and readiness SLO targets follow `docs/endpoints-slo.md`.
- Backup and DR obligations follow `docs/disaster-recovery.md`.
- Public endpoint publishing contract follows `testnet/public.env` and stable endpoint verification scripts.

## Budget Controls

1. Define monthly infra budget ceiling per environment (testnet, staging, mainnet).
2. Track spend versus budget each release window.
3. Require owner approval for >20% month-over-month increase.

## Ownership

- Infrastructure Owner: `TBD`
- Ops Owner: `TBD`
- Review cadence: monthly (or per release candidate window)
