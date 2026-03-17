#!/usr/bin/env bash
set -euo pipefail

# Guardrail: OpenClaw ClawChain extension should consume SDK-generated contract
# constants, not hard-coded chain type URLs or REST paths.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(
  "openclaw/extensions/clawchain/index.ts"
  "openclaw/extensions/clawchain/src"
  "openclaw/src/gateway/server-methods/chain-status.ts"
)

TYPE_URL_PATTERN='\/clawchain\.(agent|privacy|marketplace|messaging|reputation)\.v1\.Msg[A-Za-z0-9_]+'
REST_PATH_PATTERN='\/clawchain\/(agent|privacy|marketplace|messaging|reputation)\/v1'

if rg -n "$TYPE_URL_PATTERN" "${TARGETS[@]}"; then
  echo "ERROR: hard-coded ClawChain Msg type URLs detected in OpenClaw extension."
  echo "Use @clawchain/sdk exported constants from sdk/src/constants.ts instead."
  exit 1
fi

if rg -n "$REST_PATH_PATTERN" "${TARGETS[@]}"; then
  echo "ERROR: hard-coded ClawChain REST paths detected in OpenClaw extension."
  echo "Use @clawchain/sdk exported REST constants from sdk/src/constants.ts instead."
  exit 1
fi

if ! rg -n 'name:\s*"clawchain_agent_capabilities"' openclaw/extensions/clawchain/src/tools.ts >/dev/null; then
  echo "ERROR: clawchain_agent_capabilities tool is missing."
  exit 1
fi

if ! rg -n 'supportedTools\?: string\[\];|pricingHint\?: string;|version\?: string;' sdk/src/types.ts >/dev/null; then
  echo "ERROR: SDK capability publish/query fields are missing in sdk/src/types.ts."
  exit 1
fi

if ! rg -n 'uptimeScoreBps|heartbeatSlaPenalties|heartbeatSlaRecoveries' sdk/src/types.ts >/dev/null; then
  echo "ERROR: SDK reputation uptime signal fields are missing in sdk/src/types.ts."
  exit 1
fi

# Task delegation surface guardrails
if ! rg -n 'export function createTaskTools' openclaw/extensions/clawchain/src/task-tools.ts >/dev/null; then
  echo "ERROR: OpenClaw task tools suite is missing."
  exit 1
fi

for tool_name in \
  clawchain_delegate_task \
  clawchain_accept_task \
  clawchain_complete_task \
  clawchain_task \
  clawchain_tasks_by_delegator \
  clawchain_tasks_by_assignee
do
  if ! rg -n "name:\\s*\"${tool_name}\"" openclaw/extensions/clawchain/src/task-tools.ts >/dev/null; then
    echo "ERROR: OpenClaw task tool '${tool_name}' is missing."
    exit 1
  fi
done

if ! rg -n 'delegateTask\(|acceptTask\(|completeTask\(|getTask\(|getTasksByDelegator\(|getTasksByAssignee\(' sdk/src/client.ts >/dev/null; then
  echo "ERROR: SDK task delegation/query client methods are missing."
  exit 1
fi

if ! rg -n 'REST_TASK|REST_TASKS_BY_DELEGATOR|REST_TASKS_BY_ASSIGNEE' sdk/src/constants.ts >/dev/null; then
  echo "ERROR: SDK task REST constants are missing."
  exit 1
fi

# Runtime readiness contract guardrails
if ! rg -n 'readiness:\s*RuntimeReadinessSchema' openclaw/src/gateway/protocol/schema/chain.ts >/dev/null; then
  echo "ERROR: runtime.status readiness schema is missing."
  exit 1
fi

if ! rg -n 'readiness:\s*\{' openclaw/extensions/clawchain/index.ts >/dev/null; then
  echo "ERROR: runtime.status readiness payload is missing in clawchain extension."
  exit 1
fi

# clawd readiness CLI guardrails
if ! rg -n 'command\("readiness"\)' cmd/clawd/src/main.ts >/dev/null; then
  echo "ERROR: clawd readiness command is missing."
  exit 1
fi

if ! rg -n 'option\("--json",' cmd/clawd/src/main.ts >/dev/null; then
  echo "ERROR: clawd readiness --json flag is missing."
  exit 1
fi

if ! rg -n 'ok:\s*report\.ready|blockers:\s*report\.blockers' cmd/clawd/src/commands/readiness.ts >/dev/null; then
  echo "ERROR: clawd readiness JSON payload contract is missing required keys."
  exit 1
fi

# Cross-module OpenClaw queryability/tool-coverage guardrails (DoD).
if ! rg -n 'name:\s*"clawchain_shield"|name:\s*"clawchain_private_transfer"|name:\s*"clawchain_unshield"' openclaw/extensions/clawchain/src/tools.ts >/dev/null; then
  echo "ERROR: privacy module tool coverage is incomplete."
  exit 1
fi

if ! rg -n 'name:\s*"clawchain_agent_info"|name:\s*"clawchain_agent_capabilities"|name:\s*"clawchain_agent_liveness"' openclaw/extensions/clawchain/src/tools.ts openclaw/extensions/clawchain/src/activity-tools.ts >/dev/null; then
  echo "ERROR: agent module tool coverage is incomplete."
  exit 1
fi

if ! rg -n 'name:\s*"clawchain_send_message"|name:\s*"clawchain_inbox"|name:\s*"clawchain_mark_read"' openclaw/extensions/clawchain/src/messaging-tools.ts >/dev/null; then
  echo "ERROR: messaging module tool coverage is incomplete."
  exit 1
fi

if ! rg -n 'name:\s*"clawchain_list_skill"|name:\s*"clawchain_browse_skills"|name:\s*"clawchain_query_escrow"' openclaw/extensions/clawchain/src/marketplace-tools.ts openclaw/extensions/clawchain/src/escrow-tools.ts >/dev/null; then
  echo "ERROR: marketplace module tool coverage is incomplete."
  exit 1
fi

if ! rg -n 'name:\s*"clawchain_agent_reputation"|name:\s*"clawchain_top_agents"' openclaw/extensions/clawchain/src/reputation-tools.ts >/dev/null; then
  echo "ERROR: reputation module tool coverage is incomplete."
  exit 1
fi

echo "OpenClaw contract literal guard passed."
