import { loadClawdConfig } from "./config.js";
import {
  queryGatewayMethod,
  queryGatewayProviderDashboard,
  queryGatewayProviderStatus,
  queryGatewayRuntimeStatus,
  type ClawdGatewayProviderDashboard,
  type ClawdGatewayProviderPhase,
  type ClawdGatewayProviderStatus,
  type ClawdGatewayRuntimeStatus,
} from "./openclaw-gateway.js";
import {
  createRestTaskFetcher,
  determineRecoveryAction,
  loadActiveTasks,
  type RecoveryAction,
} from "./task-recovery.js";

export type ProviderLifecycleItem = {
  ok: boolean;
  detail: string;
  source: "gateway" | "rest" | "local" | "config" | "unavailable";
  phase?: ClawdGatewayProviderPhase;
  evidence?: string[];
};

export type ProviderLifecycleRewards = ProviderLifecycleItem & {
  agentRewardsUclaw: string | null;
  stakingRewards: Array<{ denom: string; amount: string }>;
};

export type ProviderLifecycleRecovery = ProviderLifecycleItem & {
  trackedTaskCount: number;
  actions: RecoveryAction[];
  resumableTaskIds: number[];
  cleanupTaskIds: number[];
};

export type ProviderLifecycleReport = {
  chainId: string;
  agentAddress: string | null;
  gateway: {
    source: "gateway" | "unavailable";
    currentPhase: ClawdGatewayProviderPhase | null;
    ready: boolean | null;
    blockHeight: number | null;
    connectedPeers: number | null;
    evidence: string[];
  };
  registration: ProviderLifecycleItem;
  heartbeat: ProviderLifecycleItem;
  recovery: ProviderLifecycleRecovery;
  rewards: ProviderLifecycleRewards;
  ready: boolean;
  blockers: string[];
};

type GatewayAgentInfoResult = {
  agent?: {
    registered?: boolean;
    name?: string;
    lastHeartbeat?: string | null;
  };
};

type GatewayWalletRewardsResult = {
  total?: Array<{ denom?: string; amount?: string }>;
};

export async function evaluateProviderLifecycle(): Promise<ProviderLifecycleReport> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = trimSlash(cfg.restUrl ?? deriveRestUrl(rpcUrl));

  const [providerStatus, providerDashboard, runtime] = await Promise.all([
    queryGatewayProviderStatus(),
    queryGatewayProviderDashboard(),
    queryGatewayRuntimeStatus(),
  ]);
  const agentAddress =
    cfg.agentAddress?.trim() ||
    providerStatus?.address?.trim() ||
    providerDashboard?.address?.trim() ||
    null;
  const agentInfo = agentAddress
    ? await queryGatewayMethod<GatewayAgentInfoResult>("chain.agents.info", { address: agentAddress })
    : null;
  const walletRewards = agentAddress
    ? await queryGatewayMethod<GatewayWalletRewardsResult>("chain.wallet.staking.rewards", { address: agentAddress })
    : null;

  const registration = await evaluateRegistration(agentAddress, restUrl, providerStatus, runtime, agentInfo);
  const heartbeat = await evaluateHeartbeat(agentAddress, restUrl, providerStatus, providerDashboard, runtime, agentInfo);
  const recovery = await evaluateRecovery(restUrl);
  const rewards = await evaluateRewards(agentAddress, restUrl, providerDashboard, walletRewards);

  const blockers = [
    !registration.ok ? `registration: ${registration.detail}` : null,
    !heartbeat.ok ? `heartbeat: ${heartbeat.detail}` : null,
    !recovery.ok ? `recovery: ${recovery.detail}` : null,
    !rewards.ok ? `rewards: ${rewards.detail}` : null,
  ].filter(Boolean) as string[];

  return {
    chainId: cfg.chainId,
    agentAddress,
    gateway: summarizeProviderGateway(providerStatus, providerDashboard),
    registration,
    heartbeat,
    recovery,
    rewards,
    ready: blockers.length === 0,
    blockers,
  };
}

