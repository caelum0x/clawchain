import { loadClawdConfig } from "./config.js";
import { shouldRequireSignedManifest } from "./manifest-security.js";
import {
  queryGatewayMethod,
  queryGatewayProviderDashboard,
  queryGatewayProviderStatus,
  queryGatewayRuntimeStatus,
  type ClawdGatewayProviderDashboard,
  type ClawdGatewayProviderStatus,
  type ClawdGatewayRuntimeStatus,
} from "./openclaw-gateway.js";

export type ReadinessCheck = {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
};

export type ReadinessReport = {
  chainId: string;
  agentAddress: string | null;
  rpcUrl: string;
  restUrl: string;
  messagingEndpoint: string | null;
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  ready: boolean;
};

export type StartupLifecycleStage =
  | "identity_init"
  | "chain_connect"
  | "register"
  | "heartbeat"
  | "messaging";

export type StartupLifecycleStageResult = {
  stage: StartupLifecycleStage;
  ok: boolean;
  detail: string;
};

export type StartupLifecycleReport = {
  stages: StartupLifecycleStageResult[];
  completed: boolean;
  currentStage: StartupLifecycleStage;
  blocker: string | null;
  readiness: ReadinessReport;
};

export async function evaluateIntegratedReadiness(): Promise<ReadinessReport> {
  const cfg = loadClawdConfig();
  const rpcUrl = trimSlash(cfg.rpcUrl ?? "http://localhost:26657");
  const restUrl = trimSlash(cfg.restUrl ?? deriveRestUrl(rpcUrl));
  const gatewayCandidates = [
    trimSlash(process.env.OPENCLAW_GATEWAY_URL ?? "http://localhost:18789"),
    "http://localhost:3000",
  ];
  const [providerStatus, providerDashboard, runtime] = await Promise.all([
    queryGatewayProviderStatus(),
    queryGatewayProviderDashboard(),
    queryGatewayRuntimeStatus(),
  ]);
  const agentAddress =
    cfg.agentAddress?.trim() ||
    providerStatus?.address?.trim() ||
    providerDashboard?.address?.trim() ||
    undefined;
  const agentInfo = agentAddress
    ? await queryGatewayMethod<GatewayAgentInfoResult>("chain.agents.info", {
        address: agentAddress,
      })
    : null;

  const checks: ReadinessCheck[] = [];
  checks.push(await checkRpc(rpcUrl, cfg.chainId));
  checks.push(await checkRest(restUrl));
  checks.push(checkManifestSignature(cfg));
  checks.push(await checkGateway(gatewayCandidates, runtime, providerStatus, providerDashboard));
  checks.push(await checkAgentRegistered(restUrl, agentAddress, providerStatus, runtime, agentInfo));
  checks.push(
    await checkAgentLiveness(restUrl, agentAddress, providerStatus, providerDashboard, runtime, agentInfo),
  );
  checks.push(await checkMessagingEndpoint(cfg.messagingEndpoint, runtime));
  checks.push(await checkPeers(rpcUrl, runtime));
  checks.push(checkIncidentMode(cfg.incidentMode));

  const blockers = checks.filter((c) => c.required && !c.ok);

  return {
    chainId: cfg.chainId,
    agentAddress: agentAddress ?? null,
    rpcUrl,
    restUrl,
    messagingEndpoint: cfg.messagingEndpoint ?? null,
    checks,
    blockers,
    ready: blockers.length === 0,
  };
}

