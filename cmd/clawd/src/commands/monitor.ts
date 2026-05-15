/**
 * `clawd monitor` — real-time chain monitoring focused on health.
 *
 * Subcommands:
 *   (default)    — live health dashboard (block height, peers, mempool, validators)
 *   validators   — track validator set changes
 *   blocks       — watch last N blocks
 *   agents       — watch agent activity
 *   dex          — watch DEX activity
 */

import { loadClawdConfig } from "../lib/config.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Types
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

interface NetInfoResponse {
  result?: {
    n_peers?: string;
    peers?: Array<{
      node_info?: { moniker?: string; id?: string };
      remote_ip?: string;
    }>;
  };
}

interface UnconfirmedTxsResponse {
  result?: {
    n_txs?: string;
    total?: string;
    total_bytes?: string;
  };
}

interface Validator {
  operator_address?: string;
  description?: { moniker?: string };
  tokens?: string;
  status?: string;
  jailed?: boolean;
}

interface ValidatorsResponse {
  validators?: Validator[];
  pagination?: { total?: string };
}

interface BlockResponse {
  result?: {
    block?: {
      header?: {
        height?: string;
        time?: string;
        proposer_address?: string;
      };
      data?: {
        txs?: string[];
      };
    };
  };
  block?: {
    header?: {
      height?: string;
      time?: string;
      proposer_address?: string;
    };
    data?: {
      txs?: string[];
    };
  };
}

interface BlockResultsResponse {
  result?: {
    txs_results?: Array<{
      gas_wanted?: string;
      gas_used?: string;
    }>;
  };
}

interface LiveAgentsResponse {
  agents?: Array<{
    address?: string;
    moniker?: string;
    status?: string;
  }>;
  pagination?: { total?: string };
}

interface AgentStatsResponse {
  total_registered?: string;
  total_active?: string;
  tasks_in_progress?: string;
  tasks_completed?: string;
  heartbeats_per_minute?: string;
}

interface RecentActivityResponse {
  activity?: Array<{
    type?: string;
    agent?: string;
    timestamp?: string;
  }>;
  pagination?: { total?: string };
}

interface DexPoolsResponse {
  pools?: Array<{
    id?: string;
    pair?: string;
    total_liquidity?: string;
    volume_24h?: string;
  }>;
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

/** Color-coded status indicator. */
function statusIndicator(level: "healthy" | "degraded" | "critical"): string {
  switch (level) {
    case "healthy":
      return "\x1b[32m[OK]\x1b[0m";
    case "degraded":
      return "\x1b[33m[WARN]\x1b[0m";
    case "critical":
      return "\x1b[31m[CRIT]\x1b[0m";
  }
}

/** Green text. */
function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

/** Yellow text. */
function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

/** Red text. */
function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}

/** Dim text. */
function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

/** Bold text. */
function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

