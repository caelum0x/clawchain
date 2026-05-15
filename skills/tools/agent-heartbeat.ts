/**
 * agent-heartbeat tool -- Send a liveness heartbeat for the current agent.
 *
 * Broadcasts MsgAgentHeartbeat to prove the agent is active on-chain.
 * Requires a signing mnemonic.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { RPC_URL, signingClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentHeartbeatParams {
  /** Optional endpoint override for heartbeat payload. */
  endpoint?: string;
  /** Optional free-form metadata string (uptime, queue depth, version, etc). */
  metadata?: string;
}

export interface AgentHeartbeatResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export default async function agentHeartbeat(
  params: AgentHeartbeatParams = {},
): Promise<AgentHeartbeatResult> {
  const client = new ClawChainClient(signingClientOptions());

  try {
    await client.connect();

    const statusResponse = await fetch(`${RPC_URL}/status`);
    if (!statusResponse.ok) {
      return {
        success: false,
        error: `Failed to query node status from ${RPC_URL}/status: HTTP ${statusResponse.status}`,
      };
    }
    const statusJson = (await statusResponse.json()) as {
      result?: { sync_info?: { latest_block_height?: string } };
    };
    const latestHeightRaw = statusJson.result?.sync_info?.latest_block_height;
    const nodeHeight = Number.parseInt(latestHeightRaw ?? "0", 10);
    if (!Number.isFinite(nodeHeight) || nodeHeight <= 0) {
      return {
        success: false,
        error: "Failed to parse latest block height from node status.",
      };
    }

    const result = await client.agentHeartbeat({
      nodeHeight,
      endpoint: params.endpoint ?? "",
      metadata: params.metadata ?? "",
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
    return { success: false, error: `Failed to send heartbeat: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
