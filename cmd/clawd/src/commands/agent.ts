/**
 * `clawd agent` subcommands — register, info, tasks, rewards, heartbeat.
 *
 * Uses direct REST queries and @cosmjs signing (same pattern as wallet.ts)
 * rather than the SDK package to avoid a cross-package dependency at runtime.
 */

import { GasPrice, SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr, formatTime, truncate } from "../lib/format.js";
import { queryGatewayMethod } from "../lib/openclaw-gateway.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function ensureSigner() {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd agent register
// ---------------------------------------------------------------------------

export type AgentRegisterOptions = {
  name?: string;
  endpoint?: string;
  tools?: string;
  pricingHint?: string;
  version?: string;
};

export async function runAgentRegister(opts: AgentRegisterOptions): Promise<void> {
  const { cfg, rpcUrl, account, signingClient } = await ensureSigner();
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const name = opts.name ?? cfg.moniker ?? "clawd-agent";
  const endpoint = opts.endpoint ?? cfg.messagingEndpoint ?? `http://localhost:${cfg.messagingPort ?? 7777}`;
  const supportedTools = opts.tools
    ? opts.tools.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // Derive pubkey hex from wallet
  const pubkeyBytes = account.pubkey;
  const pubkeyHex = Buffer.from(pubkeyBytes).toString("hex");

  console.log(`Registering agent "${name}" at ${endpoint}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgRegisterAgent",
    value: {
      creator: account.address,
      pubkey: pubkeyHex,
      endpoint,
      name,
      supportedTools,
      pricingHint: opts.pricingHint ?? "",
      version: opts.version ?? "clawd/0.1.0",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Registration failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Agent registered successfully.`);
    console.log(`  Address:  ${account.address}`);
    console.log(`  Name:     ${name}`);
    console.log(`  Endpoint: ${endpoint}`);
    console.log(`  TxHash:   ${res.transactionHash}`);
  } catch (err) {
    console.error(`Registration failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd agent info
// ---------------------------------------------------------------------------

export type AgentInfoOptions = {
  address?: string;
  json?: boolean;
};

export async function runAgentInfo(opts: AgentInfoOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  const address = opts.address ?? cfg.agentAddress;

  if (!address) {
    console.error('No agent address found. Run "clawd init" first or pass --address.');
    process.exit(1);
  }

  try {
    // Agent info
    const agentRes = await fetch(
      `${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!agentRes.ok) {
      console.error(`Agent not found or not registered (HTTP ${agentRes.status}).`);
      process.exit(1);
    }
    const agent = (await agentRes.json()) as Record<string, unknown>;

    // Stats
    let stats: Record<string, unknown> = {};
    try {
      const statsRes = await fetch(
        `${restUrl}/clawchain/agent/v1/stats/${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (statsRes.ok) {
        const statsData = (await statsRes.json()) as { stats?: Record<string, unknown> };
        stats = statsData.stats ?? {};
      }
    } catch { /* ignore */ }

    // Liveness
    let liveness: Record<string, unknown> = {};
    try {
      const livenessRes = await fetch(
        `${restUrl}/clawchain/agent/v1/liveness/${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (livenessRes.ok) {
        const livenessData = (await livenessRes.json()) as { liveness?: Record<string, unknown> };
        liveness = livenessData.liveness ?? {};
      }
    } catch { /* ignore */ }

    if (opts.json) {
      process.stdout.write(JSON.stringify({ agent, stats, liveness }, null, 2) + "\n");
      return;
    }

    console.log("Agent Info");
    console.log("==========");
    console.log(`  Address:      ${address}`);
    console.log(`  Registered:   ${agent.registered ?? false}`);
    console.log(`  Name:         ${agent.name ?? "-"}`);
    console.log(`  Endpoint:     ${agent.endpoint ?? "-"}`);
    console.log(`  Pubkey:       ${shortAddr(String(agent.pubkey ?? "-"))}`);
    console.log(`  Version:      ${agent.version ?? "-"}`);

    const tools = agent.supportedTools ?? agent.supported_tools;
    if (Array.isArray(tools) && tools.length > 0) {
      console.log(`  Tools:        ${(tools as string[]).join(", ")}`);
    }

    if (agent.pricingHint ?? agent.pricing_hint) {
      console.log(`  Pricing:      ${agent.pricingHint ?? agent.pricing_hint}`);
    }

    const deposit = agent.depositAmount ?? agent.deposit_amount;
    if (deposit) {
      console.log(`  Deposit:      ${formatClaw(String(deposit))}`);
    }

    console.log();
    console.log("Stats");
    console.log("-----");
    console.log(`  Total Actions:    ${stats.totalActions ?? stats.total_actions ?? 0}`);
    console.log(`  Intents Created:  ${stats.intentsCreated ?? stats.intents_created ?? 0}`);
    console.log(`  Intents Finalized:${stats.intentsFinalized ?? stats.intents_finalized ?? 0}`);

    console.log();
    console.log("Liveness");
    console.log("--------");
    const lastHb = Number(liveness.lastHeartbeatHeight ?? liveness.last_heartbeat_height ?? 0);
    const hbCount = Number(liveness.heartbeatCount ?? liveness.heartbeat_count ?? 0);
    console.log(`  Last Heartbeat Height: ${lastHb || "-"}`);
    console.log(`  Heartbeat Count:       ${hbCount}`);
    console.log(`  Endpoint:              ${liveness.endpoint ?? "-"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query agent info: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd agent tasks
// ---------------------------------------------------------------------------

export type AgentTasksOptions = {
  address?: string;
  role?: string; // "assigned" | "delegated" | "all"
  json?: boolean;
};

export async function runAgentTasks(opts: AgentTasksOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  const address = opts.address ?? cfg.agentAddress;

  if (!address) {
    console.error('No agent address. Run "clawd init" first or pass --address.');
    process.exit(1);
  }

  const role = opts.role ?? "all";
  type TaskInfo = {
    taskId?: number; task_id?: number;
    status?: string;
    description?: string;
    delegatorAddress?: string; delegator_address?: string;
    assigneeAddress?: string; assignee_address?: string;
    budget?: string;
    skillId?: number; skill_id?: number;
    result?: string;
    createdAt?: number; created_at?: number;
    completedAt?: number; completed_at?: number;
  };
  type GatewayTaskInfo = {
    id?: string;
    description?: string;
    assignee?: string;
    delegator?: string;
    status?: string;
    createdAt?: string;
  };

  const allTasks: TaskInfo[] = [];

  try {
    const gatewayRole =
      role === "assigned" ? "assignee" : role === "delegated" ? "delegator" : undefined;
    const gatewayTasks = await queryGatewayMethod<{ tasks?: GatewayTaskInfo[] }>(
      "chain.agents.tasks",
      {
        address,
        ...(gatewayRole ? { role: gatewayRole } : {}),
      },
    );
    if (gatewayTasks?.tasks) {
      for (const task of gatewayTasks.tasks) {
        allTasks.push({
          taskId: Number.parseInt(task.id ?? "0", 10) || 0,
          status: task.status,
          delegatorAddress: task.delegator,
          assigneeAddress: task.assignee,
          description: task.description,
        });
      }
    } else {
    if (role === "assigned" || role === "all") {
      const res = await fetch(
        `${restUrl}/clawchain/agent/v1/tasks_by_assignee/${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { tasks?: TaskInfo[] };
        for (const t of data.tasks ?? []) {
          allTasks.push(t);
        }
      }
    }

    if (role === "delegated" || role === "all") {
      const res = await fetch(
        `${restUrl}/clawchain/agent/v1/tasks_by_delegator/${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { tasks?: TaskInfo[] };
        for (const t of data.tasks ?? []) {
          // Avoid duplicates when role=all
          const id = t.taskId ?? t.task_id ?? 0;
          if (!allTasks.some((x) => (x.taskId ?? x.task_id ?? 0) === id)) {
            allTasks.push(t);
          }
        }
      }
    }
    }
  } catch (err) {
    console.error(`Failed to query tasks: ${String(err)}`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ tasks: allTasks }, null, 2) + "\n");
    return;
  }

  if (allTasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  const headers = ["ID", "Status", "Delegator", "Assignee", "Budget", "Description"];
  const rows = allTasks.map((t) => [
    String(t.taskId ?? t.task_id ?? 0),
    String(t.status ?? "unknown"),
    shortAddr(String(t.delegatorAddress ?? t.delegator_address ?? "")),
    shortAddr(String(t.assigneeAddress ?? t.assignee_address ?? "")),
    t.budget ? formatClaw(t.budget) : "-",
    truncate(String(t.description ?? ""), 40),
  ]);

  console.log(`Tasks (${allTasks.length})\n`);
  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd agent rewards
// ---------------------------------------------------------------------------

export type AgentRewardsOptions = {
  address?: string;
  json?: boolean;
};

export async function runAgentRewards(opts: AgentRewardsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  const address = opts.address ?? cfg.agentAddress;

  if (!address) {
    console.error('No agent address. Run "clawd init" first or pass --address.');
    process.exit(1);
  }

  try {
    const res = await fetch(
      `${restUrl}/clawchain/agent/v1/rewards/${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(8_000) },
    );

    if (!res.ok) {
      console.error(`Failed to query rewards (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const cumulativeRewards = String(data.cumulative_rewards ?? data.cumulativeRewards ?? "0");
    const denom = String(data.denom ?? "uclaw");

    if (opts.json) {
      process.stdout.write(JSON.stringify({ address, cumulativeRewards, denom }, null, 2) + "\n");
      return;
    }

    console.log("Agent Rewards");
    console.log("=============");
    console.log(`  Address:     ${address}`);
    console.log(`  Cumulative:  ${formatClaw(cumulativeRewards)}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query rewards: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd agent heartbeat
// ---------------------------------------------------------------------------

export type AgentHeartbeatOptions = {
  endpoint?: string;
  metadata?: string;
};

export async function runAgentHeartbeat(opts: AgentHeartbeatOptions): Promise<void> {
  const { cfg, rpcUrl, account, signingClient } = await ensureSigner();

  // Get current block height
  let nodeHeight = 0;
  try {
    const statusRes = await fetch(`${rpcUrl.replace(/\/?$/, "")}/status`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (statusRes.ok) {
      const statusData = (await statusRes.json()) as {
        result?: { sync_info?: { latest_block_height?: string } };
      };
      nodeHeight = parseInt(statusData.result?.sync_info?.latest_block_height ?? "0", 10);
    }
  } catch { /* use 0 */ }

  const endpoint = opts.endpoint ?? cfg.messagingEndpoint ?? "";
  const metadata = opts.metadata ?? JSON.stringify({ version: "clawd/0.1.0" });

  console.log(`Sending heartbeat (height=${nodeHeight})...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
    value: {
      creator: account.address,
      nodeHeight: BigInt(nodeHeight),
      endpoint,
      metadata,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Heartbeat failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Heartbeat sent successfully.`);
    console.log(`  TxHash: ${res.transactionHash}`);
    console.log(`  Height: ${nodeHeight}`);
  } catch (err) {
    console.error(`Heartbeat failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
