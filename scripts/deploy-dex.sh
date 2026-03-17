#!/usr/bin/env bash
# deploy-dex.sh — Compile and deploy Astroport-forked DEX contracts to ClawChain.
#
# Usage:
#   ./scripts/deploy-dex.sh                # full build + deploy
#   ./scripts/deploy-dex.sh --skip-build   # deploy pre-built artifacts only
#   ./scripts/deploy-dex.sh --dry-run      # show what would be done without executing
#   ./scripts/deploy-dex.sh --force        # re-upload even if code-ids.json exists
#
# Environment variable overrides:
#   CHAIN_ID         Chain ID              (default: clawchain-testnet-1)
#   NODE_URL         Tendermint RPC        (default: http://localhost:26657)
#   KEY_NAME         Keyring key name      (default: admin)
#   GAS_PRICES       Gas price string      (default: 0.0001uclaw)
#   KEYRING_BACKEND  Keyring backend       (default: test)
#   BINARY           Chain binary path     (default: clawchaind)
#   HOME_DIR         Chain home directory   (default: ~/.clawchain)

set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEX_DIR="$ROOT_DIR/contracts/dex"
ARTIFACTS_DIR="$ROOT_DIR/artifacts"
DEPLOY_CONFIG="$DEX_DIR/deploy/config.json"

CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
NODE_URL="${NODE_URL:-http://localhost:26657}"
KEY_NAME="${KEY_NAME:-admin}"
GAS_PRICES="${GAS_PRICES:-0.0001uclaw}"
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"
BINARY="${BINARY:-clawchaind}"
HOME_DIR="${HOME_DIR:-$HOME/.clawchain}"
GAS="auto"
GAS_ADJUSTMENT="1.4"

# Optimizer Docker image
OPTIMIZER_IMAGE="cosmwasm/optimizer:0.16.0"

# Contracts to deploy (order matters: pair types before factory, factory before router/oracle)
CONTRACTS_CORE=(
  "factory:astroport_factory:contracts/factory"
  "pair:astroport_pair:contracts/pair"
  "pair_concentrated:astroport_pair_concentrated:contracts/pair_concentrated"
  "router:astroport_router:contracts/router"
  "oracle:astroport_oracle:contracts/periphery/oracle"
)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CLI flags
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SKIP_BUILD=false
DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --dry-run)    DRY_RUN=true ;;
    --force)      FORCE=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--dry-run] [--force] [--help]"
      echo ""
      echo "Flags:"
      echo "  --skip-build   Skip WASM compilation, use existing artifacts"
      echo "  --dry-run      Show what would be done without executing"
      echo "  --force        Re-upload contracts even if code-ids.json exists"
      echo "  --help         Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  CHAIN_ID, NODE_URL, KEY_NAME, GAS_PRICES, KEYRING_BACKEND, BINARY, HOME_DIR"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (use --help for usage)"
      exit 1
      ;;
  esac
done

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Colors and logging
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}==>${NC} ${BOLD}$*${NC}"; }
dry_info(){ echo -e "${YELLOW}[DRY]${NC}  $*"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Cleanup trap
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEMP_FILES=()
cleanup() {
  for f in "${TEMP_FILES[@]:-}"; do
    rm -f "$f" 2>/dev/null || true
  done
}
trap cleanup EXIT

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Resolve the chain binary (try PATH, then build dir)
resolve_binary() {
  if command -v "$BINARY" &>/dev/null; then
    echo "$BINARY"
  elif [ -f "$ROOT_DIR/build/$BINARY" ]; then
    echo "$ROOT_DIR/build/$BINARY"
  elif [ -f "$ROOT_DIR/$BINARY" ]; then
    echo "$ROOT_DIR/$BINARY"
  else
    fail "Chain binary '$BINARY' not found in PATH, build/, or project root"
  fi
}

# Wait for a transaction to be included in a block, then return the result JSON
wait_for_tx() {
  local txhash="$1"
  local label="$2"
  local max_attempts=12
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    sleep 3

    local result
    result=$("$CHAIN_BIN" q tx "$txhash" \
      --home "$HOME_DIR" \
      --node "$NODE_URL" \
      --output json 2>/dev/null) || continue

    # Check if tx succeeded (code 0)
    local code
    code=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',1))" 2>/dev/null) || code="1"

    if [ "$code" = "0" ]; then
      echo "$result"
      return 0
    else
      local raw_log
      raw_log=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('raw_log','unknown error'))" 2>/dev/null) || raw_log="unknown"
      fail "$label transaction failed (code $code): $raw_log"
    fi
  done

  fail "$label transaction $txhash was not included after $((max_attempts * 3))s"
}

