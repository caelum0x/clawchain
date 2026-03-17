#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash ./scripts/check-mainnet-capacity-gate.sh >/dev/null
bash ./scripts/check-production-infrastructure-gate.sh >/dev/null
bash ./scripts/check-chain-hardening-gate.sh >/dev/null
bash ./scripts/check-runtime-hardening-gate.sh >/dev/null
bash ./scripts/check-ecosystem-integrator-gate.sh >/dev/null
bash ./scripts/check-governance-operations-gate.sh >/dev/null
bash ./scripts/check-drill-evidence-gate.sh >/dev/null
bash ./scripts/check-growth-user-layer-gate.sh >/dev/null
bash ./scripts/check-capacity-slo-evidence-gate.sh >/dev/null
bash ./scripts/check-production-data-replacement-gate.sh >/dev/null
bash ./scripts/check-real-world-external-validation-gate.sh >/dev/null
bash ./scripts/check-mainnet-cutover-rehearsal-gate.sh >/dev/null
bash ./scripts/check-launch-day-operations-gate.sh >/dev/null
bash ./scripts/check-first-week-stabilization-gate.sh >/dev/null
bash ./scripts/check-phase16-automation-evidence-capture-gate.sh >/dev/null
bash ./scripts/check-phase16-reliability-alerting-gate.sh >/dev/null
bash ./scripts/check-phase16-operator-ux-gate.sh >/dev/null
bash ./scripts/check-security-compliance-closure-evidence-gate.sh >/dev/null
bash ./scripts/check-ecosystem-readiness-proof-gate.sh >/dev/null
bash ./scripts/check-launch-decision-packet-gate.sh >/dev/null
bash ./scripts/check-security-review-gate.sh >/dev/null
bash ./scripts/check-go-live-decision-gate.sh >/dev/null
bash ./scripts/check-mainnet-launch-program-gate.sh >/dev/null
bash ./scripts/check-launch-artifact-completeness.sh >/dev/null

echo "mainnet readiness gate passed."
