#!/usr/bin/env bash
# gate-summary.sh — Operator-facing summary of all release gate states
#
# Usage:
#   ./scripts/gate-summary.sh [--json]
#
# Runs each gate target and reports pass/fail status.
# With --json, outputs machine-readable JSON.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
JSON_MODE=false

if [ "${1:-}" = "--json" ]; then
  JSON_MODE=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Core gates to check (ordered by importance)
GATES=(
  "protocol-sanity"
  "health-check"
  "endpoint-smoke"
  "incident-drill"
)

# Check which gate scripts actually exist
AVAILABLE_GATES=()
GATE_SCRIPTS=(
  "protocol-sanity:scripts/check-protocol-sanity.sh"
  "health-check:scripts/health-check.sh"
  "endpoint-smoke:scripts/endpoint-smoke.sh"
  "incident-drill:scripts/incident-drill.sh"
  "validate-upgrade:scripts/validate-upgrade.sh"
  "load-test:scripts/load-test.sh"
)

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
RESULTS=()

run_gate() {
  local name="$1"
  local script="$2"
  local full_path="$PROJECT_DIR/$script"

  TOTAL=$((TOTAL + 1))

  if [ ! -f "$full_path" ]; then
    SKIPPED=$((SKIPPED + 1))
    RESULTS+=("{\"gate\":\"$name\",\"status\":\"skipped\",\"reason\":\"script not found\"}")
    if ! $JSON_MODE; then
      echo -e "  ${YELLOW}[SKIP]${NC} $name — script not found ($script)"
    fi
    return
  fi

  if bash "$full_path" > /dev/null 2>&1; then
    PASSED=$((PASSED + 1))
    RESULTS+=("{\"gate\":\"$name\",\"status\":\"passed\"}")
    if ! $JSON_MODE; then
      echo -e "  ${GREEN}[PASS]${NC} $name"
    fi
  else
    FAILED=$((FAILED + 1))
    RESULTS+=("{\"gate\":\"$name\",\"status\":\"failed\",\"remediation\":\"$(get_remediation "$name")\"}")
    if ! $JSON_MODE; then
      echo -e "  ${RED}[FAIL]${NC} $name"
      local hint
      hint=$(get_remediation "$name")
      if [ -n "$hint" ]; then
        echo -e "         ${YELLOW}fix:${NC} $hint"
      fi
    fi
  fi
}

get_remediation() {
  local gate="$1"
  case "$gate" in
    protocol-sanity)
      echo "Run 'make proto-gen' then 'make protocol-surface-lock-refresh' to resync proto contracts"
      ;;
    health-check)
      echo "Ensure chain is running ('make testnet-start' or 'clawchaind start'). Check RPC on port 26657"
      ;;
    endpoint-smoke)
      echo "Enable REST API in app.toml (api.enable=true) and restart chain"
      ;;
    incident-drill)
      echo "Check chain is running and RPC accessible. Review drill output: 'make incident-drill 2>&1'"
      ;;
    validate-upgrade)
      echo "Ensure chain binary is built ('go build ./...') and state is exportable"
      ;;
    load-test)
      echo "Check chain is running with funded accounts. Review: 'make load-test 2>&1'"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Check additional Makefile-based gates
check_makefile_gate() {
  local name="$1"
  TOTAL=$((TOTAL + 1))

  if cd "$PROJECT_DIR" && make "$name" > /dev/null 2>&1; then
    PASSED=$((PASSED + 1))
    RESULTS+=("{\"gate\":\"$name\",\"status\":\"passed\"}")
    if ! $JSON_MODE; then
      echo -e "  ${GREEN}[PASS]${NC} $name"
    fi
  else
    FAILED=$((FAILED + 1))
    RESULTS+=("{\"gate\":\"$name\",\"status\":\"failed\",\"remediation\":\"$(get_remediation "$name")\"}")
    if ! $JSON_MODE; then
      echo -e "  ${RED}[FAIL]${NC} $name"
      local hint
      hint=$(get_remediation "$name")
      if [ -n "$hint" ]; then
        echo -e "         ${YELLOW}fix:${NC} $hint"
      fi
    fi
  fi
}

if ! $JSON_MODE; then
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  ClawChain Release Gate Summary"
  echo "═══════════════════════════════════════════════"
  echo ""
  echo "Infrastructure Gates:"
fi

for entry in "${GATE_SCRIPTS[@]}"; do
  name="${entry%%:*}"
  script="${entry#*:}"
  run_gate "$name" "$script"
done

if ! $JSON_MODE; then
  echo ""
  echo "Build Gates:"
fi

# Quick build checks
TOTAL=$((TOTAL + 1))
if cd "$PROJECT_DIR" && go build ./... > /dev/null 2>&1; then
  PASSED=$((PASSED + 1))
  RESULTS+=("{\"gate\":\"go-build\",\"status\":\"passed\"}")
  if ! $JSON_MODE; then
    echo -e "  ${GREEN}[PASS]${NC} go-build"
  fi
else
  FAILED=$((FAILED + 1))
  RESULTS+=("{\"gate\":\"go-build\",\"status\":\"failed\",\"remediation\":\"Run 'go build ./...' and fix compile errors\"}")
  if ! $JSON_MODE; then
    echo -e "  ${RED}[FAIL]${NC} go-build"
    echo -e "         ${YELLOW}fix:${NC} Run 'go build ./...' and fix compile errors"
  fi
fi

TOTAL=$((TOTAL + 1))
if cd "$PROJECT_DIR/sdk" && npx tsc --noEmit > /dev/null 2>&1; then
  PASSED=$((PASSED + 1))
  RESULTS+=("{\"gate\":\"sdk-typecheck\",\"status\":\"passed\"}")
  if ! $JSON_MODE; then
    echo -e "  ${GREEN}[PASS]${NC} sdk-typecheck"
  fi
else
  FAILED=$((FAILED + 1))
  RESULTS+=("{\"gate\":\"sdk-typecheck\",\"status\":\"failed\",\"remediation\":\"cd sdk && npx tsc --noEmit to see TS errors\"}")
  if ! $JSON_MODE; then
    echo -e "  ${RED}[FAIL]${NC} sdk-typecheck"
    echo -e "         ${YELLOW}fix:${NC} cd sdk && npx tsc --noEmit to see TS errors"
  fi
fi

if $JSON_MODE; then
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"total\": $TOTAL,"
  echo "  \"passed\": $PASSED,"
  echo "  \"failed\": $FAILED,"
  echo "  \"skipped\": $SKIPPED,"
  echo "  \"allPassed\": $([ "$FAILED" -eq 0 ] && echo "true" || echo "false"),"
  echo "  \"gates\": ["
  for i in "${!RESULTS[@]}"; do
    if [ "$i" -lt $((${#RESULTS[@]} - 1)) ]; then
      echo "    ${RESULTS[$i]},"
    else
      echo "    ${RESULTS[$i]}"
    fi
  done
  echo "  ]"
  echo "}"
else
  echo ""
  echo "═══════════════════════════════════════════════"
  echo -e "  Total: $TOTAL  ${GREEN}Passed: $PASSED${NC}  ${RED}Failed: $FAILED${NC}  ${YELLOW}Skipped: $SKIPPED${NC}"
  echo "═══════════════════════════════════════════════"
fi

[ "$FAILED" -eq 0 ] || exit 1