async function evaluateRegistration(
  agentAddress: string | null,
  restUrl: string,
  providerStatus: ClawdGatewayProviderStatus | null,
  runtime: ClawdGatewayRuntimeStatus | null,
  agentInfo: GatewayAgentInfoResult | null,
): Promise<ProviderLifecycleItem> {
  if (!agentAddress) {
    return {
      ok: false,
      detail: "agentAddress missing in clawd config",
      source: "config",
    };
  }

  const runPhase = providerStatus?.phases?.run;
  if (runPhase?.ok !== undefined) {
    const detail = runPhase.detail ?? "provider.status run phase unavailable";
    const registered = runPhase.ok === true || detail.toLowerCase().includes("registered but");
    return {
      ok: registered,
      detail: registered
        ? `registered via provider.status phase=run`
        : `not registered via provider.status phase=run`,
      source: "gateway",
      phase: "run",
      evidence: [detail],
    };
  }

  if (agentInfo?.agent) {
    const registered = agentInfo.agent.registered === true;
    return {
      ok: registered,
      detail: registered
        ? `registered via chain.agents.info${agentInfo.agent.name ? ` name=${agentInfo.agent.name}` : ""}`
        : "not registered via chain.agents.info",
      source: "gateway",
    };
  }

  if (runtime?.readiness?.checks?.agentRegistered !== undefined) {
    const registered = runtime.readiness.checks.agentRegistered === true;
    return {
      ok: registered,
      detail: registered ? "registered via runtime.status" : "not registered via runtime.status",
      source: "gateway",
    };
  }

  const url = `${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(agentAddress)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        ok: false,
        detail: `HTTP ${res.status} (${url})`,
        source: "rest",
      };
    }
    const data = (await res.json()) as { registered?: boolean };
    return {
      ok: data.registered === true,
      detail: data.registered === true ? "registered via REST" : "not registered via REST",
      source: "rest",
    };
  } catch (err) {
    return {
      ok: false,
      detail: String(err),
      source: "unavailable",
    };
  }
}

async function evaluateHeartbeat(
  agentAddress: string | null,
  restUrl: string,
  providerStatus: ClawdGatewayProviderStatus | null,
  providerDashboard: ClawdGatewayProviderDashboard | null,
  runtime: ClawdGatewayRuntimeStatus | null,
  agentInfo: GatewayAgentInfoResult | null,
): Promise<ProviderLifecycleItem> {
  if (!agentAddress) {
    return {
      ok: false,
      detail: "agentAddress missing in clawd config",
      source: "config",
    };
  }

  const runPhase = providerStatus?.phases?.run;
  if (runPhase?.ok !== undefined) {
    const detail = runPhase.detail ?? "provider.status run phase unavailable";
    return {
      ok: runPhase.ok === true,
      detail: runPhase.ok === true ? "live via provider.status phase=run" : "not live via provider.status phase=run",
      source: "gateway",
      phase: "run",
      evidence: [
        detail,
        providerDashboard?.heartbeat
          ? `heartbeat.enabled=${Boolean(providerDashboard.heartbeat.enabled)} inFlight=${Boolean(providerDashboard.heartbeat.inFlight)} via provider.dashboard`
          : "provider.dashboard heartbeat unavailable",
      ],
    };
  }

  const lastHeartbeat = agentInfo?.agent?.lastHeartbeat;
  if (typeof lastHeartbeat === "string" || lastHeartbeat === null) {
    return {
      ok: Boolean(lastHeartbeat),
      detail: lastHeartbeat ? `lastHeartbeat=${lastHeartbeat} via chain.agents.info` : "lastHeartbeat missing via chain.agents.info",
      source: "gateway",
    };
  }

  if (runtime?.readiness?.checks?.agentLive !== undefined) {
    const ok = runtime.readiness.checks.agentLive === true;
    return {
      ok,
      detail: ok ? "live via runtime.status" : "not live via runtime.status",
      source: "gateway",
    };
  }

  const url = `${restUrl}/clawchain/agent/v1/liveness/${encodeURIComponent(agentAddress)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        ok: false,
        detail: `HTTP ${res.status} (${url})`,
        source: "rest",
      };
    }
    const data = (await res.json()) as {
      found?: boolean;
      liveness?: { heartbeatCount?: number };
    };
    const heartbeatCount = data.liveness?.heartbeatCount ?? 0;
    return {
      ok: Boolean(data.found && heartbeatCount > 0),
      detail: `heartbeatCount=${heartbeatCount} via REST`,
      source: "rest",
    };
  } catch (err) {
    return {
      ok: false,
      detail: String(err),
      source: "unavailable",
    };
  }
}