# Extract an attribute value from tx events
extract_event_attr() {
  local tx_json="$1"
  local event_type="$2"
  local attr_key="$3"

  echo "$tx_json" | python3 -c "
import json, sys
tx = json.load(sys.stdin)
# Try top-level events first (Cosmos SDK 0.50+)
for evt in tx.get('events', []):
    if evt.get('type') == '${event_type}':
        for attr in evt.get('attributes', []):
            if attr.get('key') == '${attr_key}':
                print(attr['value'])
                sys.exit(0)
# Fallback: logs[].events
for log in tx.get('logs', []):
    for evt in log.get('events', []):
        if evt.get('type') == '${event_type}':
            for attr in evt.get('attributes', []):
                if attr.get('key') == '${attr_key}':
                    print(attr['value'])
                    sys.exit(0)
print('')
" 2>/dev/null
}

# Store a WASM contract on chain, return code_id
store_contract() {
  local wasm_file="$1"
  local label="$2"

  [ -f "$wasm_file" ] || fail "WASM file not found: $wasm_file"

  info "Uploading $label ($(du -h "$wasm_file" | cut -f1 | xargs))..."

  local tx_result
  tx_result=$("$CHAIN_BIN" tx wasm store "$wasm_file" \
    --from "$KEY_NAME" \
    --home "$HOME_DIR" \
    --keyring-backend "$KEYRING_BACKEND" \
    --chain-id "$CHAIN_ID" \
    --node "$NODE_URL" \
    --gas "$GAS" \
    --gas-adjustment "$GAS_ADJUSTMENT" \
    --gas-prices "$GAS_PRICES" \
    --broadcast-mode sync \
    --output json \
    -y 2>/dev/null)

  local txhash
  txhash=$(echo "$tx_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('txhash',''))" 2>/dev/null)

  if [ -z "$txhash" ]; then
    local raw
    raw=$(echo "$tx_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('raw_log',''))" 2>/dev/null) || raw=""
    fail "Failed to store $label — no txhash returned. Raw: $raw"
  fi

  info "  tx: $txhash — waiting for inclusion..."

  local tx_json
  tx_json=$(wait_for_tx "$txhash" "$label store")

  local code_id
  code_id=$(extract_event_attr "$tx_json" "store_code" "code_id")

  if [ -z "$code_id" ]; then
    fail "Could not extract code_id for $label from tx $txhash"
  fi

  ok "$label uploaded — code_id: $code_id"
  echo "$code_id"
}

# Instantiate a contract, return address
instantiate_contract() {
  local code_id="$1"
  local label="$2"
  local init_msg="$3"
  local admin="${4:-$FACTORY_ADMIN}"

  info "Instantiating $label (code_id: $code_id)..."

  local tx_result
  tx_result=$("$CHAIN_BIN" tx wasm instantiate "$code_id" "$init_msg" \
    --from "$KEY_NAME" \
    --home "$HOME_DIR" \
    --keyring-backend "$KEYRING_BACKEND" \
    --chain-id "$CHAIN_ID" \
    --node "$NODE_URL" \
    --gas "$GAS" \
    --gas-adjustment "$GAS_ADJUSTMENT" \
    --gas-prices "$GAS_PRICES" \
    --label "$label" \
    --admin "$admin" \
    --broadcast-mode sync \
    --output json \
    -y 2>/dev/null)

  local txhash
  txhash=$(echo "$tx_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('txhash',''))" 2>/dev/null)

  if [ -z "$txhash" ]; then
    fail "Failed to instantiate $label — no txhash"
  fi

  info "  tx: $txhash — waiting for inclusion..."

  local tx_json
  tx_json=$(wait_for_tx "$txhash" "$label instantiate")

  local contract_addr
  contract_addr=$(extract_event_attr "$tx_json" "instantiate" "_contract_address")

  if [ -z "$contract_addr" ]; then
    fail "Could not extract contract address for $label from tx $txhash"
  fi

  ok "$label instantiated — address: $contract_addr"
  echo "$contract_addr"
}

