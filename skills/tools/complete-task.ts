/**
 * complete-task tool -- Complete a task with a result / deliverable.
 *
 * Changes the task status from "accepted" to "completed" and records the
 * result on-chain. Only the assigned agent can complete the task.
 * Requires a signing mnemonic.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompleteTaskParams {
  /** ID of the task to complete. */
  taskId: number;
  /** Result / deliverable of the completed task. */
  result: string;
}

export interface CompleteTaskResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export default async function completeTask(
  params: CompleteTaskParams,
): Promise<CompleteTaskResult> {
  if (params.taskId == null || params.taskId < 0) {
    return { success: false, error: "A valid task ID is required." };
  }
  if (!params.result) {
    return { success: false, error: "A result is required to complete a task." };
  }

  const client = new ClawChainClient(signingClientOptions());

  try {
    await client.connect();

    const result = await client.completeTask({
      taskId: params.taskId,
      result: params.result,
    });

    if (result.code !== 0) {
      return {
        success: false,
        txHash: result.transactionHash,
        error: `Transaction failed (code ${result.code}): ${result.rawLog}`,
      };
    }

    return {
      success: true,
      txHash: result.transactionHash,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to complete task: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
