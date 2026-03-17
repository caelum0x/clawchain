#!/usr/bin/env bash
#
# gen-api-docs.sh - Query a live ClawChain node and generate a comprehensive
# auto-generated API endpoint reference with response schemas and examples.
#
# Requires a running chain at localhost:1317 (REST / gRPC-gateway).
#
# Usage:
#   ./scripts/gen-api-docs.sh
#   ./scripts/gen-api-docs.sh --base-url http://custom-host:1317
#   ./scripts/gen-api-docs.sh --timeout 5
#
# Outputs:
#   docs-site/docs/api/_generated-endpoints.md
#
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────
BASE_URL="http://localhost:1317"
CURL_TIMEOUT=3        # seconds per request
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$PROJECT_DIR/docs-site/docs/api"
OUT_FILE="$OUT_DIR/_generated-endpoints.md"

# ── Colors ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Parse arguments ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      shift
      BASE_URL="${1:?--base-url requires a value}"; shift ;;
    --timeout)
      shift
      CURL_TIMEOUT="${1:?--timeout requires a value}"; shift ;;
    -h|--help)
      echo "Usage: $0 [--base-url URL] [--timeout SECS]"
      echo ""
      echo "Options:"
      echo "  --base-url URL   REST API base URL (default: http://localhost:1317)"
      echo "  --timeout SECS   Curl timeout per request in seconds (default: 3)"
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

# ── Helpers ────────────────────────────────────────────────────────────

# query_endpoint PATH DESCRIPTION
#   Queries the endpoint, returns the HTTP status code.
#   Sets global vars: LAST_STATUS, LAST_BODY, LAST_OK
query_endpoint() {
  local path="$1"
  local url="${BASE_URL}${path}"
  local tmpfile
  tmpfile=$(mktemp)

  LAST_STATUS=$(curl -s -o "$tmpfile" -w '%{http_code}' \
    --connect-timeout "$CURL_TIMEOUT" \
    --max-time "$CURL_TIMEOUT" \
    "$url" 2>/dev/null || echo "000")

  LAST_BODY=$(cat "$tmpfile" 2>/dev/null || echo "")
  rm -f "$tmpfile"

  if [[ "$LAST_STATUS" == "200" ]]; then
    LAST_OK=true
  else
    LAST_OK=false
  fi
}

# format_json RAW_JSON
#   Pretty-print JSON, truncating to a reasonable size for docs.
format_json() {
  local raw="$1"
  local max_lines=60
  local formatted
  formatted=$(echo "$raw" | python3 -m json.tool 2>/dev/null || echo "$raw")
  local line_count
  line_count=$(echo "$formatted" | wc -l | tr -d ' ')
  if [[ "$line_count" -gt "$max_lines" ]]; then
    echo "$formatted" | head -n "$max_lines"
    echo "  // ... truncated ($line_count lines total)"
  else
    echo "$formatted"
  fi
}

# extract_schema RAW_JSON
#   Extract top-level keys and their types to produce a minimal schema summary.
extract_schema() {
  local raw="$1"
  python3 -c "
import json, sys

def describe(val, depth=0, max_depth=2):
    indent = '  ' * depth
    if isinstance(val, dict):
        if depth >= max_depth:
            return '{...}'
        parts = []
        for k, v in val.items():
            parts.append(f'{indent}  \"{k}\": {describe(v, depth+1, max_depth)}')
        inner = ',\n'.join(parts)
        return '{\n' + inner + '\n' + indent + '}'
    elif isinstance(val, list):
        if len(val) == 0:
            return '[]'
        return '[' + describe(val[0], depth, max_depth) + ', ...]'
    elif isinstance(val, bool):
        return 'boolean'
    elif isinstance(val, int):
        return 'integer'
    elif isinstance(val, float):
        return 'number'
    elif isinstance(val, str):
        return 'string'
    elif val is None:
        return 'null'
    return str(type(val).__name__)

try:
    data = json.loads(sys.stdin.read())
    print(describe(data))
except:
    print('(unable to parse)')
" <<< "$raw"
}

# ── Connectivity check ─────────────────────────────────────────────────
echo -e "${BOLD}=== ClawChain Live API Documentation Generator ===${NC}"
echo ""
echo -e "Target: ${CYAN}${BASE_URL}${NC}"
echo ""

query_endpoint "/cosmos/base/tendermint/v1beta1/node_info"
if [[ "$LAST_OK" != "true" ]]; then
  echo -e "${RED}ERROR: Cannot reach chain at ${BASE_URL}${NC}"
  echo "Make sure the node is running with the REST API enabled (app.toml [api] enable = true)."
  exit 1