# Execute a contract message
execute_contract() {
  local contract_addr="$1"
  local exec_msg="$2"
  local label="$3"
  local funds="${4:-}"

  info "Executing $label..."

  local funds_flag=""
  if [ -n "$funds" ]; then
    funds_flag="--amount $funds"
  fi

  local tx_result
  tx_result=$("$CHAIN_BIN" tx wasm execute "$contract_addr" "$exec_msg" \
    --from "$KEY_NAME" \
    --home "$HOME_DIR" \
    --keyring-backend "$KEYRING_BACKEND" \
    --chain-id "$CHAIN_ID" \
    --node "$NODE_URL" \
    --gas "$GAS" \
    --gas-adjustment "$GAS_ADJUSTMENT" \
    --gas-prices "$GAS_PRICES" \
    --broadcast-mode sync \
    --output json \
    $funds_flag \
    -y 2>/dev/null)

  local txhash
  txhash=$(echo "$tx_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('txhash',''))" 2>/dev/null)

  if [ -z "$txhash" ]; then
    fail "Failed to execute $label — no txhash"
  fi

  info "  tx: $txhash — waiting for inclusion..."

  local tx_json
  tx_json=$(wait_for_tx "$txhash" "$label execute")

  ok "$label executed successfully"
  echo "$tx_json"
}

