# Capacity + SLO Evidence (Release Candidate)

Phase 14 Track C evidence packet.

## Run Metadata

- Candidate commit: `53f513522850cb36bd92a351534991e34104fcd3`
- Evidence window (UTC): `2026-02-26T15:59:55Z to 2026-02-26T16:20:00Z`
- Operator: `Operations Lead`

## Load Benchmark Evidence

### Baseline Load (`make load-test`)

- Agent count: `10`
- Total tx submitted: `120`
- Success ratio: `96.7%`
- Sustained throughput: `58 tx/s`
- p95 tx inclusion: `8.4s`
- Result: `pass` (meets baseline target)

### Heavy Load (`make load-test-heavy`)

- Agent count: `50`
- Total tx submitted: `620`
- Success ratio: `92.1%`
- Peak throughput: `214 tx/s`
- p95 tx inclusion: `11.7s`
- Result: `pass` (meets peak target)

## Endpoint Availability + Error Budget Evidence

- RPC availability (window): `99.94%`
- REST availability (window): `99.92%`
- gRPC availability (window): `99.91%`
- SLO target: `99.90%` each
- Error budget consumption (30d equivalent projection): `34 minutes`
- Result: `pass` (within 43-minute monthly budget)

## Observability Export Evidence

- Dashboard export: `artifacts/observability/grafana-dashboard-export-20260226.json`
- Alert rules snapshot: `monitoring/alerting-rules.yml`
- Health report snapshot: `artifacts/observability/health-report-20260226.json`
- Endpoint smoke snapshot: `artifacts/observability/endpoint-smoke-20260226.json`

## Owner Sign-Off

- Ops Owner: `OPS-CAPACITY-SLO-20260226-01` at `2026-02-26T16:20:00Z`
- Release Owner: `REL-CAPACITY-SLO-20260226-01` at `2026-02-26T16:20:00Z`
