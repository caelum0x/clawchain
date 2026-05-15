/**
 * `clawd earnings` — consolidated earnings overview across all revenue streams.
 *
 * Fetches agent mining rewards, task income, staking rewards, skill sales,
 * and current balance in parallel, then renders a summary table or JSON.
 */

import { loadClawdConfig } from "../lib/config.js";
import { formatClaw, shortAddr, table } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EarningsOptions = { json?: boolean; period?: string };

export type EarningsSummary = {
  address: string;
  period: string;
  streams: {
    agentMining: { cumulative: string; denom: string };
    taskIncome: { completed: number; totalBudget: string; denom: string };
    stakingRewards: { pending: string; denom: string };
    skillSales: { totalRevenue: string; purchaseCount: number };
  };
  totalEstimatedUclaw: string;
  balance: string;
};

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

const TIMEOUT = 8_000;

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Return a cutoff timestamp (in seconds) for the given period string.
 * Supported: "7d", "30d", "all". Defaults to "all" (cutoff = 0).
 */
function periodCutoffSeconds(period: string): number {
  const nowSec = Math.floor(Date.now() / 1000);
  if (period === "7d") return nowSec - 7 * 86400;
  if (period === "30d") return nowSec - 30 * 86400;
  return 0; // "all"
}

// ---------------------------------------------------------------------------
// REST response types
// ---------------------------------------------------------------------------

interface AgentRewardsResponse {
  cumulative_rewards?: string;
  cumulativeRewards?: string;
  denom?: string;
}

interface TaskInfo {
  taskId?: number;
  task_id?: number;
  status?: string;
  budget?: string;
  completedAt?: number;
  completed_at?: number;
}

interface TasksByAssigneeResponse {
  tasks?: TaskInfo[];
}

interface StakingRewardsResponse {
  total?: Array<{ denom?: string; amount?: string }>;
}

interface BalancesResponse {
  balances?: Array<{ denom?: string; amount?: string }>;
}

interface SkillAnalyticsResponse {
  total_revenue?: string;
  totalRevenue?: string;
  purchase_count?: number;
  purchaseCount?: number;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function gatherEarnings(
  restUrl: string,
  address: string,
  period: string,
): Promise<EarningsSummary> {
  const cutoff = periodCutoffSeconds(period);

  // Fetch all streams in parallel
  const [agentRewards, assignedTasks, stakingRewards, balances] =
    await Promise.all([
      fetchJSON<AgentRewardsResponse>(
        `${restUrl}/clawchain/agent/v1/rewards/${encodeURIComponent(address)}`,
      ),
      fetchJSON<TasksByAssigneeResponse>(
        `${restUrl}/clawchain/agent/v1/tasks/assignee/${encodeURIComponent(address)}`,
      ),
      fetchJSON<StakingRewardsResponse>(
        `${restUrl}/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(address)}/rewards`,
      ),
      fetchJSON<BalancesResponse>(
        `${restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`,
      ),
    ]);

  // -- Agent mining --
  const agentCumulative = String(
    agentRewards?.cumulative_rewards ?? agentRewards?.cumulativeRewards ?? "0",
  );
  const agentDenom = String(agentRewards?.denom ?? "uclaw");

  // -- Task income --
  const allTasks = assignedTasks?.tasks ?? [];
  const completedTasks = allTasks.filter((t) => {
    if (t.status !== "completed") return false;
    const completedAt = t.completedAt ?? t.completed_at ?? 0;
    return completedAt >= cutoff;
  });
  const totalBudget = completedTasks.reduce((sum, t) => {
    return sum + BigInt(t.budget ?? "0");
  }, 0n);

  // -- Staking rewards --
  const stakingTotal = stakingRewards?.total ?? [];
  const stakingClaw = stakingTotal.find((c) => c.denom === "uclaw");
  const stakingPending = stakingClaw?.amount
    ? stakingClaw.amount.split(".")[0]
    : "0";

  // -- Skill sales (no config-based skill IDs for now, default to 0) --
  const skillTotalRevenue = "0";
  const skillPurchaseCount = 0;

  // -- Balance --
  const balanceList = balances?.balances ?? [];
  const clawBalance = balanceList.find((b) => b.denom === "uclaw");
  const balance = clawBalance?.amount ?? "0";

  // -- Total estimated uclaw --
  const totalEstimated =
    BigInt(agentCumulative) +
    totalBudget +
    BigInt(stakingPending) +
    BigInt(skillTotalRevenue);

  return {
    address,
    period,
    streams: {
      agentMining: { cumulative: agentCumulative, denom: agentDenom },
      taskIncome: {
        completed: completedTasks.length,
        totalBudget: totalBudget.toString(),
        denom: "uclaw",
      },
      stakingRewards: { pending: stakingPending, denom: "uclaw" },
      skillSales: {
        totalRevenue: skillTotalRevenue,
        purchaseCount: skillPurchaseCount,
      },
    },
    totalEstimatedUclaw: totalEstimated.toString(),
    balance,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderEarnings(summary: EarningsSummary): string {
  const lines: string[] = [];

  lines.push("Earnings Summary");
  lines.push("=================");
  lines.push(`  Address : ${shortAddr(summary.address)}`);
  lines.push(`  Period  : ${summary.period}`);
  lines.push("");

  const headers = ["Stream", "Amount", "Detail"];
  const rows: string[][] = [
    [
      "Agent Mining",
      formatClaw(summary.streams.agentMining.cumulative),
      "cumulative rewards",
    ],
    [
      "Task Income",
      formatClaw(summary.streams.taskIncome.totalBudget),
      `${summary.streams.taskIncome.completed} completed task(s)`,
    ],
    [
      "Staking Rewards",
      formatClaw(summary.streams.stakingRewards.pending),
      "pending (unclaimed)",
    ],
    [
      "Skill Sales",
      formatClaw(summary.streams.skillSales.totalRevenue),
      `${summary.streams.skillSales.purchaseCount} purchase(s)`,
    ],
  ];

  lines.push(table(headers, rows));
  lines.push("");
  lines.push(`  Total Estimated : ${formatClaw(summary.totalEstimatedUclaw)}`);
  lines.push(`  Current Balance : ${formatClaw(summary.balance)}`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runEarnings(opts: EarningsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  const address = cfg.agentAddress;

  if (!address) {
    console.error('No agent address found. Run "clawd init" first.');
    process.exit(1);
  }

  const period = opts.period ?? "all";

  try {
    const summary = await gatherEarnings(restUrl, address, period);

    if (opts.json) {
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
      return;
    }

    console.log(renderEarnings(summary));
  } catch (err) {
    console.error(`Failed to gather earnings: ${String(err)}`);
    process.exit(1);
  }
}
