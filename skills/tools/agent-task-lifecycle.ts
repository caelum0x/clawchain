/**
 * agent-task-lifecycle tool -- Execute Slice 1 agent flow end-to-end.
 *
 * Flow:
 *   1) Ensure delegator agent is registered
 *   2) Send heartbeat
 *   3) Delegate task
 *   4) Optionally accept/complete task when signer is the assignee
 */

import { ClawChainAgent } from "../../sdk/src/agent.js";
import type { TxResult } from "../../sdk/src/types.js";
import { RPC_URL, agentOptions, signingClientOptions } from "./config.js";
import { ClawChainClient } from "../../sdk/src/client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTaskLifecycleParams {
  assignee: string;
  description: string;
  requirements?: string;
  skillId?: number;
  budget?: string;
  deadlineBlocks?: number;
  heartbeatEndpoint?: string;
  heartbeatMetadata?: string;
  autoAccept?: boolean;
  autoComplete?: boolean;
  completionResult?: string;
}

export interface AgentTaskLifecycleResult {
  success: boolean;
  delegator: string;
  assignee: string;
  alreadyRegistered: boolean;
  taskId?: number;
  registerTxHash?: string;
  heartbeatTxHash?: string;
  delegateTxHash?: string;
  acceptTxHash?: string;
  completeTxHash?: string;
  errorStage?: "register" | "heartbeat" | "delegate" | "accept" | "complete";
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txError(prefix: string, tx: TxResult): string {
  return `${prefix} failed (code ${tx.code}): ${tx.rawLog}`;
}

function extractTaskId(tx: TxResult): number | undefined {
  for (const event of tx.events) {
    if (event.type !== "delegate_task") {
      continue;
    }
    const attr = event.attributes.find((a) => a.key === "task_id");
    if (!attr) {
      continue;
    }
    const parsed = Number.parseInt(attr.value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

async function getNodeHeight(): Promise<number> {
  const statusResponse = await fetch(`${RPC_URL}/status`);
  if (!statusResponse.ok) {
    throw new Error(`status endpoint returned HTTP ${statusResponse.status}`);
  }
  const statusJson = (await statusResponse.json()) as {
    result?: { sync_info?: { latest_block_height?: string } };
  };
  const latestHeightRaw = statusJson.result?.sync_info?.latest_block_height;
  const nodeHeight = Number.parseInt(latestHeightRaw ?? "0", 10);
  if (!Number.isFinite(nodeHeight) || nodeHeight <= 0) {
    throw new Error("could not parse latest block height");
  }
  return nodeHeight;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export default async function agentTaskLifecycle(
  params: AgentTaskLifecycleParams,
): Promise<AgentTaskLifecycleResult> {
  if (!params.assignee) {
    return {
      success: false,
      delegator: "",
      assignee: "",
      alreadyRegistered: false,
      errorStage: "delegate",
      error: "Assignee address is required.",
    };
  }
  if (!params.description) {
    return {
      success: false,
      delegator: "",
      assignee: params.assignee,
      alreadyRegistered: false,
      errorStage: "delegate",
      error: "Task description is required.",
    };
  }
  if (params.autoComplete && !params.completionResult) {
    return {
      success: false,
      delegator: "",
      assignee: params.assignee,
      alreadyRegistered: false,
      errorStage: "complete",
      error: "completionResult is required when autoComplete=true.",
    };
  }

  const agent = new ClawChainAgent(agentOptions());
  const heartbeatClient = new ClawChainClient(signingClientOptions());

  let delegator = "";
  let alreadyRegistered = false;
  let registerTxHash: string | undefined;
  let heartbeatTxHash: string | undefined;
  let delegateTxHash: string | undefined;
  let acceptTxHash: string | undefined;
  let completeTxHash: string | undefined;
  let taskId: number | undefined;

  try {
    await agent.initialize();
    await heartbeatClient.connect();
    delegator = agent.getAddress();

    alreadyRegistered = await agent.isRegistered();
    if (!alreadyRegistered) {
      const registerTx = await agent.register();
      registerTxHash = registerTx.transactionHash;
      if (registerTx.code !== 0) {
        return {
          success: false,
          delegator,
          assignee: params.assignee,
          alreadyRegistered,
          registerTxHash,
          errorStage: "register",
          error: txError("registration", registerTx),
        };
      }
    }

    const nodeHeight = await getNodeHeight();
    const heartbeatTx = await heartbeatClient.agentHeartbeat({
      nodeHeight,
      endpoint: params.heartbeatEndpoint ?? "",
      metadata: params.heartbeatMetadata ?? "",
    });
    heartbeatTxHash = heartbeatTx.transactionHash;
    if (heartbeatTx.code !== 0) {
      return {
        success: false,
        delegator,
        assignee: params.assignee,
        alreadyRegistered,
        registerTxHash,
        heartbeatTxHash,
        errorStage: "heartbeat",
        error: txError("heartbeat", heartbeatTx),
      };
    }

    const delegateTx = await agent.delegateTask({
      assignee: params.assignee,
      description: params.description,
      requirements: params.requirements,
      skillId: params.skillId,
      budget: params.budget,
      deadlineBlocks: params.deadlineBlocks,
    });
    delegateTxHash = delegateTx.transactionHash;
    if (delegateTx.code !== 0) {
      return {
        success: false,
        delegator,
        assignee: params.assignee,
        alreadyRegistered,
        registerTxHash,
        heartbeatTxHash,
        delegateTxHash,
        errorStage: "delegate",
        error: txError("delegate task", delegateTx),
      };
    }

    taskId = extractTaskId(delegateTx);

    const wantsAccept = params.autoAccept === true;
    const wantsComplete = params.autoComplete === true;
    if ((wantsAccept || wantsComplete) && params.assignee !== delegator) {
      return {
        success: false,
        delegator,
        assignee: params.assignee,
        alreadyRegistered,
        taskId,
        registerTxHash,
        heartbeatTxHash,
        delegateTxHash,
        errorStage: wantsAccept ? "accept" : "complete",
        error:
          "autoAccept/autoComplete requires assignee to match the current signer address.",
      };
    }

    if (wantsAccept) {
      if (taskId == null) {
        return {
          success: false,
          delegator,
          assignee: params.assignee,
          alreadyRegistered,
          registerTxHash,
          heartbeatTxHash,
          delegateTxHash,
          errorStage: "accept",
          error: "Task was delegated but task ID was not found in events.",
        };
      }
      const acceptTx = await agent.acceptTask(taskId);
      acceptTxHash = acceptTx.transactionHash;
      if (acceptTx.code !== 0) {
        return {
          success: false,
          delegator,
          assignee: params.assignee,
          alreadyRegistered,
          taskId,
          registerTxHash,
          heartbeatTxHash,
          delegateTxHash,
          acceptTxHash,
          errorStage: "accept",
          error: txError("accept task", acceptTx),
        };
      }
    }

    if (wantsComplete) {
      if (taskId == null) {
        return {
          success: false,
          delegator,
          assignee: params.assignee,
          alreadyRegistered,
          registerTxHash,
          heartbeatTxHash,
          delegateTxHash,
          acceptTxHash,
          errorStage: "complete",
          error: "Task was delegated but task ID was not found in events.",
        };
      }
      const completeTx = await agent.completeTask(taskId, params.completionResult!);
      completeTxHash = completeTx.transactionHash;
      if (completeTx.code !== 0) {
        return {
          success: false,
          delegator,
          assignee: params.assignee,
          alreadyRegistered,
          taskId,
          registerTxHash,
          heartbeatTxHash,
          delegateTxHash,
          acceptTxHash,
          completeTxHash,
          errorStage: "complete",
          error: txError("complete task", completeTx),
        };
      }
    }

    return {
      success: true,
      delegator,
      assignee: params.assignee,
      alreadyRegistered,
      taskId,
      registerTxHash,
      heartbeatTxHash,
      delegateTxHash,
      acceptTxHash,
      completeTxHash,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      delegator,
      assignee: params.assignee,
      alreadyRegistered,
      taskId,
      registerTxHash,
      heartbeatTxHash,
      delegateTxHash,
      acceptTxHash,
      completeTxHash,
      error: `Lifecycle execution failed: ${message}`,
    };
  } finally {
    await agent.shutdown().catch(() => {});
    await heartbeatClient.disconnect().catch(() => {});
  }
}
