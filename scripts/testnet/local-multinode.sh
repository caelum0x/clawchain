#!/usr/bin/env bash
#
# local-multinode.sh — stand up a LOCAL multi-validator ClawChain testnet (the
# rehearsal substrate for the public testnet launch, docs/plans/2026-05-31-testnet-launch.md).
#
# Uses the SDK-native `clawchaind multi-node` to create N validator dirs on one host
# (distinct RPC/P2P/gRPC/API ports, persistent-peers pre-wired), then:
#   - seeds the SAME privacy ZK keys (pk+vk) into every node  [consensus-critical:
#     the verifying key must be identical across validators or proof verification diverges]
#   - applies testnet genesis params (fast gov, lenient slashing, mint/staking),
#     keeping genesis byte-identical across nodes
#   - boots all validators and waits until they reach consensus (heights advance + agree)
#
# Usage:
#   bash scripts/testnet/local-multinode.sh up      [N]   # init + start + verify (default N=4)
#   bash scripts/testnet/local-multinode.sh down          # stop all validators
#   bash scripts/testnet/local-multinode.sh status        # heights per node
#
# NOTE: dev/insecure ZK keys — never for a value-bearing network.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BIN="${CLAWCHAIN_BIN:-$REPO_ROOT/build/clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/.testnet-multinode}"
DENOM="uclaw"
N="${2:-4}"
PIDFILE="$OUT_DIR/.pids"
# RPC ports `multi-node` assigns by default: 26657, 26654, 26651, 26648, ...
rpc_port() { echo $((26657 - $1 * 3)); }

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 required"; exit 1; }; }

cmd_down() {
  if [ -f "$PIDFILE" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDFILE"
    rm -f "$PIDFILE"
  fi
  pkill -f "clawchaind start --home $OUT_DIR" 2>/dev/null || true
  echo "stopped."
}

cmd_status() {
  for i in $(seq 0 $((N - 1))); do
    h=$(curl -s --max-time 2 "http://localhost:$(rpc_port "$i")/status" 2>/dev/null | grep -o '"latest_block_height":"[0-9]*"' | grep -oE '[0-9]+')
    echo "  validator$i (rpc $(rpc_port "$i")): height=${h:-down}"
  done
}

cmd_up() {
  [ -x "$BIN" ] || { echo "Building clawchaind..."; make build; }
  need jq; need curl

  echo "== stop any prior run + wipe $OUT_DIR =="
  cmd_down >/dev/null 2>&1; sleep 1; rm -rf "$OUT_DIR"

  echo "== init $N validators (multi-node) =="
  "$BIN" multi-node --v "$N" --chain-id "$CHAIN_ID" --starting-ip-address localhost \
    --keyring-backend test --output-dir "$OUT_DIR" --minimum-gas-prices "0.0001${DENOM}" >/dev/null

  echo "== seed identical privacy ZK keys (pk+vk) into every validator =="
  "$BIN" privacy gen-dev-keys "$OUT_DIR/validator0/keys" >/dev/null 2>&1
  for i in $(seq 1 $((N - 1))); do
    mkdir -p "$OUT_DIR/validator$i/keys"
    cp "$OUT_DIR/validator0/keys/"*.bin "$OUT_DIR/validator$i/keys/"
  done

  echo "== patch testnet genesis params on validator0, copy to all =="
  local g="$OUT_DIR/validator0/config/genesis.json"
  patch() { jq "$1" "$g" > "$g.tmp" && mv "$g.tmp" "$g"; }
  # Fast governance for testing (expedited MUST be < voting, or genesis validation fails).
  patch '.app_state.gov.params.voting_period = "100s"'
  patch '.app_state.gov.params.expedited_voting_period = "50s"'
  patch '.app_state.gov.params.max_deposit_period = "100s"'
  patch '.app_state.gov.params.min_deposit = [{"denom":"uclaw","amount":"10000000"}]'
  # Mint / staking.
  patch '.app_state.mint.params.mint_denom = "uclaw"'
  patch '.app_state.staking.params.bond_denom = "uclaw"'
  patch '.app_state.staking.params.unbonding_time = "600s"'
  patch '.app_state.staking.params.max_validators = 50'
  # Lenient slashing for a small testnet.
  patch '.app_state.slashing.params.signed_blocks_window = "1000"'
  patch '.app_state.slashing.params.min_signed_per_window = "0.050000000000000000"'
  patch '.app_state.slashing.params.downtime_jail_duration = "60s"'
  patch '.consensus.params.block.max_gas = "100000000"'
  # Byte-identical genesis across all nodes (same app_hash).
  for i in $(seq 1 $((N - 1))); do cp "$g" "$OUT_DIR/validator$i/config/genesis.json"; done

  echo "== validate genesis =="
  "$BIN" genesis validate "$g" >/dev/null

  echo "== enable API + faster blocks on each node =="
  for i in $(seq 0 $((N - 1))); do
    local app="$OUT_DIR/validator$i/config/app.toml" cfg="$OUT_DIR/validator$i/config/config.toml"
    # Enable REST API (the `;}` before } is required by BSD/macOS sed).
    sed -i.bak '/^\[api\]/,/^\[/{s|^enable = false|enable = true|;}' "$app" 2>/dev/null || true
    sed -i.bak 's|enabled-unsafe-cors = false|enabled-unsafe-cors = true|g' "$app" 2>/dev/null || true
    sed -i.bak 's|timeout_commit = "5s"|timeout_commit = "1s"|g' "$cfg" 2>/dev/null || true
    sed -i.bak 's|^prometheus = false|prometheus = true|' "$cfg" 2>/dev/null || true
    find "$OUT_DIR/validator$i/config" -name "*.bak" -delete 2>/dev/null || true
  done

  echo "== start $N validators =="
  : > "$PIDFILE"
  for i in $(seq 0 $((N - 1))); do
    nohup "$BIN" start --home "$OUT_DIR/validator$i" --minimum-gas-prices "0.0001${DENOM}" \
      > "$OUT_DIR/validator$i.log" 2>&1 &
    echo $! >> "$PIDFILE"
  done

  echo "== wait for consensus (heights advance + agree across validators) =="
  for attempt in $(seq 1 40); do
    sleep 2
    declare -a heights=()
    local up=0
    for i in $(seq 0 $((N - 1))); do
      h=$(curl -s --max-time 2 "http://localhost:$(rpc_port "$i")/status" 2>/dev/null | grep -o '"latest_block_height":"[0-9]*"' | grep -oE '[0-9]+')
      [ -n "$h" ] && { heights[$i]=$h; up=$((up + 1)); }
    done
    if [ "$up" -eq "$N" ]; then
      local min=${heights[0]} max=${heights[0]}
      for h in "${heights[@]}"; do [ "$h" -lt "$min" ] && min=$h; [ "$h" -gt "$max" ] && max=$h; done
      echo "  all $N up; heights ${heights[*]} (spread $((max - min)))"
      if [ "$min" -ge 3 ] && [ $((max - min)) -le 2 ]; then
        echo ""
        echo "✅ multi-validator consensus reached: $N validators producing blocks in agreement."
        echo "   RPC endpoints: $(for i in $(seq 0 $((N-1))); do printf 'localhost:%s ' "$(rpc_port "$i")"; done)"
        echo "   Stop with: bash scripts/testnet/local-multinode.sh down"
        return 0
      fi
    fi
  done
  echo "❌ consensus not reached within timeout; check $OUT_DIR/validator*.log"
  return 1
}

case "${1:-up}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  *) echo "usage: $0 {up [N]|down|status}"; exit 1 ;;
esac
