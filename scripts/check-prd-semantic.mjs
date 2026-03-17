#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const checks = [
  // Agent liveness + heartbeat (chain)
  {
    file: "x/agent/keeper/msg_server_agent_heartbeat.go",
    pattern: /func\s+\(k msgServer\)\s+AgentHeartbeat\(/,
    desc: "MsgAgentHeartbeat handler exists",
  },
  {
    file: "x/agent/types/keys.go",
    pattern: /AgentLivenessKey/,
    desc: "Agent liveness key prefix exists",
  },
  {
    file: "x/agent/keeper/query_agent_liveness.go",
    pattern: /func\s+\(q queryServer\)\s+AgentLiveness\(/,
    desc: "Agent liveness query handler exists",
  },
  {
    file: "proto/clawchain/agent/v1/query.proto",
    pattern: /rpc\s+AgentLiveness\s*\(/,
    desc: "AgentLiveness RPC exists",
  },
  {
    file: "proto/clawchain/agent/v1/query.proto",
    pattern: /rpc\s+LiveAgents\s*\(/,
    desc: "LiveAgents RPC exists",
  },

  // Economic policy params + enforcement
  {
    file: "proto/clawchain/agent/v1/params.proto",
    pattern: /max_actions_per_block/,
    desc: "max_actions_per_block param exists",
  },
  {
    file: "proto/clawchain/agent/v1/params.proto",
    pattern: /min_task_budget_uclaw/,
    desc: "min_task_budget_uclaw param exists",
  },
  {
    file: "x/agent/keeper/msg_server_agent_action.go",
    pattern: /enforceActionRateLimit/,
    desc: "agent action rate-limit enforcement exists",
  },
  {
    file: "x/agent/keeper/msg_server_delegate_task.go",
    pattern: /validateTaskBudget/,
    desc: "task budget policy enforcement exists",
  },
  {
    file: "x/agent/keeper/msg_server_delegate_task.go",
    pattern: /task_budget_policy_applied/,
    desc: "task budget policy event emission exists",
  },

  // SDK surfaces for agent policy/liveness
  {
    file: "sdk/src/client.ts",
    pattern: /async\s+agentHeartbeat\s*\(/,
    desc: "SDK agentHeartbeat exists",
  },
  {
    file: "sdk/src/client.ts",
    pattern: /async\s+getAgentLiveness\s*\(/,
    desc: "SDK getAgentLiveness exists",
  },
  {
    file: "sdk/src/client.ts",
    pattern: /async\s+getLiveAgents\s*\(/,
    desc: "SDK getLiveAgents exists",
  },
  {
    file: "sdk/src/client.ts",
    pattern: /maxActionsPerBlock:\s*asNum\(/,
    desc: "SDK maps maxActionsPerBlock param",
  },
  {
    file: "sdk/src/client.ts",
    pattern: /minTaskBudgetUclaw:\s*asNum\(/,
    desc: "SDK maps minTaskBudgetUclaw param",
  },

  // Runtime delegation + operator surface
  {
    file: "openclaw/src/cli/up-cli.ts",
    pattern: /delegates to clawd up/i,
    desc: "openclaw up delegates to clawd up",
  },
  {
    file: "openclaw/src/cli/up-cli.ts",
    pattern: /return\s+\{\s*bin:\s*"clawd",\s*args:\s*\["up"/,
    desc: "openclaw up fallback invokes clawd up",
  },
  {
    file: "cmd/clawd/src/commands/agent-flow.ts",
    pattern: /node appears stalled at height/,
    desc: "agent-flow detects stalled chain",
  },
  {
    file: "cmd/clawd/src/commands/product-flow.ts",
    pattern: /node appears stalled at height/,
    desc: "product-flow detects stalled chain",
  },

  // Build/gate wiring
  {
    file: "Makefile",
    pattern: /^protocol-sanity:/m,
    desc: "protocol-sanity target exists",
  },
  {
    file: "Makefile",
    pattern: /node scripts\/check-prd-claims\.mjs/,
    desc: "protocol-sanity includes PRD claim checker",
  },
  {
    file: "Makefile",
    pattern: /^product-flow-gate:/m,
    desc: "product-flow-gate target exists",
  },
];

const failures = [];
for (const check of checks) {
  const absolute = path.join(repoRoot, check.file);
  if (!fs.existsSync(absolute)) {
    failures.push(`[missing file] ${check.file} :: ${check.desc}`);
    continue;
  }
  const content = fs.readFileSync(absolute, "utf8");
  if (!check.pattern.test(content)) {
    failures.push(`[missing semantic] ${check.file} :: ${check.desc}`);
  }
}

if (failures.length > 0) {
  console.error("PRD semantic check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`PRD semantic check passed (${checks.length} assertions).`);
