#!/usr/bin/env bash
# explorer-data-verify.sh — Live "explorer data verification" (E4-lite) for the
# ClawChain block explorer (claw-explorer/, a Ping.pub Vue SPA).
#
# WHAT THIS PROVES (and what it does NOT):
#   The explorer's custom-module tabs are thin client-side views over REST query
#   endpoints. This script proves the DATA LAYER and the BUILD/SERVE shell:
#     (a) DATA LAYER — on a freshly booted single node, each tab's REST endpoint
#         returns parseable JSON (HTTP 200, not 404/501/unknown-path), and the
#         seeded endpoints return the expected seeded rows (model, provider, and
#         a fully-settled inference job: attested + disputed + resolved).
#     (b) BUILD + SERVE — the explorer builds (or reuses an existing dist/) and
#         serves an HTTP 200 SPA shell containing the <div id="app"> root.
#
#   ┌──────────────────────────────────────────────────────────────────────────┐
#   │ NOT COVERED: true DOM-render verification (actually rendering each tab in  │
#   │ a real browser) requires a headless browser (gstack / Playwright). gstack  │
#   │ is NOT installed in this environment, so DOM-render checks are OUT OF      │
#   │ SCOPE. We verify the data each tab consumes + that the SPA shell serves.   │
#   └──────────────────────────────────────────────────────────────────────────┘
#
# Seeded inference lifecycle (extends scripts/testnet/inference-settlement-accept.sh):
#   register-model -> set-inference-pricing -> register-inference-provider
#   -> provider-heartbeat -> submit-inference-job -> start -> complete
#   -> submit-usage-attestation -> dispute-inference-job
#   -> resolve-inference-dispute <job> false  (uphold=false: reject the dispute,
#      restore provider reputation, mark resolved=true)
#   Plus: tokenfactory create-denom so the tokenfactory tab has a denom to show.
#
#   After seeding the chain holds: 1 model, 1 inference provider, 1 inference job
#   that is completed + attested + disputed + resolved, and 1 tokenfactory denom.
#
# Re-runnable: FRESH temp home each run (.explorer-verify-node/, gitignored) and a
# trap that always tears down BOTH the node and the explorer serve process.
set -uo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BINARY="${CLAWCHAIND_BIN:-$ROOT_DIR/build/clawchaind}"
EXPLORER_DIR="$ROOT_DIR/claw-explorer"
DENOM="uclaw"
CHAIN_ID="clawchain-local"
MONIKER="explorer-verify-node"
KEYRING="test"
RPC="http://localhost:26657"
REST="${CLAWCHAIN_REST:-http://localhost:1317}"
SERVE_PORT="${EXPLORER_SERVE_PORT:-8087}"   # non-conflicting (explorer prod uses 8082)
SERVE_URL="http://localhost:${SERVE_PORT}"
GAS_FLAGS="--gas auto --gas-adjustment 1.5 --gas-prices 0.025${DENOM}"

DEV_KEY="dev-account"
DEV_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
PROV_KEY="provider-account"

HOME_DIR="$ROOT_DIR/.explorer-verify-node"
LOGFILE="$ROOT_DIR/build/explorer-verify-node.log"
SERVE_LOG="$ROOT_DIR/build/explorer-verify-serve.log"
CHAIN_PID=""
SERVE_PID=""

TF_SUBDENOM="explorerverify"

# ── Colors / logging ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }

cleanup() {
  if [ -n "$SERVE_PID" ] && kill -0 "$SERVE_PID" 2>/dev/null; then
    info "Stopping explorer serve (PID $SERVE_PID)..."
    kill "$SERVE_PID" 2>/dev/null || true
    # vite preview spawns child processes; nuke the group too.
    pkill -P "$SERVE_PID" 2>/dev/null || true
    wait "$SERVE_PID" 2>/dev/null || true
  fi
  if [ -n "$CHAIN_PID" ] && kill -0 "$CHAIN_PID" 2>/dev/null; then
    info "Stopping chain (PID $CHAIN_PID)..."
    kill "$CHAIN_PID" 2>/dev/null || true
    wait "$CHAIN_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail() {
  echo -e "${RED}[FAIL]${NC}  $*" >&2
  echo -e "${RED}━━━ EXPLORER DATA VERIFICATION FAILED ━━━${NC}" >&2
  exit 1
}