function commaNumber(n: number | bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function timeSince(isoTime: string): string {
  try {
    const diff = Date.now() - new Date(isoTime).getTime();
    if (diff < 0) return "future";
    if (diff < 1000) return "<1s";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
  } catch {
    return "-";
  }
}

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function getUrls(): { rpcUrl: string; restUrl: string } {
  const cfg = loadClawdConfig();
  const rpcUrl = (cfg.rpcUrl || "http://localhost:26657").replace(/\/+$/, "");
  const restUrl = (cfg.restUrl || "http://localhost:1317").replace(/\/+$/, "");
  return { rpcUrl, restUrl };
}

// ---------------------------------------------------------------------------
// Monitor: live health dashboard
// ---------------------------------------------------------------------------

interface HealthSnapshot {
  blockHeight: string;
  blockTime: string;
  catchingUp: boolean;
  chainId: string;
  peerCount: string;
  mempoolTxs: string;
  mempoolBytes: string;
  validatorCount: number;
  jailedCount: number;
  nodeReachable: boolean;
}

async function gatherHealth(): Promise<HealthSnapshot> {
  const { rpcUrl, restUrl } = getUrls();

  const [nodeStatus, netInfo, unconfirmedTxs, validators] = await Promise.all([
    fetchJSON<NodeStatus>(`${rpcUrl}/status`),
    fetchJSON<NetInfoResponse>(`${rpcUrl}/net_info`),
    fetchJSON<UnconfirmedTxsResponse>(`${rpcUrl}/unconfirmed_txs?limit=0`),
    fetchJSON<ValidatorsResponse>(
      `${restUrl}/cosmos/staking/v1beta1/validators?pagination.limit=500`,
    ),
  ]);

  const syncInfo = nodeStatus?.result?.sync_info;
  const nodeInfo = nodeStatus?.result?.node_info;
  const valList = validators?.validators ?? [];
  const jailed = valList.filter((v) => v.jailed === true).length;

  return {
    blockHeight: syncInfo?.latest_block_height ?? "-",
    blockTime: syncInfo?.latest_block_time ?? "-",
    catchingUp: syncInfo?.catching_up ?? false,
    chainId: nodeInfo?.network ?? "-",
    peerCount: netInfo?.result?.n_peers ?? "-",
    mempoolTxs: unconfirmedTxs?.result?.n_txs ?? unconfirmedTxs?.result?.total ?? "-",
    mempoolBytes: unconfirmedTxs?.result?.total_bytes ?? "-",
    validatorCount: valList.filter((v) => v.status === "BOND_STATUS_BONDED").length,
    jailedCount: jailed,
    nodeReachable: nodeStatus !== null,
  };
}

function renderHealth(snap: HealthSnapshot): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(bold("ClawChain Monitor") + dim(`  ${now}`));
  lines.push("");

  if (!snap.nodeReachable) {
    lines.push(`  Node:      ${statusIndicator("critical")} not reachable`);
    lines.push("");
    lines.push(dim("  Waiting for node connection..."));
    return lines.join("\n");
  }

  // Block height
  const blockAge = snap.blockTime !== "-" ? timeSince(snap.blockTime) : "-";
  const blockAgeMs =
    snap.blockTime !== "-" ? Date.now() - new Date(snap.blockTime).getTime() : 0;
  const blockHealthLevel =
    blockAgeMs > 30_000 ? "critical" : blockAgeMs > 10_000 ? "degraded" : "healthy";
  lines.push(
    `  Block:     ${statusIndicator(blockHealthLevel)} ${commaNumber(Number(snap.blockHeight))} (${blockAge})`,
  );

  // Sync status
  if (snap.catchingUp) {
    lines.push(`  Sync:      ${statusIndicator("degraded")} catching up`);
  } else {
    lines.push(`  Sync:      ${statusIndicator("healthy")} synced`);
  }

  // Chain ID
  lines.push(`  Chain ID:  ${snap.chainId}`);

  // Peers
  const peerNum = parseInt(snap.peerCount, 10);
  const peerLevel = isNaN(peerNum) || peerNum === 0 ? "critical" : peerNum < 3 ? "degraded" : "healthy";
  lines.push(`  Peers:     ${statusIndicator(peerLevel)} ${snap.peerCount}`);

  // Validators
  const valLevel = snap.validatorCount === 0 ? "critical" : "healthy";
  const jailStr = snap.jailedCount > 0 ? yellow(` (${snap.jailedCount} jailed)`) : "";
  lines.push(`  Validators:${statusIndicator(valLevel)} ${snap.validatorCount} active${jailStr}`);

  // Mempool
  const mempoolNum = parseInt(snap.mempoolTxs, 10);
  const mempoolLevel =
    isNaN(mempoolNum) ? "degraded" : mempoolNum > 100 ? "degraded" : "healthy";
  const mempoolBytesStr = snap.mempoolBytes !== "-"
    ? ` (${commaNumber(Number(snap.mempoolBytes))} bytes)`
    : "";
  lines.push(
    `  Mempool:   ${statusIndicator(mempoolLevel)} ${snap.mempoolTxs} txs${mempoolBytesStr}`,
  );

  lines.push("");
  lines.push(dim("  Press Ctrl+C to exit"));

  return lines.join("\n");
}