fi

CHAIN_ID=$(echo "$LAST_BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('default_node_info',{}).get('network','unknown'))" 2>/dev/null || echo "unknown")
echo -e "Connected to chain: ${GREEN}${CHAIN_ID}${NC}"
echo ""

# ── Define all endpoints to probe ──────────────────────────────────────

# Each entry: MODULE|METHOD|PATH|DESCRIPTION
# ClawChain custom modules
ENDPOINTS=(
  # ── Agent module ──
  "agent|GET|/clawchain/agent/v1/params|Agent module parameters"
  "agent|GET|/clawchain/agent/v1/live|List live agents"
  "agent|GET|/clawchain/agent/v1/remote_agents|List remote (IBC) agents"
  "agent|GET|/clawchain/agent/v1/negotiations|List negotiations"
  "agent|GET|/clawchain/agent/v1/activity/recent/10|Recent agent activity (last 10)"

  # ── Privacy module ──
  "privacy|GET|/clawchain/privacy/v1/params|Privacy module parameters"
  "privacy|GET|/clawchain/privacy/v1/merkle_root|Current Merkle tree root"
  "privacy|GET|/clawchain/privacy/v1/tree_stats|Merkle tree statistics"

  # ── Marketplace module ──
  "marketplace|GET|/clawchain/marketplace/v1/params|Marketplace module parameters"
  "marketplace|GET|/clawchain/marketplace/v1/compute_resources|List compute resources"
  "marketplace|GET|/clawchain/marketplace/v1/compute_jobs|List compute jobs"
  "marketplace|GET|/clawchain/marketplace/v1/compute_leases|List compute leases"
  "marketplace|GET|/clawchain/marketplace/v1/skills|List registered skills"

  # ── Model Registry module ──
  "modelregistry|GET|/clawchain/modelregistry/v1/params|Model registry parameters"
  "modelregistry|GET|/clawchain/modelregistry/v1/models|List registered models"
  "modelregistry|GET|/clawchain/modelregistry/v1/inference/providers|List inference providers"
  "modelregistry|GET|/clawchain/modelregistry/v1/inference/jobs|List inference jobs"

  # ── Reputation module ──
  "reputation|GET|/clawchain/reputation/v1/params|Reputation module parameters"
  "reputation|GET|/clawchain/reputation/v1/top_agents|Top agents by reputation"

  # ── Messaging module ──
  "messaging|GET|/clawchain/messaging/v1/params|Messaging module parameters"

  # ── Governance module ──
  "governance|GET|/clawchain/governance/v1/params|Governance module parameters"
  "governance|GET|/clawchain/governance/v1/proposals|List governance proposals"

  # ── ClawChain base module ──
  "clawchain|GET|/clawchain/clawchain/v1/params|ClawChain base module parameters"

  # ── Cosmos SDK core endpoints ──
  "cosmos-bank|GET|/cosmos/bank/v1beta1/supply|Total token supply"
  "cosmos-bank|GET|/cosmos/bank/v1beta1/denoms_metadata|Denomination metadata"
  "cosmos-staking|GET|/cosmos/staking/v1beta1/validators|List validators"
  "cosmos-staking|GET|/cosmos/staking/v1beta1/pool|Staking pool info"
  "cosmos-staking|GET|/cosmos/staking/v1beta1/params|Staking parameters"
  "cosmos-distribution|GET|/cosmos/distribution/v1beta1/community_pool|Community pool balance"
  "cosmos-distribution|GET|/cosmos/distribution/v1beta1/params|Distribution parameters"
  "cosmos-gov|GET|/cosmos/gov/v1/proposals|SDK governance proposals"
  "cosmos-gov|GET|/cosmos/gov/v1/params/voting|Voting parameters"
  "cosmos-auth|GET|/cosmos/auth/v1beta1/module_accounts|Module accounts"
  "cosmos-mint|GET|/cosmos/mint/v1beta1/params|Mint parameters"
  "cosmos-mint|GET|/cosmos/mint/v1beta1/inflation|Current inflation rate"
  "cosmos-mint|GET|/cosmos/mint/v1beta1/annual_provisions|Annual provisions"
  "cosmos-slashing|GET|/cosmos/slashing/v1beta1/params|Slashing parameters"
  "cosmos-node|GET|/cosmos/base/tendermint/v1beta1/node_info|Node information"
  "cosmos-node|GET|/cosmos/base/tendermint/v1beta1/syncing|Node sync status"
  "cosmos-node|GET|/cosmos/base/tendermint/v1beta1/blocks/latest|Latest block"

  # ── IBC endpoints ──
  "ibc|GET|/ibc/core/channel/v1/channels|IBC channels"
  "ibc|GET|/ibc/core/connection/v1/connections|IBC connections"
  "ibc|GET|/ibc/core/client/v1/client_states|IBC client states"
  "ibc|GET|/ibc/apps/transfer/v1/params|IBC transfer parameters"
  "ibc|GET|/ibc/apps/transfer/v1/denom_traces|IBC denom traces"

  # ── CosmWasm endpoints ──
  "cosmwasm|GET|/cosmwasm/wasm/v1/codes|Uploaded WASM codes"
  "cosmwasm|GET|/cosmwasm/wasm/v1/params|CosmWasm parameters"
)

