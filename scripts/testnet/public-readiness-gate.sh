#!/usr/bin/env bash
#
# public-readiness-gate.sh - local preflight for the public testnet launch.
# It reports what can be proven on one machine and what remains blocked by VPS,
# DNS/TLS, or external participants.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BIN="${CLAWCHAIN_BIN:-$REPO_ROOT/build/clawchaind}"
RUN_CEREMONY_SIM="${RUN_CEREMONY_SIM:-1}"
RUN_LIVE_SMOKE="${RUN_LIVE_SMOKE:-0}"
RUN_UPGRADE_REHEARSAL="${RUN_UPGRADE_REHEARSAL:-0}"

PASS=0
FAIL=0
WARN=0
BLOCKED=0

ok() { echo "  OK      $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL    $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  WARN    $1"; WARN=$((WARN + 1)); }
blocked() { echo "  BLOCKED $1"; BLOCKED=$((BLOCKED + 1)); }

run_check() {
  local label="$1"
  shift
  if "$@" >/tmp/public-readiness-gate.out 2>/tmp/public-readiness-gate.err; then
    ok "$label"
  else
    bad "$label"
    sed -n '1,8p' /tmp/public-readiness-gate.err | sed 's/^/          /'
  fi
}

run_blocked_check() {
  local label="$1"
  shift
  if "$@" >/tmp/public-readiness-gate.out 2>/tmp/public-readiness-gate.err; then
    ok "$label"
  else
    blocked "$label"
    sed -n '1,6p' /tmp/public-readiness-gate.err | sed 's/^/          /'
  fi
}

echo "== local prerequisites =="
[[ -x "$BIN" ]] && ok "clawchaind binary exists: $BIN" || bad "missing build/clawchaind; run make build"
command -v jq >/dev/null 2>&1 && ok "jq installed" || bad "jq missing"
command -v curl >/dev/null 2>&1 && ok "curl installed" || bad "curl missing"
command -v docker >/dev/null 2>&1 && ok "docker installed" || warn "docker missing; compose config cannot be validated here"

echo "== script syntax =="
run_check "testnet shell scripts parse" bash -n \
  scripts/genesis-ceremony.sh \
  scripts/testnet/local-multinode.sh \
  scripts/testnet/smoke-multinode.sh \
  scripts/testnet/rehearse-gov-upgrade.sh \
  scripts/testnet/simulate-genesis-ceremony.sh \
  scripts/testnet/public-readiness-gate.sh \
  testnet/publish-public-testnet.sh \
  testnet/deploy-hetzner-public.sh \
  testnet/validate-public-env.sh \
  testnet/validate-public-manifest.sh \
  testnet/validate-public-status.sh \
  testnet/verify-public-artifacts-only.sh

echo "== static launch config =="
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    run_check "docker compose config is valid" docker compose -f testnet/docker-compose.yml config -q
  else
    warn "docker compose plugin missing"
  fi
fi

[[ -f testnet/public.env.example ]] && ok "public env template present" || bad "missing testnet/public.env.example"
run_blocked_check "public env has real seed/deploy values" env STRICT_PUBLIC=0 bash testnet/validate-public-env.sh testnet/public.env
run_blocked_check "public manifest has real seed values" bash testnet/validate-public-manifest.sh testnet/public/manifest.json
run_check "public status schema validates" bash testnet/validate-public-status.sh testnet/public/status.json
run_blocked_check "published artifact URLs are reachable and reproducible" env STRICT_PUBLIC=0 bash testnet/verify-public-artifacts-only.sh testnet/public/manifest.json testnet/public/status.json
[[ -f claw-explorer/chains/testnet/clawchain.json ]] && ok "explorer testnet chain config present" || bad "missing explorer testnet chain config"
[[ -f testnet/monitoring/prometheus.yml && -f testnet/monitoring/alert-rules.yml && -f testnet/monitoring/alertmanager.yml ]] \
  && ok "monitoring configs present" || bad "missing monitoring configs"
[[ -f testnet/nginx/testnet-public.conf.tpl ]] && ok "nginx public static template present" || bad "missing nginx public template"

echo "== local ceremony and chain rehearsals =="
if [[ "$RUN_CEREMONY_SIM" == "1" ]]; then
  run_check "external-validator genesis ceremony simulation" bash scripts/testnet/simulate-genesis-ceremony.sh
else
  warn "skipped ceremony simulation (RUN_CEREMONY_SIM=0)"
fi

if [[ "$RUN_LIVE_SMOKE" == "1" ]]; then
  run_check "live multinode full-module smoke" bash scripts/testnet/smoke-multinode.sh
else
  warn "skipped live smoke (set RUN_LIVE_SMOKE=1 after local-multinode up)"
fi

if [[ "$RUN_UPGRADE_REHEARSAL" == "1" ]]; then
  run_check "live gov upgrade rehearsal" bash scripts/testnet/rehearse-gov-upgrade.sh
else
  warn "skipped live upgrade rehearsal (set RUN_UPGRADE_REHEARSAL=1 with pre/post binaries)"
fi

echo "== externally blocked items =="
blocked "VPS/host provisioning for validator and sentry nodes"
blocked "Public DNS and TLS for RPC/REST/gRPC/faucet/explorer/monitoring"
blocked "External validator gentx submissions and sign-off"
blocked "External integrator onboarding"
blocked "Public endpoint smoke, 7-day soak, and public upgrade rehearsal"
blocked "Final testnet privacy trusted setup ceremony decision/execution"

echo ""
echo "=================================================="
echo "  Public testnet readiness gate"
echo "=================================================="
echo "  passed:  $PASS"
echo "  failed:  $FAIL"
echo "  warnings:$WARN"
echo "  blocked: $BLOCKED"
echo "=================================================="

if [[ "$FAIL" -eq 0 ]]; then
  echo "LOCAL READY: all local gates passed; remaining items require hosts, DNS/TLS, or people."
else
  echo "NOT READY: fix local failures above before public deployment."
fi

exit "$FAIL"
