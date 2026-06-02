#!/usr/bin/env bash
# inference-settlement-accept.sh — Live single-node acceptance test for the P4
# inference-settlement messages (submit-usage-attestation + dispute-inference-job).
#
# Proves, end-to-end on a real running chain:
#   1. submit-usage-attestation (provider-only, requires job completed) sets
#      attestation_hash / attested_output_tokens / attested_at on-chain.
#   2. dispute-inference-job (requester-only, requires completed) sets
#      disputed=true / dispute_reason / disputed_at on-chain.
#   3. The dispute slashes the PROVIDER's reputation (best-effort: a no-op on a
#      fresh chain with no pre-existing reputation record — documented, not failed).
#
# Lifecycle driven via clawchaind autocli tx commands:
#   register-model -> set-inference-pricing -> register-inference-provider
#   -> submit-inference-job (auto-assigns online provider, escrows payment)
#   -> start-inference-job -> complete-inference-job
#   -> submit-usage-attestation -> dispute-inference-job
#
# Re-runnable: uses a FRESH temp home each run and always stops the node on EXIT.
set -uo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BINARY="${CLAWCHAIND_BIN:-$ROOT_DIR/build/clawchaind}"
DENOM="uclaw"
CHAIN_ID="clawchain-local"
MONIKER="accept-node"
KEYRING="test"
RPC="http://localhost:26657"
GAS_FLAGS="--gas auto --gas-adjustment 1.5 --gas-prices 0.025${DENOM}"

# dev-account is the well-known mnemonic from scripts/local-dev.sh (the REQUESTER).
DEV_KEY="dev-account"
DEV_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
# The PROVIDER (separate key, generated fresh).
PROV_KEY="provider-account"

HOME_DIR="$ROOT_DIR/.accept-node"
LOGFILE="$ROOT_DIR/build/accept-node.log"
CHAIN_PID=""

# ── Colors / logging ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }

cleanup() {
  if [ -n "$CHAIN_PID" ] && kill -0 "$CHAIN_PID" 2>/dev/null; then
    info "Stopping chain (PID $CHAIN_PID)..."
    kill "$CHAIN_PID" 2>/dev/null || true
    wait "$CHAIN_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail() {
  echo -e "${RED}[FAIL]${NC}  $*" >&2
  echo -e "${RED}━━━ ACCEPTANCE TEST FAILED ━━━${NC}" >&2
  exit 1
}

bin() { "$BINARY" "$@"; }
keyaddr() { bin keys show "$1" --home "$HOME_DIR" --keyring-backend "$KEYRING" -a; }

