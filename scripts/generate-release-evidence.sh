#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST="${MANIFEST:-unknown}"
HOST="${HOST:-unknown}"
PROTOCOL_SANITY_STATUS="${PROTOCOL_SANITY_STATUS:-unknown}"
UPGRADE_READINESS_STATUS="${UPGRADE_READINESS_STATUS:-unknown}"
MAINNET_READINESS_STATUS="${MAINNET_READINESS_STATUS:-unknown}"
MAINNET_LAUNCH_PROGRAM_STATUS="${MAINNET_LAUNCH_PROGRAM_STATUS:-unknown}"
LAUNCH_ARTIFACT_COMPLETENESS_STATUS="${LAUNCH_ARTIFACT_COMPLETENESS_STATUS:-unknown}"
PRODUCTION_INFRASTRUCTURE_STATUS="${PRODUCTION_INFRASTRUCTURE_STATUS:-unknown}"
CHAIN_HARDENING_STATUS="${CHAIN_HARDENING_STATUS:-unknown}"
RUNTIME_HARDENING_STATUS="${RUNTIME_HARDENING_STATUS:-unknown}"
ECOSYSTEM_INTEGRATOR_STATUS="${ECOSYSTEM_INTEGRATOR_STATUS:-unknown}"
GOVERNANCE_OPERATIONS_STATUS="${GOVERNANCE_OPERATIONS_STATUS:-unknown}"
DRILL_EVIDENCE_STATUS="${DRILL_EVIDENCE_STATUS:-unknown}"
GROWTH_USER_LAYER_STATUS="${GROWTH_USER_LAYER_STATUS:-unknown}"
CAPACITY_SLO_EVIDENCE_STATUS="${CAPACITY_SLO_EVIDENCE_STATUS:-unknown}"
PRODUCTION_DATA_REPLACEMENT_STATUS="${PRODUCTION_DATA_REPLACEMENT_STATUS:-unknown}"
REAL_WORLD_EXTERNAL_VALIDATION_STATUS="${REAL_WORLD_EXTERNAL_VALIDATION_STATUS:-unknown}"
MAINNET_CUTOVER_REHEARSAL_STATUS="${MAINNET_CUTOVER_REHEARSAL_STATUS:-unknown}"
LAUNCH_DAY_OPERATIONS_STATUS="${LAUNCH_DAY_OPERATIONS_STATUS:-unknown}"
FIRST_WEEK_STABILIZATION_STATUS="${FIRST_WEEK_STABILIZATION_STATUS:-unknown}"
PHASE16_AUTOMATION_CAPTURE_STATUS="${PHASE16_AUTOMATION_CAPTURE_STATUS:-unknown}"
PHASE16_RELIABILITY_ALERTING_STATUS="${PHASE16_RELIABILITY_ALERTING_STATUS:-unknown}"
PHASE16_OPERATOR_UX_STATUS="${PHASE16_OPERATOR_UX_STATUS:-unknown}"
SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS="${SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS:-unknown}"
ECOSYSTEM_READINESS_PROOF_STATUS="${ECOSYSTEM_READINESS_PROOF_STATUS:-unknown}"
LAUNCH_DECISION_PACKET_STATUS="${LAUNCH_DECISION_PACKET_STATUS:-unknown}"
RELEASE_ARTIFACT_PROVENANCE_STATUS="${RELEASE_ARTIFACT_PROVENANCE_STATUS:-unknown}"
ONE_COMMAND_AGENT_GATE_STATUS="${ONE_COMMAND_AGENT_GATE_STATUS:-unknown}"
PHASE17_PUBLIC_TESTNET_STABILITY_STATUS="${PHASE17_PUBLIC_TESTNET_STABILITY_STATUS:-unknown}"
PHASE18_REAL_ENDPOINT_CUTOVER_STATUS="${PHASE18_REAL_ENDPOINT_CUTOVER_STATUS:-unknown}"
PHASE18_CONTINUOUS_OPS_STATUS="${PHASE18_CONTINUOUS_OPS_STATUS:-unknown}"
PHASE19_EVIDENCE_DRIFT_STATUS="${PHASE19_EVIDENCE_DRIFT_STATUS:-unknown}"
PUBLIC_TESTNET_REPRO_STATUS="${PUBLIC_TESTNET_REPRO_STATUS:-unknown}"

