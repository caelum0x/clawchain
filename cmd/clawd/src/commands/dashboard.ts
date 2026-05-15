/**
 * `clawd dashboard` — rich terminal status overview of the entire ClawChain network.
 */

import { loadClawdConfig } from "../lib/config.js";
import { formatClaw } from "../lib/format.js";
import { queryGatewayMethod, queryGatewayRuntimeStatus } from "../lib/openclaw-gateway.js";
import { evaluateProviderLifecycle } from "../lib/provider-lifecycle.js";

// ---------------------------------------------------------------------------
// Types for API responses
// ---------------------------------------------------------------------------

interface NodeStatus {
  result?: {
    node_info?: { moniker?: string; network?: string; version?: string };
    sync_info?: {
      latest_block_height?: string;
      latest_block_time?: string;
      catching_up?: boolean;
    };
  };
}

interface SupplyResponse {
  supply?: Array<{ denom?: string; amount?: string }>;
}

interface StakingPoolResponse {
  pool?: { bonded_tokens?: string; not_bonded_tokens?: string };
}

interface InflationResponse {
  inflation?: string;
}

interface CommunityPoolResponse {
  pool?: Array<{ denom?: string; amount?: string }>;
}

interface Validator {
  description?: { moniker?: string };
  tokens?: string;
  status?: string;
}

interface ValidatorsResponse {
  validators?: Validator[];
}

interface LiveAgentsResponse {
  agents?: unknown[];
  pagination?: { total?: string };
}

interface GatewayAgentsListResponse {
  agents?: unknown[];
  count?: number;
  total?: number;
}

interface RecentActivityResponse {
  activity?: unknown[];
  pagination?: { total?: string };
}

interface TreeStatsResponse {
  leaf_count?: string;
  depth?: string;
  current_root?: string;
}

interface SkillsResponse {
  skills?: unknown[];
  pagination?: { total?: string };
}

interface ComputeResourcesResponse {
  resources?: unknown[];
  compute_resources?: unknown[];
  pagination?: { total?: string };
}

interface IBCChannelsResponse {
  channels?: unknown[];
  pagination?: { total?: string };
}

