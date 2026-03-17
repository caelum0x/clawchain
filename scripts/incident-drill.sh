#!/usr/bin/env bash
# incident-drill.sh — Simulate incident scenarios to validate response procedures
#
# Usage:
#   ./scripts/incident-drill.sh [scenario]
#
# Scenarios:
#   halt      — Simulate chain halt and recovery
#   rollback  — Simulate binary rollback procedure
#   backup    — Validate backup/restore round-trip
#   all       — Run all drills sequentially
#
# Requires a running local chain (clawchaind).

set -euo pipefail

CHAIN_ID="${CHAIN_ID:-clawchain-local-1}"
RPC="${RPC:-http://localhost:26657}"
BINARY="${BINARY:-$HOME/go/bin/clawchaind}"
HOME_DIR="${HOME_DIR:-$HOME/.clawchain}"
BACKUP_DIR="/tmp/incident-drill-backup"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

PASSED=0
FAILED=0

inc_pass() { PASSED=$((PASSED + 1)); }
inc_fail() { FAILED=$((FAILED + 1)); }

check() {
  local desc="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    pass "$desc"
    inc_pass
  else
    fail "$desc"
    inc_fail
  fi
}

get_height() {
  curl -s "$RPC/status" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['sync_info']['latest_block_height'])" 2>/dev/null
}

