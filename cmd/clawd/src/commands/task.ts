/**
 * `clawd task` subcommands — delegate, status, accept, complete.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { formatClaw, shortAddr, formatTime } from "../lib/format.js";

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
// clawd task delegate
// ---------------------------------------------------------------------------

export type TaskDelegateOptions = {
  assignee: string;
  description: string;
  requirements?: string;
  skillId?: number;
  budget?: string;
  deadlineBlocks?: number;
};

export async function runTaskDelegate(opts: TaskDelegateOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Delegating task to ${shortAddr(opts.assignee)}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgDelegateTask",
    value: {
      creator: account.address,
      assignee: opts.assignee,
      description: opts.description,
      requirements: opts.requirements ?? "",
      skillId: BigInt(opts.skillId ?? 0),
      budget: opts.budget ?? "",
      deadlineBlocks: BigInt(opts.deadlineBlocks ?? 0),
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Task delegation failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract task_id from events
    let taskId = "unknown";
    for (const event of res.events ?? []) {
      if (event.type === "delegate_task" || event.type === "task_delegated") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "task_id",
        );
        if (attr) {
          taskId = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`Task delegated successfully.`);
    console.log(`  Task ID:     ${taskId}`);
    console.log(`  Assignee:    ${opts.assignee}`);
    console.log(`  Description: ${opts.description}`);
    if (opts.budget) console.log(`  Budget:      ${formatClaw(opts.budget)}`);
    console.log(`  TxHash:      ${res.transactionHash}`);
  } catch (err) {
    console.error(`Task delegation failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd task status
// ---------------------------------------------------------------------------

export type TaskStatusOptions = {
  taskId: number;
  json?: boolean;
};

export async function runTaskStatus(opts: TaskStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  try {
    const res = await fetch(
      `${restUrl}/clawchain/agent/v1/task/${opts.taskId}`,
      { signal: AbortSignal.timeout(8_000) },
    );

    if (!res.ok) {
      console.error(`Task #${opts.taskId} not found (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as Record<string, unknown>;

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    console.log(`Task #${opts.taskId}`);
    console.log("=".repeat(40));
    console.log(`  Status:       ${data.status ?? "unknown"}`);
    console.log(`  Delegator:    ${data.delegatorAddress ?? data.delegator_address ?? "-"}`);
    console.log(`  Assignee:     ${data.assigneeAddress ?? data.assignee_address ?? "-"}`);
    console.log(`  Description:  ${data.description ?? "-"}`);
    console.log(`  Requirements: ${data.requirements ?? "-"}`);
    console.log(`  Skill ID:     ${data.skillId ?? data.skill_id ?? 0}`);
    const budget = String(data.budget ?? "0");
    console.log(`  Budget:       ${budget !== "0" ? formatClaw(budget) : "-"}`);
    console.log(`  Deadline:     ${data.deadlineBlocks ?? data.deadline_blocks ?? 0} blocks`);
    const created = Number(data.createdAt ?? data.created_at ?? 0);
    const completed = Number(data.completedAt ?? data.completed_at ?? 0);
    console.log(`  Created At:   ${formatTime(created)}`);
    console.log(`  Completed At: ${formatTime(completed)}`);
    if (data.result) {
      console.log(`  Result:       ${data.result}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query task: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd task accept
// ---------------------------------------------------------------------------

export type TaskAcceptOptions = {
  taskId: number;
};

export async function runTaskAccept(opts: TaskAcceptOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Accepting task #${opts.taskId}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgAcceptTask",
    value: {
      creator: account.address,
      taskId: BigInt(opts.taskId),
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Accept failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Task #${opts.taskId} accepted.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Accept failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd task complete
// ---------------------------------------------------------------------------

export type TaskCompleteOptions = {
  taskId: number;
  result: string;
};

export async function runTaskComplete(opts: TaskCompleteOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Completing task #${opts.taskId}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgCompleteTask",
    value: {
      creator: account.address,
      taskId: BigInt(opts.taskId),
      result: opts.result,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Complete failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Task #${opts.taskId} completed.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Complete failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
