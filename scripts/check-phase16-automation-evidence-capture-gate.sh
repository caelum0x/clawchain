#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_scripts=(
  scripts/generate-daily-health-summary.sh
  scripts/capture-launch-day-transcript.sh
  scripts/check-evidence-artifact-integrity-gate.sh
)

for script in "${required_scripts[@]}"; do
  if [[ ! -f "$script" ]]; then
    echo "ERROR: missing Phase 16 Track A script '$script'." >&2
    exit 1
  fi
done

if ! rg -n 'daily health summary written to|overall_status' scripts/generate-daily-health-summary.sh >/dev/null; then
  echo "ERROR: daily health summary automation script missing expected output fields." >&2
  exit 1
fi

if ! rg -n 'usage: .* <label> -- <command|tee \"\\$log_file\"|log_artifact' scripts/capture-launch-day-transcript.sh >/dev/null; then
  echo "ERROR: launch-day transcript capture script missing command capture semantics." >&2
  exit 1
fi

bash ./scripts/check-evidence-artifact-integrity-gate.sh >/dev/null

echo "phase16 automation evidence capture gate passed."
