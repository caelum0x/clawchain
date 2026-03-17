#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f monitoring/alerting-rules.yml ]]; then
  echo "ERROR: missing monitoring/alerting-rules.yml." >&2
  exit 1
fi

if [[ ! -f docs/weekly-operations-packet.md ]]; then
  echo "ERROR: missing docs/weekly-operations-packet.md." >&2
  exit 1
fi

if [[ ! -f scripts/generate-weekly-readiness-cadence-report.sh ]]; then
  echo "ERROR: missing scripts/generate-weekly-readiness-cadence-report.sh." >&2
  exit 1
fi

if ! rg -n 'alert: PeerChurnDetected|runbook: "docs/incident-runbook.md#operate-while-isolated"' monitoring/alerting-rules.yml >/dev/null; then
  echo "ERROR: peer-churn proactive alert or runbook link is missing." >&2
  exit 1
fi

if ! rg -n 'alert: IncidentAckSlaP1Breached|alert: IncidentAckSlaP2Breached|runbook: "docs/support-community-pipeline.md"' monitoring/alerting-rules.yml >/dev/null; then
  echo "ERROR: incident SLA alerts or runbook link are missing." >&2
  exit 1
fi

if ! rg -n 'Synthetic Readiness Probe Cadence|weekly-readiness-cadence' docs/weekly-operations-packet.md >/dev/null; then
  echo "ERROR: weekly operations packet missing readiness cadence section." >&2
  exit 1
fi

if rg -n '\bTBD\b|\bPending\b' docs/weekly-operations-packet.md >/dev/null; then
  echo "ERROR: weekly operations packet contains placeholder values." >&2
  exit 1
fi

if ! rg -n 'artifacts/stabilization/weekly-readiness-cadence-[0-9]{8}\.json' docs/weekly-operations-packet.md >/dev/null; then
  echo "ERROR: weekly operations packet missing concrete readiness cadence artifact reference." >&2
  exit 1
fi

readiness_artifact="$(rg -o 'artifacts/stabilization/weekly-readiness-cadence-[0-9]{8}\.json' docs/weekly-operations-packet.md | head -n1)"
if [[ -z "$readiness_artifact" ]]; then
  echo "ERROR: could not parse weekly readiness cadence artifact path." >&2
  exit 1
fi

if [[ ! -f "$readiness_artifact" ]]; then
  echo "ERROR: missing weekly readiness cadence artifact '$readiness_artifact'." >&2
  exit 1
fi

echo "phase16 reliability and alerting gate passed."