# ── Params-only endpoints (for detailed response capture) ──
PARAMS_ENDPOINTS=(
  "agent|/clawchain/agent/v1/params|Agent"
  "privacy|/clawchain/privacy/v1/params|Privacy"
  "marketplace|/clawchain/marketplace/v1/params|Marketplace"
  "modelregistry|/clawchain/modelregistry/v1/params|Model Registry"
  "reputation|/clawchain/reputation/v1/params|Reputation"
  "messaging|/clawchain/messaging/v1/params|Messaging"
  "governance|/clawchain/governance/v1/params|Governance"
  "clawchain|/clawchain/clawchain/v1/params|ClawChain (base)"
)

# ── Probe all endpoints ────────────────────────────────────────────────
echo -e "${BOLD}Probing ${#ENDPOINTS[@]} endpoints...${NC}"
echo ""

declare -a RESULTS=()
ok_count=0
err_count=0
unreachable_count=0

for entry in "${ENDPOINTS[@]}"; do
  IFS='|' read -r module method path description <<< "$entry"
  query_endpoint "$path"

  if [[ "$LAST_STATUS" == "000" ]]; then
    status_label="TIMEOUT"
    unreachable_count=$((unreachable_count + 1))
    echo -e "  ${YELLOW}TIMEOUT${NC}  ${method} ${path}"
  elif [[ "$LAST_OK" == "true" ]]; then
    status_label="OK"
    ok_count=$((ok_count + 1))
    echo -e "  ${GREEN}  ${LAST_STATUS}${NC}  ${method} ${path}"
  else
    status_label="ERROR:${LAST_STATUS}"
    err_count=$((err_count + 1))
    echo -e "  ${RED}  ${LAST_STATUS}${NC}  ${method} ${path}"
  fi

  RESULTS+=("${module}|${method}|${path}|${description}|${status_label}")
done

echo ""
echo -e "Results: ${GREEN}${ok_count} OK${NC}, ${RED}${err_count} errors${NC}, ${YELLOW}${unreachable_count} timeouts${NC}"
echo ""

# ── Collect params responses ───────────────────────────────────────────
echo -e "${BOLD}Collecting module parameter responses...${NC}"

PARAMS_TMP=$(mktemp -d)
trap "rm -rf $PARAMS_TMP" EXIT

for entry in "${PARAMS_ENDPOINTS[@]}"; do
  IFS='|' read -r module path label <<< "$entry"
  query_endpoint "$path"
  if [[ "$LAST_OK" == "true" && -n "$LAST_BODY" ]]; then
    echo "$LAST_BODY" > "$PARAMS_TMP/${module}.response"
    extract_schema "$LAST_BODY" > "$PARAMS_TMP/${module}.schema"
    echo -e "  ${GREEN}OK${NC}  ${label} params captured"
  else
    echo "" > "$PARAMS_TMP/${module}.response"
    echo "(endpoint returned HTTP ${LAST_STATUS})" > "$PARAMS_TMP/${module}.schema"
    echo -e "  ${RED}FAIL${NC}  ${label} params (HTTP ${LAST_STATUS})"
  fi
done

echo ""

# ── Generate the markdown document ─────────────────────────────────────
echo -e "${BOLD}Writing ${OUT_FILE}...${NC}"
mkdir -p "$OUT_DIR"

TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

cat > "$OUT_FILE" << 'HEADER'
---
sidebar_position: 99
title: Generated Endpoint Reference
---

<!-- Auto-generated by scripts/gen-api-docs.sh — do not edit manually -->
HEADER

cat >> "$OUT_FILE" << EOF

# API Endpoint Reference (Auto-Generated)

