#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CLAWD_DIR="$ROOT_DIR/cmd/clawd"

MANIFEST="${1:-${MANIFEST:-}}"
HOST="${2:-${HOST:-}}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-180}"
ACCEPTANCE_TIMEOUT_SECONDS="${ACCEPTANCE_TIMEOUT_SECONDS:-300}"
REQUEST_FAUCET="${REQUEST_FAUCET:-1}"
BOOTSTRAP_OUT_DIR="${BOOTSTRAP_OUT_DIR:-$ROOT_DIR/artifacts/bootstrap}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
CLAWD_HOME="${CLAWD_HOME:-$ROOT_DIR/.tmp/clawd-home}"
OPENCLAW_HOME="${OPENCLAW_HOME:-$ROOT_DIR/.tmp/openclaw-home}"
CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$ROOT_DIR/.tmp/clawchain-home}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$ROOT_DIR/.tmp/openclaw-state}"
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-19001}"
MESSAGING_PORT="${MESSAGING_PORT:-19777}"
NODE_BINARY="${NODE_BINARY:-}"

if [[ -z "$NODE_BINARY" ]]; then
  if [[ -x "$ROOT_DIR/bin/clawchaind" ]]; then
    NODE_BINARY="$ROOT_DIR/bin/clawchaind"
  elif [[ -x "$HOME/go/bin/clawchaind" ]]; then
    NODE_BINARY="$HOME/go/bin/clawchaind"
  else
    NODE_BINARY="clawchaind"
  fi
fi

if [[ -z "$MANIFEST" ]]; then
  echo "usage: $0 <manifest-url-or-path> <public-host>" >&2
  exit 1
fi
if [[ -z "$HOST" ]]; then
  echo "usage: $0 <manifest-url-or-path> <public-host>" >&2
  exit 1
fi
if [[ ! -f "$CLAWD_DIR/dist/main.js" ]]; then
  echo "missing clawd build output: $CLAWD_DIR/dist/main.js" >&2
  echo "run: make clawd-build" >&2
  exit 1
fi

mkdir -p "$BOOTSTRAP_OUT_DIR"
mkdir -p "$CLAWD_HOME" "$OPENCLAW_HOME" "$CLAWCHAIN_HOME" "$OPENCLAW_STATE_DIR"

if [[ "$MANIFEST" != http://* && "$MANIFEST" != https://* ]]; then
  MANIFEST="$(cd "$ROOT_DIR" && realpath "$MANIFEST")"
fi

UP_LOG="${BOOTSTRAP_OUT_DIR}/fresh-machine-up-${RUN_ID}.log"
READY_JSON="${BOOTSTRAP_OUT_DIR}/fresh-machine-readiness-${RUN_ID}.json"
DOCTOR_JSON="${BOOTSTRAP_OUT_DIR}/fresh-machine-doctor-${RUN_ID}.json"
SUMMARY_JSON="${BOOTSTRAP_OUT_DIR}/fresh-machine-summary-${RUN_ID}.json"

cleanup() {
  if [[ -n "${UP_PID:-}" ]]; then
    kill "${UP_PID}" >/dev/null 2>&1 || true
    wait "${UP_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "--> Fresh-machine acceptance: launching one-command runtime path"
(
  cd "$CLAWD_DIR"
  up_args=(
    ./dist/main.js
    up
    --from-manifest "$MANIFEST"
    --host "$HOST"
    --node-binary "$NODE_BINARY"
    --messaging-port "$MESSAGING_PORT"
    --require-ready
    --ready-timeout-seconds "$READY_TIMEOUT_SECONDS"
  )
  if [[ "$REQUEST_FAUCET" == "1" ]]; then
    up_args+=(--request-faucet)
  fi
  CLAWD_HOME="$CLAWD_HOME" OPENCLAW_HOME="$OPENCLAW_HOME" CLAWCHAIN_HOME="$CLAWCHAIN_HOME" OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" OPENCLAW_GATEWAY_PORT="$OPENCLAW_GATEWAY_PORT" node "${up_args[@]}" >"$UP_LOG" 2>&1
) &
UP_PID=$!

echo "--> Waiting for readiness signal (max ${ACCEPTANCE_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + ACCEPTANCE_TIMEOUT_SECONDS ))
ready=0

while [[ $(date +%s) -lt $deadline ]]; do
  if ! kill -0 "$UP_PID" >/dev/null 2>&1; then
    echo "runtime process exited before acceptance checks completed." >&2
    tail -n 80 "$UP_LOG" >&2 || true
    exit 1
  fi

  if (
    cd "$CLAWD_DIR"
    CLAWD_HOME="$CLAWD_HOME" OPENCLAW_HOME="$OPENCLAW_HOME" CLAWCHAIN_HOME="$CLAWCHAIN_HOME" OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" OPENCLAW_GATEWAY_PORT="$OPENCLAW_GATEWAY_PORT" node ./dist/main.js readiness --json >"$READY_JSON"
  ); then
    ready=1
    break
  fi
  sleep 5
done

if [[ "$ready" != "1" ]]; then
  echo "timed out waiting for clawd readiness." >&2
  tail -n 80 "$UP_LOG" >&2 || true
  exit 1
fi

echo "--> Running machine-readable doctor check"
(
  cd "$CLAWD_DIR"
  CLAWD_HOME="$CLAWD_HOME" OPENCLAW_HOME="$OPENCLAW_HOME" CLAWCHAIN_HOME="$CLAWCHAIN_HOME" OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" OPENCLAW_GATEWAY_PORT="$OPENCLAW_GATEWAY_PORT" node ./dist/main.js doctor --json >"$DOCTOR_JSON"
)

echo "--> Fresh-machine acceptance gate passed"
if [[ ! -s "$READY_JSON" || ! -s "$DOCTOR_JSON" || ! -s "$UP_LOG" ]]; then
  echo "fresh-machine acceptance artifact generation failed." >&2
  echo "expected non-empty files: $UP_LOG, $READY_JSON, $DOCTOR_JSON" >&2
  exit 1
fi

cat >"$SUMMARY_JSON" <<EOF
{
  "runId": "$RUN_ID",
  "status": "passed",
  "manifest": "$MANIFEST",
  "host": "$HOST",
  "artifacts": {
    "upLog": "${UP_LOG#$ROOT_DIR/}",
    "readinessJson": "${READY_JSON#$ROOT_DIR/}",
    "doctorJson": "${DOCTOR_JSON#$ROOT_DIR/}"
  }
}
EOF

if [[ ! -s "$SUMMARY_JSON" ]]; then
  echo "fresh-machine acceptance summary artifact generation failed: $SUMMARY_JSON" >&2
  exit 1
fi

echo "  manifest: $MANIFEST"
echo "  host:     $HOST"
echo "  run_id:   $RUN_ID"
echo "  summary:  ${SUMMARY_JSON#$ROOT_DIR/}"