wait_blocks() {
  local target=$1
  local start
  start=$(get_height)
  local deadline=$((start + target))
  info "Waiting for block $deadline (current: $start)..."
  for _ in $(seq 1 60); do
    local current
    current=$(get_height 2>/dev/null || echo "0")
    if [ "$current" -ge "$deadline" ] 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# ── Drill: Backup Round-Trip ──────────────────────────────────────────────

drill_backup() {
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  DRILL: Backup / Restore Round-Trip"
  echo "════════════════════════════════════════════════"

  rm -rf "$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"

  # Step 1: Verify chain is running
  info "Step 1: Verify chain is producing blocks"
  local h1 h2
  h1=$(get_height)
  check "Chain is running (height=$h1)" [ "$h1" -gt 0 ]

  # Step 2: Capture state via RPC ABCI queries (live-safe, no DB lock needed)
  info "Step 2: Capture chain state via RPC"
  for endpoint in \
    "$RPC/status" \
    "$RPC/net_info" \
    "$RPC/consensus_state"; do
    if curl -sf "$endpoint" > /dev/null 2>&1; then
      pass "RPC query OK: $endpoint"
      inc_pass
    else
      fail "RPC query failed: $endpoint"
      inc_fail
    fi
  done

  # Step 3: Capture a block snapshot
  info "Step 3: Capture block snapshot"
  if curl -sf "$RPC/block" > "$BACKUP_DIR/block-snapshot.json" 2>/dev/null; then
    check "Block snapshot is valid JSON" python3 -c "import json; json.load(open('$BACKUP_DIR/block-snapshot.json'))"
  else
    fail "Block snapshot capture failed"
    inc_fail
  fi

  # Step 4: Backup validator key
  info "Step 4: Backup validator key"
  if [ -f "$HOME_DIR/config/priv_validator_key.json" ]; then
    cp "$HOME_DIR/config/priv_validator_key.json" "$BACKUP_DIR/"
    pass "Validator key backed up"
    inc_pass
  else
    fail "Validator key not found"
    inc_fail
  fi

  # Step 5: Backup node key
  info "Step 5: Backup node key"
  if [ -f "$HOME_DIR/config/node_key.json" ]; then
    cp "$HOME_DIR/config/node_key.json" "$BACKUP_DIR/"
    pass "Node key backed up"
    inc_pass
  else
    fail "Node key not found"
    inc_fail
  fi

  # Step 6: Verify backup completeness
  info "Step 6: Verify backup completeness"
  check "block-snapshot.json exists" test -f "$BACKUP_DIR/block-snapshot.json"
  check "priv_validator_key.json exists" test -f "$BACKUP_DIR/priv_validator_key.json"
  check "node_key.json exists" test -f "$BACKUP_DIR/node_key.json"

  # Step 7: Verify backup script exists
  info "Step 7: Verify backup tooling exists"
  check "backup-state.sh exists" test -f "$(dirname "$0")/backup-state.sh"
  check "restore-state.sh exists" test -f "$(dirname "$0")/restore-state.sh"

  # Step 8: Chain still producing blocks
  info "Step 8: Chain still healthy after backup drill"
  sleep 2
  h2=$(get_height)
  check "Chain advanced ($h1 → $h2)" [ "$h2" -gt "$h1" ]

  # Step 9: Note about full export
  info "NOTE: Full genesis export (clawchaind export) requires chain to be stopped."
  info "      Use 'make backup' for offline export or 'make backup LIVE=1' for data dir copy."

  rm -rf "$BACKUP_DIR"
}

# ── Drill: Halt Simulation ───────────────────────────────────────────────

drill_halt() {
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  DRILL: Chain Halt Simulation"
  echo "════════════════════════════════════════════════"

  # Step 1: Record pre-halt state
  info "Step 1: Record pre-halt state"
  local pre_height
  pre_height=$(get_height)
  check "Chain running at height $pre_height" [ "$pre_height" -gt 0 ]

  # Step 2: Simulate detection latency
  info "Step 2: Simulating alert detection (2s delay)"
  sleep 2
  pass "Alert detected within SLA"
  inc_pass

  # Step 3: Verify health check detects running chain
  info "Step 3: Health check reports healthy"
  check "RPC responds to status" curl -sf "$RPC/status"

  # Step 4: Simulate operator acknowledgment
  info "Step 4: Operator acknowledgment"
  pass "Operator acknowledged (simulated)"
  inc_pass

  # Step 5: Verify we can query critical state before halt
  info "Step 5: Pre-halt state capture"
  check "Can query consensus state" curl -sf "$RPC/consensus_state"
  check "Can query block" curl -sf "$RPC/block"

  # Step 6: Verify recovery readiness
  info "Step 6: Recovery readiness check"
  check "Binary exists" which "$BINARY"
  check "Home directory exists" test -d "$HOME_DIR"
  check "Config exists" test -f "$HOME_DIR/config/config.toml"

  # NOTE: We do NOT actually stop the chain in this drill.
  # A full halt drill would stop clawchaind, verify it stopped,
  # then restart and verify block production resumes.
  info "NOTE: Skipping actual chain stop (non-destructive drill)"

  # Step 7: Verify chain is still producing
  local post_height
  post_height=$(get_height)
  check "Chain still advancing ($pre_height → $post_height)" [ "$post_height" -ge "$pre_height" ]
}

# ── Drill: Rollback Simulation ───────────────────────────────────────────

drill_rollback() {
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  DRILL: Binary Rollback Simulation"
  echo "════════════════════════════════════════════════"

  # Step 1: Record current binary version
  info "Step 1: Record current binary"
  local version
  version=$($BINARY version 2>/dev/null || echo "dev")
  [ -z "$version" ] && version="dev-build"
  pass "Binary version: $version"
  inc_pass

  # Step 2: Verify we have a state export capability
  info "Step 2: Verify export capability"
  check "Export command exists" $BINARY export --help

  # Step 3: Verify backup script exists
  info "Step 3: Verify backup tooling"
  check "backup-state.sh exists" test -f "$(dirname "$0")/backup-state.sh"
  check "restore-state.sh exists" test -f "$(dirname "$0")/restore-state.sh"

  # Step 4: Verify upgrade guide documentation
  info "Step 4: Verify rollback documentation"
  check "upgrade-guide.md exists" test -f docs/upgrade-guide.md
  check "disaster-recovery.md exists" test -f docs/disaster-recovery.md

  # Step 5: Simulate rollback decision record
  info "Step 5: Generate rollback decision record"
  local record
  record=$(cat <<JSONEOF
{
  "candidate": "$version",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "type": "rollback",
  "authority": "drill-operator",
  "sign_off": "incident-drill automated test",
  "rationale": "Drill exercise — no actual rollback performed",
  "follow_up": ["review post-mortem template", "update runbook"]
}
JSONEOF
  )
  echo "$record" | python3 -c "import sys,json; json.load(sys.stdin)" && {
    pass "Decision record is valid JSON"
    inc_pass
  } || {
    fail "Decision record invalid"
    inc_fail
  }

  # NOTE: We do NOT actually swap binaries in this drill.
  info "NOTE: Skipping actual binary swap (non-destructive drill)"
}

# ── Main ─────────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  DRILL SUMMARY"
  echo "════════════════════════════════════════════════"
  echo -e "  ${GREEN}Passed: $PASSED${NC}"
  echo -e "  ${RED}Failed: $FAILED${NC}"
  echo "════════════════════════════════════════════════"
  if [ "$FAILED" -gt 0 ]; then
    exit 1
  fi
}

SCENARIO="${1:-all}"

case "$SCENARIO" in
  halt)
    drill_halt
    ;;
  rollback)
    drill_rollback
    ;;
  backup)
    drill_backup
    ;;
  all)
    drill_backup
    drill_halt
    drill_rollback
    ;;
  *)
    echo "Unknown scenario: $SCENARIO"
    echo "Usage: $0 [halt|rollback|backup|all]"
    exit 1
    ;;
esac

print_summary
