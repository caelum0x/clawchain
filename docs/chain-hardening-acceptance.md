# Chain Hardening Acceptance

Phase 13 Track C acceptance criteria.

## 1) Upgrade Handler + Migration Validation

Required command path:

```bash
make validate-upgrade
```

Acceptance:
- upgrade validation script exits successfully
- consensus version checks align with current module versions
- exported genesis/state structural checks pass

## 2) Load Acceptance Benchmarks

Required command path:

```bash
make load-test
make load-test-heavy
```

Acceptance:
- baseline and heavy load scripts execute without fatal chain/runtime errors
- transaction success ratio and throughput summary are produced
- no persistent chain stall or sync regression after test completion

## 3) Observability Package Completeness

Required assets:
- `docs/observability.md`
- `monitoring/prometheus.yml`
- `monitoring/alerting-rules.yml`
- `monitoring/grafana-dashboard.json`
- `scripts/monitoring-setup.sh`
- `scripts/health-check.sh`
- `scripts/endpoint-smoke.sh`

Acceptance:
- alerting, dashboard, and retention guidance are documented
- health and endpoint smoke scripts are present and runnable
