/**
 * chain-status tool -- Query ClawChain node status.
 *
 * Returns the current block height, node ID, network name, and sync state.
 * This is a read-only query; no mnemonic is required.
 */

import { RPC_URL } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainStatusParams {
  /** Override the default RPC URL (optional). */
  rpcUrl?: string;
}

export interface ChainStatusResult {
  success: boolean;
  /** Latest block height. */
  blockHeight: number;
  /** Network / chain identifier (e.g. "clawchain"). */
  network: string;
  /** Hex-encoded node ID. */
  nodeId: string;
  /** Whether the node is still catching up with the network. */
  syncing: boolean;
  /** ISO-8601 timestamp of the latest block. */
  latestBlockTime: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Query the status of a ClawChain node via the Tendermint RPC `/status` endpoint.
 *
 * @param params - Optional parameters (rpcUrl override).
 * @returns Structured status information or an error result.
 */
export default async function chainStatus(
  params: ChainStatusParams = {},
): Promise<ChainStatusResult> {
  const rpc = params.rpcUrl ?? RPC_URL;

  try {
    const response = await fetch(`${rpc}/status`);

    if (!response.ok) {
      return {
        success: false,
        blockHeight: 0,
        network: "",
        nodeId: "",
        syncing: false,
        latestBlockTime: "",
        error: `HTTP ${response.status}: ${await response.text().catch(() => "unknown error")}`,
      };
    }

    const data = await response.json() as any;
    const result = data.result ?? data;

    const nodeInfo = result.node_info ?? {};
    const syncInfo = result.sync_info ?? {};

    return {
      success: true,
      blockHeight: parseInt(syncInfo.latest_block_height ?? "0", 10),
      network: nodeInfo.network ?? "",
      nodeId: nodeInfo.id ?? "",
      syncing: syncInfo.catching_up ?? false,
      latestBlockTime: syncInfo.latest_block_time ?? "",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      blockHeight: 0,
      network: "",
      nodeId: "",
      syncing: false,
      latestBlockTime: "",
      error: `Failed to query chain status: ${message}`,
    };
  }
}