# Find a WASM artifact by contract name
find_wasm() {
  local name="$1"
  local candidates=(
    "$ARTIFACTS_DIR/${name}.wasm"
    "$ARTIFACTS_DIR/${name//-/_}.wasm"
    "$DEX_DIR/artifacts/${name}.wasm"
    "$DEX_DIR/artifacts/${name//-/_}.wasm"
    "$DEX_DIR/target/wasm32-unknown-unknown/release/${name}.wasm"
    "$DEX_DIR/target/wasm32-unknown-unknown/release/${name//-/_}.wasm"
  )
  for f in "${candidates[@]}"; do
    if [ -f "$f" ]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Preflight checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

step "Preflight checks"

CHAIN_BIN=$(resolve_binary)
ok "Chain binary: $CHAIN_BIN"

if [ "$DRY_RUN" = true ]; then
  dry_info "Dry-run mode enabled — no transactions will be submitted"
  dry_info "Chain ID:     $CHAIN_ID"
  dry_info "Node URL:     $NODE_URL"
  dry_info "Key:          $KEY_NAME"
  dry_info "Gas prices:   $GAS_PRICES"
  dry_info "Artifacts:    $ARTIFACTS_DIR"
  echo ""
fi

if [ "$DRY_RUN" = false ]; then
  # Check node is reachable
  if ! curl -sf "${NODE_URL}/status" > /dev/null 2>&1; then
    fail "Chain node not reachable at $NODE_URL — is it running?"
  fi
  ok "Node reachable at $NODE_URL"

  # Derive admin address from key
  FACTORY_ADMIN=$("$CHAIN_BIN" keys show "$KEY_NAME" \
    --home "$HOME_DIR" \
    --keyring-backend "$KEYRING_BACKEND" \
    -a 2>/dev/null) \
    || fail "Key '$KEY_NAME' not found in keyring (backend: $KEYRING_BACKEND)"
  ok "Deployer: $FACTORY_ADMIN"
else
  FACTORY_ADMIN="<derived-from-${KEY_NAME}-key>"
  dry_info "Deployer would be resolved from key '$KEY_NAME'"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1: Build WASM contracts
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

step "Phase 1: Build contracts"

if [ "$SKIP_BUILD" = true ]; then
  info "Skipping build (--skip-build)"
else
  mkdir -p "$ARTIFACTS_DIR"

  # Prefer Docker optimizer for deterministic builds
  if command -v docker &>/dev/null; then
    info "Using CosmWasm optimizer Docker image: $OPTIMIZER_IMAGE"

    if [ "$DRY_RUN" = true ]; then
      dry_info "Would run: docker run --rm -v $DEX_DIR:/code $OPTIMIZER_IMAGE"
    else
      docker run --rm \
        -v "$DEX_DIR":/code \
        --mount type=volume,source="clawchain_dex_cache",target=/target \
        --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
        "$OPTIMIZER_IMAGE" 2>&1 | while IFS= read -r line; do
          echo -e "  ${CYAN}[docker]${NC} $line"
        done

      # Optimizer outputs to /code/artifacts/ inside the container (i.e. $DEX_DIR/artifacts/)
      if [ -d "$DEX_DIR/artifacts" ]; then
        info "Copying optimized WASM artifacts to $ARTIFACTS_DIR/"
        cp -v "$DEX_DIR/artifacts/"*.wasm "$ARTIFACTS_DIR/" 2>/dev/null || true
        ok "Optimized artifacts ready"
      else
        warn "Docker optimizer did not produce artifacts directory"
      fi
    fi
  elif command -v cargo &>/dev/null; then
    warn "Docker not available — falling back to cargo wasm (non-deterministic builds)"

    # Ensure wasm target is installed
    if ! rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown; then
      info "Adding wasm32-unknown-unknown target..."
      rustup target add wasm32-unknown-unknown
    fi

    if [ "$DRY_RUN" = true ]; then
      dry_info "Would run: cargo build --release --target wasm32-unknown-unknown for each contract"
    else
      for entry in "${CONTRACTS_CORE[@]}"; do
        IFS=':' read -r name wasm_name subdir <<< "$entry"
        contract_dir="$DEX_DIR/$subdir"
        if [ -d "$contract_dir" ]; then
          info "Building $name..."
          (cd "$DEX_DIR" && cargo build \
            --release \
            --target wasm32-unknown-unknown \
            --package "$wasm_name" \
            --quiet 2>&1) && ok "$name built" || warn "$name build failed"
        else
          warn "Contract directory not found: $contract_dir"
        fi
      done

      # Copy artifacts
      WASM_OUT="$DEX_DIR/target/wasm32-unknown-unknown/release"
      for entry in "${CONTRACTS_CORE[@]}"; do
        IFS=':' read -r name wasm_name subdir <<< "$entry"
        # Rust crate names use hyphens but artifacts use underscores
        artifact_name="${wasm_name//-/_}.wasm"
        wasm_file="$WASM_OUT/$artifact_name"
        if [ -f "$wasm_file" ]; then
          cp "$wasm_file" "$ARTIFACTS_DIR/$artifact_name"
          ok "Copied $artifact_name to artifacts/"
        fi
      done
    fi
  else
    fail "Neither docker nor cargo found — cannot build contracts"
  fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 2: Upload WASM contracts
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

step "Phase 2: Upload contracts"

CODE_IDS_FILE="$ARTIFACTS_DIR/code-ids.json"

# Idempotency: skip if code-ids.json already exists (unless --force)
if [ -f "$CODE_IDS_FILE" ] && [ "$FORCE" = false ]; then
  info "Found existing $CODE_IDS_FILE — skipping uploads (use --force to override)"
  # Load existing code IDs
  FACTORY_CODE_ID=$(python3 -c "import json; print(json.load(open('$CODE_IDS_FILE'))['factory'])" 2>/dev/null)
  PAIR_CODE_ID=$(python3 -c "import json; print(json.load(open('$CODE_IDS_FILE'))['pair'])" 2>/dev/null)
  PAIR_CONCENTRATED_CODE_ID=$(python3 -c "import json; print(json.load(open('$CODE_IDS_FILE'))['pair_concentrated'])" 2>/dev/null)
  ROUTER_CODE_ID=$(python3 -c "import json; print(json.load(open('$CODE_IDS_FILE'))['router'])" 2>/dev/null)
  ORACLE_CODE_ID=$(python3 -c "import json; print(json.load(open('$CODE_IDS_FILE'))['oracle'])" 2>/dev/null)
  ok "Loaded code IDs from cache: factory=$FACTORY_CODE_ID pair=$PAIR_CODE_ID pair_concentrated=$PAIR_CONCENTRATED_CODE_ID router=$ROUTER_CODE_ID oracle=$ORACLE_CODE_ID"
else
  if [ "$DRY_RUN" = true ]; then
    dry_info "Would upload the following contracts:"
    for entry in "${CONTRACTS_CORE[@]}"; do
      IFS=':' read -r name wasm_name subdir <<< "$entry"
      artifact_name="${wasm_name//-/_}.wasm"
      wasm_path=$(find_wasm "$wasm_name" 2>/dev/null || echo "<not found>")
      dry_info "  $name -> $wasm_path"
    done
    # Assign placeholder IDs for dry-run
    FACTORY_CODE_ID="<factory_code_id>"
    PAIR_CODE_ID="<pair_code_id>"
    PAIR_CONCENTRATED_CODE_ID="<pair_concentrated_code_id>"
    ROUTER_CODE_ID="<router_code_id>"
    ORACLE_CODE_ID="<oracle_code_id>"
  else
    # Upload factory
    FACTORY_WASM=$(find_wasm "astroport_factory") || fail "Factory WASM not found — did the build succeed?"
    FACTORY_CODE_ID=$(store_contract "$FACTORY_WASM" "factory")
    # Strip any extra output lines, keep last line (the code_id)
    FACTORY_CODE_ID=$(echo "$FACTORY_CODE_ID" | tail -1)

    # Upload pair (XYK)
    PAIR_WASM=$(find_wasm "astroport_pair") || fail "Pair WASM not found"
    PAIR_CODE_ID=$(store_contract "$PAIR_WASM" "pair")
    PAIR_CODE_ID=$(echo "$PAIR_CODE_ID" | tail -1)

    # Upload pair_concentrated
    PAIR_CONCENTRATED_WASM=$(find_wasm "astroport_pair_concentrated") || fail "Pair concentrated WASM not found"
    PAIR_CONCENTRATED_CODE_ID=$(store_contract "$PAIR_CONCENTRATED_WASM" "pair_concentrated")
    PAIR_CONCENTRATED_CODE_ID=$(echo "$PAIR_CONCENTRATED_CODE_ID" | tail -1)

    # Upload router
    ROUTER_WASM=$(find_wasm "astroport_router") || fail "Router WASM not found"
    ROUTER_CODE_ID=$(store_contract "$ROUTER_WASM" "router")
    ROUTER_CODE_ID=$(echo "$ROUTER_CODE_ID" | tail -1)

    # Upload oracle
    ORACLE_WASM=$(find_wasm "astroport_oracle") || fail "Oracle WASM not found"
    ORACLE_CODE_ID=$(store_contract "$ORACLE_WASM" "oracle")
    ORACLE_CODE_ID=$(echo "$ORACLE_CODE_ID" | tail -1)

    # Save code IDs
    cat > "$CODE_IDS_FILE" <<CIDEOF
{
  "factory": ${FACTORY_CODE_ID},
  "pair": ${PAIR_CODE_ID},
  "pair_concentrated": ${PAIR_CONCENTRATED_CODE_ID},
  "router": ${ROUTER_CODE_ID},
  "oracle": ${ORACLE_CODE_ID},
  "chain_id": "${CHAIN_ID}",
  "uploaded_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CIDEOF
    ok "Code IDs saved to $CODE_IDS_FILE"
  fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3: Instantiate contracts
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

step "Phase 3: Instantiate contracts"

ADDR_FILE="$ARTIFACTS_DIR/contract-addresses.json"

# ── 3a. Factory ──

FACTORY_INIT_MSG=$(cat <<FEOF
{
  "pair_configs": [
    {
      "code_id": ${PAIR_CODE_ID},
      "pair_type": {"xyk": {}},
      "total_fee_bps": 30,
      "maker_fee_bps": 10,
      "is_disabled": false,
      "is_generator_disabled": false,
      "permissioned": false
    },
    {
      "code_id": ${PAIR_CODE_ID},
      "pair_type": {"stable": {}},
      "total_fee_bps": 5,
      "maker_fee_bps": 2,
      "is_disabled": false,
      "is_generator_disabled": false,
      "permissioned": false
    },
    {
      "code_id": ${PAIR_CONCENTRATED_CODE_ID},
      "pair_type": {"custom": "concentrated"},
      "total_fee_bps": 30,
      "maker_fee_bps": 10,
      "is_disabled": false,
      "is_generator_disabled": false,
      "permissioned": false
    }
  ],
  "token_code_id": 0,
  "owner": "${FACTORY_ADMIN}",
  "whitelist_code_id": 0
}
FEOF
)

if [ "$DRY_RUN" = true ]; then
  dry_info "Would instantiate factory with code_id=${FACTORY_CODE_ID}"
  dry_info "  init_msg: $(echo "$FACTORY_INIT_MSG" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)))' 2>/dev/null || echo "$FACTORY_INIT_MSG")"
  FACTORY_ADDR="<factory_address>"
else
  FACTORY_ADDR=$(instantiate_contract "$FACTORY_CODE_ID" "claw-dex-factory" "$FACTORY_INIT_MSG")
  FACTORY_ADDR=$(echo "$FACTORY_ADDR" | tail -1)
fi

# ── 3b. Router ──

ROUTER_INIT_MSG=$(cat <<REOF
{
  "astroport_factory": "${FACTORY_ADDR}"
}
REOF
)

if [ "$DRY_RUN" = true ]; then
  dry_info "Would instantiate router with code_id=${ROUTER_CODE_ID}"
  dry_info "  factory_addr: ${FACTORY_ADDR}"
  ROUTER_ADDR="<router_address>"
else
  ROUTER_ADDR=$(instantiate_contract "$ROUTER_CODE_ID" "claw-dex-router" "$ROUTER_INIT_MSG")
  ROUTER_ADDR=$(echo "$ROUTER_ADDR" | tail -1)
fi

# ── 3c. Oracle ──

ORACLE_INIT_MSG=$(cat <<OEOF
{
  "factory_contract": "${FACTORY_ADDR}",
  "period": 86400
}
OEOF
)

if [ "$DRY_RUN" = true ]; then
  dry_info "Would instantiate oracle with code_id=${ORACLE_CODE_ID}"
  dry_info "  factory_addr: ${FACTORY_ADDR}"
  dry_info "  period: 86400"
  ORACLE_ADDR="<oracle_address>"
else
  ORACLE_ADDR=$(instantiate_contract "$ORACLE_CODE_ID" "claw-dex-oracle" "$ORACLE_INIT_MSG")
  ORACLE_ADDR=$(echo "$ORACLE_ADDR" | tail -1)
fi

# Save contract addresses
if [ "$DRY_RUN" = false ]; then
  cat > "$ADDR_FILE" <<ADDREOF
{
  "factory": "${FACTORY_ADDR}",
  "router": "${ROUTER_ADDR}",
  "oracle": "${ORACLE_ADDR}",
  "chain_id": "${CHAIN_ID}",
  "deployer": "${FACTORY_ADMIN}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ADDREOF
  ok "Contract addresses saved to $ADDR_FILE"
else
  dry_info "Would save contract addresses to $ADDR_FILE"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 4: Create initial CLAW/ATOM pool
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

step "Phase 4: Create initial CLAW/ATOM pool"

CREATE_PAIR_MSG=$(cat <<CPEOF
{
  "create_pair": {
    "pair_type": {"xyk": {}},
    "asset_infos": [
      {"native_token": {"denom": "uclaw"}},
      {"native_token": {"denom": "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2"}}
    ]
  }
}
CPEOF
)

if [ "$DRY_RUN" = true ]; then
  dry_info "Would create CLAW/ATOM XYK pair via factory at ${FACTORY_ADDR}"
  dry_info "  asset_infos: uclaw + ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2"
  PAIR_ADDR="<pair_address>"
else
  pair_tx_json=$(execute_contract "$FACTORY_ADDR" "$CREATE_PAIR_MSG" "create CLAW/ATOM pair")

  # Extract pair contract address from wasm events
  PAIR_ADDR=$(echo "$pair_tx_json" | python3 -c "
import json, sys
tx = json.load(sys.stdin)
for evt in tx.get('events', []):
    if evt.get('type') == 'wasm':
        for attr in evt.get('attributes', []):
            if attr.get('key') == 'pair_contract_addr':
                print(attr['value'])
                sys.exit(0)
# Fallback: search in logs
for log in tx.get('logs', []):
    for evt in log.get('events', []):
        if evt.get('type') == 'wasm':
            for attr in evt.get('attributes', []):
                if attr.get('key') == 'pair_contract_addr':
                    print(attr['value'])
                    sys.exit(0)
print('')
" 2>/dev/null)

  if [ -n "$PAIR_ADDR" ]; then
    ok "CLAW/ATOM pair created at: $PAIR_ADDR"

    # Update contract-addresses.json with pair address
    python3 -c "
import json
with open('$ADDR_FILE', 'r') as f:
    data = json.load(f)
data['claw_atom_pair'] = '$PAIR_ADDR'
with open('$ADDR_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
    ok "Updated $ADDR_FILE with pair address"
  else
    warn "Pair created but could not extract pair contract address from events"
  fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5: Verification
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

step "Phase 5: Verification"

if [ "$DRY_RUN" = true ]; then
  dry_info "Would query factory for pair list"
  dry_info "Would query router config"
  dry_info "Would query oracle config"
else
  # Query factory for pairs
  info "Querying factory for registered pairs..."
  PAIRS_QUERY='{"pairs":{"limit":10}}'
  pairs_result=$("$CHAIN_BIN" q wasm contract-state smart "$FACTORY_ADDR" "$PAIRS_QUERY" \
    --home "$HOME_DIR" \
    --node "$NODE_URL" \
    --output json 2>/dev/null) || warn "Could not query factory pairs"

  if [ -n "${pairs_result:-}" ]; then
    pair_count=$(echo "$pairs_result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
pairs = data.get('data', {}).get('pairs', [])
print(len(pairs))
" 2>/dev/null) || pair_count="0"
    ok "Factory reports $pair_count registered pair(s)"
  fi

  # Query router config
  info "Querying router config..."
  ROUTER_QUERY='{"config":{}}'
  router_result=$("$CHAIN_BIN" q wasm contract-state smart "$ROUTER_ADDR" "$ROUTER_QUERY" \
    --home "$HOME_DIR" \
    --node "$NODE_URL" \
    --output json 2>/dev/null) || warn "Could not query router config"

  if [ -n "${router_result:-}" ]; then
    router_factory=$(echo "$router_result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('data', {}).get('astroport_factory', 'unknown'))
" 2>/dev/null) || router_factory="unknown"
    ok "Router points to factory: $router_factory"
  fi

  # Query oracle
  info "Querying oracle config..."
  ORACLE_QUERY='{"config":{}}'
  oracle_result=$("$CHAIN_BIN" q wasm contract-state smart "$ORACLE_ADDR" "$ORACLE_QUERY" \
    --home "$HOME_DIR" \
    --node "$NODE_URL" \
    --output json 2>/dev/null) || warn "Could not query oracle config"

  if [ -n "${oracle_result:-}" ]; then
    ok "Oracle responding to queries"
  fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${CYAN}"
echo "================================================================"
echo "  ClawChain DEX Deployment Summary"
echo "================================================================"
echo -e "${NC}"

echo -e "  ${BOLD}Chain:${NC}          $CHAIN_ID"
echo -e "  ${BOLD}Node:${NC}           $NODE_URL"
echo -e "  ${BOLD}Deployer:${NC}       $FACTORY_ADMIN"
echo ""

echo -e "  ${BOLD}${YELLOW}Code IDs:${NC}"
echo -e "    Factory:            ${CYAN}${FACTORY_CODE_ID}${NC}"
echo -e "    Pair (XYK):         ${CYAN}${PAIR_CODE_ID}${NC}"
echo -e "    Pair (Concentrated):${CYAN}${PAIR_CONCENTRATED_CODE_ID}${NC}"
echo -e "    Router:             ${CYAN}${ROUTER_CODE_ID}${NC}"
echo -e "    Oracle:             ${CYAN}${ORACLE_CODE_ID}${NC}"
echo ""

echo -e "  ${BOLD}${YELLOW}Contract Addresses:${NC}"
echo -e "    Factory:            ${CYAN}${FACTORY_ADDR}${NC}"
echo -e "    Router:             ${CYAN}${ROUTER_ADDR}${NC}"
echo -e "    Oracle:             ${CYAN}${ORACLE_ADDR}${NC}"
echo -e "    CLAW/ATOM Pair:     ${CYAN}${PAIR_ADDR:-not extracted}${NC}"
echo ""

echo -e "  ${BOLD}${YELLOW}Artifacts:${NC}"
echo -e "    Code IDs:           ${CYAN}${CODE_IDS_FILE}${NC}"
echo -e "    Addresses:          ${CYAN}${ADDR_FILE}${NC}"
echo -e "    Deploy config:      ${CYAN}${DEPLOY_CONFIG}${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "  ${YELLOW}(DRY RUN — no transactions were submitted)${NC}"
  echo ""
fi

echo -e "${BOLD}${CYAN}================================================================${NC}"
echo -e "${GREEN}Done.${NC}"
