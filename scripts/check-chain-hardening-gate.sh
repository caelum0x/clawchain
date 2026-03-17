#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/chain-hardening-acceptance.md
  docs/observability.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing chain-hardening doc '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Upgrade Handler \+ Migration Validation|Load Acceptance Benchmarks|Observability Package Completeness' docs/chain-hardening-acceptance.md >/dev/null; then
  echo "ERROR: docs/chain-hardening-acceptance.md missing required sections." >&2
  exit 1
fi

required_scripts=(
  scripts/validate-upgrade.sh
  scripts/load-test.sh
  scripts/monitoring-setup.sh
  scripts/health-check.sh
  scripts/endpoint-smoke.sh
)

for script_path in "${required_scripts[@]}"; do
  if [[ ! -f "$script_path" ]]; then
    echo "ERROR: missing chain-hardening script '$script_path'." >&2
    exit 1
  fi
done

required_monitoring_assets=(
  monitoring/prometheus.yml
  monitoring/alerting-rules.yml
  monitoring/grafana-dashboard.json
)

for asset in "${required_monitoring_assets[@]}"; do
  if [[ ! -f "$asset" ]]; then
    echo "ERROR: missing observability asset '$asset'." >&2
    exit 1
  fi
done

if ! rg -n '^validate-upgrade:|^load-test:|^load-test-heavy:|^monitoring-setup:|^health-check:|^endpoint-smoke:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing one or more chain-hardening targets." >&2
  exit 1
fi

echo "chain hardening gate passed."
