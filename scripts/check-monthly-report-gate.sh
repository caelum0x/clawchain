#!/usr/bin/env bash
# check-monthly-report-gate.sh — Gate ensuring monthly report artifact is present
#
# Checks that a monthly network report exists for the current or previous month.
# Report must be in: artifacts/monthly-reports/YYYY-MM.md
#
# Usage:
#   ./scripts/check-monthly-report-gate.sh [YYYY-MM]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_DIR/artifacts/monthly-reports"

# Accept explicit month or default to current
if [ $# -ge 1 ]; then
  TARGET_MONTH="$1"
else
  # Check current month first, then previous month
  CURRENT_MONTH=$(date -u +%Y-%m)
  # Calculate previous month
  if command -v gdate > /dev/null 2>&1; then
    PREV_MONTH=$(gdate -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m 2>/dev/null || date -u -v-1m +%Y-%m 2>/dev/null || echo "")
  else
    PREV_MONTH=$(date -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m 2>/dev/null || date -u -v-1m +%Y-%m 2>/dev/null || echo "")
  fi
  TARGET_MONTH=""
fi

PASS=true
FOUND_REPORT=""

check_report() {
  local month="$1"
  local path="$REPORT_DIR/$month.md"
  if [ -f "$path" ]; then
    FOUND_REPORT="$path"
    return 0
  fi
  return 1
}

echo "Monthly Report Gate"
echo "==================="

if [ -n "${TARGET_MONTH:-}" ]; then
  # Explicit month requested
  if check_report "$TARGET_MONTH"; then
    echo "[PASS] Monthly report found: $FOUND_REPORT"
  else
    echo "[FAIL] Monthly report missing for $TARGET_MONTH"
    echo "       Expected: $REPORT_DIR/$TARGET_MONTH.md"
    echo "       Template: docs/monthly-network-report-template.md"
    PASS=false
  fi
else
  # Check current or previous month
  if check_report "$CURRENT_MONTH"; then
    echo "[PASS] Monthly report found for current month: $FOUND_REPORT"
  elif [ -n "$PREV_MONTH" ] && check_report "$PREV_MONTH"; then
    echo "[PASS] Monthly report found for previous month: $FOUND_REPORT"
  else
    echo "[FAIL] No monthly report found for $CURRENT_MONTH or ${PREV_MONTH:-unknown}"
    echo "       Expected: $REPORT_DIR/$CURRENT_MONTH.md"
    echo "       Template: docs/monthly-network-report-template.md"
    echo ""
    echo "  To create a report:"
    echo "    mkdir -p $REPORT_DIR"
    echo "    cp docs/monthly-network-report-template.md $REPORT_DIR/$CURRENT_MONTH.md"
    echo "    # Fill in metrics, then re-run this gate"
    PASS=false
  fi
fi

# Check template exists
if [ ! -f "$PROJECT_DIR/docs/monthly-network-report-template.md" ]; then
  echo "[FAIL] Monthly report template missing: docs/monthly-network-report-template.md"
  PASS=false
else
  echo "[PASS] Report template exists"
fi

# Check governance decision log exists
if [ ! -f "$PROJECT_DIR/docs/governance-decision-log.md" ]; then
  echo "[FAIL] Governance decision log missing: docs/governance-decision-log.md"
  PASS=false
else
  echo "[PASS] Governance decision log exists"
fi

if $PASS; then
  echo ""
  echo "Monthly report gate: PASSED"
  exit 0
else
  echo ""
  echo "Monthly report gate: FAILED"
  exit 1
fi
