#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docs=(
  docs/production-launch-artifact-index.md
  docs/launch-day-operations-log.md
  docs/launch-day-status-workflow-log.md
  docs/launch-day-incident-bridge-ack.md
  docs/first-week-health-summaries.md
  docs/launch-week-incidents.md
)

for doc in "${docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing integrity source doc '$doc'." >&2
    exit 1
  fi
done

missing=0
while IFS= read -r artifact; do
  if [[ -z "$artifact" ]]; then
    continue
  fi
  if [[ ! -e "$artifact" ]]; then
    echo "ERROR: missing referenced artifact path: $artifact" >&2
    missing=$((missing + 1))
  fi
done < <(rg -no 'artifacts/[A-Za-z0-9_./-]+' "${docs[@]}" | awk -F: '{print $NF}' | sort -u)

if [[ "$missing" -gt 0 ]]; then
  echo "evidence artifact integrity gate failed with $missing missing artifact(s)." >&2
  exit 1
fi

echo "evidence artifact integrity gate passed."
