#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/endpoints-slo.md
  docs/disaster-recovery.md
  docs/hosting-cost-profile.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing production-infrastructure doc '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'SLO Targets|Availability|Latency|Throughput|Resource Bounds' docs/endpoints-slo.md >/dev/null; then
  echo "ERROR: docs/endpoints-slo.md missing required SLO sections." >&2
  exit 1
fi

if ! rg -n 'Recovery Objectives|Recovery Time Objective|Recovery Point Objective|Regular Backup Schedule|Rollback Procedures' docs/disaster-recovery.md >/dev/null; then
  echo "ERROR: docs/disaster-recovery.md missing required DR/RTO/RPO sections." >&2
  exit 1
fi

if ! rg -n 'Profiles|Monthly Cost Target|Capacity \+ Cost Assumptions|Ownership' docs/hosting-cost-profile.md >/dev/null; then
  echo "ERROR: docs/hosting-cost-profile.md missing required hosting/cost sections." >&2
  exit 1
fi

required_scripts=(
  testnet/validate-public-env.sh
  testnet/verify-stable-endpoints.sh
  scripts/backup-state.sh
  scripts/restore-state.sh
  scripts/monitoring-setup.sh
)

for script_path in "${required_scripts[@]}"; do
  if [[ ! -f "$script_path" ]]; then
    echo "ERROR: missing production-infrastructure script '$script_path'." >&2
    exit 1
  fi
done

if ! rg -n '^backup:|^restore:|^testnet-public-stable-endpoints:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing backup/restore/stable-endpoint targets." >&2
  exit 1
fi

echo "production infrastructure gate passed."