> This document was auto-generated by querying a live ClawChain node.
> Generated at: \`${TIMESTAMP}\` | Chain ID: \`${CHAIN_ID}\` | Base URL: \`${BASE_URL}\`

---

## Endpoint Summary

The table below lists every probed endpoint, its HTTP method, a brief description,
and the status observed when the documentation was generated.

| Status | Module | Method | Path | Description |
|--------|--------|--------|------|-------------|
EOF

# Write the summary table
for result in "${RESULTS[@]}"; do
  IFS='|' read -r module method path description status <<< "$result"
  if [[ "$status" == "OK" ]]; then
    status_badge="OK"
  elif [[ "$status" == "TIMEOUT" ]]; then
    status_badge="TIMEOUT"
  else
    status_badge="$status"
  fi
  echo "| ${status_badge} | ${module} | ${method} | \`${path}\` | ${description} |" >> "$OUT_FILE"
done

# ── ClawChain Module Sections ──────────────────────────────────────────

cat >> "$OUT_FILE" << 'EOF'

---

## ClawChain Module Parameters

Each ClawChain custom module exposes a `/params` endpoint that returns the
module's current on-chain configuration. Below are the live responses captured
from each module.

EOF

for entry in "${PARAMS_ENDPOINTS[@]}"; do
  IFS='|' read -r module path label <<< "$entry"

  cat >> "$OUT_FILE" << EOF
### ${label} Module

**Endpoint:** \`GET ${path}\`

EOF

  resp_file="$PARAMS_TMP/${module}.response"
  schema_file="$PARAMS_TMP/${module}.schema"
  resp_content=""
  if [[ -f "$resp_file" ]]; then
    resp_content=$(cat "$resp_file")
  fi

  if [[ -n "$resp_content" ]]; then
    cat >> "$OUT_FILE" << EOF
**Response schema:**

\`\`\`
$(cat "$schema_file")
\`\`\`

**Example response:**

\`\`\`json
$(format_json "$resp_content")
\`\`\`

EOF
  else
    cat >> "$OUT_FILE" << EOF
> This endpoint returned an error when queried. The module may not be
> initialized or the node may not support this query.

EOF
  fi
done

# ── Cosmos SDK Core Endpoints Section ──────────────────────────────────

cat >> "$OUT_FILE" << 'EOF'
---

## Cosmos SDK Core Endpoints

Standard Cosmos SDK endpoints available on every SDK-based chain.

| Method | Path | Description |
|--------|------|-------------|
EOF

for result in "${RESULTS[@]}"; do
  IFS='|' read -r module method path description status <<< "$result"
  case "$module" in
    cosmos-*|ibc|cosmwasm)
      echo "| ${method} | \`${path}\` | ${description} |" >> "$OUT_FILE"
      ;;
  esac
done

# ── Address-parameterized endpoints ────────────────────────────────────

cat >> "$OUT_FILE" << 'EOF'

---

## Address-Parameterized Endpoints

The following endpoints require an address or ID parameter and were not probed
automatically. Replace the placeholder with a valid value.

### Agent Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/agent/v1/agent/{address}` | Get agent by address |
| GET | `/clawchain/agent/v1/stats/{address}` | Agent statistics |
| GET | `/clawchain/agent/v1/rewards/{address}` | Agent rewards |
| GET | `/clawchain/agent/v1/liveness/{address}` | Agent liveness status |
| GET | `/clawchain/agent/v1/activity/{address}/{limit}` | Agent activity history |
| GET | `/clawchain/agent/v1/task/{task_id}` | Get task by ID |
| GET | `/clawchain/agent/v1/tasks/assignee/{address}` | Tasks assigned to agent |
| GET | `/clawchain/agent/v1/tasks/delegator/{address}` | Tasks delegated by address |
| GET | `/clawchain/agent/v1/intent/{intent_id}` | Get intent by ID |
| GET | `/clawchain/agent/v1/negotiation/{id}` | Get negotiation by ID |
| GET | `/clawchain/agent/v1/negotiations/{address}` | Negotiations for address |

### Privacy Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/privacy/v1/nullifier_exists/{nullifier}` | Check if nullifier is spent |
| GET | `/clawchain/privacy/v1/commitment_index/{commitment_hex}` | Commitment tree index |
| GET | `/clawchain/privacy/v1/merkle_proof/{commitment_hex}` | Merkle inclusion proof |
| GET | `/clawchain/privacy/v1/view_key/{commitment_hex}` | View key for commitment |
| POST | `/clawchain/privacy/v1/verify_amount_proof` | Verify a ZK amount proof |