export async function runMonitor(opts: {
  json?: boolean;
  interval?: number;
}): Promise<void> {
  const intervalMs = ((opts.interval ?? 5) * 1000);

  const tick = async () => {
    const snap = await gatherHealth();
    if (opts.json) {
      process.stdout.write(JSON.stringify(snap) + "\n");
    } else {
      clearScreen();
      console.log(renderHealth(snap));
    }
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    clearInterval(timer);
    if (!opts.json) {
      console.log("\nMonitor stopped.");
    }
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Monitor: validators
// ---------------------------------------------------------------------------

interface ValidatorSnapshot {
  active: Array<{
    moniker: string;
    address: string;
    tokens: string;
    status: string;
    jailed: boolean;
  }>;
  jailed: Array<{
    moniker: string;
    address: string;
    tokens: string;
  }>;
  totalActive: number;
  totalJailed: number;
  totalTombstoned: number;
  reachable: boolean;
}

async function gatherValidators(): Promise<ValidatorSnapshot> {
  const { restUrl } = getUrls();

  const [bonded, all] = await Promise.all([
    fetchJSON<ValidatorsResponse>(
      `${restUrl}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=200`,
    ),
    fetchJSON<ValidatorsResponse>(
      `${restUrl}/cosmos/staking/v1beta1/validators?pagination.limit=500`,
    ),
  ]);

  const bondedList = bonded?.validators ?? [];
  const allList = all?.validators ?? [];
  const jailedList = allList.filter((v) => v.jailed === true);
  const tombstonedCount = allList.filter(
    (v) => v.status === "BOND_STATUS_UNSPECIFIED" && v.jailed === true,
  ).length;

  const active = bondedList
    .sort((a, b) => Number(BigInt(b.tokens ?? "0") - BigInt(a.tokens ?? "0")))
    .map((v) => ({
      moniker: v.description?.moniker ?? "unknown",
      address: v.operator_address ?? "",
      tokens: v.tokens ?? "0",
      status: v.status ?? "",
      jailed: v.jailed ?? false,
    }));

  const jailed = jailedList.map((v) => ({
    moniker: v.description?.moniker ?? "unknown",
    address: v.operator_address ?? "",
    tokens: v.tokens ?? "0",
  }));

  return {
    active,
    jailed,
    totalActive: bondedList.length,
    totalJailed: jailedList.length,
    totalTombstoned: tombstonedCount,
    reachable: bonded !== null || all !== null,
  };
}

function renderValidators(snap: ValidatorSnapshot): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(bold("ClawChain Validator Monitor") + dim(`  ${now}`));
  lines.push("");

  if (!snap.reachable) {
    lines.push(`  ${statusIndicator("critical")} REST API not reachable`);
    return lines.join("\n");
  }

  lines.push(`  Active validators:  ${green(String(snap.totalActive))}`);
  lines.push(`  Jailed:             ${snap.totalJailed > 0 ? red(String(snap.totalJailed)) : green("0")}`);
  lines.push(`  Tombstoned:         ${snap.totalTombstoned > 0 ? red(String(snap.totalTombstoned)) : green("0")}`);
  lines.push("");

  if (snap.active.length > 0) {
    lines.push(bold("  Active Validators (by voting power):"));
    const headers = ["Moniker", "Address", "Voting Power"];
    const rows = snap.active.slice(0, 20).map((v) => [
      v.moniker.length > 20 ? v.moniker.slice(0, 17) + "..." : v.moniker,
      shortAddr(v.address),
      formatClaw(v.tokens),
    ]);
    const tbl = table(headers, rows);
    for (const line of tbl.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  if (snap.jailed.length > 0) {
    lines.push("");
    lines.push(bold("  Jailed Validators:"));
    for (const v of snap.jailed.slice(0, 10)) {
      lines.push(`    ${red("JAILED")} ${v.moniker} (${shortAddr(v.address)})`);
    }
  }

  lines.push("");
  lines.push(dim("  Press Ctrl+C to exit"));
  return lines.join("\n");
}

export async function runMonitorValidators(opts: {
  json?: boolean;
  interval?: number;
}): Promise<void> {
  const intervalMs = (opts.interval ?? 5) * 1000;

  const tick = async () => {
    const snap = await gatherValidators();
    if (opts.json) {
      process.stdout.write(JSON.stringify(snap) + "\n");
    } else {
      clearScreen();
      console.log(renderValidators(snap));
    }
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    if (!opts.json) console.log("\nMonitor stopped.");
    process.exit(0);
  });

  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Monitor: blocks
// ---------------------------------------------------------------------------

interface BlockInfo {
  height: string;
  time: string;
  txCount: number;
  proposer: string;
  gasUsed: string;
  gasWanted: string;
  timeSincePrev: string;
}

interface BlocksSnapshot {
  blocks: BlockInfo[];
  reachable: boolean;
}

async function gatherBlocks(count: number): Promise<BlocksSnapshot> {
  const { rpcUrl } = getUrls();

  // Get latest height first
  const nodeStatus = await fetchJSON<NodeStatus>(`${rpcUrl}/status`);
  if (!nodeStatus?.result?.sync_info?.latest_block_height) {
    return { blocks: [], reachable: false };
  }

  const latestHeight = parseInt(nodeStatus.result.sync_info.latest_block_height, 10);
  const startHeight = Math.max(1, latestHeight - count + 1);

  // Fetch blocks in parallel
  const blockPromises: Promise<{ block: BlockResponse | null; results: BlockResultsResponse | null }>[] = [];
  for (let h = latestHeight; h >= startHeight; h--) {
    blockPromises.push(
      Promise.all([
        fetchJSON<BlockResponse>(`${rpcUrl}/block?height=${h}`),
        fetchJSON<BlockResultsResponse>(`${rpcUrl}/block_results?height=${h}`),
      ]).then(([block, results]) => ({ block, results })),
    );
  }

  const blockData = await Promise.all(blockPromises);

  const blocks: BlockInfo[] = [];
  let prevTime: string | null = null;

  // Process from oldest to newest for time diff calculation, then reverse
  const sorted = blockData.reverse();
  for (const { block, results } of sorted) {
    const header = block?.result?.block?.header ?? block?.block?.header;
    const txs = block?.result?.block?.data?.txs ?? block?.block?.data?.txs ?? [];
    const txResults = results?.result?.txs_results ?? [];

    let totalGasUsed = 0;
    let totalGasWanted = 0;
    for (const txr of txResults) {
      totalGasUsed += parseInt(txr.gas_used ?? "0", 10);
      totalGasWanted += parseInt(txr.gas_wanted ?? "0", 10);
    }

    const height = header?.height ?? "-";
    const time = header?.time ?? "-";
    let timeSincePrevStr = "-";
    if (prevTime && time !== "-") {
      const diffMs = new Date(time).getTime() - new Date(prevTime).getTime();
      timeSincePrevStr = diffMs < 1000 ? "<1s" : `${(diffMs / 1000).toFixed(1)}s`;
    }
    prevTime = time;

    blocks.push({
      height,
      time,
      txCount: txs.length,
      proposer: header?.proposer_address
        ? header.proposer_address.slice(0, 12) + "..."
        : "-",
      gasUsed: commaNumber(totalGasUsed),
      gasWanted: commaNumber(totalGasWanted),
      timeSincePrev: timeSincePrevStr,
    });
  }

  // Return newest first
  blocks.reverse();

  return { blocks, reachable: true };
}

function renderBlocks(snap: BlocksSnapshot): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(bold("ClawChain Block Monitor") + dim(`  ${now}`));
  lines.push("");

  if (!snap.reachable) {
    lines.push(`  ${statusIndicator("critical")} Node not reachable`);
    return lines.join("\n");
  }

  if (snap.blocks.length === 0) {
    lines.push("  No blocks found.");
    return lines.join("\n");
  }

  const headers = ["Height", "Proposer", "Txs", "Block Time", "Gas Used/Limit", "Since Prev"];
  const rows = snap.blocks.map((b) => [
    b.height,
    b.proposer,
    String(b.txCount),
    timeSince(b.time),
    `${b.gasUsed}/${b.gasWanted}`,
    b.timeSincePrev,
  ]);

  const tbl = table(headers, rows);
  for (const line of tbl.split("\n")) {
    lines.push(`  ${line}`);
  }

  lines.push("");
  lines.push(dim("  Press Ctrl+C to exit"));
  return lines.join("\n");
}

export async function runMonitorBlocks(opts: {
  count?: number;
  json?: boolean;
  interval?: number;
}): Promise<void> {
  const count = opts.count ?? 10;
  const intervalMs = (opts.interval ?? 5) * 1000;

  const tick = async () => {
    const snap = await gatherBlocks(count);
    if (opts.json) {
      process.stdout.write(JSON.stringify(snap) + "\n");
    } else {
      clearScreen();
      console.log(renderBlocks(snap));
    }
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    if (!opts.json) console.log("\nMonitor stopped.");
    process.exit(0);
  });

  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Monitor: agents
// ---------------------------------------------------------------------------

interface AgentSnapshot {
  totalRegistered: string;
  totalActive: string;
  heartbeatsPerMin: string;
  tasksInProgress: string;
  tasksCompleted: string;
  recentActivity: Array<{
    type: string;
    agent: string;
    timestamp: string;
  }>;
  reachable: boolean;
}

async function gatherAgents(): Promise<AgentSnapshot> {
  const { restUrl } = getUrls();

  const [stats, liveAgents, recentActivity] = await Promise.all([
    fetchJSON<AgentStatsResponse>(`${restUrl}/clawchain/agent/v1/stats`),
    fetchJSON<LiveAgentsResponse>(`${restUrl}/clawchain/agent/v1/live_agents`),
    fetchJSON<RecentActivityResponse>(`${restUrl}/clawchain/agent/v1/recent_activity`),
  ]);

  const agentList = liveAgents?.agents ?? [];
  const activityList = recentActivity?.activity ?? [];

  return {
    totalRegistered: stats?.total_registered ?? liveAgents?.pagination?.total ?? String(agentList.length),
    totalActive: stats?.total_active ?? String(agentList.filter((a) => a.status === "active" || a.status === "ACTIVE").length),
    heartbeatsPerMin: stats?.heartbeats_per_minute ?? "-",
    tasksInProgress: stats?.tasks_in_progress ?? "-",
    tasksCompleted: stats?.tasks_completed ?? "-",
    recentActivity: activityList.slice(0, 10).map((a) => ({
      type: a.type ?? "-",
      agent: a.agent ?? "-",
      timestamp: a.timestamp ?? "-",
    })),
    reachable: stats !== null || liveAgents !== null,
  };
}

function renderAgents(snap: AgentSnapshot): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(bold("ClawChain Agent Monitor") + dim(`  ${now}`));
  lines.push("");

  if (!snap.reachable) {
    lines.push(`  ${statusIndicator("critical")} Agent API not reachable`);
    return lines.join("\n");
  }

  lines.push(`  Registered agents:  ${green(snap.totalRegistered)}`);
  lines.push(`  Active agents:      ${green(snap.totalActive)}`);
  lines.push(`  Heartbeats/min:     ${snap.heartbeatsPerMin}`);
  lines.push(`  Tasks in progress:  ${snap.tasksInProgress}`);
  lines.push(`  Tasks completed:    ${snap.tasksCompleted}`);

  if (snap.recentActivity.length > 0) {
    lines.push("");
    lines.push(bold("  Recent Activity:"));
    for (const a of snap.recentActivity) {
      const agentShort = a.agent.length > 15 ? shortAddr(a.agent) : a.agent;
      lines.push(`    ${dim(timeSince(a.timestamp))}  ${a.type}  ${agentShort}`);
    }
  }

  lines.push("");
  lines.push(dim("  Press Ctrl+C to exit"));
  return lines.join("\n");
}

export async function runMonitorAgents(opts: {
  json?: boolean;
  interval?: number;
}): Promise<void> {
  const intervalMs = (opts.interval ?? 5) * 1000;

  const tick = async () => {
    const snap = await gatherAgents();
    if (opts.json) {
      process.stdout.write(JSON.stringify(snap) + "\n");
    } else {
      clearScreen();
      console.log(renderAgents(snap));
    }
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    if (!opts.json) console.log("\nMonitor stopped.");
    process.exit(0);
  });

  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Monitor: dex
// ---------------------------------------------------------------------------

interface DexSnapshot {
  totalPools: string;
  volume24h: string;
  recentSwaps: Array<{
    pair: string;
    amount: string;
    timestamp: string;
  }>;
  liquidityChanges: Array<{
    pool: string;
    type: string;
    amount: string;
    timestamp: string;
  }>;
  reachable: boolean;
}

async function gatherDex(): Promise<DexSnapshot> {
  const { restUrl } = getUrls();

  const pools = await fetchJSON<DexPoolsResponse>(
    `${restUrl}/clawchain/dex/v1/pools`,
  );

  const poolList = pools?.pools ?? [];
  let totalVolume = 0n;
  for (const p of poolList) {
    totalVolume += BigInt(p.volume_24h ?? "0");
  }

  // Recent swaps/liquidity changes would come from activity endpoints;
  // use available pool data as a baseline
  const recentSwaps = poolList.slice(0, 5).map((p) => ({
    pair: p.pair ?? p.id ?? "-",
    amount: p.volume_24h ?? "0",
    timestamp: new Date().toISOString(),
  }));

  return {
    totalPools: pools?.pagination?.total ?? String(poolList.length),
    volume24h: totalVolume.toString(),
    recentSwaps,
    liquidityChanges: [],
    reachable: pools !== null,
  };
}

function renderDex(snap: DexSnapshot): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(bold("ClawChain DEX Monitor") + dim(`  ${now}`));
  lines.push("");

  if (!snap.reachable) {
    lines.push(`  ${statusIndicator("degraded")} DEX API not reachable`);
    lines.push(dim("  DEX module may not be enabled on this chain."));
    return lines.join("\n");
  }

  const poolCount = parseInt(snap.totalPools, 10);
  const poolLevel = poolCount === 0 ? "degraded" : "healthy";
  lines.push(`  Total pools:  ${statusIndicator(poolLevel)} ${snap.totalPools}`);
  lines.push(`  24h volume:   ${formatClaw(snap.volume24h)}`);

  if (snap.recentSwaps.length > 0) {
    lines.push("");
    lines.push(bold("  Pool Activity (by 24h volume):"));
    const headers = ["Pair", "24h Volume"];
    const rows = snap.recentSwaps.map((s) => [
      s.pair,
      formatClaw(s.amount),
    ]);
    const tbl = table(headers, rows);
    for (const line of tbl.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  if (snap.liquidityChanges.length > 0) {
    lines.push("");
    lines.push(bold("  Recent Liquidity Changes:"));
    for (const lc of snap.liquidityChanges.slice(0, 5)) {
      lines.push(`    ${lc.type} ${lc.pool} ${formatClaw(lc.amount)} ${dim(timeSince(lc.timestamp))}`);
    }
  }

  lines.push("");
  lines.push(dim("  Press Ctrl+C to exit"));
  return lines.join("\n");
}

export async function runMonitorDex(opts: {
  json?: boolean;
  interval?: number;
}): Promise<void> {
  const intervalMs = (opts.interval ?? 5) * 1000;

  const tick = async () => {
    const snap = await gatherDex();
    if (opts.json) {
      process.stdout.write(JSON.stringify(snap) + "\n");
    } else {
      clearScreen();
      console.log(renderDex(snap));
    }
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    if (!opts.json) console.log("\nMonitor stopped.");
    process.exit(0);
  });

  await new Promise(() => {});
}
