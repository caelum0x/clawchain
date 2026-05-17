import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";

type BlockchainStatusResult = {
  enabled: boolean;
  rpcUrl?: string;
  restUrl?: string;
  rpcReachable: boolean;
  restReachable: boolean;
  blockHeight: number | null;
  nodeId: string | null;
  network: string | null;
  agentAddress: string | null;
  autoRegister: boolean;
  heartbeatEnabled: boolean;
  heartbeatIntervalSeconds: number;
  autonomousLoopEnabled: boolean;
  faucetEnabled: boolean;
  nodeAutoStart: boolean;
};

async function probeEndpoint(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function fetchNodeStatus(
  rpcUrl: string,
  timeoutMs = 5000,
): Promise<{ blockHeight: number | null; nodeId: string | null; network: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${rpcUrl}/status`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {return { blockHeight: null, nodeId: null, network: null };}
    const data = (await response.json()) as {
      result?: {
        node_info?: { id?: string; network?: string };
        sync_info?: { latest_block_height?: string };
      };
    };
    const info = data.result;
    return {
      blockHeight: info?.sync_info?.latest_block_height
        ? Number.parseInt(info.sync_info.latest_block_height, 10)
        : null,
      nodeId: info?.node_info?.id ?? null,
      network: info?.node_info?.network ?? null,
    };
  } catch {
    return { blockHeight: null, nodeId: null, network: null };
  }
}

export async function blockchainStatusCommand(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  options?: { json?: boolean },
): Promise<BlockchainStatusResult> {
  const bc = cfg.blockchain;
  const enabled = bc?.enabled === true;
  const rpcUrl = bc?.rpcUrl ?? "http://localhost:26657";
  const restUrl = bc?.restUrl ?? "http://localhost:1317";

  if (!enabled) {
    const result: BlockchainStatusResult = {
      enabled: false,
      rpcUrl,
      restUrl,
      rpcReachable: false,
      restReachable: false,
      blockHeight: null,
      nodeId: null,
      network: null,
      agentAddress: null,
      autoRegister: false,
      heartbeatEnabled: false,
      heartbeatIntervalSeconds: 60,
      autonomousLoopEnabled: false,
      faucetEnabled: false,
      nodeAutoStart: false,
    };
    if (options?.json) {
      runtime.log(JSON.stringify(result, null, 2));
    } else {
      runtime.log("ClawChain: disabled");
      runtime.log("Enable with: openclaw configure --section blockchain");
    }
    return result;
  }

  // Probe endpoints in parallel
  const [rpcReachable, restReachable, nodeStatus] = await Promise.all([
    probeEndpoint(rpcUrl),
    probeEndpoint(restUrl),
    fetchNodeStatus(rpcUrl),
  ]);

  // Try to resolve agent address from mnemonic env or config
  let agentAddress: string | null = null;
  const mnemonic = bc?.mnemonic ?? process.env.BLOCKCHAIN_MNEMONIC;
  if (mnemonic) {
    // Address derivation requires crypto libs; we just indicate it's configured
    agentAddress = "(configured — derive on startup)";
  }

  const result: BlockchainStatusResult = {
    enabled: true,
    rpcUrl,
    restUrl,
    rpcReachable,
    restReachable,
    blockHeight: nodeStatus.blockHeight,
    nodeId: nodeStatus.nodeId,
    network: nodeStatus.network,
    agentAddress,
    autoRegister: bc?.autoRegister ?? true,
    heartbeatEnabled: bc?.heartbeat?.enabled ?? true,
    heartbeatIntervalSeconds: bc?.heartbeat?.intervalSeconds ?? 60,
    autonomousLoopEnabled: bc?.autonomousLoop?.enabled ?? false,
    faucetEnabled: bc?.faucet?.enabled ?? false,
    nodeAutoStart: bc?.node?.autoStart ?? false,
  };

  if (options?.json) {
    runtime.log(JSON.stringify(result, null, 2));
  } else {
    const lines: string[] = [];
    lines.push("ClawChain Status");
    lines.push("═══════════════════════════════════════");
    lines.push(`  Enabled:         yes`);
    lines.push(`  RPC URL:         ${rpcUrl}`);
    lines.push(`  RPC reachable:   ${rpcReachable ? "yes" : "no"}`);
    lines.push(`  REST URL:        ${restUrl}`);
    lines.push(`  REST reachable:  ${restReachable ? "yes" : "no"}`);
    if (nodeStatus.network) {
      lines.push(`  Network:         ${nodeStatus.network}`);
    }
    if (nodeStatus.blockHeight !== null) {
      lines.push(`  Block height:    ${nodeStatus.blockHeight}`);
    }
    if (nodeStatus.nodeId) {
      lines.push(`  Node ID:         ${nodeStatus.nodeId}`);
    }
    lines.push("");
    lines.push("Agent Configuration");
    lines.push("───────────────────────────────────────");
    lines.push(`  Identity:        ${agentAddress ?? "not configured"}`);
    lines.push(`  Auto-register:   ${result.autoRegister ? "yes" : "no"}`);
    lines.push(`  Heartbeat:       ${result.heartbeatEnabled ? `every ${result.heartbeatIntervalSeconds}s` : "disabled"}`);
    lines.push(`  Autonomous loop: ${result.autonomousLoopEnabled ? "yes" : "no"}`);
    lines.push(`  Node auto-start: ${result.nodeAutoStart ? "yes" : "no"}`);
    lines.push(`  Faucet:          ${result.faucetEnabled ? "yes" : "no"}`);

    runtime.log(lines.join("\n"));
  }

  return result;
}
