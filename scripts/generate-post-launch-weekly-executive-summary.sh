#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEEK_ID="${WEEK_ID:-$(date -u +%G-W%V)}"
OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
NIGHTLY_OPS_PACK="${NIGHTLY_OPS_PACK:-artifacts/operations/nightly-ops-pack-latest.json}"
WEEKLY_DRILL_PACK="${WEEKLY_DRILL_PACK:-artifacts/operations/weekly-incident-drill-pack-latest.json}"
MONTHLY_GOVERNANCE_PACK="${MONTHLY_GOVERNANCE_PACK:-artifacts/governance/monthly-governance-pack-latest.json}"
RELEASE_EVIDENCE="${RELEASE_EVIDENCE:-artifacts/release-evidence.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for path in "$NIGHTLY_OPS_PACK" "$WEEKLY_DRILL_PACK" "$MONTHLY_GOVERNANCE_PACK" "$RELEASE_EVIDENCE"; do
  if [[ ! -f "$path" ]]; then
    echo "ERROR: missing executive summary input '$path'." >&2
    exit 1
  fi
done

mkdir -p "$OUT_DIR"

json_artifact="${OUT_DIR}/post-launch-weekly-executive-summary-${WEEK_ID}.json"
json_latest="${OUT_DIR}/post-launch-weekly-executive-summary-latest.json"
md_artifact="${OUT_DIR}/post-launch-weekly-executive-summary-${WEEK_ID}.md"
md_latest="${OUT_DIR}/post-launch-weekly-executive-summary-latest.md"

nightly_status="$(jq -r '.overallStatus // "unknown"' "$NIGHTLY_OPS_PACK")"
weekly_status="$(jq -r '.closureStatus // "unknown"' "$WEEKLY_DRILL_PACK")"
weekly_drill_status="$(jq -r '.drill.status // "unknown"' "$WEEKLY_DRILL_PACK")"
monthly_status="$(jq -r '.closureStatus // "unknown"' "$MONTHLY_GOVERNANCE_PACK")"
release_status="$(jq -r '.overall_status // "unknown"' "$RELEASE_EVIDENCE")"
phase19_drift_status="$(jq -r '.gates.phase19_evidence_drift_controls // "unknown"' "$RELEASE_EVIDENCE")"

overall_status="passed"
recommendation="launch_stable_continue_weekly_ops"
if [[ "$nightly_status" != "passed" || "$weekly_status" != "closed" || "$weekly_drill_status" != "passed" || "$monthly_status" != "closed" || "$release_status" != "passed" || "$phase19_drift_status" != "passed" ]]; then
  overall_status="attention_required"
  recommendation="hold_stabilized_label_and_remediate_open_signals"
fi

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg weekId "$WEEK_ID" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg nightlyOpsPack "$NIGHTLY_OPS_PACK" \
  --arg weeklyDrillPack "$WEEKLY_DRILL_PACK" \
  --arg monthlyGovernancePack "$MONTHLY_GOVERNANCE_PACK" \
  --arg releaseEvidence "$RELEASE_EVIDENCE" \
  --arg nightlyStatus "$nightly_status" \
  --arg weeklyStatus "$weekly_status" \
  --arg weeklyDrillStatus "$weekly_drill_status" \
  --arg monthlyStatus "$monthly_status" \
  --arg releaseStatus "$release_status" \
  --arg phase19DriftStatus "$phase19_drift_status" \
  --arg overallStatus "$overall_status" \
  --arg recommendation "$recommendation" \
  --argjson nightlyOpsPackJson "$(cat "$NIGHTLY_OPS_PACK")" \
  --argjson weeklyDrillPackJson "$(cat "$WEEKLY_DRILL_PACK")" \
  --argjson monthlyGovernancePackJson "$(cat "$MONTHLY_GOVERNANCE_PACK")" \
  --argjson releaseEvidenceJson "$(cat "$RELEASE_EVIDENCE")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    weekId: $weekId,
    gitCommit: $gitCommit,
    inputs: {
      nightlyOpsPack: $nightlyOpsPack,
      weeklyDrillPack: $weeklyDrillPack,
      monthlyGovernancePack: $monthlyGovernancePack,
      releaseEvidence: $releaseEvidence
    },
    status: {
      nightlyOps: $nightlyStatus,
      weeklyDrillClosure: $weeklyStatus,
      weeklyDrill: $weeklyDrillStatus,
      monthlyGovernanceClosure: $monthlyStatus,
      releaseEvidence: $releaseStatus,
      phase19EvidenceDriftControls: $phase19DriftStatus
    },
    overallStatus: $overallStatus,
    recommendation: $recommendation,
    artifacts: {
      nightlyOpsPack: $nightlyOpsPackJson,
      weeklyDrillPack: $weeklyDrillPackJson,
      monthlyGovernancePack: $monthlyGovernancePackJson,
      releaseEvidence: $releaseEvidenceJson
    }
  }
  ' >"$json_artifact"

cp "$json_artifact" "$json_latest"

cat >"$md_artifact" <<MD
# Post-Launch Weekly Executive Summary (${WEEK_ID})

- Generated at (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Git commit: $(git rev-parse HEAD)
- Overall status: ${overall_status}
- Recommendation: ${recommendation}

## Signal Snapshot

- Nightly ops pack: ${nightly_status}
- Weekly incident drill closure: ${weekly_status}
- Weekly incident drill execution: ${weekly_drill_status}
- Monthly governance closure: ${monthly_status}
- Release evidence: ${release_status}
- Phase 19 evidence drift controls: ${phase19_drift_status}

## Artifact Paths

- ${NIGHTLY_OPS_PACK}
- ${WEEKLY_DRILL_PACK}
- ${MONTHLY_GOVERNANCE_PACK}
- ${RELEASE_EVIDENCE}
- ${json_artifact}
MD

cp "$md_artifact" "$md_latest"

echo "post-launch weekly executive summary written."
echo "  json:   $json_artifact"
echo "  latest: $json_latest"
echo "  md:     $md_artifact"