if [[ "$PROTOCOL_SANITY_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-capability-determinism.sh >/dev/null \
    && bash ./scripts/check-security-economic-policy.sh >/dev/null \
    && bash ./scripts/check-sla-reputation-coupling.sh >/dev/null \
    && bash ./scripts/check-upgrade-readiness.sh >/dev/null; then
    PROTOCOL_SANITY_STATUS="passed"
  else
    PROTOCOL_SANITY_STATUS="failed"
  fi
fi

if [[ "$UPGRADE_READINESS_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-upgrade-readiness.sh >/dev/null; then
    UPGRADE_READINESS_STATUS="passed"
  else
    UPGRADE_READINESS_STATUS="failed"
  fi
fi

if [[ "$MAINNET_READINESS_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-mainnet-readiness-gate.sh >/dev/null; then
    MAINNET_READINESS_STATUS="passed"
  else
    MAINNET_READINESS_STATUS="failed"
  fi
fi

if [[ "$MAINNET_LAUNCH_PROGRAM_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-mainnet-launch-program-gate.sh >/dev/null; then
    MAINNET_LAUNCH_PROGRAM_STATUS="passed"
  else
    MAINNET_LAUNCH_PROGRAM_STATUS="failed"
  fi
fi

if [[ "$LAUNCH_ARTIFACT_COMPLETENESS_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-launch-artifact-completeness.sh >/dev/null; then
    LAUNCH_ARTIFACT_COMPLETENESS_STATUS="passed"
  else
    LAUNCH_ARTIFACT_COMPLETENESS_STATUS="failed"
  fi
fi

if [[ "$PRODUCTION_INFRASTRUCTURE_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-production-infrastructure-gate.sh >/dev/null; then
    PRODUCTION_INFRASTRUCTURE_STATUS="passed"
  else
    PRODUCTION_INFRASTRUCTURE_STATUS="failed"
  fi
fi

if [[ "$CHAIN_HARDENING_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-chain-hardening-gate.sh >/dev/null; then
    CHAIN_HARDENING_STATUS="passed"
  else
    CHAIN_HARDENING_STATUS="failed"
  fi
fi

if [[ "$RUNTIME_HARDENING_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-runtime-hardening-gate.sh >/dev/null; then
    RUNTIME_HARDENING_STATUS="passed"
  else
    RUNTIME_HARDENING_STATUS="failed"
  fi
fi

if [[ "$ECOSYSTEM_INTEGRATOR_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-ecosystem-integrator-gate.sh >/dev/null; then
    ECOSYSTEM_INTEGRATOR_STATUS="passed"
  else
    ECOSYSTEM_INTEGRATOR_STATUS="failed"
  fi
fi

if [[ "$GOVERNANCE_OPERATIONS_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-governance-operations-gate.sh >/dev/null; then
    GOVERNANCE_OPERATIONS_STATUS="passed"
  else
    GOVERNANCE_OPERATIONS_STATUS="failed"
  fi
fi

if [[ "$DRILL_EVIDENCE_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-drill-evidence-gate.sh >/dev/null; then
    DRILL_EVIDENCE_STATUS="passed"
  else
    DRILL_EVIDENCE_STATUS="failed"
  fi
fi

if [[ "$GROWTH_USER_LAYER_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-growth-user-layer-gate.sh >/dev/null; then
    GROWTH_USER_LAYER_STATUS="passed"
  else
    GROWTH_USER_LAYER_STATUS="failed"
  fi
fi

if [[ "$CAPACITY_SLO_EVIDENCE_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-capacity-slo-evidence-gate.sh >/dev/null; then
    CAPACITY_SLO_EVIDENCE_STATUS="passed"
  else
    CAPACITY_SLO_EVIDENCE_STATUS="failed"
  fi
fi

if [[ "$PRODUCTION_DATA_REPLACEMENT_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-production-data-replacement-gate.sh >/dev/null; then
    PRODUCTION_DATA_REPLACEMENT_STATUS="passed"
  else
    PRODUCTION_DATA_REPLACEMENT_STATUS="failed"
  fi
fi

if [[ "$REAL_WORLD_EXTERNAL_VALIDATION_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-real-world-external-validation-gate.sh >/dev/null; then
    REAL_WORLD_EXTERNAL_VALIDATION_STATUS="passed"
  else
    REAL_WORLD_EXTERNAL_VALIDATION_STATUS="failed"
  fi
fi

if [[ "$MAINNET_CUTOVER_REHEARSAL_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-mainnet-cutover-rehearsal-gate.sh >/dev/null; then
    MAINNET_CUTOVER_REHEARSAL_STATUS="passed"
  else
    MAINNET_CUTOVER_REHEARSAL_STATUS="failed"
  fi
fi

if [[ "$LAUNCH_DAY_OPERATIONS_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-launch-day-operations-gate.sh >/dev/null; then
    LAUNCH_DAY_OPERATIONS_STATUS="passed"
  else
    LAUNCH_DAY_OPERATIONS_STATUS="failed"
  fi
fi

if [[ "$FIRST_WEEK_STABILIZATION_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-first-week-stabilization-gate.sh >/dev/null; then
    FIRST_WEEK_STABILIZATION_STATUS="passed"
  else
    FIRST_WEEK_STABILIZATION_STATUS="failed"
  fi
fi

if [[ "$PHASE16_AUTOMATION_CAPTURE_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase16-automation-evidence-capture-gate.sh >/dev/null; then
    PHASE16_AUTOMATION_CAPTURE_STATUS="passed"
  else
    PHASE16_AUTOMATION_CAPTURE_STATUS="failed"
  fi
fi

if [[ "$PHASE16_RELIABILITY_ALERTING_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase16-reliability-alerting-gate.sh >/dev/null; then
    PHASE16_RELIABILITY_ALERTING_STATUS="passed"
  else
    PHASE16_RELIABILITY_ALERTING_STATUS="failed"
  fi
fi

if [[ "$PHASE16_OPERATOR_UX_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase16-operator-ux-gate.sh >/dev/null; then
    PHASE16_OPERATOR_UX_STATUS="passed"
  else
    PHASE16_OPERATOR_UX_STATUS="failed"
  fi
fi

if [[ "$SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-security-compliance-closure-evidence-gate.sh >/dev/null; then
    SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS="passed"
  else
    SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS="failed"
  fi
fi

if [[ "$ECOSYSTEM_READINESS_PROOF_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-ecosystem-readiness-proof-gate.sh >/dev/null; then
    ECOSYSTEM_READINESS_PROOF_STATUS="passed"
  else
    ECOSYSTEM_READINESS_PROOF_STATUS="failed"
  fi
fi

if [[ "$LAUNCH_DECISION_PACKET_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-launch-decision-packet-gate.sh >/dev/null; then
    LAUNCH_DECISION_PACKET_STATUS="passed"
  else
    LAUNCH_DECISION_PACKET_STATUS="failed"
  fi
fi

if [[ "$RELEASE_ARTIFACT_PROVENANCE_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-release-artifact-provenance.sh >/dev/null; then
    RELEASE_ARTIFACT_PROVENANCE_STATUS="passed"
  else
    RELEASE_ARTIFACT_PROVENANCE_STATUS="failed"
  fi
fi

if [[ "$PUBLIC_TESTNET_REPRO_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-public-testnet-reproducibility.sh >/dev/null; then
    PUBLIC_TESTNET_REPRO_STATUS="passed"
  else
    PUBLIC_TESTNET_REPRO_STATUS="failed"
  fi
fi

if [[ "$PHASE17_PUBLIC_TESTNET_STABILITY_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase17-public-testnet-stability-gate.sh >/dev/null; then
    PHASE17_PUBLIC_TESTNET_STABILITY_STATUS="passed"
  else
    PHASE17_PUBLIC_TESTNET_STABILITY_STATUS="failed"
  fi
fi

if [[ "$PHASE18_REAL_ENDPOINT_CUTOVER_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase18-real-endpoint-cutover-gate.sh >/dev/null; then
    PHASE18_REAL_ENDPOINT_CUTOVER_STATUS="passed"
  else
    PHASE18_REAL_ENDPOINT_CUTOVER_STATUS="failed"
  fi
fi

if [[ "$PHASE18_CONTINUOUS_OPS_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase18-continuous-ops-gate.sh >/dev/null; then
    PHASE18_CONTINUOUS_OPS_STATUS="passed"
  else
    PHASE18_CONTINUOUS_OPS_STATUS="failed"
  fi
fi

if [[ "$PHASE19_EVIDENCE_DRIFT_STATUS" == "unknown" ]]; then
  if bash ./scripts/check-phase19-evidence-drift-gate.sh >/dev/null; then
    PHASE19_EVIDENCE_DRIFT_STATUS="passed"
  else
    PHASE19_EVIDENCE_DRIFT_STATUS="failed"
  fi
fi

if [[ "$ONE_COMMAND_AGENT_GATE_STATUS" == "unknown" ]]; then
  ONE_COMMAND_AGENT_GATE_STATUS="not_recorded"
fi

overall_status="passed"
for status in "$PROTOCOL_SANITY_STATUS" "$UPGRADE_READINESS_STATUS" "$MAINNET_READINESS_STATUS" "$MAINNET_LAUNCH_PROGRAM_STATUS" "$LAUNCH_ARTIFACT_COMPLETENESS_STATUS" "$PRODUCTION_INFRASTRUCTURE_STATUS" "$CHAIN_HARDENING_STATUS" "$RUNTIME_HARDENING_STATUS" "$ECOSYSTEM_INTEGRATOR_STATUS" "$GOVERNANCE_OPERATIONS_STATUS" "$DRILL_EVIDENCE_STATUS" "$GROWTH_USER_LAYER_STATUS" "$CAPACITY_SLO_EVIDENCE_STATUS" "$PRODUCTION_DATA_REPLACEMENT_STATUS" "$REAL_WORLD_EXTERNAL_VALIDATION_STATUS" "$MAINNET_CUTOVER_REHEARSAL_STATUS" "$LAUNCH_DAY_OPERATIONS_STATUS" "$FIRST_WEEK_STABILIZATION_STATUS" "$PHASE16_AUTOMATION_CAPTURE_STATUS" "$PHASE16_RELIABILITY_ALERTING_STATUS" "$PHASE16_OPERATOR_UX_STATUS" "$SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS" "$ECOSYSTEM_READINESS_PROOF_STATUS" "$LAUNCH_DECISION_PACKET_STATUS" "$RELEASE_ARTIFACT_PROVENANCE_STATUS" "$ONE_COMMAND_AGENT_GATE_STATUS" "$PHASE17_PUBLIC_TESTNET_STABILITY_STATUS" "$PHASE18_REAL_ENDPOINT_CUTOVER_STATUS" "$PHASE18_CONTINUOUS_OPS_STATUS" "$PHASE19_EVIDENCE_DRIFT_STATUS" "$PUBLIC_TESTNET_REPRO_STATUS"; do
  case "$status" in
    passed|not_recorded) ;;
    *) overall_status="failed" ;;
  esac
done

mkdir -p artifacts

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_commit="$(git rev-parse HEAD)"
git_branch="$(git rev-parse --abbrev-ref HEAD)"

cat > artifacts/release-evidence.json <<JSON
{
  "generated_at_utc": "$timestamp",
  "git": {
    "branch": "$git_branch",
    "commit": "$git_commit"
  },
  "inputs": {
    "manifest": "$MANIFEST",
    "host": "$HOST"
  },
  "gates": {
    "protocol_sanity": "$PROTOCOL_SANITY_STATUS",
    "upgrade_readiness": "$UPGRADE_READINESS_STATUS",
    "mainnet_readiness": "$MAINNET_READINESS_STATUS",
    "mainnet_launch_program": "$MAINNET_LAUNCH_PROGRAM_STATUS",
    "launch_artifact_completeness": "$LAUNCH_ARTIFACT_COMPLETENESS_STATUS",
    "production_infrastructure": "$PRODUCTION_INFRASTRUCTURE_STATUS",
    "chain_hardening": "$CHAIN_HARDENING_STATUS",
    "runtime_hardening": "$RUNTIME_HARDENING_STATUS",
    "ecosystem_integrator": "$ECOSYSTEM_INTEGRATOR_STATUS",
    "governance_operations": "$GOVERNANCE_OPERATIONS_STATUS",
    "drill_evidence": "$DRILL_EVIDENCE_STATUS",
    "growth_user_layer": "$GROWTH_USER_LAYER_STATUS",
    "capacity_slo_evidence": "$CAPACITY_SLO_EVIDENCE_STATUS",
    "production_data_replacement": "$PRODUCTION_DATA_REPLACEMENT_STATUS",
    "real_world_external_validation": "$REAL_WORLD_EXTERNAL_VALIDATION_STATUS",
    "mainnet_cutover_rehearsal": "$MAINNET_CUTOVER_REHEARSAL_STATUS",
    "launch_day_operations": "$LAUNCH_DAY_OPERATIONS_STATUS",
    "first_week_stabilization": "$FIRST_WEEK_STABILIZATION_STATUS",
    "phase16_automation_evidence_capture": "$PHASE16_AUTOMATION_CAPTURE_STATUS",
    "phase16_reliability_alerting": "$PHASE16_RELIABILITY_ALERTING_STATUS",
    "phase16_operator_ux": "$PHASE16_OPERATOR_UX_STATUS",
    "security_compliance_closure_evidence": "$SECURITY_COMPLIANCE_CLOSURE_EVIDENCE_STATUS",
    "ecosystem_readiness_proof": "$ECOSYSTEM_READINESS_PROOF_STATUS",
    "launch_decision_packet": "$LAUNCH_DECISION_PACKET_STATUS",
    "release_artifact_provenance": "$RELEASE_ARTIFACT_PROVENANCE_STATUS",
    "one_command_agent": "$ONE_COMMAND_AGENT_GATE_STATUS",
    "phase17_public_testnet_stability": "$PHASE17_PUBLIC_TESTNET_STABILITY_STATUS",
    "phase18_real_endpoint_cutover": "$PHASE18_REAL_ENDPOINT_CUTOVER_STATUS",
    "phase18_continuous_ops": "$PHASE18_CONTINUOUS_OPS_STATUS",
    "phase19_evidence_drift_controls": "$PHASE19_EVIDENCE_DRIFT_STATUS",
    "public_testnet_reproducibility": "$PUBLIC_TESTNET_REPRO_STATUS"
  },
  "overall_status": "$overall_status",
  "artifact_policy": {
    "path": "artifacts/release-evidence.json",
    "retention": "retain latest 20 release evidence files or 90 days, whichever is greater"
  }
}
JSON

echo "release evidence written to artifacts/release-evidence.json"