interface IBCConnectionsResponse {
  connections?: unknown[];
  pagination?: { total?: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMEOUT = 5_000;

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function commaNumber(n: bigint | number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pad(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

// Box-drawing helpers
const BOX_W = 56; // inner width (between vertical bars)

function topBorder(): string {
  return "\u2554" + "\u2550".repeat(BOX_W) + "\u2557";
}

function midBorder(): string {
  return "\u2560" + "\u2550".repeat(BOX_W) + "\u2563";
}

function botBorder(): string {
  return "\u255A" + "\u2550".repeat(BOX_W) + "\u255D";
}

function boxLine(text: string): string {
  return "\u2551 " + pad(text, BOX_W - 2) + " \u2551";
}

function boxCenter(text: string): string {
  const totalPad = BOX_W - 2 - text.length;
  if (totalPad <= 0) return boxLine(text);
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return "\u2551 " + " ".repeat(left) + text + " ".repeat(right) + " \u2551";
}

// ---------------------------------------------------------------------------
// Dashboard data structure
// ---------------------------------------------------------------------------

interface DashboardData {
  chain: {
    chainId: string;
    height: string;
    time: string;
    catchingUp: boolean;
    moniker: string;
    version: string;
    reachable: boolean;
  };
  economics: {
    totalSupply: string;
    bondedTokens: string;
    unbondedTokens: string;
    bondedPercent: string;
    inflation: string;
    communityPool: string;
    reachable: boolean;
  };
  validators: {
    activeCount: number;
    top3: Array<{ moniker: string; tokens: string }>;
    reachable: boolean;
  };
  agents: {
    activeCount: string;
    recentActivityCount: string;
    reachable: boolean;
  };
  provider: {
    ready: boolean;
    registration: string;
    heartbeat: string;
    recovery: string;
    rewards: string;
    blockers: string[];
    reachable: boolean;
  };
  privacy: {
    leafCount: string;
    depth: string;
    reachable: boolean;
  };
  marketplace: {
    skillsCount: string;
    computeResourcesCount: string;
    reachable: boolean;
  };
  ibc: {
    channelCount: string;
    connectionCount: string;
    reachable: boolean;
  };
}

// ---------------------------------------------------------------------------
// Fetch all data
// ---------------------------------------------------------------------------

async function gatherDashboardData(): Promise<DashboardData> {
  const config = loadClawdConfig();
  const rpcUrl = (config.rpcUrl || "http://localhost:26657").replace(/\/+$/, "");
  const restUrl = (config.restUrl || "http://localhost:1317").replace(/\/+$/, "");

  const runtime = await queryGatewayRuntimeStatus();
  const providerLifecycle = await evaluateProviderLifecycle();

  // Fire all requests in parallel
  const [
    nodeStatus,
    supply,
    stakingPool,
    inflation,
    communityPool,
    validators,
    liveAgentsGateway,
    liveAgents,
    recentActivity,
    treeStats,
    skills,
    computeResources,
    ibcChannels,
    ibcConnections,
  ] = await Promise.all([
    fetchJSON<NodeStatus>(`${rpcUrl}/status`),
    fetchJSON<SupplyResponse>(`${restUrl}/cosmos/bank/v1beta1/supply`),
    fetchJSON<StakingPoolResponse>(`${restUrl}/cosmos/staking/v1beta1/pool`),
    fetchJSON<InflationResponse>(`${restUrl}/cosmos/mint/v1beta1/inflation`),
    fetchJSON<CommunityPoolResponse>(`${restUrl}/cosmos/distribution/v1beta1/community_pool`),
    fetchJSON<ValidatorsResponse>(`${restUrl}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`),
    queryGatewayMethod<GatewayAgentsListResponse>("chain.agents.list", { limit: 100 }),
    fetchJSON<LiveAgentsResponse>(`${restUrl}/clawchain/agent/v1/live_agents`),
    fetchJSON<RecentActivityResponse>(`${restUrl}/clawchain/agent/v1/recent_activity`),
    fetchJSON<TreeStatsResponse>(`${restUrl}/clawchain/privacy/v1/tree_stats`),
    fetchJSON<SkillsResponse>(`${restUrl}/clawchain/marketplace/v1/skills`),
    fetchJSON<ComputeResourcesResponse>(`${restUrl}/clawchain/marketplace/v1/compute_resources`),
    fetchJSON<IBCChannelsResponse>(`${restUrl}/ibc/core/channel/v1/channels`),
    fetchJSON<IBCConnectionsResponse>(`${restUrl}/ibc/core/connection/v1/connections`),
  ]);

  // -- Chain Status --
  const nodeInfo = nodeStatus?.result?.node_info;
  const syncInfo = nodeStatus?.result?.sync_info;

  // -- Economics --
  const clawSupply = supply?.supply?.find(
    (s) => s.denom === "uclaw",
  );
  const bonded = stakingPool?.pool?.bonded_tokens ?? "0";
  const unbonded = stakingPool?.pool?.not_bonded_tokens ?? "0";
  const totalSupplyAmt = clawSupply?.amount ?? "0";
  let bondedPercent = "0.00";
  if (BigInt(totalSupplyAmt) > 0n) {
    bondedPercent = ((Number(bonded) / Number(totalSupplyAmt)) * 100).toFixed(2);
  }

  const inflationStr = inflation?.inflation ?? "0";
  const inflationPct = (parseFloat(inflationStr) * 100).toFixed(2);

  const cpoolClaw = communityPool?.pool?.find(
    (c) => c.denom === "uclaw",
  );
  // Community pool amounts can be decimal strings; truncate to integer
  const cpoolAmount = cpoolClaw?.amount
    ? cpoolClaw.amount.split(".")[0]
    : "0";

  // -- Validators --
  const validatorList = validators?.validators ?? [];
  const sorted = [...validatorList].sort(
    (a, b) => Number(BigInt(b.tokens ?? "0") - BigInt(a.tokens ?? "0")),
  );
  const top3 = sorted.slice(0, 3).map((v) => ({
    moniker: v.description?.moniker ?? "unknown",
    tokens: v.tokens ?? "0",
  }));

  // -- Agents --
  const agentList = liveAgents?.agents ?? [];
  const agentTotal =
    liveAgentsGateway?.total !== undefined
      ? String(liveAgentsGateway.total)
      : liveAgents?.pagination?.total ?? String(agentList.length);
  const activityList = recentActivity?.activity ?? [];
  const activityTotal =
    recentActivity?.pagination?.total ?? String(activityList.length);

  // -- Privacy --
  const leafCount = treeStats?.leaf_count ?? "0";
  const depth = treeStats?.depth ?? "0";

  // -- Marketplace --
  const skillList = skills?.skills ?? [];
  const skillTotal = skills?.pagination?.total ?? String(skillList.length);
  const computeList =
    computeResources?.compute_resources ?? computeResources?.resources ?? [];
  const computeTotal =
    computeResources?.pagination?.total ?? String(computeList.length);

  // -- IBC --
  const channelList = ibcChannels?.channels ?? [];
  const channelTotal =
    ibcChannels?.pagination?.total ?? String(channelList.length);
  const connList = ibcConnections?.connections ?? [];
  const connTotal =
    ibcConnections?.pagination?.total ?? String(connList.length);

  return {
    chain: {
      chainId: nodeInfo?.network ?? config.chainId,
      height:
        syncInfo?.latest_block_height ??
        (runtime?.chain?.latestBlockHeight !== undefined && runtime.chain.latestBlockHeight !== null
          ? String(runtime.chain.latestBlockHeight)
          : "-"),
      time: syncInfo?.latest_block_time ?? "-",
      catchingUp: syncInfo?.catching_up ?? runtime?.chain?.catchingUp ?? false,
      moniker: nodeInfo?.moniker ?? "-",
      version: nodeInfo?.version ?? "-",
      reachable: nodeStatus !== null || runtime?.chain?.alive === true,
    },
    economics: {
      totalSupply: totalSupplyAmt,
      bondedTokens: bonded,
      unbondedTokens: unbonded,
      bondedPercent,
      inflation: inflationPct,
      communityPool: cpoolAmount,
      reachable: supply !== null || stakingPool !== null,
    },
    validators: {
      activeCount: validatorList.length,
      top3,
      reachable: validators !== null,
    },
    agents: {
      activeCount: agentTotal,
      recentActivityCount: activityTotal,
      reachable: liveAgentsGateway !== null || liveAgents !== null,
    },
    provider: {
      ready: providerLifecycle.ready,
      registration: providerLifecycle.registration.detail,
      heartbeat: providerLifecycle.heartbeat.detail,
      recovery: providerLifecycle.recovery.detail,
      rewards: providerLifecycle.rewards.detail,
      blockers: providerLifecycle.blockers,
      reachable: true,
    },
    privacy: {
      leafCount,
      depth,
      reachable: treeStats !== null,
    },
    marketplace: {
      skillsCount: skillTotal,
      computeResourcesCount: computeTotal,
      reachable: skills !== null || computeResources !== null,
    },
    ibc: {
      channelCount: channelTotal,
      connectionCount: connTotal,
      reachable: ibcChannels !== null || ibcConnections !== null,
    },
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderDashboard(data: DashboardData): string {
  const lines: string[] = [];

  lines.push(topBorder());
  lines.push(boxCenter("ClawChain Dashboard"));
  lines.push(midBorder());

  // -- Chain Status --
  lines.push(boxLine("Chain Status"));
  if (data.chain.reachable) {
    lines.push(boxLine(`  Chain ID : ${data.chain.chainId}`));
    lines.push(boxLine(`  Block    : ${commaNumber(Number(data.chain.height))}`));
    lines.push(boxLine(`  Time     : ${data.chain.time}`));
    lines.push(boxLine(`  Syncing  : ${data.chain.catchingUp ? "YES" : "no"}`));
    lines.push(boxLine(`  Moniker  : ${data.chain.moniker}`));
    lines.push(boxLine(`  Version  : ${data.chain.version}`));
  } else {
    lines.push(boxLine("  (node not reachable)"));
  }

  lines.push(midBorder());

  // -- Economics --
  lines.push(boxLine("Network Economics"));
  if (data.economics.reachable) {
    lines.push(boxLine(`  Supply       : ${formatClaw(data.economics.totalSupply)}`));
    lines.push(
      boxLine(
        `  Bonded       : ${formatClaw(data.economics.bondedTokens)} (${data.economics.bondedPercent}%)`,
      ),
    );
    lines.push(boxLine(`  Unbonded     : ${formatClaw(data.economics.unbondedTokens)}`));
    lines.push(boxLine(`  Inflation    : ${data.economics.inflation}%`));
    lines.push(boxLine(`  Community    : ${formatClaw(data.economics.communityPool)}`));
  } else {
    lines.push(boxLine("  (REST API not reachable)"));
  }

  lines.push(midBorder());

  // -- Validators --
  lines.push(boxLine("Validators"));
  if (data.validators.reachable) {
    lines.push(boxLine(`  Active: ${data.validators.activeCount}`));
    if (data.validators.top3.length > 0) {
      lines.push(boxLine("  Top validators by voting power:"));
      for (const v of data.validators.top3) {
        const name = v.moniker.length > 20 ? v.moniker.slice(0, 17) + "..." : v.moniker;
        lines.push(boxLine(`    ${name}  ${formatClaw(v.tokens)}`));
      }
    }
  } else {
    lines.push(boxLine("  (not reachable)"));
  }

  lines.push(midBorder());

  // -- Agent Network --
  lines.push(boxLine("Agent Network"));
  if (data.agents.reachable) {
    lines.push(boxLine(`  Active agents    : ${commaNumber(Number(data.agents.activeCount))}`));
    lines.push(boxLine(`  Recent activity  : ${commaNumber(Number(data.agents.recentActivityCount))}`));
  } else {
    lines.push(boxLine("  (not reachable)"));
  }

  lines.push(midBorder());

  // -- Local Provider --
  lines.push(boxLine("Local Provider"));
  if (data.provider.reachable) {
    lines.push(boxLine(`  Ready            : ${data.provider.ready ? "YES" : "no"}`));
    lines.push(boxLine(`  Registration     : ${data.provider.registration}`));
    lines.push(boxLine(`  Heartbeat        : ${data.provider.heartbeat}`));
    lines.push(boxLine(`  Recovery         : ${data.provider.recovery}`));
    lines.push(boxLine(`  Rewards          : ${data.provider.rewards}`));
    if (data.provider.blockers.length > 0) {
      const blockerText = data.provider.blockers.join(" | ");
      lines.push(boxLine(`  Blockers         : ${blockerText}`));
    }
  } else {
    lines.push(boxLine("  (not reachable)"));
  }

  lines.push(midBorder());

  // -- Privacy Pool --
  lines.push(boxLine("Privacy Pool"));
  if (data.privacy.reachable) {
    lines.push(boxLine(`  Merkle leaves : ${commaNumber(Number(data.privacy.leafCount))}`));
    lines.push(boxLine(`  Tree depth    : ${data.privacy.depth}`));
  } else {
    lines.push(boxLine("  (not reachable)"));
  }

  lines.push(midBorder());

  // -- Marketplace --
  lines.push(boxLine("Marketplace"));
  if (data.marketplace.reachable) {
    lines.push(boxLine(`  Skills            : ${commaNumber(Number(data.marketplace.skillsCount))}`));
    lines.push(boxLine(`  Compute resources : ${commaNumber(Number(data.marketplace.computeResourcesCount))}`));
  } else {
    lines.push(boxLine("  (not reachable)"));
  }

  lines.push(midBorder());

  // -- IBC --
  lines.push(boxLine("IBC"));
  if (data.ibc.reachable) {
    lines.push(boxLine(`  Channels    : ${commaNumber(Number(data.ibc.channelCount))}`));
    lines.push(boxLine(`  Connections : ${commaNumber(Number(data.ibc.connectionCount))}`));
  } else {
    lines.push(boxLine("  (not reachable)"));
  }

  lines.push(botBorder());

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runDashboard(opts: { json?: boolean }): Promise<void> {
  const data = await gatherDashboardData();

  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    return;
  }

  console.log(renderDashboard(data));
}
