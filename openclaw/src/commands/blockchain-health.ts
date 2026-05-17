import type { OpenClawConfig } from "../config/config.js";

export type BlockchainHealthReport = {
  configured: boolean;
  rpcReachable: boolean;
  restReachable: boolean;
  blockHeight: number | null;
  syncing: boolean;
  mnemonicConfigured: boolean;
  proofBinaryAvailable: boolean;
  issues: string[];
  tips: string[];
};

async function probeHttp(url: string, timeoutMs = 3000): Promise<boolean> {
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

async function fetchSyncStatus(rpcUrl: string): Promise<{
  height: number | null;
  syncing: boolean;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${rpcUrl}/status`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {return { height: null, syncing: false };}
    const data = (await response.json()) as {
      result?: {
        sync_info?: {
          latest_block_height?: string;
          catching_up?: boolean;
        };
      };
    };
    const info = data.result?.sync_info;
    return {
      height: info?.latest_block_height ? Number.parseInt(info.latest_block_height, 10) : null,
      syncing: info?.catching_up === true,
    };
  } catch {
    return { height: null, syncing: false };
  }
}

async function detectBinaryExists(name: string): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    execSync(cmd, { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function checkBlockchainHealth(
  cfg: OpenClawConfig,
): Promise<BlockchainHealthReport> {
  const bc = cfg.blockchain;
  const issues: string[] = [];
  const tips: string[] = [];

  if (!bc?.enabled) {
    return {
      configured: false,
      rpcReachable: false,
      restReachable: false,
      blockHeight: null,
      syncing: false,
      mnemonicConfigured: false,
      proofBinaryAvailable: false,
      issues: [],
      tips: ["Enable blockchain: openclaw configure --section blockchain"],
    };
  }

  const rpcUrl = bc.rpcUrl ?? "http://localhost:26657";
  const restUrl = bc.restUrl ?? "http://localhost:1317";

  const [rpcReachable, restReachable, syncStatus, proofBinaryAvailable] = await Promise.all([
    probeHttp(rpcUrl),
    probeHttp(restUrl),
    fetchSyncStatus(rpcUrl),
    detectBinaryExists(bc.proofBinaryPath ?? "clawproof"),
  ]);

  if (!rpcReachable) {
    issues.push(`RPC endpoint unreachable: ${rpcUrl}`);
    tips.push("Start the chain node or check the RPC URL");
  }
  if (!restReachable) {
    issues.push(`REST endpoint unreachable: ${restUrl}`);
    tips.push("Enable the REST API in app.toml or check the URL");
  }
  if (syncStatus.syncing) {
    issues.push("Node is still syncing — transactions may fail");
    tips.push("Wait for sync to complete before sending transactions");
  }

  const mnemonicConfigured = Boolean(bc.mnemonic || process.env.BLOCKCHAIN_MNEMONIC);
  if (!mnemonicConfigured) {
    issues.push("No agent mnemonic configured");
    tips.push("Set blockchain.mnemonic in config or BLOCKCHAIN_MNEMONIC env var");
  }

  if (!proofBinaryAvailable) {
    issues.push("clawproof binary not found — ZK proofs will fail");
    tips.push("Install clawproof: cd cmd/clawproof && go build -o clawproof");
  }

  return {
    configured: true,
    rpcReachable,
    restReachable,
    blockHeight: syncStatus.height,
    syncing: syncStatus.syncing,
    mnemonicConfigured,
    proofBinaryAvailable,
    issues,
    tips,
  };
}

export function formatBlockchainHealthSummary(report: BlockchainHealthReport): string {
  if (!report.configured) {
    return "ClawChain: not configured";
  }

  const lines: string[] = [];
  const ok = report.rpcReachable && report.restReachable && !report.syncing;
  lines.push(`ClawChain: ${ok ? "healthy" : "degraded"}`);

  if (report.blockHeight !== null) {
    lines.push(`  Block height: ${report.blockHeight}`);
  }

  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      lines.push(`  [!] ${issue}`);
    }
  }
  if (report.tips.length > 0) {
    for (const tip of report.tips) {
      lines.push(`  Tip: ${tip}`);
    }
  }

  return lines.join("\n");
}