async function evaluateRecovery(restUrl: string): Promise<ProviderLifecycleRecovery> {
  const tracked = loadActiveTasks();
  if (tracked.length === 0) {
    return {
      ok: true,
      detail: "no locally tracked tasks",
      source: "local",
      trackedTaskCount: 0,
      actions: [],
      resumableTaskIds: [],
      cleanupTaskIds: [],
    };
  }

  const fetchTask = createRestTaskFetcher(restUrl);
  const actions: RecoveryAction[] = [];
  const resumableTaskIds: number[] = [];
  const cleanupTaskIds: number[] = [];

  for (const task of tracked) {
    try {
      const onChainTask = await fetchTask(task.taskId);
      const action = determineRecoveryAction(task, onChainTask);
      actions.push(action);
      if (action.action === "resume") {
        resumableTaskIds.push(action.taskId);
      } else {
        cleanupTaskIds.push(action.taskId);
      }
    } catch {
      actions.push({ action: "cleanup_not_found", taskId: task.taskId });
      cleanupTaskIds.push(task.taskId);
    }
  }

  return {
    ok: true,
    detail:
      cleanupTaskIds.length > 0 || resumableTaskIds.length > 0
        ? `tracked=${tracked.length} resumable=${resumableTaskIds.length} cleanup=${cleanupTaskIds.length}`
        : `tracked=${tracked.length} pending inspection`,
    source: "local",
    trackedTaskCount: tracked.length,
    actions,
    resumableTaskIds,
    cleanupTaskIds,
  };
}

async function evaluateRewards(
  agentAddress: string | null,
  restUrl: string,
  providerDashboard: ClawdGatewayProviderDashboard | null,
  walletRewards: GatewayWalletRewardsResult | null,
): Promise<ProviderLifecycleRewards> {
  if (!agentAddress) {
    return {
      ok: false,
      detail: "agentAddress missing in clawd config",
      source: "config",
      agentRewardsUclaw: null,
      stakingRewards: [],
    };
  }

  const dashboardRewards = providerDashboard?.rewards;
  if (dashboardRewards) {
    const stakingRewards = normalizeCoins(walletRewards?.total);
    return {
      ok: true,
      detail: `providerRewards=${dashboardRewards.total ?? "unavailable"} pending=${dashboardRewards.pending ?? "unavailable"} via provider.dashboard staking=${formatCoins(stakingRewards)}`,
      source: "gateway",
      phase: "earn",
      evidence: [
        `provider.dashboard connected=${Boolean(providerDashboard.connected)}`,
        `blockHeight=${providerDashboard.blockHeight ?? "unknown"}`,
      ],
      agentRewardsUclaw: dashboardRewards.total ?? null,
      stakingRewards,
    };
  }

  let agentRewardsUclaw: string | null = null;
  let source: ProviderLifecycleRewards["source"] = "rest";
  try {
    const res = await fetch(
      `${restUrl}/clawchain/agent/v1/rewards/${encodeURIComponent(agentAddress)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = (await res.json()) as { cumulative_rewards?: string; cumulativeRewards?: string };
      agentRewardsUclaw = String(data.cumulative_rewards ?? data.cumulativeRewards ?? "0");
    }
  } catch {
    source = "unavailable";
  }

  const stakingRewards = normalizeCoins(walletRewards?.total);
  const ok = agentRewardsUclaw !== null || stakingRewards.length > 0;

  return {
    ok,
    detail:
      agentRewardsUclaw !== null || stakingRewards.length > 0
        ? `agent=${agentRewardsUclaw ?? "unavailable"} staking=${formatCoins(stakingRewards)}`
        : "reward visibility unavailable",
    source: walletRewards ? "gateway" : source,
    agentRewardsUclaw,
    stakingRewards,
  };
}

function summarizeProviderGateway(
  providerStatus: ClawdGatewayProviderStatus | null,
  providerDashboard: ClawdGatewayProviderDashboard | null,
): ProviderLifecycleReport["gateway"] {
  const evidence = [
    providerStatus ? "provider.status available" : "provider.status unavailable",
    providerDashboard ? "provider.dashboard available" : "provider.dashboard unavailable",
  ];
  return {
    source: providerStatus || providerDashboard ? "gateway" : "unavailable",
    currentPhase: providerStatus?.currentPhase ?? null,
    ready: providerStatus?.ready ?? providerDashboard?.readiness?.ready ?? null,
    blockHeight: providerStatus?.blockHeight ?? providerDashboard?.blockHeight ?? null,
    connectedPeers:
      providerStatus?.connectedPeers ?? providerDashboard?.network?.connectedPeers ?? null,
    evidence,
  };
}

function normalizeCoins(
  coins: Array<{ denom?: string; amount?: string }> | undefined,
): Array<{ denom: string; amount: string }> {
  return Array.isArray(coins)
    ? coins
        .filter((coin) => typeof coin?.denom === "string" && typeof coin?.amount === "string")
        .map((coin) => ({ denom: coin.denom!, amount: coin.amount! }))
    : [];
}

function formatCoins(coins: Array<{ denom: string; amount: string }>): string {
  if (coins.length === 0) return "none";
  return coins.map((coin) => `${coin.amount}${coin.denom}`).join(",");
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