### Marketplace Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/marketplace/v1/compute_resource/{id}` | Get compute resource by ID |
| GET | `/clawchain/marketplace/v1/compute_leases/{address}` | Leases for address |
| GET | `/clawchain/marketplace/v1/escrow/{escrow_id}` | Get escrow by ID |
| GET | `/clawchain/marketplace/v1/escrows/{address}` | Escrows for address |
| GET | `/clawchain/marketplace/v1/dispute/{escrow_id}` | Get dispute for escrow |
| GET | `/clawchain/marketplace/v1/provider_stats/{address}` | Provider statistics |
| GET | `/clawchain/marketplace/v1/skill/{skill_id}` | Get skill by ID |
| GET | `/clawchain/marketplace/v1/skills/category/{category}` | Skills by category |
| GET | `/clawchain/marketplace/v1/skills/owner/{owner}` | Skills by owner |
| GET | `/clawchain/marketplace/v1/skills/search/{query}` | Search skills |
| GET | `/clawchain/marketplace/v1/skills/analytics/{skill_id}` | Skill analytics |

### Model Registry Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/modelregistry/v1/model/{model_id}` | Get model by ID |
| GET | `/clawchain/modelregistry/v1/model/{model_id}/versions` | Model version history |
| GET | `/clawchain/modelregistry/v1/inference/pricing/{model_id}` | Inference pricing |
| GET | `/clawchain/modelregistry/v1/inference/job/{job_id}` | Get inference job by ID |

### Reputation Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/reputation/v1/reputation/{agent_address}` | Agent reputation score |
| GET | `/clawchain/reputation/v1/ratings/{agent_address}` | Agent ratings |
| GET | `/clawchain/reputation/v1/endorsements/{agent_address}` | Agent endorsements |

### Messaging Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/messaging/v1/messages/{address}` | Messages for address |
| GET | `/clawchain/messaging/v1/conversation/{address_a}/{address_b}` | Conversation between two addresses |

### Governance Module

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawchain/governance/v1/proposal/{proposal_id}` | Get proposal by ID |
| GET | `/clawchain/governance/v1/proposal/{proposal_id}/votes` | Votes for proposal |

### Cosmos SDK (address-parameterized)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cosmos/bank/v1beta1/balances/{address}` | All balances for address |
| GET | `/cosmos/bank/v1beta1/balances/{address}/by_denom?denom=uclaw` | Single denom balance |
| GET | `/cosmos/staking/v1beta1/validators/{validator_addr}` | Validator details |
| GET | `/cosmos/staking/v1beta1/delegations/{delegator_addr}` | Delegations for address |
| GET | `/cosmos/staking/v1beta1/validators/{validator_addr}/delegations` | Delegations to validator |
| GET | `/cosmos/staking/v1beta1/delegators/{delegator_addr}/unbonding_delegations` | Unbonding delegations |
| GET | `/cosmos/distribution/v1beta1/delegators/{delegator_addr}/rewards` | Staking rewards |
| GET | `/cosmos/distribution/v1beta1/validators/{validator_addr}/commission` | Validator commission |
| GET | `/cosmos/tx/v1beta1/txs/{hash}` | Transaction by hash |
| POST | `/cosmos/tx/v1beta1/txs` | Broadcast signed transaction |
| POST | `/cosmos/tx/v1beta1/simulate` | Simulate transaction (gas estimation) |
EOF

# ── Footer ─────────────────────────────────────────────────────────────

cat >> "$OUT_FILE" << EOF

---

## Regenerating This Document

Run the generation script against a live node:

\`\`\`bash
./scripts/gen-api-docs.sh
./scripts/gen-api-docs.sh --base-url http://custom-host:1317
\`\`\`

The script probes each endpoint, records the HTTP status and response body,
and writes this file. Endpoints that require path parameters (addresses, IDs)
are documented but not probed.

> Last generated: \`${TIMESTAMP}\`
EOF

echo -e "${GREEN}Done.${NC} Output: ${OUT_FILE}"
echo ""
echo -e "Summary:"
echo -e "  Endpoints probed:  ${#ENDPOINTS[@]}"
echo -e "  Successful (200):  ${ok_count}"
echo -e "  Errors:            ${err_count}"
echo -e "  Timeouts:          ${unreachable_count}"
echo -e "  Params captured:   ${#PARAMS_ENDPOINTS[@]} modules"
echo ""
echo -e "To regenerate: ${DIM}./scripts/gen-api-docs.sh${NC}"
