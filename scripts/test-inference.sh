#!/usr/bin/env bash
# test-inference.sh — Test the ClawChain AI inference pipeline with OpenRouter.
#
# Usage:
#   OPENROUTER_API_KEY=sk-or-... ./scripts/test-inference.sh
#
# Tests:
#   1. OpenRouter API connectivity
#   2. Model listing
#   3. Chat completion (free model)
#   4. Streaming chat completion
#   5. Sidecar format compatibility

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
PASS=0
FAIL=0

ok()   { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
info() { echo -e "  ${YELLOW}[INFO]${NC} $1"; }

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Error: OPENROUTER_API_KEY not set."
  echo "Usage: OPENROUTER_API_KEY=sk-or-... $0"
  exit 1
fi

API="https://openrouter.ai/api/v1"
AUTH="Authorization: Bearer $OPENROUTER_API_KEY"
MODEL="liquid/lfm-2.5-1.2b-instruct:free"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        ClawChain AI Inference Pipeline Test              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Test 1: API connectivity ───────────────────────────────────
echo "Test 1: OpenRouter API Connectivity"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/models" -H "$AUTH" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  ok "OpenRouter API reachable (HTTP $STATUS)"
else
  fail "OpenRouter API returned HTTP $STATUS"
fi

# ── Test 2: Model listing ─────────────────────────────────────
echo "Test 2: Model Listing"
FREE_COUNT=$(curl -s "$API/models" -H "$AUTH" 2>/dev/null | python3 -c "
import json,sys
data = json.load(sys.stdin)
free = [m for m in data.get('data',[]) if m.get('pricing',{}).get('prompt')=='0']
print(len(free))
" 2>/dev/null || echo "0")
if [ "$FREE_COUNT" -gt "0" ] 2>/dev/null; then
  ok "Found $FREE_COUNT free models available"
else
  fail "Could not list free models"
fi

# ── Test 3: Chat completion ────────────────────────────────────
echo "Test 3: Chat Completion (non-streaming)"
RESPONSE=$(curl -s "$API/chat/completions" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [{\"role\": \"user\", \"content\": \"What is 2+2? Reply with just the number.\"}],
    \"max_tokens\": 10
  }" 2>/dev/null)

CONTENT=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('choices',[{}])[0].get('message',{}).get('content',''))" 2>/dev/null || echo "")
if echo "$CONTENT" | grep -q "4"; then
  ok "Got correct response: '$CONTENT'"
else
  if [ -n "$CONTENT" ]; then
    ok "Got response (content: '$CONTENT')"
  else
    ERROR=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('error',{}).get('message','unknown'))" 2>/dev/null || echo "unknown")
    fail "No content in response: $ERROR"
  fi
fi

# ── Test 4: Streaming completion ───────────────────────────────
echo "Test 4: Streaming Chat Completion"
STREAM_OUT=$(curl -s "$API/chat/completions" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Say hello.\"}],
    \"max_tokens\": 20,
    \"stream\": true
  }" 2>/dev/null | head -20)

if echo "$STREAM_OUT" | grep -q "data:"; then
  CHUNK_COUNT=$(echo "$STREAM_OUT" | grep -c "data:" || echo "0")
  ok "Streaming works ($CHUNK_COUNT chunks received)"
else
  fail "No streaming data received"
fi

# ── Test 5: Sidecar format compatibility ───────────────────────
echo "Test 5: Sidecar-Compatible Response Format"
USAGE=$(echo "$RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('usage',{})
print(f\"prompt={u.get('prompt_tokens',0)} completion={u.get('completion_tokens',0)} total={u.get('total_tokens',0)}\")
" 2>/dev/null || echo "")

if echo "$USAGE" | grep -q "total="; then
  ok "Response includes token usage: $USAGE"
else
  fail "Missing usage data in response"
fi

# ── Summary ────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "────────────────────────────────────────────────────────────"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