export async function evaluateStartupLifecycle(): Promise<StartupLifecycleReport> {
  const readiness = await evaluateIntegratedReadiness();
  const checkByName = new Map(readiness.checks.map((c) => [c.name, c] as const));

  const stages: StartupLifecycleStageResult[] = [];

  const hasIdentity = Boolean(readiness.agentAddress && readiness.agentAddress.trim().length > 0);
  stages.push({
    stage: "identity_init",
    ok: hasIdentity,
    detail: hasIdentity ? "agentAddress present in clawd config" : "agentAddress missing in clawd config",
  });

  const rpcCheck = checkByName.get("Chain RPC");
  const restCheck = checkByName.get("Chain REST");
  const chainOk = Boolean(rpcCheck?.ok && restCheck?.ok);
  stages.push({
    stage: "chain_connect",
    ok: chainOk,
    detail: chainOk
      ? "chain RPC + REST reachable"
      : rpcCheck?.ok
        ? (restCheck?.detail ?? "chain REST is not reachable")
        : (rpcCheck?.detail ?? "chain RPC is not reachable"),
  });

  const registerCheck = checkByName.get("On-chain agent identity");
  stages.push({
    stage: "register",
    ok: Boolean(registerCheck?.ok),
    detail: registerCheck?.detail ?? "agent registration status unavailable",
  });

  const heartbeatCheck = checkByName.get("Agent heartbeat/liveness");
  stages.push({
    stage: "heartbeat",
    ok: Boolean(heartbeatCheck?.ok),
    detail: heartbeatCheck?.detail ?? "agent liveness status unavailable",
  });

  const messagingCheck = checkByName.get("Messaging endpoint");
  stages.push({
    stage: "messaging",
    ok: Boolean(messagingCheck?.ok),
    detail: messagingCheck?.detail ?? "messaging endpoint status unavailable",
  });

  const firstBlocked = stages.find((s) => !s.ok);

  return {
    stages,
    completed: firstBlocked === undefined,
    currentStage: firstBlocked?.stage ?? "messaging",
    blocker: firstBlocked ? `${firstBlocked.stage}: ${firstBlocked.detail}` : null,
    readiness,
  };
}

export async function waitForIntegratedReadiness(
  timeoutSeconds: number,
  opts?: {
    intervalMs?: number;
    onPending?: (report: ReadinessReport) => void;
  },
): Promise<ReadinessReport> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  const intervalMs = Math.max(1000, opts?.intervalMs ?? 5000);
  let lastReport: ReadinessReport | null = null;

  while (Date.now() < deadline) {
    const report = await evaluateIntegratedReadiness();
    lastReport = report;
    if (report.ready) {
      return report;
    }
    opts?.onPending?.(report);
    await sleep(intervalMs);
  }

  if (lastReport) {
    return lastReport;
  }
  return evaluateIntegratedReadiness();
}

export async function waitForStartupLifecycle(
  timeoutSeconds: number,
  opts?: {
    intervalMs?: number;
    onPending?: (report: StartupLifecycleReport) => void;
  },
): Promise<StartupLifecycleReport> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  const intervalMs = Math.max(1000, opts?.intervalMs ?? 5000);
  let lastReport: StartupLifecycleReport | null = null;

  while (Date.now() < deadline) {
    const report = await evaluateStartupLifecycle();
    lastReport = report;
    if (report.completed) {
      return report;
    }
    opts?.onPending?.(report);
    await sleep(intervalMs);
  }

  if (lastReport) {
    return lastReport;
  }
  return evaluateStartupLifecycle();
}

async function checkRpc(rpcUrl: string, expectedChainId: string): Promise<ReadinessCheck> {
  const url = `${rpcUrl}/status`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "Chain RPC",
        ok: false,
        detail: `HTTP ${res.status}`,
        required: true,
      };
    }
    const data = (await res.json()) as {
      result?: {
        node_info?: { network?: string };
      };
    };
    const network = data.result?.node_info?.network;
    if (network && network !== expectedChainId) {
      return {
        name: "Chain RPC",
        ok: false,
        detail: `chain_id mismatch expected=${expectedChainId} got=${network}`,
        required: true,
      };
    }
    return {
      name: "Chain RPC",
      ok: true,
      detail: `reachable (chain_id=${network ?? "unknown"})`,
      required: true,
    };
  } catch (err) {
    return {
      name: "Chain RPC",
      ok: false,
      detail: String(err),
      required: true,
    };
  }
}

