/**
 * `clawd inventory` — unified provider inventory view.
 *
 * Aggregates all provider surfaces (skills, GPU, models, tasks) into a single
 * dashboard view showing counts, earnings, and status across every revenue
 * channel.
 */

import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { formatClaw } from "../lib/format.js";

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

/**
 * Safe REST fetch that returns null on any error instead of throwing.
 */
async function safeFetch(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InventoryOptions = {
  json?: boolean;
};

export type InventorySummary = {
  address: string;
  skills: { count: number; totalRevenue: string };
  gpu: { registered: boolean; activeLeases: number; totalEarnings: string };
  models: { count: number; totalAccess: number };
  tasks: { completed: number; pending: number; totalBudget: string };
  totalEarningsUclaw: string;
};

// ---------------------------------------------------------------------------
// clawd inventory
// ---------------------------------------------------------------------------

export async function runInventory(opts: InventoryOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  if (!mnemonicFileExists()) {
    console.error('No mnemonic found. Run "clawd init" first.');
    process.exit(1);
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    console.error("Failed to load mnemonic.");
    process.exit(1);
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    console.error("Failed to derive wallet account.");
    process.exit(1);
  }

  const address = account.address;

  // Fetch all provider surfaces in parallel
  const [skillsData, gpuData, modelsData, tasksData] = await Promise.all([
    safeFetch(`${restUrl}/clawchain/marketplace/v1/skills_by_owner/${encodeURIComponent(address)}`),
    safeFetch(`${restUrl}/clawchain/marketplace/v1/gpu_providers/${encodeURIComponent(address)}`),
    safeFetch(`${restUrl}/clawchain/modelregistry/v1/models?owner=${encodeURIComponent(address)}`),
    safeFetch(`${restUrl}/clawchain/agent/v1/tasks/assignee/${encodeURIComponent(address)}`),
  ]);

  // --- Skills ---
  const skills = skillsData?.skills ?? [];
  let skillRevenue = 0n;
  for (const s of skills) {
    const purchases = Number(s.purchaseCount ?? s.purchase_count ?? 0);
    const price = BigInt(s.price ?? "0");
    skillRevenue += price * BigInt(purchases);
  }

  // --- GPU ---
  const gpuProvider = gpuData?.provider ?? null;
  const gpuRegistered = !!gpuProvider;
  const activeLeases = Number(gpuProvider?.active_leases ?? 0);
  // Try to get completed job earnings
  let gpuEarnings = 0n;
  try {
    const jobsData = await safeFetch(
      `${restUrl}/clawchain/marketplace/v1/compute/jobs?address=${encodeURIComponent(address)}&status=completed`,
    );
    const jobs = jobsData?.jobs ?? [];
    for (const j of jobs) {
      gpuEarnings += BigInt(j.earnings ?? j.total_cost ?? "0");
    }
  } catch {
    // Best-effort
  }

  // --- Models ---
  const models = modelsData?.models ?? [];
  let totalAccess = 0;
  for (const m of models) {
    totalAccess += Number(m.access_count ?? m.total_queries ?? 0);
  }

  // --- Tasks ---
  const tasks = tasksData?.tasks ?? [];
  let completedTasks = 0;
  let pendingTasks = 0;
  let taskBudget = 0n;
  for (const t of tasks) {
    const status = String(t.status ?? "").toLowerCase();
    if (status === "completed" || status === "done") {
      completedTasks++;
    } else {
      pendingTasks++;
    }
    taskBudget += BigInt(t.budget ?? t.reward ?? "0");
  }

  const totalEarnings = skillRevenue + gpuEarnings + taskBudget;

  const summary: InventorySummary = {
    address,
    skills: { count: skills.length, totalRevenue: skillRevenue.toString() },
    gpu: { registered: gpuRegistered, activeLeases, totalEarnings: gpuEarnings.toString() },
    models: { count: models.length, totalAccess },
    tasks: { completed: completedTasks, pending: pendingTasks, totalBudget: taskBudget.toString() },
    totalEarningsUclaw: totalEarnings.toString(),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    return;
  }

  console.log(`Provider Inventory\n`);
  console.log(`  Address: ${address}`);
  console.log();

  // Skills
  console.log(`  Skills Marketplace`);
  console.log(`    Listed Skills:   ${skills.length}`);
  console.log(`    Total Revenue:   ${formatClaw(skillRevenue.toString())}`);
  console.log();

  // GPU
  console.log(`  GPU Compute`);
  console.log(`    Registered:      ${gpuRegistered ? "Yes" : "No"}`);
  console.log(`    Active Leases:   ${activeLeases}`);
  console.log(`    Total Earnings:  ${formatClaw(gpuEarnings.toString())}`);
  console.log();

  // Models
  console.log(`  Model Registry`);
  console.log(`    Hosted Models:   ${models.length}`);
  console.log(`    Total Accesses:  ${totalAccess}`);
  console.log();

  // Tasks
  console.log(`  Agent Tasks`);
  console.log(`    Completed:       ${completedTasks}`);
  console.log(`    Pending:         ${pendingTasks}`);
  console.log(`    Total Budget:    ${formatClaw(taskBudget.toString())}`);
  console.log();

  // Total
  console.log(`  Total Earnings:    ${formatClaw(totalEarnings.toString())}`);
  console.log();
}
