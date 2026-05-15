/**
 * `clawd benchmark` subcommands -- built-in performance benchmarking.
 *
 * Run comprehensive chain benchmarks, compare results, and track history:
 *   benchmark run        -- run a benchmark suite (quick, standard, thorough)
 *   benchmark compare    -- compare two benchmark results
 *   benchmark profiles   -- list available benchmark profiles
 *   benchmark history    -- show past benchmark runs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table } from "../lib/format.js";
import { CLAWD_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkerResult = {
  requestId: number;
  startTime: number;
  endTime: number;
  latencyMs: number;
  success: boolean;
  statusCode: number;
  endpoint: string;
  error?: string;
};

type PhaseResult = {
  name: string;
  description: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  errors: Record<string, number>;
  durationSec: number;
};

type BenchmarkResult = {
  id: string;
  profile: string;
  startedAt: string;
  completedAt: string;
  rpcUrl: string;
  restUrl: string;
  chainId: string;
  phases: PhaseResult[];
  summary: {
    totalRequests: number;
    overallSuccessRate: number;
    overallRps: number;
    overallP50: number;
    overallP95: number;
    overallP99: number;
  };
};

type BenchmarkProfile = {
  name: string;
  description: string;
  durationSec: number;
  concurrency: number;
  scenarios: string[];
};

type WriteContext = {
  wallet: DirectSecp256k1HdWallet;
  address: string;
};

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const PROFILES: Record<string, BenchmarkProfile> = {
  quick: {
    name: "quick",
    description: "Fast smoke test -- read-only queries, 10s",
    durationSec: 10,
    concurrency: 5,
    scenarios: ["rpc_health", "block_query", "account_query"],
  },
  standard: {
    name: "standard",
    description: "Balanced benchmark -- mixed read/write, 30s",
    durationSec: 30,
    concurrency: 10,
    scenarios: ["rpc_health", "block_query", "account_query", "tx_broadcast"],
  },
  thorough: {
    name: "thorough",
    description: "Full stress test -- all scenarios, 120s",
    durationSec: 120,
    concurrency: 50,
    scenarios: ["rpc_health", "block_query", "account_query", "tx_broadcast", "cosmwasm_query"],
  },
};

// ---------------------------------------------------------------------------
// Benchmarks directory
// ---------------------------------------------------------------------------

const BENCHMARKS_DIR = join(CLAWD_HOME, "benchmarks");

function ensureBenchmarksDir(): void {
  mkdirSync(BENCHMARKS_DIR, { recursive: true });
}

function saveBenchmarkResult(result: BenchmarkResult): string {
  ensureBenchmarksDir();
  const filename = `benchmark-${result.id}.json`;
  const filePath = join(BENCHMARKS_DIR, filename);
  writeFileSync(filePath, JSON.stringify(result, null, 2) + "\n");
  return filePath;
}

function loadBenchmarkFile(filePath: string): BenchmarkResult {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as BenchmarkResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, "").replace(/\.\d+Z$/, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Percentile calculation
// ---------------------------------------------------------------------------

function calculatePercentiles(
  values: number[],
  percentiles: number[],
): Record<string, number> {
  if (values.length === 0) {
    const result: Record<string, number> = {};
    for (const p of percentiles) {
      result[`p${p}`] = 0;
    }
    return result;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const result: Record<string, number> = {};

  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    const clamped = Math.max(0, Math.min(index, sorted.length - 1));
    result[`p${p}`] = sorted[clamped];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function extractErrorType(message: string): string {
  if (message.includes("ECONNREFUSED")) return "ECONNREFUSED";
  if (message.includes("ECONNRESET")) return "ECONNRESET";
  if (message.includes("ETIMEDOUT") || message.includes("timeout")) return "timeout";
  if (message.includes("ENOTFOUND")) return "ENOTFOUND";
  if (message.includes("fetch failed")) return "fetch_failed";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Phase request executors
// ---------------------------------------------------------------------------

async function executePhaseRequest(
  phase: string,
  rpc: string,
  rest: string,
  writeCtx?: WriteContext,
): Promise<{ endpoint: string; statusCode: number }> {
  switch (phase) {
    case "rpc_health": {
      const endpoint = `${rpc}/status`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      return { endpoint, statusCode: res.status };
    }

    case "block_query": {
      const height = Math.floor(Math.random() * 100) + 1;
      const endpoint = `${rpc}/block?height=${height}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      return { endpoint, statusCode: res.status };
    }

    case "account_query": {
      // Query the module account as a stable target
      const endpoint = `${rest}/cosmos/auth/v1beta1/accounts/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e2fhk`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      return { endpoint, statusCode: res.status };
    }

    case "tx_broadcast": {
      if (!writeCtx) {
        throw new Error("tx_broadcast phase requires a wallet");
      }
      const client = await SigningStargateClient.connectWithSigner(rpc, writeCtx.wallet);
      try {
        const result = await client.sendTokens(
          writeCtx.address,
          writeCtx.address,
          [{ denom: "uclaw", amount: "1" }],
          { amount: [{ denom: "uclaw", amount: "500" }], gas: "200000" },
        );
        return {
          endpoint: `${rpc} [MsgSend self-transfer]`,
          statusCode: result.code === 0 ? 200 : 500,
        };
      } finally {
        client.disconnect();
      }
    }

    case "cosmwasm_query": {
      const cfg = loadClawdConfig();
      const factoryAddr = (cfg as Record<string, unknown>).dexFactoryAddress as string | undefined;
      if (!factoryAddr) {
        // Fall back to a generic wasm params query
        const endpoint = `${rest}/cosmwasm/wasm/v1/params`;
        const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
        return { endpoint, statusCode: res.status };
      }
      const query = Buffer.from(JSON.stringify({ config: {} })).toString("base64");
      const endpoint = `${rest}/cosmwasm/wasm/v1/contract/${factoryAddr}/smart/${query}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      return { endpoint, statusCode: res.status };
    }

    default:
      throw new Error(`Unknown benchmark phase: ${phase}`);
  }
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

async function runWorker(
  workerId: number,
  phase: string,
  rpc: string,
  rest: string,
  durationMs: number,
  verbose: boolean,
  writeCtx?: WriteContext,
): Promise<WorkerResult[]> {
  const results: WorkerResult[] = [];
  const testStart = Date.now();
  let requestId = 0;

  while (Date.now() - testStart < durationMs) {
    const startTime = Date.now();
    let success = false;
    let statusCode = 0;
    let endpoint = "";
    let error: string | undefined;

    try {
      const res = await executePhaseRequest(phase, rpc, rest, writeCtx);
      endpoint = res.endpoint;
      statusCode = res.statusCode;
      success = statusCode >= 200 && statusCode < 400;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      error = extractErrorType(message);
      endpoint = endpoint || `${rpc} [error]`;
      success = false;
    }

    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    results.push({
      requestId: requestId++,
      startTime,
      endTime,
      latencyMs,
      success,
      statusCode,
      endpoint,
      error,
    });

    if (verbose) {
      const status = success ? "OK" : "FAIL";
      console.log(
        `  [worker-${workerId}] ${status} ${endpoint} ${latencyMs}ms${error ? ` (${error})` : ""}`,
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase aggregation
// ---------------------------------------------------------------------------

function aggregatePhase(
  workerResults: WorkerResult[][],
  phaseName: string,
  phaseDescription: string,
  durationSec: number,
): PhaseResult {
  const allResults = workerResults.flat();
  const totalRequests = allResults.length;
  const successfulRequests = allResults.filter((r) => r.success).length;
  const failedRequests = totalRequests - successfulRequests;

  const latencies = allResults.map((r) => r.latencyMs);
  const percentiles = calculatePercentiles(latencies, [50, 95, 99]);

  const min = latencies.length > 0 ? Math.min(...latencies) : 0;
  const max = latencies.length > 0 ? Math.max(...latencies) : 0;
  const mean =
    latencies.length > 0
      ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length
      : 0;

  const errors: Record<string, number> = {};
  for (const r of allResults) {
    if (r.error) {
      errors[r.error] = (errors[r.error] || 0) + 1;
    }
  }

  const actualDuration =
    allResults.length > 0
      ? (Math.max(...allResults.map((r) => r.endTime)) -
          Math.min(...allResults.map((r) => r.startTime))) /
        1000
      : durationSec;

  const requestsPerSecond =
    actualDuration > 0 ? totalRequests / actualDuration : 0;

  return {
    name: phaseName,
    description: phaseDescription,
    totalRequests,
    successfulRequests,
    failedRequests,
    requestsPerSecond,
    latency: {
      min,
      max,
      mean,
      p50: percentiles.p50,
      p95: percentiles.p95,
      p99: percentiles.p99,
    },
    errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
    errors,
    durationSec,
  };
}

// ---------------------------------------------------------------------------
// Phase descriptions
// ---------------------------------------------------------------------------

const PHASE_DESCRIPTIONS: Record<string, string> = {
  rpc_health: "RPC health check latency (/status)",
  block_query: "Block query throughput (GET /block?height=N)",
  account_query: "Account query throughput (/cosmos/auth/v1beta1/accounts/{addr})",
  tx_broadcast: "Transaction broadcast throughput (MsgSend self-transfer)",
  cosmwasm_query: "CosmWasm query throughput (smart contract or params)",
};

// ---------------------------------------------------------------------------
// Text report formatting
// ---------------------------------------------------------------------------

function formatBenchmarkReport(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("ClawBench Performance Report");
  lines.push("\u2550".repeat(40));
  lines.push(`Profile:      ${result.profile}`);
  lines.push(`Chain ID:     ${result.chainId}`);
  lines.push(`RPC:          ${result.rpcUrl}`);
  lines.push(`REST:         ${result.restUrl}`);
  lines.push(`Started:      ${result.startedAt}`);
  lines.push(`Completed:    ${result.completedAt}`);
  lines.push(`Benchmark ID: ${result.id}`);

  for (const phase of result.phases) {
    lines.push("");
    lines.push(`\u2500 ${phase.name}: ${phase.description}`);
    lines.push(`  Requests:   ${phase.totalRequests.toLocaleString()} total, ${phase.successfulRequests.toLocaleString()} ok, ${phase.failedRequests.toLocaleString()} failed`);
    lines.push(`  Rate:       ${phase.requestsPerSecond.toFixed(1)} req/s`);
    lines.push(`  Error Rate: ${(phase.errorRate * 100).toFixed(1)}%`);
    lines.push(`  Latency:    min=${phase.latency.min.toFixed(1)}ms  mean=${phase.latency.mean.toFixed(1)}ms  max=${phase.latency.max.toFixed(1)}ms`);
    lines.push(`  Percentiles: p50=${phase.latency.p50.toFixed(1)}ms  p95=${phase.latency.p95.toFixed(1)}ms  p99=${phase.latency.p99.toFixed(1)}ms`);

    const errorEntries = Object.entries(phase.errors);
    if (errorEntries.length > 0) {
      lines.push(`  Errors:`);
      for (const [errType, count] of errorEntries) {
        lines.push(`    ${errType}: ${count}`);
      }
    }
  }

  lines.push("");
  lines.push("\u2500 Summary");
  lines.push(`  Total Requests:     ${result.summary.totalRequests.toLocaleString()}`);
  lines.push(`  Overall Success:    ${(result.summary.overallSuccessRate * 100).toFixed(1)}%`);
  lines.push(`  Overall Throughput: ${result.summary.overallRps.toFixed(1)} req/s`);
  lines.push(`  Overall p50:        ${result.summary.overallP50.toFixed(1)}ms`);
  lines.push(`  Overall p95:        ${result.summary.overallP95.toFixed(1)}ms`);
  lines.push(`  Overall p99:        ${result.summary.overallP99.toFixed(1)}ms`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// clawd benchmark run
// ---------------------------------------------------------------------------

export type BenchmarkRunOptions = {
  profile?: string;
  rpc?: string;
  rest?: string;
  verbose?: boolean;
  json?: boolean;
};

export async function runBenchmarkRun(opts: BenchmarkRunOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpc = (opts.rpc ?? cfg.rpcUrl ?? "http://localhost:26657").replace(/\/+$/, "");
  const rest = (opts.rest ?? cfg.restUrl ?? deriveRestFromRpc(rpc)).replace(/\/+$/, "");
  const verbose = opts.verbose ?? false;
  const jsonOutput = opts.json ?? false;

  const profileName = opts.profile ?? "standard";
  const profile = PROFILES[profileName];
  if (!profile) {
    console.error(
      `Unknown profile: ${profileName}\nAvailable profiles: ${Object.keys(PROFILES).join(", ")}`,
    );
    process.exit(1);
  }

  // Determine if we need a write context
  const needsWrite = profile.scenarios.includes("tx_broadcast");
  let writeCtx: WriteContext | undefined;

  if (needsWrite) {
    if (!mnemonicFileExists()) {
      console.error(
        `Profile "${profileName}" includes tx_broadcast which requires a wallet mnemonic. Run "clawd init" first.`,
      );
      process.exit(1);
    }
    const mnemonic = loadMnemonic();
    if (!mnemonic) {
      console.error("Failed to load mnemonic.");
      process.exit(1);
      return;
    }
    const prefix = cfg.prefix ?? "claw";
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    const [account] = await wallet.getAccounts();
    if (!account) {
      console.error("Failed to derive wallet account.");
      process.exit(1);
      return;
    }
    writeCtx = { wallet, address: account.address };
    if (!jsonOutput) {
      console.log(`Loaded wallet: ${writeCtx.address}`);
    }
  }

  const benchmarkId = generateId();
  const startedAt = new Date().toISOString();

  if (!jsonOutput) {
    console.log(
      `\nStarting benchmark: profile=${profileName} concurrency=${profile.concurrency} duration=${profile.durationSec}s`,
    );
    console.log(`Phases: ${profile.scenarios.join(", ")}`);
    console.log("");
  }

  const phases: PhaseResult[] = [];
  const allLatencies: number[] = [];
  let totalReqs = 0;
  let totalSuccess = 0;

  // Per-phase duration: split total duration evenly across phases
  const phaseDuration = profile.durationSec / profile.scenarios.length;

  for (const scenario of profile.scenarios) {
    const description = PHASE_DESCRIPTIONS[scenario] ?? scenario;
    const durationMs = phaseDuration * 1000;

    if (!jsonOutput) {
      console.log(`Running phase: ${scenario} (${phaseDuration.toFixed(0)}s, ${profile.concurrency} workers)...`);
    }

    const workerPromises: Promise<WorkerResult[]>[] = [];
    for (let i = 0; i < profile.concurrency; i++) {
      workerPromises.push(
        runWorker(i, scenario, rpc, rest, durationMs, verbose, writeCtx),
      );
    }

    const workerResults = await Promise.all(workerPromises);
    const phase = aggregatePhase(workerResults, scenario, description, phaseDuration);
    phases.push(phase);

    // Accumulate for summary
    totalReqs += phase.totalRequests;
    totalSuccess += phase.successfulRequests;
    const phaseLatencies = workerResults.flat().map((r) => r.latencyMs);
    allLatencies.push(...phaseLatencies);

    if (!jsonOutput) {
      console.log(
        `  -> ${phase.totalRequests} reqs, ${phase.requestsPerSecond.toFixed(1)} req/s, p50=${phase.latency.p50.toFixed(1)}ms, p95=${phase.latency.p95.toFixed(1)}ms`,
      );
    }
  }

  // Build summary
  const overallPercentiles = calculatePercentiles(allLatencies, [50, 95, 99]);
  const completedAt = new Date().toISOString();
  const totalDuration = phases.reduce((sum, p) => sum + p.durationSec, 0);

  const result: BenchmarkResult = {
    id: benchmarkId,
    profile: profileName,
    startedAt,
    completedAt,
    rpcUrl: rpc,
    restUrl: rest,
    chainId: cfg.chainId ?? "clawchain-1",
    phases,
    summary: {
      totalRequests: totalReqs,
      overallSuccessRate: totalReqs > 0 ? totalSuccess / totalReqs : 0,
      overallRps: totalDuration > 0 ? totalReqs / totalDuration : 0,
      overallP50: overallPercentiles.p50,
      overallP95: overallPercentiles.p95,
      overallP99: overallPercentiles.p99,
    },
  };

  // Auto-save
  const savedPath = saveBenchmarkResult(result);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log(formatBenchmarkReport(result));
    console.log(`Results saved to: ${savedPath}`);
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// clawd benchmark compare
// ---------------------------------------------------------------------------

export type BenchmarkCompareOptions = {
  baseline: string;
  current: string;
  json?: boolean;
};

export async function runBenchmarkCompare(opts: BenchmarkCompareOptions): Promise<void> {
  const jsonOutput = opts.json ?? false;

  let baseline: BenchmarkResult;
  let current: BenchmarkResult;

  try {
    baseline = loadBenchmarkFile(opts.baseline);
  } catch (err) {
    console.error(`Failed to load baseline file: ${String(err)}`);
    process.exit(1);
    return;
  }

  try {
    current = loadBenchmarkFile(opts.current);
  } catch (err) {
    console.error(`Failed to load current file: ${String(err)}`);
    process.exit(1);
    return;
  }

  type PhaseDelta = {
    phase: string;
    baselineRps: number;
    currentRps: number;
    deltaRpsPct: number;
    baselineP50: number;
    currentP50: number;
    deltaP50Pct: number;
    baselineP95: number;
    currentP95: number;
    deltaP95Pct: number;
    baselineP99: number;
    currentP99: number;
    deltaP99Pct: number;
    baselineErrorRate: number;
    currentErrorRate: number;
  };

  type ComparisonResult = {
    baselineId: string;
    baselineProfile: string;
    baselineDate: string;
    currentId: string;
    currentProfile: string;
    currentDate: string;
    phases: PhaseDelta[];
    summaryDelta: {
      baselineRps: number;
      currentRps: number;
      deltaRpsPct: number;
      baselineP50: number;
      currentP50: number;
      deltaP50Pct: number;
      baselineP95: number;
      currentP95: number;
      deltaP95Pct: number;
    };
  };

  // Build per-phase deltas
  const phaseDeltas: PhaseDelta[] = [];

  // Collect all phase names from both runs
  const allPhaseNames = new Set([
    ...baseline.phases.map((p) => p.name),
    ...current.phases.map((p) => p.name),
  ]);

  for (const phaseName of allPhaseNames) {
    const bp = baseline.phases.find((p) => p.name === phaseName);
    const cp = current.phases.find((p) => p.name === phaseName);

    if (!bp || !cp) continue; // Only compare phases present in both

    const deltaRps = bp.requestsPerSecond > 0
      ? ((cp.requestsPerSecond - bp.requestsPerSecond) / bp.requestsPerSecond) * 100
      : 0;
    const deltaP50 = bp.latency.p50 > 0
      ? ((cp.latency.p50 - bp.latency.p50) / bp.latency.p50) * 100
      : 0;
    const deltaP95 = bp.latency.p95 > 0
      ? ((cp.latency.p95 - bp.latency.p95) / bp.latency.p95) * 100
      : 0;
    const deltaP99 = bp.latency.p99 > 0
      ? ((cp.latency.p99 - bp.latency.p99) / bp.latency.p99) * 100
      : 0;

    phaseDeltas.push({
      phase: phaseName,
      baselineRps: bp.requestsPerSecond,
      currentRps: cp.requestsPerSecond,
      deltaRpsPct: deltaRps,
      baselineP50: bp.latency.p50,
      currentP50: cp.latency.p50,
      deltaP50Pct: deltaP50,
      baselineP95: bp.latency.p95,
      currentP95: cp.latency.p95,
      deltaP95Pct: deltaP95,
      baselineP99: bp.latency.p99,
      currentP99: cp.latency.p99,
      deltaP99Pct: deltaP99,
      baselineErrorRate: bp.errorRate,
      currentErrorRate: cp.errorRate,
    });
  }

  // Summary delta
  const summaryDeltaRps = baseline.summary.overallRps > 0
    ? ((current.summary.overallRps - baseline.summary.overallRps) / baseline.summary.overallRps) * 100
    : 0;
  const summaryDeltaP50 = baseline.summary.overallP50 > 0
    ? ((current.summary.overallP50 - baseline.summary.overallP50) / baseline.summary.overallP50) * 100
    : 0;
  const summaryDeltaP95 = baseline.summary.overallP95 > 0
    ? ((current.summary.overallP95 - baseline.summary.overallP95) / baseline.summary.overallP95) * 100
    : 0;

  const comparison: ComparisonResult = {
    baselineId: baseline.id,
    baselineProfile: baseline.profile,
    baselineDate: baseline.startedAt,
    currentId: current.id,
    currentProfile: current.profile,
    currentDate: current.startedAt,
    phases: phaseDeltas,
    summaryDelta: {
      baselineRps: baseline.summary.overallRps,
      currentRps: current.summary.overallRps,
      deltaRpsPct: summaryDeltaRps,
      baselineP50: baseline.summary.overallP50,
      currentP50: current.summary.overallP50,
      deltaP50Pct: summaryDeltaP50,
      baselineP95: baseline.summary.overallP95,
      currentP95: current.summary.overallP95,
      deltaP95Pct: summaryDeltaP95,
    },
  };

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(comparison, null, 2) + "\n");
    return;
  }

  // Formatted text comparison
  const lines: string[] = [];

  lines.push("");
  lines.push("ClawBench Comparison");
  lines.push("\u2550".repeat(40));
  lines.push(`Baseline: ${baseline.id} (${baseline.profile}, ${baseline.startedAt})`);
  lines.push(`Current:  ${current.id} (${current.profile}, ${current.startedAt})`);
  lines.push("");

  // ANSI color helpers
  const RED = "\x1b[31m";
  const GREEN = "\x1b[32m";
  const RESET = "\x1b[0m";

  // For latency: higher is worse (regression), lower is improvement
  function latencyDeltaStr(deltaPct: number): string {
    const sign = deltaPct >= 0 ? "+" : "";
    const str = `${sign}${deltaPct.toFixed(1)}%`;
    if (deltaPct > 10) return `${RED}${str}${RESET}`; // Regression
    if (deltaPct < -10) return `${GREEN}${str}${RESET}`; // Improvement
    return str;
  }

  // For throughput: higher is better (improvement), lower is regression
  function rpsDeltaStr(deltaPct: number): string {
    const sign = deltaPct >= 0 ? "+" : "";
    const str = `${sign}${deltaPct.toFixed(1)}%`;
    if (deltaPct < -10) return `${RED}${str}${RESET}`; // Regression
    if (deltaPct > 10) return `${GREEN}${str}${RESET}`; // Improvement
    return str;
  }

  const headers = ["Phase", "Metric", "Baseline", "Current", "Delta"];
  const rows: string[][] = [];

  for (const pd of phaseDeltas) {
    rows.push([pd.phase, "RPS", pd.baselineRps.toFixed(1), pd.currentRps.toFixed(1), rpsDeltaStr(pd.deltaRpsPct)]);
    rows.push(["", "p50", `${pd.baselineP50.toFixed(1)}ms`, `${pd.currentP50.toFixed(1)}ms`, latencyDeltaStr(pd.deltaP50Pct)]);
    rows.push(["", "p95", `${pd.baselineP95.toFixed(1)}ms`, `${pd.currentP95.toFixed(1)}ms`, latencyDeltaStr(pd.deltaP95Pct)]);
    rows.push(["", "p99", `${pd.baselineP99.toFixed(1)}ms`, `${pd.currentP99.toFixed(1)}ms`, latencyDeltaStr(pd.deltaP99Pct)]);
    rows.push(["", "err%", `${(pd.baselineErrorRate * 100).toFixed(1)}%`, `${(pd.currentErrorRate * 100).toFixed(1)}%`, ""]);
    rows.push(["", "", "", "", ""]); // Spacer
  }

  console.log(table(headers, rows));

  lines.push("");
  lines.push("\u2500 Overall");
  lines.push(`  Throughput: ${baseline.summary.overallRps.toFixed(1)} -> ${current.summary.overallRps.toFixed(1)} req/s (${rpsDeltaStr(summaryDeltaRps)})`);
  lines.push(`  p50:        ${baseline.summary.overallP50.toFixed(1)} -> ${current.summary.overallP50.toFixed(1)}ms (${latencyDeltaStr(summaryDeltaP50)})`);
  lines.push(`  p95:        ${baseline.summary.overallP95.toFixed(1)} -> ${current.summary.overallP95.toFixed(1)}ms (${latencyDeltaStr(summaryDeltaP95)})`);
  lines.push("");

  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// clawd benchmark profiles
// ---------------------------------------------------------------------------

export type BenchmarkProfilesOptions = {
  json?: boolean;
};

export async function runBenchmarkProfiles(opts: BenchmarkProfilesOptions): Promise<void> {
  const profileList = Object.values(PROFILES);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ profiles: profileList }, null, 2) + "\n");
    return;
  }

  const headers = ["Name", "Duration", "Concurrency", "Scenarios"];
  const rows = profileList.map((p) => [
    p.name,
    `${p.durationSec}s`,
    String(p.concurrency),
    p.scenarios.join(", "),
  ]);

  console.log("Available Benchmark Profiles\n");
  console.log(table(headers, rows));
  console.log("");
}

// ---------------------------------------------------------------------------
// clawd benchmark history
// ---------------------------------------------------------------------------

export type BenchmarkHistoryOptions = {
  json?: boolean;
  limit?: number;
};

export async function runBenchmarkHistory(opts: BenchmarkHistoryOptions): Promise<void> {
  const jsonOutput = opts.json ?? false;
  const limit = opts.limit ?? 20;

  ensureBenchmarksDir();

  let files: string[];
  try {
    files = readdirSync(BENCHMARKS_DIR)
      .filter((f) => f.startsWith("benchmark-") && f.endsWith(".json"))
      .sort()
      .reverse();
  } catch {
    files = [];
  }

  if (files.length === 0) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ history: [] }, null, 2) + "\n");
    } else {
      console.log("No benchmark history found. Run `clawd benchmark run` to create one.");
    }
    return;
  }

  const limited = files.slice(0, limit);

  type HistoryEntry = {
    id: string;
    profile: string;
    date: string;
    totalRequests: number;
    overallRps: number;
    overallP50: number;
    overallP95: number;
    successRate: number;
    filePath: string;
  };

  const entries: HistoryEntry[] = [];

  for (const file of limited) {
    const filePath = join(BENCHMARKS_DIR, file);
    try {
      const result = loadBenchmarkFile(filePath);
      entries.push({
        id: result.id,
        profile: result.profile,
        date: result.startedAt,
        totalRequests: result.summary.totalRequests,
        overallRps: result.summary.overallRps,
        overallP50: result.summary.overallP50,
        overallP95: result.summary.overallP95,
        successRate: result.summary.overallSuccessRate,
        filePath,
      });
    } catch {
      // Skip corrupt files
    }
  }

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({ history: entries }, null, 2) + "\n");
    return;
  }

  if (entries.length === 0) {
    console.log("No valid benchmark history found.");
    return;
  }

  const headers = ["ID", "Profile", "Date", "Requests", "RPS", "p50", "p95", "Success"];
  const rows = entries.map((e) => [
    e.id,
    e.profile,
    e.date.replace(/T/, " ").replace(/\.\d+Z$/, "Z"),
    e.totalRequests.toLocaleString(),
    e.overallRps.toFixed(1),
    `${e.overallP50.toFixed(1)}ms`,
    `${e.overallP95.toFixed(1)}ms`,
    `${(e.successRate * 100).toFixed(1)}%`,
  ]);

  console.log(`Benchmark History (${entries.length} runs)\n`);
  console.log(table(headers, rows));
  console.log(`\nResults stored in: ${BENCHMARKS_DIR}`);
  console.log("");
}
