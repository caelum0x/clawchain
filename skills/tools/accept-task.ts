/**
 * accept-task tool -- Accept a task that was delegated to this agent.
 *
 * Changes the task status from "pending" to "accepted". Only the assigned
 * agent can accept the task. Requires a signing mnemonic.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcceptTaskParams {
  /** ID of the task to accept. */
  taskId: number;
}

export interface AcceptTaskResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export default async function acceptTask(
  params: AcceptTaskParams,
): Promise<AcceptTaskResult> {
  if (params.taskId == null || params.taskId < 0) {
    return { success: false, error: "A valid task ID is required." };
  }

  const client = new ClawChainClient(signingClientOptions());

  try {
    await client.connect();

    const result = await client.acceptTask({ taskId: params.taskId });

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
    return { success: false, error: `Failed to accept task: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
