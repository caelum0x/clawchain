/**
 * delegate-task tool -- Delegate a task to another registered agent.
 *
 * Creates a new task on-chain with the specified assignee, description,
 * requirements, budget, and deadline. Requires a signing mnemonic.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DelegateTaskParams {
  /** Bech32 address of the agent to assign the task to. */
  assignee: string;
  /** Description of what needs to be done. */
  description: string;
  /** Requirements for completing the task. */
  requirements?: string;
  /** Skill ID relevant to this task (0 = none). */
  skillId?: number;
  /** Budget for the task (e.g. "1000uclaw"). */
  budget?: string;
  /** Number of blocks until the task deadline. */
  deadlineBlocks?: number;
}

export interface DelegateTaskResult {
  success: boolean;
  taskId?: number;
  txHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export default async function delegateTask(
  params: DelegateTaskParams,
): Promise<DelegateTaskResult> {
  if (!params.assignee) {
    return { success: false, error: "Assignee address is required." };
  }
  if (!params.description) {
    return { success: false, error: "Task description is required." };
  }

  const client = new ClawChainClient(signingClientOptions());

  try {
    await client.connect();

    const result = await client.delegateTask({
      assignee: params.assignee,
      description: params.description,
      requirements: params.requirements,
      skillId: params.skillId,
      budget: params.budget,
      deadlineBlocks: params.deadlineBlocks,
    });

    if (result.code !== 0) {
      return {
        success: false,
        txHash: result.transactionHash,
        error: `Transaction failed (code ${result.code}): ${result.rawLog}`,
      };
    }

    // Extract task_id from events.
    let taskId: number | undefined;
    for (const event of result.events) {
      if (event.type === "delegate_task") {
        const attr = event.attributes.find((a) => a.key === "task_id");
        if (attr) {
          taskId = parseInt(attr.value, 10);
        }
      }
    }

    return {
      success: true,
      taskId,
      txHash: result.transactionHash,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to delegate task: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