async function checkRest(restUrl: string): Promise<ReadinessCheck> {
  const url = `${restUrl}/cosmos/base/tendermint/v1beta1/syncing`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "Chain REST",
        ok: false,
        detail: `HTTP ${res.status}`,
        required: true,
      };
    }
    return {
      name: "Chain REST",
      ok: true,
      detail: "reachable",
      required: true,
    };
  } catch (err) {
    return {
      name: "Chain REST",
      ok: false,
      detail: String(err),
      required: true,
    };
  }
}

async function checkGateway(
  candidates: string[],
  runtime: ClawdGatewayRuntimeStatus | null,
  providerStatus: ClawdGatewayProviderStatus | null,
  providerDashboard: ClawdGatewayProviderDashboard | null,
): Promise<ReadinessCheck> {
  if (providerStatus || providerDashboard) {
    const currentPhase = providerStatus?.currentPhase ?? "unknown";
    const ready = providerStatus?.ready ?? providerDashboard?.readiness?.ready ?? null;
    return {
      name: "OpenClaw gateway",
      ok: true,
      detail: `provider gateway available phase=${currentPhase} ready=${ready ?? "unknown"}`,
      required: true,
    };
  }

  if (runtime) {
    const blockers = runtime.readiness?.blockers ?? [];
    return {
      name: "OpenClaw gateway",
      ok: true,
      detail:
        blockers.length > 0
          ? `runtime.status available blockers=${blockers.join(" | ")}`
          : "runtime.status available",
      required: true,
    };
  }

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return {
          name: "OpenClaw gateway",
          ok: true,
          detail: `reachable at ${base}`,
          required: true,
        };
      }
    } catch {
      // try next candidate
    }
  }
  return {
    name: "OpenClaw gateway",
    ok: false,
    detail: `not reachable on ${candidates.join(", ")}`,
    required: true,
  };
}

