#!/usr/bin/env bash
#
# Seed a running local devnet with deterministic demo-friendly state:
# funded demo accounts, tokenfactory denom, privacy note, oracle vote,
# registered agent, marketplace skill, and a machine-readable artifact.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BIN="${CLAWCHAIN_BIN:-$ROOT_DIR/build/clawchaind}"
HOME_DIR="${DEVNET_HOME:-$ROOT_DIR/.devnet-node}"
CHAIN_ID="${CHAIN_ID:-clawchain-devnet}"
NODE="${NODE:-tcp://localhost:26657}"
RPC_URL="${RPC_URL:-http://localhost:26657}"
REST_URL="${REST_URL:-http://localhost:1317}"
ARTIFACT="${DEVNET_DEMO_ARTIFACT:-$ROOT_DIR/artifacts/devnet/demo-state.json}"

KEY="dev-account"
KB=(--keyring-backend test --home "$HOME_DIR")
TX=(--chain-id "$CHAIN_ID" --node "$NODE" --gas auto --gas-adjustment 1.8 --gas-prices 0.025uclaw --yes -o json)

PASS=0
FAIL=0
LAST_HASH=""
ok() { echo "  OK   $1" >&2; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $1" >&2; FAIL=$((FAIL + 1)); }

wait_tx() {
  local hash="$1"
  [[ -n "$hash" ]] || { echo "missing-hash"; return; }
  for _ in $(seq 1 25); do
    sleep 1
    code=$("$BIN" query tx "$hash" --node "$NODE" -o json 2>/dev/null | grep -oE '"code":[0-9]+' | head -1 | grep -oE '[0-9]+')
    [[ -n "$code" ]] && { echo "$code"; return; }
  done
  echo "timeout"
}

run_tx() {
  local desc="$1"
  shift
  local out hash code
  out=$("$@" "${KB[@]}" "${TX[@]}" 2>"/tmp/devnet-seed-${desc//[^a-zA-Z0-9]/-}.err" || true)
  hash=$(printf '%s' "$out" | grep -o '"txhash":"[^"]*"' | cut -d'"' -f4)
  code=$(wait_tx "$hash")
  if [[ "$code" = "0" ]]; then
    ok "$desc"
    LAST_HASH="$hash"
    return 0
  fi
  bad "$desc (code ${code:-?})"
  return 1
}

[[ -x "$BIN" ]] || { echo "missing $BIN; run scripts/local-dev.sh --devnet"; exit 1; }
[[ -d "$HOME_DIR/config" ]] || { echo "missing devnet home $HOME_DIR; run scripts/local-dev.sh --devnet"; exit 1; }
curl -s --max-time 2 "$RPC_URL/status" >/dev/null 2>&1 || { echo "devnet RPC not reachable at $RPC_URL"; exit 1; }

HEIGHT=$(curl -s --max-time 2 "$RPC_URL/status" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['sync_info']['latest_block_height'])" 2>/dev/null || echo "0")
STAMP="$(date +%s)"
SUFFIX="${HEIGHT}-${STAMP}"

DEV_ADDR=$("$BIN" keys show "$KEY" -a "${KB[@]}")
VALOPER=$("$BIN" keys show "$KEY" --bech val -a "${KB[@]}")
PRIV=$(printf 'y\n' | "$BIN" keys export "$KEY" --unarmored-hex --unsafe "${KB[@]}" 2>/dev/null | tr -d '[:space:]')

AGENT_KEY="demo-agent-$STAMP"
USER_KEY="demo-user-$STAMP"
"$BIN" keys add "$AGENT_KEY" "${KB[@]}" >/tmp/devnet-seed-agent-key.json 2>/dev/null
"$BIN" keys add "$USER_KEY" "${KB[@]}" >/tmp/devnet-seed-user-key.json 2>/dev/null
AGENT_ADDR=$("$BIN" keys show "$AGENT_KEY" -a "${KB[@]}")
USER_ADDR=$("$BIN" keys show "$USER_KEY" -a "${KB[@]}")

echo "== devnet demo seed: accounts =="
run_tx "fund demo agent" "$BIN" tx bank send "$KEY" "$AGENT_ADDR" 50000000uclaw
bank_agent_hash="$LAST_HASH"
run_tx "fund demo user" "$BIN" tx bank send "$KEY" "$USER_ADDR" 25000000uclaw
bank_user_hash="$LAST_HASH"

echo "== devnet demo seed: tokenfactory =="
SUBDENOM="demo$STAMP"
run_tx "create demo denom" "$BIN" tx tokenfactory create-denom "$SUBDENOM" --from "$KEY"
factory_hash="$LAST_HASH"
DEMO_DENOM="factory/$DEV_ADDR/$SUBDENOM"
run_tx "mint demo denom" "$BIN" tx tokenfactory mint 1000000 "$DEMO_DENOM" --from "$KEY"
mint_hash="$LAST_HASH"
run_tx "send demo denom to user" "$BIN" tx bank send "$KEY" "$USER_ADDR" "1000$DEMO_DENOM"
send_factory_hash="$LAST_HASH"

echo "== devnet demo seed: agent + marketplace =="
run_tx "register demo agent" "$BIN" tx agent register-agent \
  "demo-agent-pubkey-$SUFFIX" \
  "http://localhost:9999/demo-agent" \
  "demo-agent-$STAMP" \
  --supported-tools summarize,code-review,oracle-check \
  --pricing-hint '{"unit":"request","price":"100uclaw"}' \
  --version "1.0.0" \
  --from "$AGENT_KEY"
agent_hash="$LAST_HASH"
run_tx "list demo skill" "$BIN" tx marketplace list-skill \
  "demo-skill-$STAMP" \
  "Seeded devnet skill for dashboard and marketplace demos" \
  "100" \
  "uclaw" \
  --from "$AGENT_KEY"
skill_hash="$LAST_HASH"

echo "== devnet demo seed: privacy + oracle =="
shield_output=$(PRIV_HEX="$PRIV" RPC_URL="$RPC_URL" npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-shield-check.ts 2>/tmp/devnet-seed-shield.err || true)
if printf '%s' "$shield_output" | grep -q "SUCCESS"; then
  ok "privacy note"
else
  bad "privacy note"
fi
commitment=$(printf '%s' "$shield_output" | grep -o 'commitment=[^[:space:]]*' | head -1 | cut -d= -f2)

oracle_output=$(PRIV_HEX="$PRIV" RPC_URL="$RPC_URL" VALOPER="$VALOPER" SALT=seed npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-oracle-check.ts 2>/tmp/devnet-seed-oracle.err || true)
if printf '%s' "$oracle_output" | grep -q "SUCCESS"; then
  ok "oracle commit-reveal"
else
  bad "oracle commit-reveal"
fi

mkdir -p "$(dirname "$ARTIFACT")"
"$BIN" query bank balances "$USER_ADDR" --node "$NODE" -o json > /tmp/devnet-seed-user-balances.json 2>/dev/null || echo '{}' > /tmp/devnet-seed-user-balances.json
"$BIN" query agent agent "$AGENT_ADDR" --node "$NODE" -o json > /tmp/devnet-seed-agent.json 2>/dev/null || echo '{}' > /tmp/devnet-seed-agent.json
"$BIN" query marketplace skills --node "$NODE" -o json > /tmp/devnet-seed-skills.json 2>/dev/null || echo '{}' > /tmp/devnet-seed-skills.json
"$BIN" query privacy tree-stats --node "$NODE" -o json > /tmp/devnet-seed-privacy.json 2>/dev/null || echo '{}' > /tmp/devnet-seed-privacy.json

python3 - "$ARTIFACT" <<PY
import json, sys, time
artifact = {
    "chain_id": "$CHAIN_ID",
    "rpc_url": "$RPC_URL",
    "rest_url": "$REST_URL",
    "seeded_at_unix": int(time.time()),
    "height_at_start": "$HEIGHT",
    "accounts": {
        "dev": "$DEV_ADDR",
        "demo_agent": "$AGENT_ADDR",
        "demo_user": "$USER_ADDR",
    },
    "tokenfactory": {
        "subdenom": "$SUBDENOM",
        "denom": "$DEMO_DENOM",
    },
    "privacy": {
        "commitment": "$commitment",
    },
    "txhashes": {
        "fund_agent": "$bank_agent_hash",
        "fund_user": "$bank_user_hash",
        "create_denom": "$factory_hash",
        "mint": "$mint_hash",
        "send_factory": "$send_factory_hash",
        "register_agent": "$agent_hash",
        "list_skill": "$skill_hash",
    },
}
for key, path in {
    "demo_user_balances": "/tmp/devnet-seed-user-balances.json",
    "agent_query": "/tmp/devnet-seed-agent.json",
    "marketplace_skills": "/tmp/devnet-seed-skills.json",
    "privacy_tree": "/tmp/devnet-seed-privacy.json",
}.items():
    try:
        with open(path) as f:
            artifact[key] = json.load(f)
    except Exception as exc:
        artifact[key] = {"error": str(exc)}
with open(sys.argv[1], "w") as f:
    json.dump(artifact, f, indent=2)
    f.write("\n")
PY

echo ""
echo "=================================================="
echo "  Devnet demo seed: $PASS passed, $FAIL failed"
echo "  Artifact: $ARTIFACT"
echo "=================================================="
[[ "$FAIL" -eq 0 ]] && echo "OK: devnet demo state seeded" || echo "FAIL: see failures above"
exit "$FAIL"
