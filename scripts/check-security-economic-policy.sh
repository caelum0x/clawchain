#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! rg -n 'ErrRateLimitExceeded' x/agent/types/errors.go >/dev/null; then
  echo "ERROR: missing anti-spam rate-limit error in x/agent/types/errors.go" >&2
  exit 1
fi

if ! rg -n 'enforceActionRateLimit\(' x/agent/keeper/msg_server_agent_action.go x/agent/keeper/msg_server_submit_intent.go x/agent/keeper/msg_server_respond_intent.go x/agent/keeper/msg_server_finalize_intent.go x/agent/keeper/msg_server_delegate_task.go x/agent/keeper/msg_server_accept_task.go x/agent/keeper/msg_server_complete_task.go >/dev/null; then
  echo "ERROR: anti-spam rate-limit hooks are not wired across agent action surfaces" >&2
  exit 1
fi

if ! rg -n 'validateTaskBudget\(' x/agent/keeper/msg_server_delegate_task.go >/dev/null; then
  echo "ERROR: task budget economic policy hook is missing in delegate task handler" >&2
  exit 1
fi

if ! rg -n 'min_task_budget_uclaw|MinTaskBudgetUclaw' proto/clawchain/agent/v1/params.proto x/agent/types/params.go x/agent/keeper/msg_server_delegate_task.go >/dev/null; then
  echo "ERROR: min task budget param wiring is missing across proto/types/keeper surfaces" >&2
  exit 1
fi

if ! rg -n 'high_impact_min_deposit_uclaw|standard_task_min_budget_uclaw|expedited_task_min_budget_uclaw|expedited_task_max_deadline_blocks' proto/clawchain/agent/v1/params.proto x/agent/types/params.go x/agent/keeper/policy.go >/dev/null; then
  echo "ERROR: stake/deposit quality-tier policy params are missing across proto/types/keeper surfaces" >&2
  exit 1
fi

if ! rg -n 'enforceHighImpactActionDeposit|validateTaskBudget\(' x/agent/keeper/msg_server_agent_action.go x/agent/keeper/msg_server_delegate_task.go >/dev/null; then
  echo "ERROR: high-impact action and task quality-tier policy hooks are not enforced in handlers" >&2
  exit 1
fi

if ! rg -n 'agent_sla_signal|task_budget_policy_applied' x/agent/keeper/msg_server_complete_task.go x/agent/keeper/msg_server_delegate_task.go >/dev/null; then
  echo "ERROR: SLA/deposit policy signal events are missing in task lifecycle handlers" >&2
  exit 1
fi

echo "security/economic policy gate passed."