async function checkAgentRegistered(
  restUrl: string,
  agentAddress?: string,
  providerStatus?: ClawdGatewayProviderStatus | null,
  runtime?: ClawdGatewayRuntimeStatus | null,
  agentInfo?: GatewayAgentInfoResult | null,
): Promise<ReadinessCheck> {
  if (!agentAddress || agentAddress.trim().length === 0) {
    return {
      name: "On-chain agent identity",
      ok: false,
      detail: "agentAddress is missing in clawd config",
      required: true,
    };
  }

  const runPhase = providerStatus?.phases?.run;
  if (runPhase?.ok !== undefined) {
    const detail = runPhase.detail ?? "provider.status run phase unavailable";
    const registered = runPhase.ok === true || detail.toLowerCase().includes("registered but");
    return {
      name: "On-chain agent identity",
      ok: registered,
      detail: registered
        ? `registered=true via provider.status phase=run evidence=${detail}`
        : `registered=false via provider.status phase=run evidence=${detail}`,
      required: true,
    };
  }

  if (agentInfo?.agent) {
    const registered = agentInfo.agent.registered === true;
    return {
      name: "On-chain agent identity",
      ok: registered,
      detail: registered
        ? `registered=true via chain.agents.info name=${agentInfo.agent.name || "unknown"}`
        : "registered=false via chain.agents.info",
      required: true,
    };
  }

  if (runtime?.readiness?.checks?.agentRegistered !== undefined) {
    const registered = runtime.readiness.checks.agentRegistered === true;
    return {
      name: "On-chain agent identity",
      ok: registered,
      detail: registered
        ? "registered=true via runtime.status"
        : "registered=false via runtime.status",
      required: true,
    };
  }

  const url = `${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(agentAddress)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "On-chain agent identity",
        ok: false,
        detail: `HTTP ${res.status} (${url})`,
        required: true,
      };
    }
    const data = (await res.json()) as { registered?: boolean };
    if (!data.registered) {
      return {
        name: "On-chain agent identity",
        ok: false,
        detail: "agent is not registered",
        required: true,
      };
    }
    return {
      name: "On-chain agent identity",
      ok: true,
      detail: "registered=true",
      required: true,
    };
  } catch (err) {
    return {
      name: "On-chain agent identity",
      ok: false,
      detail: String(err),
      required: true,
    };
  }
}

async function checkAgentLiveness(
  restUrl: string,
  agentAddress?: string,
  providerStatus?: ClawdGatewayProviderStatus | null,
  providerDashboard?: ClawdGatewayProviderDashboard | null,
  runtime?: ClawdGatewayRuntimeStatus | null,
  agentInfo?: GatewayAgentInfoResult | null,
): Promise<ReadinessCheck> {
  if (!agentAddress || agentAddress.trim().length === 0) {
    return {
      name: "Agent heartbeat/liveness",
      ok: false,
      detail: "agentAddress is missing in clawd config",
      required: true,
    };
  }

  const runPhase = providerStatus?.phases?.run;
  if (runPhase?.ok !== undefined) {
    const detail = runPhase.detail ?? "provider.status run phase unavailable";
    const heartbeat = providerDashboard?.heartbeat;
    const heartbeatDetail = heartbeat
      ? ` heartbeat.enabled=${Boolean(heartbeat.enabled)} inFlight=${Boolean(heartbeat.inFlight)}`
      : "";
    return {
      name: "Agent heartbeat/liveness",
      ok: runPhase.ok === true,
      detail:
        runPhase.ok === true
          ? `agentLive=true via provider.status phase=run evidence=${detail}${heartbeatDetail}`
          : `agentLive=false via provider.status phase=run evidence=${detail}${heartbeatDetail}`,
      required: true,
    };
  }

  const lastHeartbeat = agentInfo?.agent?.lastHeartbeat;
  if (typeof lastHeartbeat === "string" || lastHeartbeat === null) {
    return {
      name: "Agent heartbeat/liveness",
      ok: Boolean(lastHeartbeat),
      detail: lastHeartbeat
        ? `lastHeartbeat=${lastHeartbeat} via chain.agents.info`
        : "lastHeartbeat=null via chain.agents.info",
      required: true,
    };
  }

  if (runtime?.readiness?.checks?.agentLive !== undefined) {
    const live = runtime.readiness.checks.agentLive === true;
    return {
      name: "Agent heartbeat/liveness",
      ok: live,
      detail: live ? "agentLive=true via runtime.status" : "agentLive=false via runtime.status",
      required: true,
    };
  }

  const url = `${restUrl}/clawchain/agent/v1/liveness/${encodeURIComponent(agentAddress)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "Agent heartbeat/liveness",
        ok: false,
        detail: `HTTP ${res.status} (${url})`,
        required: true,
      };
    }
    const data = (await res.json()) as {
      found?: boolean;
      liveness?: { heartbeatCount?: number };
    };
    const heartbeatCount = data.liveness?.heartbeatCount ?? 0;
    if (!data.found || heartbeatCount <= 0) {
      return {
        name: "Agent heartbeat/liveness",
        ok: false,
        detail: `found=${Boolean(data.found)} heartbeatCount=${heartbeatCount}`,
        required: true,
      };
    }
    return {
      name: "Agent heartbeat/liveness",
      ok: true,
      detail: `heartbeatCount=${heartbeatCount}`,
      required: true,
    };
  } catch (err) {
    return {
      name: "Agent heartbeat/liveness",
      ok: false,
      detail: String(err),
      required: true,
    };
  }
}