bin() { "$BINARY" "$@"; }
keyaddr() { bin keys show "$1" --home "$HOME_DIR" --keyring-backend "$KEYRING" -a; }

# Submit a modelregistry tx, wait for commit, abort on nonzero code.
# Usage: send_tx <from-key> <label> <args...>
send_tx() {
  local from="$1" label="$2"; shift 2
  local out hash code rawlog
  out=$(bin tx modelregistry "$@" \
        --from "$from" --chain-id "$CHAIN_ID" --keyring-backend "$KEYRING" \
        --home "$HOME_DIR" --node "$RPC" $GAS_FLAGS -y -o json 2>&1)
  _broadcast_and_poll "$label" "$out"
}

# Submit an arbitrary tx (module passed inline), wait for commit.
# Usage: send_tx_raw <from-key> <label> <module> <args...>
send_tx_raw() {
  local from="$1" label="$2" module="$3"; shift 3
  local out
  out=$(bin tx "$module" "$@" \
        --from "$from" --chain-id "$CHAIN_ID" --keyring-backend "$KEYRING" \
        --home "$HOME_DIR" --node "$RPC" $GAS_FLAGS -y -o json 2>&1)
  _broadcast_and_poll "$label" "$out"
}

_broadcast_and_poll() {
  local label="$1" out="$2"
  local hash code rawlog
  hash=$(printf '%s' "$out" | python3 -c "
import json, re, sys
raw = sys.stdin.read()
m = re.search(r'\{.*\}', raw, re.S)
if not m:
    print(''); sys.exit()
try:
    print(json.loads(m.group(0)).get('txhash',''))
except Exception:
    print('')" 2>/dev/null)
  if [ -z "$hash" ]; then
    fail "$label: tx submission failed (no txhash). Raw output:\n$out"
  fi
  local bcode
  bcode=$(printf '%s' "$out" | python3 -c "
import json, re, sys
raw = sys.stdin.read()
m = re.search(r'\{.*\}', raw, re.S)
try:
    print(json.loads(m.group(0)).get('code',0) if m else 0)
except Exception:
    print(0)" 2>/dev/null)
  if [ "${bcode:-0}" != "0" ]; then
    local brawlog
    brawlog=$(printf '%s' "$out" | python3 -c "
import json, re, sys
raw = sys.stdin.read(); m = re.search(r'\{.*\}', raw, re.S)
print(json.loads(m.group(0)).get('raw_log','') if m else raw)" 2>/dev/null)
    fail "$label: broadcast rejected (code=$bcode, hash $hash). raw_log:\n$brawlog"
  fi
  local i tx_json
  for i in $(seq 1 30); do
    tx_json=$(bin query tx "$hash" --node "$RPC" -o json 2>/dev/null)
    if [ -n "$tx_json" ]; then
      code=$(printf '%s' "$tx_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',1))" 2>/dev/null)
      [ -n "$code" ] && break
    fi
    sleep 1
  done
  if [ "${code:-1}" != "0" ]; then
    rawlog=$(printf '%s' "$tx_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('raw_log',''))" 2>/dev/null)
    fail "$label: tx committed with code=${code:-?} (hash $hash). raw_log:\n$rawlog"
  fi
  ok "$label committed (code=0, hash=$hash)"
  LAST_TX_HASH="$hash"
}

# curl a REST path, assert HTTP 200 + parseable JSON. Echoes the JSON body.
# Usage: rest_get <path-label> <path>  ; sets REST_BODY and returns 0/1
rest_get() {
  local label="$1" path="$2"
  local code body tmp
  tmp=$(mktemp)
  code=$(curl -s -o "$tmp" -w '%{http_code}' "${REST}${path}" 2>/dev/null)
  body=$(cat "$tmp"); rm -f "$tmp"
  if [ "$code" != "200" ]; then
    fail "$label: ${REST}${path} returned HTTP $code (expected 200 — explorer tab would break).\nBody:\n$body"
  fi
  if ! printf '%s' "$body" | jq -e . >/dev/null 2>&1; then
    fail "$label: ${REST}${path} did not return parseable JSON (explorer tab would break).\nBody:\n$body"
  fi
  REST_BODY="$body"
  return 0
}

# ══════════════════════════════════════════════════════════════════════════════
# 0. Preflight
# ══════════════════════════════════════════════════════════════════════════════
[ -x "$BINARY" ] || fail "binary not found/executable at $BINARY (build it first)"
command -v python3 >/dev/null || fail "python3 is required for JSON parsing"
command -v jq >/dev/null || fail "jq is required for REST assertions"
command -v curl >/dev/null || fail "curl is required"
command -v npx >/dev/null || fail "npx is required for the explorer build/serve"
[ -d "$EXPLORER_DIR" ] || fail "explorer dir not found at $EXPLORER_DIR"

info "Using binary:   $BINARY"
info "Explorer dir:   $EXPLORER_DIR"
info "Fresh temp home: $HOME_DIR"
info "REST endpoint:  $REST"
info "Serve port:     $SERVE_PORT"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 1. Fresh single-node init (mirrors inference-settlement-accept.sh)
# ══════════════════════════════════════════════════════════════════════════════
pkill -f "clawchaind start.*$HOME_DIR" 2>/dev/null || true
rm -rf "$HOME_DIR"
mkdir -p "$ROOT_DIR/build"

bin init "$MONIKER" --chain-id "$CHAIN_ID" --home "$HOME_DIR" >/dev/null 2>&1 \
  || fail "chain init failed"
ok "Chain initialized ($CHAIN_ID)"

printf '%s\n' "$DEV_MNEMONIC" | bin keys add "$DEV_KEY" \
  --home "$HOME_DIR" --keyring-backend "$KEYRING" --recover >/dev/null 2>&1 \
  || fail "could not recover dev-account"
bin keys add "$PROV_KEY" --home "$HOME_DIR" --keyring-backend "$KEYRING" >/dev/null 2>&1 \
  || fail "could not create provider key"

REQ_ADDR=$(keyaddr "$DEV_KEY")
PROV_ADDR=$(keyaddr "$PROV_KEY")
[ -n "$REQ_ADDR" ] && [ -n "$PROV_ADDR" ] || fail "could not resolve key addresses"
info "Requester (dev-account):     $REQ_ADDR"
info "Provider (provider-account): $PROV_ADDR"

bin genesis add-genesis-account "$REQ_ADDR" "1000000000000${DENOM}" \
  --home "$HOME_DIR" --keyring-backend "$KEYRING" >/dev/null 2>&1 \
  || fail "could not fund requester genesis account"
bin genesis add-genesis-account "$PROV_ADDR" "1000000000000${DENOM}" \
  --home "$HOME_DIR" --keyring-backend "$KEYRING" >/dev/null 2>&1 \
  || fail "could not fund provider genesis account"
ok "Funded requester + provider genesis accounts"

# Min gas price.
if [ -f "$HOME_DIR/config/app.toml" ]; then
  sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uclaw"/' "$HOME_DIR/config/app.toml"
  # Enable the REST API + Swagger (the explorer tabs query REST on :1317).
  sed -i.bak 's/enable = false/enable = true/' "$HOME_DIR/config/app.toml"
  sed -i.bak 's/swagger = false/swagger = true/' "$HOME_DIR/config/app.toml"
  rm -f "$HOME_DIR/config/app.toml.bak"
  ok "Min gas price set + REST API/Swagger enabled"
fi

# CORS (so a browser-served explorer could reach REST; harmless for curl).
if [ -f "$HOME_DIR/config/config.toml" ]; then
  sed -i.bak 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/' "$HOME_DIR/config/config.toml"
  rm -f "$HOME_DIR/config/config.toml.bak"
fi

# x/wasm genesis params (empty defaults reject the first tx via the antehandler).
GENESIS="$HOME_DIR/config/genesis.json"
python3 - "$GENESIS" <<'PY' || fail "could not configure wasm genesis params"
import json, sys
path = sys.argv[1]
with open(path) as f:
    g = json.load(f)
app = g.setdefault('app_state', {})
app['wasm'] = {
    'params': {
        'code_upload_access': {'permission': 'Everybody', 'addresses': []},
        'instantiate_default_permission': 'Everybody',
    },
    'codes': [],
    'contracts': [],
    'sequences': [],
}
with open(path, 'w') as f:
    json.dump(g, f, indent=2)
PY
ok "CosmWasm genesis params configured (upload: Everybody)"

bin genesis gentx "$DEV_KEY" "100000000${DENOM}" \
  --chain-id "$CHAIN_ID" --home "$HOME_DIR" --keyring-backend "$KEYRING" \
  --moniker "$MONIKER" >/dev/null 2>&1 || fail "gentx failed"
bin genesis collect-gentxs --home "$HOME_DIR" >/dev/null 2>&1 || fail "collect-gentxs failed"
ok "Validator gentx created + collected"

# ══════════════════════════════════════════════════════════════════════════════
# 2. Start node, wait for RPC + REST
# ══════════════════════════════════════════════════════════════════════════════
info "Starting node in background (REST + gRPC enabled)..."
nohup "$BINARY" start --home "$HOME_DIR" --minimum-gas-prices "0.025${DENOM}" \
  --api.enable --grpc.enable > "$LOGFILE" 2>&1 &
CHAIN_PID=$!
ok "Node started (PID $CHAIN_PID, log $LOGFILE)"

info "Waiting for RPC + block height > 1..."
READY=false
for i in $(seq 1 60); do
  if ! kill -0 "$CHAIN_PID" 2>/dev/null; then
    fail "node process died during boot. Last log lines:\n$(tail -n 30 "$LOGFILE")"
  fi
  H=$(curl -s "$RPC/status" 2>/dev/null | python3 -c "import json,sys;
try: print(json.load(sys.stdin)['result']['sync_info']['latest_block_height'])
except Exception: print('')" 2>/dev/null)
  if [ -n "$H" ] && [ "$H" -gt 1 ] 2>/dev/null; then
    ok "Chain live at height $H"
    READY=true
    break
  fi
  sleep 2
done
[ "$READY" = true ] || fail "timed out waiting for chain. Last log:\n$(tail -n 30 "$LOGFILE")"

info "Waiting for REST API ($REST) to come up..."
REST_READY=false
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${REST}/cosmos/base/tendermint/v1beta1/node_info" 2>/dev/null)
  if [ "$code" = "200" ]; then
    ok "REST API live ($REST)"
    REST_READY=true
    break
  fi
  sleep 1
done
[ "$REST_READY" = true ] || fail "REST API never came up at $REST. node log:\n$(tail -n 30 "$LOGFILE")"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 3. Seed the inference lifecycle: model -> provider -> job (attest/dispute/resolve)
# ══════════════════════════════════════════════════════════════════════════════
send_tx "$DEV_KEY" "register-model" register-model "ExplorerModel" "pytorch" "ipfs://explorer-model" \
  --access-type free

MODELS_JSON=$(bin query modelregistry models --node "$RPC" -o json 2>/dev/null)
MODEL_ID=$(printf '%s' "$MODELS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ms=d.get('models',[])
ids=[int(m.get('id') or m.get('model_id') or 0) for m in ms]
print(max(ids) if ids else '')" 2>/dev/null)
[ -n "$MODEL_ID" ] || fail "could not determine model id. models query:\n$MODELS_JSON"
ok "Registered model id = $MODEL_ID"

send_tx "$DEV_KEY" "set-inference-pricing" set-inference-pricing \
  --model-id "$MODEL_ID" --price-per-token 1 --price-per-query 0 \
  --min-payment 0 --max-tokens 1000

send_tx "$PROV_KEY" "register-inference-provider" register-inference-provider \
  --model-ids "$MODEL_ID" --max-concurrent 5 --endpoint "http://localhost:9999"
send_tx "$PROV_KEY" "provider-heartbeat" provider-heartbeat

send_tx "$DEV_KEY" "submit-inference-job" submit-inference-job "$MODEL_ID" "what is 2+2?" "1000${DENOM}"

JOBS_JSON=$(bin query modelregistry inference-jobs --node "$RPC" -o json 2>/dev/null)
JOB_ID=$(printf '%s' "$JOBS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
js=d.get('jobs',[]) or d.get('inference_jobs',[])
ids=[int(j.get('job_id') or 0) for j in js]
print(max(ids) if ids else '')" 2>/dev/null)
[ -n "$JOB_ID" ] || fail "could not determine job id. jobs query:\n$JOBS_JSON"
ok "Submitted inference job id = $JOB_ID"

ASSIGNED=$(bin query modelregistry inference-job "$JOB_ID" --node "$RPC" -o json 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['job']['provider'])" 2>/dev/null)
[ "$ASSIGNED" = "$PROV_ADDR" ] || fail "job assigned to $ASSIGNED, expected provider $PROV_ADDR"
info "Job $JOB_ID assigned provider = $ASSIGNED"

send_tx "$PROV_KEY" "start-inference-job" start-inference-job --job-id "$JOB_ID"
send_tx "$PROV_KEY" "complete-inference-job" complete-inference-job "$JOB_ID" "the answer is 4" 42

# Attestation (provider).
ATT_HASH="a1b2c3d4e5f60718293a4b5c6d7e8f90"
ATT_TOKENS=42
send_tx "$PROV_KEY" "submit-usage-attestation" submit-usage-attestation \
  "$JOB_ID" "$ATT_TOKENS" "$ATT_HASH"
ATT_TX="$LAST_TX_HASH"

# Dispute (requester).
DISPUTE_REASON="output-incorrect"
send_tx "$DEV_KEY" "dispute-inference-job" dispute-inference-job "$JOB_ID" "$DISPUTE_REASON"
DISPUTE_TX="$LAST_TX_HASH"

# Resolve (model owner = dev-account / requester). uphold=false rejects the
# dispute and restores the provider's reputation; sets resolved=true on-chain.
send_tx "$DEV_KEY" "resolve-inference-dispute" resolve-inference-dispute "$JOB_ID" false
RESOLVE_TX="$LAST_TX_HASH"
echo ""

# ── tokenfactory: create a denom so the tokenfactory tab has data ──────────────
send_tx_raw "$DEV_KEY" "tokenfactory create-denom" tokenfactory create-denom "$TF_SUBDENOM"
TF_TX="$LAST_TX_HASH"
TF_DENOM="factory/${REQ_ADDR}/${TF_SUBDENOM}"
ok "Created tokenfactory denom: $TF_DENOM"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 4. ASSERT explorer-tab REST endpoints (the real verification)
# ══════════════════════════════════════════════════════════════════════════════
info "Asserting explorer-tab REST endpoints on $REST ..."
VERIFIED_ENDPOINTS=()

# ── 4a. modelregistry: models list — seeded model must be present ──
rest_get "modelregistry/models" "/clawchain/modelregistry/v1/models"
MODEL_PRESENT=$(printf '%s' "$REST_BODY" | jq -r --arg id "$MODEL_ID" \
  '[.models[]? | select((.id // .model_id | tostring) == $id)] | length')
[ "${MODEL_PRESENT:-0}" -ge 1 ] 2>/dev/null \
  || fail "models endpoint did not contain seeded model id=$MODEL_ID.\nBody:\n$REST_BODY"
ok "[models]            seeded model id=$MODEL_ID present (200+JSON)"
VERIFIED_ENDPOINTS+=("/clawchain/modelregistry/v1/models -> model $MODEL_ID present")

# ── 4b. modelregistry: inference jobs list — job must be present ──
rest_get "modelregistry/inference/jobs" "/clawchain/modelregistry/v1/inference/jobs"
JOB_IN_LIST=$(printf '%s' "$REST_BODY" | jq -r --arg id "$JOB_ID" \
  '[(.jobs // .inference_jobs)[]? | select((.job_id | tostring) == $id)] | length')
[ "${JOB_IN_LIST:-0}" -ge 1 ] 2>/dev/null \
  || fail "inference/jobs endpoint did not contain seeded job id=$JOB_ID.\nBody:\n$REST_BODY"
ok "[inference/jobs]    seeded job id=$JOB_ID present (200+JSON)"
VERIFIED_ENDPOINTS+=("/clawchain/modelregistry/v1/inference/jobs -> job $JOB_ID present")

# ── 4c. modelregistry: job-detail (the HEADLINE) — attested + disputed + resolved ──
rest_get "modelregistry/inference/job/$JOB_ID" "/clawchain/modelregistry/v1/inference/job/${JOB_ID}"
J_HASH=$(printf '%s' "$REST_BODY"     | jq -r '.job.attestation_hash // ""')
J_DISPUTED=$(printf '%s' "$REST_BODY" | jq -r '.job.disputed // false')
J_RESOLVED=$(printf '%s' "$REST_BODY" | jq -r '.job.resolved // false')
J_REASON=$(printf '%s' "$REST_BODY"   | jq -r '.job.dispute_reason // ""')

[ -n "$J_HASH" ] && [ "$J_HASH" = "$ATT_HASH" ] \
  || fail "job-detail attestation_hash not set/mismatch: got '$J_HASH', want '$ATT_HASH'.\nBody:\n$REST_BODY"
[ "$J_DISPUTED" = "true" ] \
  || fail "job-detail disputed != true: got '$J_DISPUTED'.\nBody:\n$REST_BODY"
[ "$J_RESOLVED" = "true" ] \
  || fail "job-detail resolved != true: got '$J_RESOLVED'.\nBody:\n$REST_BODY"
ok "[inference/job/$JOB_ID] HEADLINE: attestation_hash=$J_HASH disputed=$J_DISPUTED resolved=$J_RESOLVED (200+JSON)"
VERIFIED_ENDPOINTS+=("/clawchain/modelregistry/v1/inference/job/$JOB_ID -> attested+disputed+resolved")

# ── 4d. modelregistry: providers — seeded provider present ──
rest_get "modelregistry/inference/providers" "/clawchain/modelregistry/v1/inference/providers"
PROV_PRESENT=$(printf '%s' "$REST_BODY" | jq -r --arg a "$PROV_ADDR" \
  '[(.providers // .inference_providers)[]? | select(.address == $a or .provider == $a)] | length')
[ "${PROV_PRESENT:-0}" -ge 1 ] 2>/dev/null \
  || fail "providers endpoint did not contain seeded provider $PROV_ADDR.\nBody:\n$REST_BODY"
ok "[inference/providers] seeded provider present (200+JSON)"
VERIFIED_ENDPOINTS+=("/clawchain/modelregistry/v1/inference/providers -> provider present")

# ── 4e. RESPONDS-only endpoints (200+JSON; empty rows acceptable, no seed needed) ──
# Each tab will render off these; we assert the endpoint does not 404/501.
respond_only() {
  local label="$1" path="$2"
  rest_get "$label" "$path"
  ok "[$label] responds 200+JSON"
  VERIFIED_ENDPOINTS+=("$path -> 200+JSON (responds)")
}
respond_only "agent/params"        "/clawchain/agent/v1/params"
respond_only "marketplace/params"  "/clawchain/marketplace/v1/params"
respond_only "oracle/params"       "/clawchain/oracle/v1beta1/params"
respond_only "privacy/tree_stats"  "/clawchain/privacy/v1/tree_stats"
respond_only "reputation/params"   "/clawchain/reputation/v1/params"
respond_only "governance/proposals" "/clawchain/governance/v1/proposals"
respond_only "tokenfactory/params" "/osmosis/tokenfactory/v1beta1/params"

# ── 4f. tokenfactory: denoms_from_creator must list the created denom ──
rest_get "tokenfactory/denoms_from_creator" "/osmosis/tokenfactory/v1beta1/denoms_from_creator/${REQ_ADDR}"
TF_LISTED=$(printf '%s' "$REST_BODY" | jq -r --arg d "$TF_DENOM" \
  '[.denoms[]? | select(. == $d)] | length')
[ "${TF_LISTED:-0}" -ge 1 ] 2>/dev/null \
  || fail "denoms_from_creator did not list $TF_DENOM.\nBody:\n$REST_BODY"
ok "[tokenfactory/denoms_from_creator] lists $TF_DENOM (200+JSON)"
VERIFIED_ENDPOINTS+=("/osmosis/tokenfactory/v1beta1/denoms_from_creator/{creator} -> $TF_DENOM listed")
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 5. Explorer build + serve check
# ══════════════════════════════════════════════════════════════════════════════
info "Explorer build check..."
BUILD_RESULT=""
if [ -f "$EXPLORER_DIR/dist/index.html" ]; then
  ok "Reusing existing dist/ (claw-explorer/dist/index.html present)"
  BUILD_RESULT="reused existing dist/"
else
  info "No dist/ — running 'npm run build' (may take a few minutes)..."
  ( cd "$EXPLORER_DIR" && npm run build ) >"$ROOT_DIR/build/explorer-build.log" 2>&1 \
    || fail "explorer build failed. Last log:\n$(tail -n 40 "$ROOT_DIR/build/explorer-build.log")"
  [ -f "$EXPLORER_DIR/dist/index.html" ] || fail "build succeeded but dist/index.html missing"
  ok "Explorer built (dist/index.html present)"
  BUILD_RESULT="built via npm run build"
fi

info "Serving dist/ on $SERVE_URL via 'vite preview'..."
( cd "$EXPLORER_DIR" && npx vite preview --port "$SERVE_PORT" --host 127.0.0.1 ) \
  > "$SERVE_LOG" 2>&1 &
SERVE_PID=$!
ok "Serve started (PID $SERVE_PID, log $SERVE_LOG)"

SERVE_READY=false
SPA_BODY=""
for i in $(seq 1 30); do
  if ! kill -0 "$SERVE_PID" 2>/dev/null; then
    fail "explorer serve process died. Last log:\n$(tail -n 30 "$SERVE_LOG")"
  fi
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$SERVE_URL/" 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    SPA_BODY=$(curl -s "$SERVE_URL/" 2>/dev/null)
    SERVE_READY=true
    break
  fi
  sleep 1
done
[ "$SERVE_READY" = true ] || fail "explorer never served HTTP 200 at $SERVE_URL. serve log:\n$(tail -n 30 "$SERVE_LOG")"

# Assert the SPA shell: must contain the Vue root and the bundled module script.
SPA_OK=true
SPA_DETAIL=""
if printf '%s' "$SPA_BODY" | grep -q '<div id="app">'; then
  SPA_DETAIL="${SPA_DETAIL}<div id=\"app\"> present; "
else
  SPA_OK=false
fi
if printf '%s' "$SPA_BODY" | grep -Eq '<script[^>]+type="module"[^>]+src=' ; then
  SPA_DETAIL="${SPA_DETAIL}bundled module script present"
else
  SPA_DETAIL="${SPA_DETAIL}(module script tag NOT found)"
fi
[ "$SPA_OK" = true ] \
  || fail "served HTTP 200 but SPA shell missing <div id=\"app\">. Body head:\n$(printf '%s' "$SPA_BODY" | head -c 600)"
ok "Explorer serves HTTP 200 SPA shell: $SPA_DETAIL"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 6. PASS summary
# ══════════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} EXPLORER DATA VERIFICATION (E4-lite): PASS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Chain ID:            $CHAIN_ID  (single node, home $HOME_DIR)"
echo "  REST endpoint:       $REST"
echo "  Requester/owner:     $REQ_ADDR"
echo "  Provider:            $PROV_ADDR"
echo "  Model id:            $MODEL_ID"
echo "  Job id:              $JOB_ID"
echo ""
echo "  Seeded job-detail (REST /clawchain/modelregistry/v1/inference/job/$JOB_ID):"
echo "      attestation_hash = $J_HASH"
echo "      disputed         = $J_DISPUTED"
echo "      dispute_reason   = $J_REASON"
echo "      resolved         = $J_RESOLVED"
echo ""
echo "  tokenfactory denom:  $TF_DENOM"
echo ""
echo "  Tab REST endpoints verified (HTTP 200 + parseable JSON):"
for e in "${VERIFIED_ENDPOINTS[@]}"; do
  echo "      ✓ $e"
done
echo ""
echo "  Explorer build:      $BUILD_RESULT"
echo "  Explorer serve:      HTTP 200 @ $SERVE_URL ($SPA_DETAIL)"
echo ""
echo "  Transaction hashes:"
echo "      attestation:     $ATT_TX"
echo "      dispute:         $DISPUTE_TX"
echo "      resolve:         $RESOLVE_TX"
echo "      create-denom:    $TF_TX"
echo ""
echo -e "${YELLOW}  NOTE: DOM-render verification (rendering each tab in a real browser)${NC}"
echo -e "${YELLOW}  requires gstack/Playwright, which is NOT installed here — OUT OF SCOPE.${NC}"
echo -e "${YELLOW}  This run verified the DATA LAYER + BUILD/SERVE shell only.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
exit 0
