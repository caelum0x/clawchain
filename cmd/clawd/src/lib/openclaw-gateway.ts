import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export type ClawdGatewayRuntimeStatus = {
  chain?: {
    rpcUrl?: string;
    alive?: boolean;
    latestBlockHeight?: number | null;
    catchingUp?: boolean | null;
    error?: string | null;
  };
  node?: {
    managed?: boolean;
    external?: boolean;
    running?: boolean;
  };
  agent?: {
    connected?: boolean;
    address?: string | null;
    heartbeatEnabled?: boolean;
    heartbeatInFlight?: boolean;
  };
  messaging?: {
    enabled?: boolean;
    endpoint?: string | null;
    reachable?: boolean | null;
    error?: string | null;
  };
  faucet?: {
    enabled?: boolean;
    url?: string | null;
    available?: boolean | null;
    error?: string | null;
  };
  peers?: {
    rpcReachable?: boolean;
    connectedPeers?: number | null;
    sampleNodeIds?: string[];
    error?: string | null;
  };
  contracts?: {
    msgAgentHeartbeatTypeUrl?: string;
    restAgentLivenessPath?: string;
    restLiveAgentsPath?: string;
  };
  readiness?: {
    ready?: boolean;
    checks?: {
      chainReachable?: boolean;
      agentConnected?: boolean;
      agentRegistered?: boolean;
      agentLive?: boolean;
      messagingConfigured?: boolean;
      messagingReachable?: boolean;
      peersHealthy?: boolean;
    };
    blockers?: string[];
  };
};

export type ClawdGatewayProviderPhase = "install" | "run" | "earn";

export type ClawdGatewayProviderPhaseStatus = {
  phase?: ClawdGatewayProviderPhase;
  label?: string;
  ok?: boolean;
  detail?: string;
  action?: string;
};

export type ClawdGatewayProviderStatus = {
  ready?: boolean;
  currentPhase?: ClawdGatewayProviderPhase;
  phases?: {
    install?: ClawdGatewayProviderPhaseStatus;
    run?: ClawdGatewayProviderPhaseStatus;
    earn?: ClawdGatewayProviderPhaseStatus;
  };
  address?: string | null;
  blockHeight?: number | null;
  connectedPeers?: number | null;
};

export type ClawdGatewayProviderDashboard = {
  connected?: boolean;
  address?: string | null;
  balance?: string | null;
  shieldedBalance?: string | null;
  blockHeight?: number | null;
  rewards?: {
    total?: string;
    pending?: string;
  } | null;
  stats?: {
    tasksCompleted?: number;
    tasksFailed?: number;
    tasksAccepted?: number;
    reputationScore?: number;
    successRate?: number | null;
  } | null;
  network?: {
    connectedPeers?: number | null;
    liveAgents?: number | null;
    chainAlive?: boolean;
    catchingUp?: boolean | null;
  } | null;
  readiness?: ClawdGatewayRuntimeStatus["readiness"] | null;
  heartbeat?: {
    enabled?: boolean;
    inFlight?: boolean;
  };
  messaging?: {
    enabled?: boolean;
    reachable?: boolean | null;
  };
  faucet?: {
    enabled?: boolean;
    available?: boolean | null;
  };
};

export function resolveOpenClawBin(): string {
  const explicit = process.env.CLAWD_OPENCLAW_BIN?.trim() || process.env.OPENCLAW_BIN?.trim();
  if (explicit) return explicit;

  const here = dirname(fileURLToPath(import.meta.url));
  const localCli = join(here, "..", "..", "..", "..", "openclaw", "openclaw.mjs");
  if (existsSync(localCli)) {
    return `${process.execPath} ${localCli}`;
  }

  return "openclaw";
}

export async function queryGatewayRuntimeStatus(
  timeoutMs = 10_000,
): Promise<ClawdGatewayRuntimeStatus | null> {
  return await queryGatewayMethod<ClawdGatewayRuntimeStatus>("runtime.status", {}, timeoutMs);
}

export async function queryGatewayProviderStatus(
  timeoutMs = 10_000,
): Promise<ClawdGatewayProviderStatus | null> {
  return await queryGatewayMethod<ClawdGatewayProviderStatus>("provider.status", {}, timeoutMs);
}

export async function queryGatewayProviderDashboard(
  timeoutMs = 10_000,
): Promise<ClawdGatewayProviderDashboard | null> {
  return await queryGatewayMethod<ClawdGatewayProviderDashboard>("provider.dashboard", {}, timeoutMs);
}

export async function queryGatewayMethod<T>(
  method: string,
  params: unknown = {},
  timeoutMs = 10_000,
): Promise<T | null> {
  const bin = resolveOpenClawBin();
  const callArgs = [
    "gateway",
    "call",
    method,
    "--json",
    "--timeout",
    String(timeoutMs),
    "--params",
    JSON.stringify(params ?? {}),
  ];
  const args = bin.includes(" ") ? splitCommand(bin).concat(callArgs) : [bin, ...callArgs];

  const [command, ...commandArgs] = args;
  if (!command) return null;

  return await new Promise<T | null>((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch {
        resolve(null);
      }
    });
  });
}

function splitCommand(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}