async function checkMessagingEndpoint(
  messagingEndpoint?: string,
  runtime?: ClawdGatewayRuntimeStatus | null,
): Promise<ReadinessCheck> {
  if (runtime?.messaging) {
    const configured = runtime.readiness?.checks?.messagingConfigured ?? runtime.messaging.enabled;
    const reachable =
      runtime.readiness?.checks?.messagingReachable ?? runtime.messaging.reachable === true;
    const endpoint = runtime.messaging.endpoint ?? messagingEndpoint ?? null;
    return {
      name: "Messaging endpoint",
      ok: Boolean(configured && reachable),
      detail: endpoint
        ? `configured=${Boolean(configured)} reachable=${Boolean(reachable)} via runtime.status endpoint=${endpoint}`
        : `configured=${Boolean(configured)} reachable=${Boolean(reachable)} via runtime.status`,
      required: true,
    };
  }

  if (!messagingEndpoint || messagingEndpoint.trim().length === 0) {
    return {
      name: "Messaging endpoint",
      ok: false,
      detail: "messagingEndpoint is missing in clawd config",
      required: true,
    };
  }

  const url = `${trimSlash(messagingEndpoint)}/agent/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "Messaging endpoint",
        ok: false,
        detail: `HTTP ${res.status} (${url})`,
        required: true,
      };
    }
    return {
      name: "Messaging endpoint",
      ok: true,
      detail: "reachable",
      required: true,
    };
  } catch (err) {
    return {
      name: "Messaging endpoint",
      ok: false,
      detail: String(err),
      required: true,
    };
  }
}

async function checkPeers(
  rpcUrl: string,
  runtime?: ClawdGatewayRuntimeStatus | null,
): Promise<ReadinessCheck> {
  if (runtime?.peers) {
    const connectedPeers = runtime.peers.connectedPeers ?? 0;
    const peersHealthy =
      runtime.readiness?.checks?.peersHealthy ?? (runtime.peers.rpcReachable && connectedPeers > 0);
    return {
      name: "Peer connectivity",
      ok: Boolean(peersHealthy),
      detail: `connected_peers=${connectedPeers} via runtime.status`,
      required: true,
    };
  }

  const url = `${rpcUrl}/net_info`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "Peer connectivity",
        ok: false,
        detail: `HTTP ${res.status}`,
        required: true,
      };
    }
    const data = (await res.json()) as {
      result?: { n_peers?: string };
    };
    const nPeers = Number.parseInt(data.result?.n_peers ?? "0", 10);
    if (!Number.isFinite(nPeers) || nPeers <= 0) {
      return {
        name: "Peer connectivity",
        ok: false,
        detail: "0 connected peers",
        required: true,
      };
    }
    return {
      name: "Peer connectivity",
      ok: true,
      detail: `connected_peers=${nPeers}`,
      required: true,
    };
  } catch (err) {
    return {
      name: "Peer connectivity",
      ok: false,
      detail: String(err),
      required: true,
    };
  }
}

function checkManifestSignature(cfg: ReturnType<typeof loadClawdConfig>): ReadinessCheck {
  const required =
    cfg.manifestSignatureRequired === true ||
    shouldRequireSignedManifest({ source: cfg.networkManifest });

  if (!cfg.networkManifest || cfg.networkManifest.trim().length === 0) {
    return {
      name: "Manifest signature trust",
      ok: true,
      detail: "no manifest source configured",
      required: false,
    };
  }

  if (!required) {
    return {
      name: "Manifest signature trust",
      ok: true,
      detail: "not required for local/private manifest source",
      required: false,
    };
  }

  if (cfg.manifestSignatureVerified) {
    return {
      name: "Manifest signature trust",
      ok: true,
      detail: `verified signer=${cfg.manifestSignatureSignerPubkey ?? "unknown"}`,
      required: true,
    };
  }

  return {
    name: "Manifest signature trust",
    ok: false,
    detail: cfg.manifestSignatureDetail ?? "required but not verified",
    required: true,
  };
}

function checkIncidentMode(
  incident:
    | {
        active?: boolean;
        reason?: string;
        enteredAt?: string;
      }
    | undefined,
): ReadinessCheck {
  if (!incident?.active) {
    return {
      name: "Incident mode",
      ok: true,
      detail: "inactive",
      required: false,
    };
  }
  return {
    name: "Incident mode",
    ok: false,
    detail: `active reason=${incident.reason ?? "operator-triggered"} enteredAt=${incident.enteredAt ?? "unknown"}`,
    required: false,
  };
}

function trimSlash(v: string): string {
  return v.replace(/\/+$/, "");
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const parsed = new URL(rpcUrl);
    return `${parsed.protocol}//${parsed.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GatewayAgentInfoResult = {
  agent?: {
    address?: string;
    name?: string;
    registered?: boolean;
    reputation?: number;
    lastHeartbeat?: string | null;
    skills?: string[];
    taskCount?: number;
  };
};