# Submit a tx, wait for commit, abort with the raw log on a nonzero code.
# Usage: send_tx <from-key> <label> <args...>
send_tx() {
  local from="$1" label="$2"; shift 2
  local out hash code rawlog
  out=$(bin tx modelregistry "$@" \
        --from "$from" --chain-id "$CHAIN_ID" --keyring-backend "$KEYRING" \
        --home "$HOME_DIR" --node "$RPC" $GAS_FLAGS -y -o json 2>&1)
  # `--gas auto` prints a non-JSON "gas estimate: N" line before the JSON body;
  # extract just the JSON object (the last/longest brace-delimited blob).
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
  # A broadcast-time error returns code != 0 in the broadcast response itself.
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
  # Poll for inclusion.
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

q_job() { bin query modelregistry inference-job "$1" --node "$RPC" -o json 2>/dev/null; }
jval() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

# ══════════════════════════════════════════════════════════════════════════════
# 1. Fresh single-node init
# ══════════════════════════════════════════════════════════════════════════════
[ -x "$BINARY" ] || fail "binary not found/executable at $BINARY (build it first)"
command -v python3 >/dev/null || fail "python3 is required for JSON parsing"

info "Using binary: $BINARY"
info "Fresh temp home: $HOME_DIR"
pkill -f "clawchaind start.*$HOME_DIR" 2>/dev/null || true
rm -rf "$HOME_DIR"
mkdir -p "$ROOT_DIR/build"

bin init "$MONIKER" --chain-id "$CHAIN_ID" --home "$HOME_DIR" >/dev/null 2>&1 \
  || fail "chain init failed"
ok "Chain initialized ($CHAIN_ID)"

# Requester key (recover dev-account from known mnemonic).
printf '%s\n' "$DEV_MNEMONIC" | bin keys add "$DEV_KEY" \
  --home "$HOME_DIR" --keyring-backend "$KEYRING" --recover >/dev/null 2>&1 \
  || fail "could not recover dev-account"
# Provider key (fresh).
bin keys add "$PROV_KEY" --home "$HOME_DIR" --keyring-backend "$KEYRING" >/dev/null 2>&1 \
  || fail "could not create provider key"

REQ_ADDR=$(keyaddr "$DEV_KEY")
PROV_ADDR=$(keyaddr "$PROV_KEY")
[ -n "$REQ_ADDR" ] && [ -n "$PROV_ADDR" ] || fail "could not resolve key addresses"
info "Requester (dev-account): $REQ_ADDR"
info "Provider (provider-account): $PROV_ADDR"

# Fund both accounts via genesis.
bin genesis add-genesis-account "$REQ_ADDR" "1000000000000${DENOM}" \
  --home "$HOME_DIR" --keyring-backend "$KEYRING" >/dev/null 2>&1 \
  || fail "could not fund requester genesis account"
bin genesis add-genesis-account "$PROV_ADDR" "1000000000000${DENOM}" \
  --home "$HOME_DIR" --keyring-backend "$KEYRING" >/dev/null 2>&1 \
  || fail "could not fund provider genesis account"
ok "Funded requester + provider genesis accounts"

# Min gas price for the node.
if [ -f "$HOME_DIR/config/app.toml" ]; then
  sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uclaw"/' "$HOME_DIR/config/app.toml"
  rm -f "$HOME_DIR/config/app.toml.bak"
fi

# x/wasm requires valid genesis params (empty defaults cause "unsupported access
# type" on the first tx because the module's antehandler validates code upload
# access). Mirror scripts/local-dev.sh: permit upload/instantiate by Everybody.
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

# gentx so the single node is a validator and produces blocks.
bin genesis gentx "$DEV_KEY" "100000000${DENOM}" \
  --chain-id "$CHAIN_ID" --home "$HOME_DIR" --keyring-backend "$KEYRING" \
  --moniker "$MONIKER" >/dev/null 2>&1 || fail "gentx failed"
bin genesis collect-gentxs --home "$HOME_DIR" >/dev/null 2>&1 || fail "collect-gentxs failed"
ok "Validator gentx created + collected"

# ══════════════════════════════════════════════════════════════════════════════
# 2. Start node in background, wait for RPC
# ══════════════════════════════════════════════════════════════════════════════
info "Starting node in background..."
nohup "$BINARY" start --home "$HOME_DIR" --minimum-gas-prices "0.025${DENOM}" \
  > "$LOGFILE" 2>&1 &
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

# ══════════════════════════════════════════════════════════════════════════════
# 3. Set up model + pricing + provider, then run the inference lifecycle
# ══════════════════════════════════════════════════════════════════════════════
# Register a model (owner = requester/dev-account). access_type is a required
# field validated by the keeper (free|per_query|subscription|one_time).
send_tx "$DEV_KEY" "register-model" register-model "AcceptModel" "pytorch" "ipfs://accept-model" \
  --access-type free

# Find the model id (latest registered).
MODELS_JSON=$(bin query modelregistry models --node "$RPC" -o json 2>/dev/null)
MODEL_ID=$(printf '%s' "$MODELS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ms=d.get('models',[])
ids=[int(m.get('id') or m.get('model_id') or 0) for m in ms]
print(max(ids) if ids else '')" 2>/dev/null)
[ -n "$MODEL_ID" ] || fail "could not determine model id. models query:\n$MODELS_JSON"
ok "Registered model id = $MODEL_ID"

# Set inference pricing: zero min payment so submit-inference-job always succeeds.
# Non-zero per-token price so a real cost settles to the provider on completion.
send_tx "$DEV_KEY" "set-inference-pricing" set-inference-pricing \
  --model-id "$MODEL_ID" --price-per-token 1 --price-per-query 0 \
  --min-payment 0 --max-tokens 1000

# Register the provider for this model and mark it online (IsOnline=true on register).
send_tx "$PROV_KEY" "register-inference-provider" register-inference-provider \
  --model-ids "$MODEL_ID" --max-concurrent 5 --endpoint "http://localhost:9999"

# Heartbeat to be explicit about online status.
send_tx "$PROV_KEY" "provider-heartbeat" provider-heartbeat

# Capture provider reputation BEFORE the dispute (best-effort).
REP_BEFORE_JSON=$(bin query reputation reputation "$PROV_ADDR" --node "$RPC" -o json 2>/dev/null)
REP_FOUND_BEFORE=$(printf '%s' "$REP_BEFORE_JSON" | jval "['found']")
REP_SCORE_BEFORE=$(printf '%s' "$REP_BEFORE_JSON" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin); print(d.get('reputation',{}).get('uptime_score_bps','0'))
except Exception: print('0')" 2>/dev/null)
info "Provider reputation BEFORE dispute: found=${REP_FOUND_BEFORE:-?} score=${REP_SCORE_BEFORE:-?}"

# Submit inference job (from requester) — auto-assigns the online provider, escrows payment.
send_tx "$DEV_KEY" "submit-inference-job" submit-inference-job "$MODEL_ID" "what is 2+2?" "1000${DENOM}"

# Find the job id (latest).
JOBS_JSON=$(bin query modelregistry inference-jobs --node "$RPC" -o json 2>/dev/null)
JOB_ID=$(printf '%s' "$JOBS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
js=d.get('jobs',[]) or d.get('inference_jobs',[])
ids=[int(j.get('job_id') or 0) for j in js]
print(max(ids) if ids else '')" 2>/dev/null)
[ -n "$JOB_ID" ] || fail "could not determine job id. jobs query:\n$JOBS_JSON"
ok "Submitted inference job id = $JOB_ID"

# Verify the job was assigned to OUR provider (required for attestation to work).
ASSIGNED=$(q_job "$JOB_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['job']['provider'])" 2>/dev/null)
info "Job $JOB_ID assigned provider = $ASSIGNED"
[ "$ASSIGNED" = "$PROV_ADDR" ] || fail "job assigned to $ASSIGNED, expected provider $PROV_ADDR (provider not online/registered?)"

# Provider runs the lifecycle: start -> complete.
send_tx "$PROV_KEY" "start-inference-job" start-inference-job --job-id "$JOB_ID"
send_tx "$PROV_KEY" "complete-inference-job" complete-inference-job "$JOB_ID" "the answer is 4" 42

STATUS=$(q_job "$JOB_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['job']['status'])" 2>/dev/null)
[ "$STATUS" = "completed" ] || fail "job status is '$STATUS', expected 'completed' before attestation"
ok "Job $JOB_ID status = completed"

# ══════════════════════════════════════════════════════════════════════════════
# 4. NEW FEATURE 1 — submit-usage-attestation (provider)
# ══════════════════════════════════════════════════════════════════════════════
ATT_HASH="a1b2c3d4e5f60718293a4b5c6d7e8f90"
ATT_TOKENS=42
send_tx "$PROV_KEY" "submit-usage-attestation" submit-usage-attestation \
  "$JOB_ID" "$ATT_TOKENS" "$ATT_HASH"
ATT_TX="$LAST_TX_HASH"

JOB_AFTER_ATT=$(q_job "$JOB_ID")
GOT_HASH=$(printf '%s' "$JOB_AFTER_ATT" | python3 -c "import json,sys; print(json.load(sys.stdin)['job'].get('attestation_hash',''))" 2>/dev/null)
GOT_TOK=$(printf '%s' "$JOB_AFTER_ATT" | python3 -c "import json,sys; print(json.load(sys.stdin)['job'].get('attested_output_tokens','0'))" 2>/dev/null)
GOT_AT=$(printf '%s' "$JOB_AFTER_ATT" | python3 -c "import json,sys; print(json.load(sys.stdin)['job'].get('attested_at','0'))" 2>/dev/null)

[ "$GOT_HASH" = "$ATT_HASH" ] || fail "attestation_hash mismatch: got '$GOT_HASH', want '$ATT_HASH'"
[ "$GOT_TOK" = "$ATT_TOKENS" ] || fail "attested_output_tokens mismatch: got '$GOT_TOK', want '$ATT_TOKENS'"
[ "${GOT_AT:-0}" -gt 0 ] 2>/dev/null || fail "attested_at not set (got '$GOT_AT')"
ok "ATTESTATION verified on-chain: hash=$GOT_HASH tokens=$GOT_TOK attested_at=$GOT_AT"

# ══════════════════════════════════════════════════════════════════════════════
# 5. NEW FEATURE 2 — dispute-inference-job (requester) + reputation slash
# ══════════════════════════════════════════════════════════════════════════════
DISPUTE_REASON="output-incorrect"
send_tx "$DEV_KEY" "dispute-inference-job" dispute-inference-job \
  "$JOB_ID" "$DISPUTE_REASON"
DISPUTE_TX="$LAST_TX_HASH"

JOB_AFTER_DIS=$(q_job "$JOB_ID")
GOT_DISPUTED=$(printf '%s' "$JOB_AFTER_DIS" | python3 -c "import json,sys; print(json.load(sys.stdin)['job'].get('disputed',False))" 2>/dev/null)
GOT_REASON=$(printf '%s' "$JOB_AFTER_DIS" | python3 -c "import json,sys; print(json.load(sys.stdin)['job'].get('dispute_reason',''))" 2>/dev/null)
GOT_DIS_AT=$(printf '%s' "$JOB_AFTER_DIS" | python3 -c "import json,sys; print(json.load(sys.stdin)['job'].get('disputed_at','0'))" 2>/dev/null)

[ "$GOT_DISPUTED" = "True" ] || fail "disputed not true: got '$GOT_DISPUTED'"
[ "$GOT_REASON" = "$DISPUTE_REASON" ] || fail "dispute_reason mismatch: got '$GOT_REASON', want '$DISPUTE_REASON'"
[ "${GOT_DIS_AT:-0}" -gt 0 ] 2>/dev/null || fail "disputed_at not set (got '$GOT_DIS_AT')"
ok "DISPUTE verified on-chain: disputed=$GOT_DISPUTED reason=$GOT_REASON disputed_at=$GOT_DIS_AT"

# Reputation slash assertion (BEST-EFFORT).
REP_AFTER_JSON=$(bin query reputation reputation "$PROV_ADDR" --node "$RPC" -o json 2>/dev/null)
REP_FOUND_AFTER=$(printf '%s' "$REP_AFTER_JSON" | jval "['found']")
REP_SCORE_AFTER=$(printf '%s' "$REP_AFTER_JSON" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin); print(d.get('reputation',{}).get('uptime_score_bps','0'))
except Exception: print('0')" 2>/dev/null)
info "Provider reputation AFTER dispute: found=${REP_FOUND_AFTER:-?} score=${REP_SCORE_AFTER:-?}"

REP_RESULT=""
if [ "$REP_FOUND_BEFORE" = "True" ] && [ "${REP_SCORE_BEFORE:-0}" -gt 0 ] 2>/dev/null; then
  # Pre-existing record: assert a drop of exactly the penalty (1).
  EXPECTED=$(( REP_SCORE_BEFORE - 1 ))
  if [ "${REP_SCORE_AFTER:-0}" = "$EXPECTED" ]; then
    REP_RESULT="slashed: $REP_SCORE_BEFORE -> $REP_SCORE_AFTER (penalty 1, as expected)"
    ok "REPUTATION slash verified: $REP_RESULT"
  else
    fail "reputation did not drop by penalty: before=$REP_SCORE_BEFORE after=$REP_SCORE_AFTER expected=$EXPECTED"
  fi
else
  REP_RESULT="no pre-existing reputation record (slash no-op, expected on fresh chain)"
  warn "REPUTATION: $REP_RESULT"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 6. PASS summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} P4 INFERENCE-SETTLEMENT ACCEPTANCE TEST: PASS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Chain ID:            $CHAIN_ID  (single node, home $HOME_DIR)"
echo "  Requester:           $REQ_ADDR"
echo "  Provider:            $PROV_ADDR"
echo "  Model id:            $MODEL_ID"
echo "  Job id:              $JOB_ID"
echo ""
echo "  [1] Attestation     hash=$GOT_HASH tokens=$GOT_TOK attested_at=$GOT_AT"
echo "      tx:             $ATT_TX"
echo "  [2] Dispute         disputed=$GOT_DISPUTED reason=$GOT_REASON disputed_at=$GOT_DIS_AT"
echo "      tx:             $DISPUTE_TX"
echo "  [3] Reputation      $REP_RESULT"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
exit 0
