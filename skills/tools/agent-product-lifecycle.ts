/**
 * agent-product-lifecycle tool -- strict end-to-end product flow.
 *
 * Flow stages:
 *   1) register
 *   2) heartbeat
 *   3) delegate task
 *   4) send on-chain message
 *   5) purchase marketplace skill
 *   6) create escrow
 *   7) rate seller
 *   8) endorse seller
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import type { SkillInfo, TxResult } from "../../sdk/src/types.js";
import { RPC_URL, AGENT_ENDPOINT, AGENT_NAME, signingClientOptions } from "./config.js";

type ProductFlowStage =
  | "validate"
  | "connect"
  | "register"
  | "heartbeat"
  | "delegate"
  | "message"
  | "purchase"
  | "escrow"
  | "rate"
  | "endorse"
  | "verify";

export interface AgentProductLifecycleParams {
  assignee: string;
  taskDescription: string;
  messageRecipient?: string;
  messageCiphertext: string;
  messageNonce?: string;
  skillId: number;
  escrowDescription?: string;
  deadlineBlocks?: number;
  milestones?: number;
  ratingScore?: number;
  ratingComment?: string;
  endorsementReason?: string;
  heartbeatEndpoint?: string;
  heartbeatMetadata?: string;
  agentName?: string;
  pubkey?: string;
}

export interface AgentProductLifecycleResult {
  success: boolean;
  stage?: ProductFlowStage;
  error?: string;
  recoveryHint?: string;
  fromAddress?: string;
  assignee?: string;
  seller?: string;
  alreadyRegistered?: boolean;
  registerTxHash?: string;
  heartbeatTxHash?: string;
  delegateTxHash?: string;
  messageTxHash?: string;
  purchaseTxHash?: string;
  escrowTxHash?: string;
  rateTxHash?: string;
  endorseTxHash?: string;
  taskId?: number;
  escrowId?: number;
}

export default async function agentProductLifecycle(
  params: AgentProductLifecycleParams,
): Promise<AgentProductLifecycleResult> {
  if (!params.assignee) {
    return fail("validate", "assignee is required");
  }
  if (!params.taskDescription) {
    return fail("validate", "taskDescription is required");
  }
  if (!params.messageCiphertext) {
    return fail("validate", "messageCiphertext is required");
  }
  if (params.skillId == null || params.skillId < 0) {
    return fail("validate", "skillId must be a non-negative integer");
  }

  const client = new ClawChainClient(signingClientOptions());
  const out: AgentProductLifecycleResult = {
    success: false,
    assignee: params.assignee,
  };

  try {
    await client.connect();
  } catch (err: unknown) {
    return fail("connect", asError(err), out);
  }

  try {
    const fromAddress = client.getAddress();
    out.fromAddress = fromAddress;

    const skill = await loadSkill(client, params.skillId);
    if (!skill) {
      return fail("validate", `skill ${params.skillId} not found`, out);
    }
    const seller = skill.owner;
    out.seller = seller;

    const alreadyRegistered = await isRegistered(client, fromAddress);
    out.alreadyRegistered = alreadyRegistered;
    if (!alreadyRegistered) {
      const registerTx = await runTxWithRetry("register-agent", () =>
        client.registerAgent({
          pubkey: params.pubkey ?? fromAddress,
          endpoint: params.heartbeatEndpoint ?? AGENT_ENDPOINT ?? "",
          name: params.agentName ?? AGENT_NAME ?? "openclaw-agent",
        }),
      );
      out.registerTxHash = registerTx.transactionHash;
      if (!isTxSuccess(registerTx)) {
        return fail("register", formatTxFailure("register-agent", registerTx), out);
      }
    }

    const nodeHeight = await getNodeHeight();
    const heartbeatTx = await runTxWithRetry("agent-heartbeat", () =>
      client.agentHeartbeat({
        nodeHeight,
        endpoint: params.heartbeatEndpoint ?? AGENT_ENDPOINT ?? "",
        metadata: params.heartbeatMetadata ?? "",
      }),
    );
    out.heartbeatTxHash = heartbeatTx.transactionHash;
    if (!isTxSuccess(heartbeatTx)) {
      return fail("heartbeat", formatTxFailure("agent-heartbeat", heartbeatTx), out);
    }

    const delegateTx = await runTxWithRetry("delegate-task", () =>
      client.delegateTask({
        assignee: params.assignee,
        description: params.taskDescription,
      }),
    );
    out.delegateTxHash = delegateTx.transactionHash;
    if (!isTxSuccess(delegateTx)) {
      return fail("delegate", formatTxFailure("delegate-task", delegateTx), out);
    }
    out.taskId = extractNumericAttr(delegateTx, ["task_id", "taskId"]);

    const messageTx = await runTxWithRetry("send-onchain-message", () =>
      client.sendOnChainMessage({
        recipient: params.messageRecipient ?? params.assignee,
        ciphertext: params.messageCiphertext,
        nonce: params.messageNonce ?? `nonce-${Date.now()}`,
      }),
    );
    out.messageTxHash = messageTx.transactionHash;
    if (!isTxSuccess(messageTx)) {
      return fail("message", formatTxFailure("send-onchain-message", messageTx), out);
    }

    const purchaseTx = await runTxWithRetry("purchase-skill", () =>
      client.purchaseSkill({ skillId: params.skillId }),
    );
    out.purchaseTxHash = purchaseTx.transactionHash;
    if (!isTxSuccess(purchaseTx)) {
      return fail("purchase", formatTxFailure("purchase-skill", purchaseTx), out);
    }

    const escrowTx = await runTxWithRetry("create-escrow", () =>
      client.createEscrow({
        skillId: params.skillId,
        description: params.escrowDescription ?? params.taskDescription,
        deadlineBlocks: params.deadlineBlocks ?? 100,
        milestones: params.milestones ?? 1,
      }),
    );
    out.escrowTxHash = escrowTx.transactionHash;
    if (!isTxSuccess(escrowTx)) {
      return fail("escrow", formatTxFailure("create-escrow", escrowTx), out);
    }
    out.escrowId = extractNumericAttr(escrowTx, ["escrow_id", "escrowId"]);

    const rateTx = await runTxWithRetry("rate-agent", () =>
      client.rateAgent({
        agentAddress: seller,
        skillId: params.skillId,
        score: params.ratingScore ?? 5,
        comment: params.ratingComment ?? "completed flow purchase",
      }),
    );
    out.rateTxHash = rateTx.transactionHash;
    if (!isTxSuccess(rateTx)) {
      return fail("rate", formatTxFailure("rate-agent", rateTx), out);
    }

    const endorseTx = await runTxWithRetry("endorse-agent", () =>
      client.endorseAgent({
        agentAddress: seller,
        reason: params.endorsementReason ?? "successful marketplace delivery flow",
      }),
    );
    out.endorseTxHash = endorseTx.transactionHash;
    if (!isTxSuccess(endorseTx)) {
      return fail("endorse", formatTxFailure("endorse-agent", endorseTx), out);
    }

    if (out.taskId != null) {
      const taskOk = await waitForTaskFound(client, out.taskId);
      if (!taskOk) {
        return fail("verify", `task ${out.taskId} not queryable after delegation`, out);
      }
    }
    if (out.escrowId != null) {
      const escrowOk = await waitForEscrowFound(client, out.escrowId);
      if (!escrowOk) {
        return fail("verify", `escrow ${out.escrowId} not queryable after creation`, out);
      }
    }

    return { ...out, success: true };
  } catch (err: unknown) {
    return fail("verify", asError(err), out);
  } finally {
    await client.disconnect().catch(() => {});
  }
}

function fail(
  stage: ProductFlowStage,
  error: string,
  base: Partial<AgentProductLifecycleResult> = {},
): AgentProductLifecycleResult {
  return {
    success: false,
    stage,
    error,
    recoveryHint: stageRecoveryHint(stage),
    ...base,
  };
}

function stageRecoveryHint(stage: ProductFlowStage): string {
  switch (stage) {
    case "connect":
      return `Check RPC endpoint (${RPC_URL}) and signer mnemonic configuration.`;
    case "register":
      return "Ensure pubkey/endpoint are set and retry registration.";
    case "heartbeat":
      return "Ensure node /status is reachable and send heartbeat again.";
    case "delegate":
      return "Verify assignee is a registered active agent and retry.";
    case "message":
      return "Check recipient address and nonce uniqueness; retry send.";
    case "purchase":
      return "Ensure skill is active and account has enough balance for purchase.";
    case "escrow":
      return "Verify deadlineBlocks > 0, milestones > 0, and locked funds are available.";
    case "rate":
      return "Ensure purchase succeeded and score is between 1 and 5.";
    case "endorse":
      return "Ensure endorser is a registered agent and reason is non-empty.";
    case "verify":
      return "Wait for block finality and retry query verification.";
    default:
      return "Check inputs and retry.";
  }
}

function asError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isTxSuccess(tx: TxResult): boolean {
  return Number(tx.code) === 0;
}

function formatTxFailure(label: string, tx: TxResult): string {
  return `${label} failed (code ${tx.code}): ${tx.rawLog || "unknown error"}`;
}

async function runTxWithRetry(label: string, fn: () => Promise<TxResult>, retries = 2): Promise<TxResult> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      if (i === retries) break;
      await sleep(1200 * (i + 1));
    }
  }
  throw new Error(`${label} failed after retries: ${asError(lastErr)}`);
}

function extractNumericAttr(tx: TxResult, keys: string[]): number | undefined {
  const keySet = new Set(keys);
  for (const event of tx.events) {
    for (const attr of event.attributes) {
      if (!keySet.has(attr.key)) continue;
      const parsed = Number.parseInt(attr.value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

async function loadSkill(client: ClawChainClient, skillId: number): Promise<SkillInfo | null> {
  try {
    return await client.getSkill(skillId);
  } catch {
    return null;
  }
}

async function isRegistered(client: ClawChainClient, address: string): Promise<boolean> {
  try {
    const info = await client.getAgent(address);
    return Boolean(info.registered);
  } catch {
    return false;
  }
}

async function getNodeHeight(): Promise<number> {
  const res = await fetch(`${RPC_URL}/status`);
  if (!res.ok) {
    throw new Error(`status endpoint returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as { result?: { sync_info?: { latest_block_height?: string } } };
  const raw = data.result?.sync_info?.latest_block_height;
  const height = Number.parseInt(raw ?? "0", 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("could not parse latest block height");
  }
  return height;
}

async function waitForTaskFound(client: ClawChainClient, taskId: number, attempts = 6): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await client.getTask(taskId);
      if (out.found) return true;
    } catch {
      // ignore transient query errors
    }
    await sleep(1000);
  }
  return false;
}

async function waitForEscrowFound(client: ClawChainClient, escrowId: number, attempts = 6): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await client.getEscrow(escrowId);
      if (out.found) return true;
    } catch {
      // ignore transient query errors
    }
    await sleep(1000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
