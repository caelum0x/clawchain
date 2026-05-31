#!/usr/bin/env bash
#
# simulate-genesis-ceremony.sh - rehearse external validator gentx collection on
# one machine. Each validator gets an isolated home/keyring, then submits a gentx
# into the same coordinator flow used by scripts/genesis-ceremony.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BIN="${CLAWCHAIN_BIN:-$REPO_ROOT/build/clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
VALIDATORS="${VALIDATORS:-4}"
DENOM="${DENOM:-uclaw}"
ACCOUNT_AMOUNT="${ACCOUNT_AMOUNT:-1000000000000}"
STAKE_AMOUNT="${STAKE_AMOUNT:-100000000}"
WORK_DIR="${WORK_DIR:-$(mktemp -d)}"
KEEP_WORK_DIR="${KEEP_WORK_DIR:-0}"

log() { echo "[ceremony-sim] $*"; }
fail() { echo "[ceremony-sim] ERROR: $*" >&2; exit 1; }

cleanup() {
  if [[ "$KEEP_WORK_DIR" != "1" ]]; then
    rm -rf "$WORK_DIR"
  else
    log "kept work dir: $WORK_DIR"
  fi
}
trap cleanup EXIT

[[ -x "$BIN" ]] || fail "missing executable clawchaind at $BIN"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ "$VALIDATORS" =~ ^[0-9]+$ ]] || fail "VALIDATORS must be numeric"
[[ "$VALIDATORS" -ge 4 ]] || fail "VALIDATORS must be >= 4 to satisfy launch threshold"

mkdir -p "$WORK_DIR"/{validators,gentxs,out}
ACCOUNTS="$WORK_DIR/accounts.csv"
: > "$ACCOUNTS"

log "creating $VALIDATORS isolated validator homes"
for i in $(seq 0 $((VALIDATORS - 1))); do
  home="$WORK_DIR/validators/validator$i"
  "$BIN" init "external-validator-$i" --chain-id "$CHAIN_ID" --home "$home" --default-denom "$DENOM" >/dev/null 2>&1
  "$BIN" keys add validator --keyring-backend test --home "$home" >/dev/null 2>&1
  addr="$("$BIN" keys show validator -a --keyring-backend test --home "$home")"
  printf '%s,%s\n' "$addr" "$ACCOUNT_AMOUNT" >> "$ACCOUNTS"
  log "  validator$i account: $addr"
done

GENESIS_TIME="$(date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '+1 hour' +"%Y-%m-%dT%H:%M:%SZ")"
BASE="$WORK_DIR/out/genesis.base.json"
FINAL="$WORK_DIR/out/genesis.json"

log "building coordinator base genesis"
CLAWCHAIN_BIN="$BIN" CHAIN_ID="$CHAIN_ID" MIN_VALIDATORS="$VALIDATORS" \
  bash scripts/genesis-ceremony.sh build-base \
    --accounts "$ACCOUNTS" \
    --genesis-time "$GENESIS_TIME" \
    --output "$BASE" >/dev/null

log "generating isolated validator gentxs"
for i in $(seq 0 $((VALIDATORS - 1))); do
  home="$WORK_DIR/validators/validator$i"
  cp "$BASE" "$home/config/genesis.json"
  "$BIN" genesis gentx validator "${STAKE_AMOUNT}${DENOM}" \
    --chain-id "$CHAIN_ID" \
    --keyring-backend test \
    --home "$home" \
    --moniker "external-validator-$i" >/dev/null 2>&1
  cp "$home"/config/gentx/*.json "$WORK_DIR/gentxs/"
done

log "collecting submitted gentxs through coordinator flow"
CLAWCHAIN_BIN="$BIN" CHAIN_ID="$CHAIN_ID" MIN_VALIDATORS="$VALIDATORS" \
  bash scripts/genesis-ceremony.sh collect \
    --gentx-dir "$WORK_DIR/gentxs" \
    --base "$BASE" \
    --output "$FINAL" >/dev/null

"$BIN" genesis validate "$FINAL" >/dev/null
GENTX_COUNT="$(jq '.app_state.genutil.gen_txs | length' "$FINAL")"
GENESIS_SHA="$(
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$FINAL" | awk '{print $1}';
  else shasum -a 256 "$FINAL" | awk '{print $1}'; fi
)"

[[ "$GENTX_COUNT" -eq "$VALIDATORS" ]] || fail "expected $VALIDATORS collected gentxs in final genesis, got $GENTX_COUNT"

echo ""
echo "=================================================="
echo "  Genesis ceremony simulation passed"
echo "=================================================="
echo "  gentxs:     $GENTX_COUNT"
echo "  chain_id:   $CHAIN_ID"
echo "  sha256:     $GENESIS_SHA"
echo "  final:      $FINAL"
