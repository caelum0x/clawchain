#!/usr/bin/env node

import { Command } from "commander";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkerResult = {
  requestId: number;
  startTime: number;
  endTime: number;
  latencyMs: number;
  success: boolean;
  statusCode: number;
  endpoint: string;
  error?: string;
};

export type LoadTestResult = {
  scenario: string;
  duration: number;
  concurrency: number;
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
  throughputBytesPerSec: number;
};

export type ScenarioDefinition = {
  name: string;
  description: string;
  requiresMnemonic: boolean;
};

export type RunOptions = {
  rpc: string;
  rest: string;
  concurrency: number;
  duration: number;
  rate: number;
  mnemonicFile?: string;
  json: boolean;
  verbose: boolean;
};

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------

export const SCENARIOS: ScenarioDefinition[] = [
  { name: "read", description: "Mixed read queries (status, block, supply, agents)", requiresMnemonic: false },
  { name: "write", description: "Send transfer transactions (MsgSend to self)", requiresMnemonic: true },
  { name: "mixed", description: "70% read + 30% write mixed workload", requiresMnemonic: true },
  { name: "blocks", description: "Block query stress test (random heights)", requiresMnemonic: false },
  { name: "txquery", description: "Transaction search queries", requiresMnemonic: false },
  { name: "abci", description: "ABCI query endpoint stress test", requiresMnemonic: false },
];

// ---------------------------------------------------------------------------
// Percentile helpers
// ---------------------------------------------------------------------------

export function calculatePercentiles(
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
// Read-scenario endpoint picker
// ---------------------------------------------------------------------------

export function getReadEndpoints(rpc: string, rest: string): string[] {
  return [
    `${rpc}/status`,
    `${rpc}/block`,
    `${rest}/cosmos/bank/v1beta1/supply`,
    `${rest}/clawchain/agent/v1/agents`,
  ];
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Scenario request builders
// ---------------------------------------------------------------------------

async function readRequest(rpc: string, rest: string): Promise<string> {
  const endpoints = getReadEndpoints(rpc, rest);
  return pickRandom(endpoints);
}

function blocksRequest(rpc: string): string {
  const height = Math.floor(Math.random() * 1000) + 1;
  return `${rpc}/block?height=${height}`;
}

function txQueryRequest(rpc: string): string {
  const height = Math.floor(Math.random() * 1000) + 1;
  return `${rpc}/tx_search?query="tx.height>=${height}"&per_page=10`;
}

function abciRequest(rpc: string): string {
  const data = Buffer.from("agent-key-probe").toString("hex");
  return `${rpc}/abci_query?path="/store/agent/key"&data=${data}`;
}

// ---------------------------------------------------------------------------
// Write scenario helpers
// ---------------------------------------------------------------------------

async function loadWallet(mnemonicFile: string) {
  const mnemonic = readFileSync(mnemonicFile, "utf-8").trim();
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: "claw",
  });
  const [account] = await wallet.getAccounts();
  return { wallet, address: account.address };
}

async function sendWriteTransaction(
  rpc: string,
  wallet: DirectSecp256k1HdWallet,
  address: string,
): Promise<{ endpoint: string; statusCode: number }> {
  const client = await SigningStargateClient.connectWithSigner(rpc, wallet);
  try {
    const result = await client.sendTokens(
      address,
      address,
      [{ denom: "uclaw", amount: "1" }],
      { amount: [{ denom: "uclaw", amount: "500" }], gas: "200000" },
    );
    return {
      endpoint: `${rpc} [MsgSend]`,
      statusCode: result.code === 0 ? 200 : 500,
    };
  } finally {
    client.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Single request executor
// ---------------------------------------------------------------------------

export async function executeRequest(
  scenario: string,
  rpc: string,
  rest: string,
  writeCtx?: { wallet: DirectSecp256k1HdWallet; address: string },
): Promise<{ endpoint: string; statusCode: number; bodyLength: number }> {
  let endpoint: string;
  let isWrite = false;

  switch (scenario) {
    case "read":
      endpoint = await readRequest(rpc, rest);
      break;
    case "write":
      isWrite = true;
      endpoint = `${rpc} [MsgSend]`;
      break;
    case "mixed":
      if (Math.random() < 0.3 && writeCtx) {
        isWrite = true;
        endpoint = `${rpc} [MsgSend]`;
      } else {
        endpoint = await readRequest(rpc, rest);
      }
      break;
    case "blocks":
      endpoint = blocksRequest(rpc);
      break;
    case "txquery":
      endpoint = txQueryRequest(rpc);
      break;
    case "abci":
      endpoint = abciRequest(rpc);
      break;
    default:
      throw new Error(`Unknown scenario: ${scenario}`);
  }

  if (isWrite && writeCtx) {
    const result = await sendWriteTransaction(rpc, writeCtx.wallet, writeCtx.address);
    return { ...result, bodyLength: 0 };
  }

  const response = await fetch(endpoint);
  const body = await response.text();
  return {
    endpoint,
    statusCode: response.status,
    bodyLength: body.length,
  };
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

export async function runWorker(
  workerId: number,
  scenario: string,
  rpc: string,
  rest: string,
  durationMs: number,
  delayMs: number,
  verbose: boolean,
  writeCtx?: { wallet: DirectSecp256k1HdWallet; address: string },
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
    let bodyLength = 0;

    try {
      const res = await executeRequest(scenario, rpc, rest, writeCtx);
      endpoint = res.endpoint;
      statusCode = res.statusCode;
      bodyLength = res.bodyLength;
      success = statusCode >= 200 && statusCode < 400;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      error = extractErrorType(message);
      endpoint = endpoint || `${rpc} [error]`;
      success = false;
    }

    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    const result: WorkerResult = {
      requestId: requestId++,
      startTime,
      endTime,
      latencyMs,
      success,
      statusCode,
      endpoint,
      error,
    };

    results.push(result);

    if (verbose) {
      const status = success ? "OK" : "FAIL";
      console.log(
        `[worker-${workerId}] ${status} ${endpoint} ${latencyMs}ms${error ? ` (${error})` : ""}`,
      );
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export function extractErrorType(message: string): string {
  if (message.includes("ECONNREFUSED")) return "ECONNREFUSED";
  if (message.includes("ECONNRESET")) return "ECONNRESET";
  if (message.includes("ETIMEDOUT") || message.includes("timeout")) return "timeout";
  if (message.includes("ENOTFOUND")) return "ENOTFOUND";
  if (message.includes("fetch failed")) return "fetch_failed";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Results aggregation
// ---------------------------------------------------------------------------

export function aggregateResults(
  workerResults: WorkerResult[][],
  scenario: string,
  durationSec: number,
  concurrency: number,
): LoadTestResult {
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
    scenario,
    duration: durationSec,
    concurrency,
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
    throughputBytesPerSec: 0,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatResults(result: LoadTestResult): string {
  const lines: string[] = [];
  const pct = (n: number, total: number) =>
    total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";

  lines.push("");
  lines.push("ClawFlood Load Test Results");
  lines.push("\u2550".repeat(27));
  lines.push(`Scenario:     ${result.scenario}`);
  lines.push(`Duration:     ${result.duration.toFixed(1)}s`);
  lines.push(`Concurrency:  ${result.concurrency}`);
  lines.push("");
  lines.push("Requests");
  lines.push(
    `  Total:      ${result.totalRequests.toLocaleString()}`,
  );
  lines.push(
    `  Successful: ${result.successfulRequests.toLocaleString()} (${pct(result.successfulRequests, result.totalRequests)}%)`,
  );
  lines.push(
    `  Failed:     ${result.failedRequests.toLocaleString()} (${pct(result.failedRequests, result.totalRequests)}%)`,
  );
  lines.push(
    `  Rate:       ${result.requestsPerSecond.toFixed(1)} req/s`,
  );
  lines.push("");
  lines.push("Latency (ms)");
  lines.push(`  Min:    ${result.latency.min.toFixed(1)}`);
  lines.push(`  Mean:   ${result.latency.mean.toFixed(1)}`);
  lines.push(`  p50:    ${result.latency.p50.toFixed(1)}`);
  lines.push(`  p95:    ${result.latency.p95.toFixed(1)}`);
  lines.push(`  p99:    ${result.latency.p99.toFixed(1)}`);
  lines.push(`  Max:    ${result.latency.max.toFixed(1)}`);

  const errorEntries = Object.entries(result.errors);
  if (errorEntries.length > 0) {
    lines.push("");
    lines.push("Errors");
    for (const [errType, count] of errorEntries) {
      lines.push(`  ${errType}: ${count}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Check command
// ---------------------------------------------------------------------------

export async function checkConnectivity(
  rpc: string,
  rest: string,
): Promise<{ rpc: { ok: boolean; latencyMs: number; error?: string }; rest: { ok: boolean; latencyMs: number; error?: string } }> {
  async function probe(url: string) {
    const start = Date.now();
    try {
      const res = await fetch(url);
      const latencyMs = Date.now() - start;
      return {
        ok: res.status >= 200 && res.status < 400,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, latencyMs, error: message };
    }
  }

  const [rpcResult, restResult] = await Promise.all([
    probe(`${rpc}/status`),
    probe(`${rest}/cosmos/base/tendermint/v1beta1/node_info`),
  ]);

  return { rpc: rpcResult, rest: restResult };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("claw-flood")
  .description("ClawChain RPC load testing tool inspired by Flood")
  .version("1.0.0");

program
  .command("run <scenario>")
  .description("Execute a load test scenario")
  .option("--rpc <url>", "RPC endpoint URL", "http://localhost:26657")
  .option("--rest <url>", "REST endpoint URL", "http://localhost:1317")
  .option("--concurrency <n>", "Number of parallel workers", "10")
  .option("--duration <seconds>", "Test duration in seconds", "30")
  .option("--rate <rps>", "Target requests per second (0 = unlimited)", "0")
  .option("--mnemonic-file <path>", "Path to mnemonic file for write scenarios")
  .option("--json", "Output results as JSON", false)
  .option("--verbose", "Log individual requests", false)
  .action(async (scenario: string, opts: Record<string, string | boolean>) => {
    const validScenarios = SCENARIOS.map((s) => s.name);
    if (!validScenarios.includes(scenario)) {
      console.error(
        `Unknown scenario: ${scenario}\nAvailable: ${validScenarios.join(", ")}`,
      );
      process.exit(1);
    }

    const rpc = opts.rpc as string;
    const rest = opts.rest as string;
    const concurrency = parseInt(opts.concurrency as string, 10);
    const duration = parseInt(opts.duration as string, 10);
    const rate = parseInt(opts.rate as string, 10);
    const mnemonicFile = opts.mnemonicFile as string | undefined;
    const json = opts.json as boolean;
    const verbose = opts.verbose as boolean;

    const scenarioDef = SCENARIOS.find((s) => s.name === scenario)!;
    if (scenarioDef.requiresMnemonic && !mnemonicFile) {
      console.error(
        `Scenario "${scenario}" requires --mnemonic-file`,
      );
      process.exit(1);
    }

    let writeCtx: { wallet: DirectSecp256k1HdWallet; address: string } | undefined;
    if (mnemonicFile) {
      try {
        writeCtx = await loadWallet(mnemonicFile);
        if (!json) {
          console.log(`Loaded wallet: ${writeCtx.address}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to load mnemonic: ${msg}`);
        process.exit(1);
      }
    }

    const delayMs = rate > 0 ? 1000 / (rate / concurrency) : 0;
    const durationMs = duration * 1000;

    if (!json) {
      console.log(
        `Starting load test: scenario=${scenario} concurrency=${concurrency} duration=${duration}s rate=${rate > 0 ? `${rate} req/s` : "unlimited"}`,
      );
    }

    const workerPromises: Promise<WorkerResult[]>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workerPromises.push(
        runWorker(i, scenario, rpc, rest, durationMs, delayMs, verbose, writeCtx),
      );
    }

    const workerResults = await Promise.all(workerPromises);
    const result = aggregateResults(workerResults, scenario, duration, concurrency);

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatResults(result));
    }
  });

program
  .command("scenarios")
  .description("List available load test scenarios")
  .action(() => {
    console.log("\nAvailable Scenarios");
    console.log("\u2500".repeat(60));
    console.log(
      `${"Name".padEnd(12)} ${"Mnemonic".padEnd(10)} Description`,
    );
    console.log("\u2500".repeat(60));
    for (const s of SCENARIOS) {
      const mnemonic = s.requiresMnemonic ? "required" : "-";
      console.log(
        `${s.name.padEnd(12)} ${mnemonic.padEnd(10)} ${s.description}`,
      );
    }
    console.log("");
  });

program
  .command("check")
  .description("Quick connectivity check for RPC and REST endpoints")
  .option("--rpc <url>", "RPC endpoint URL", "http://localhost:26657")
  .option("--rest <url>", "REST endpoint URL", "http://localhost:1317")
  .option("--json", "Output results as JSON", false)
  .action(async (opts: Record<string, string | boolean>) => {
    const rpc = opts.rpc as string;
    const rest = opts.rest as string;
    const json = opts.json as boolean;

    const result = await checkConnectivity(rpc, rest);

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\nClawFlood Connectivity Check");
      console.log("\u2500".repeat(40));

      const rpcStatus = result.rpc.ok ? "OK" : "FAIL";
      console.log(
        `RPC  (${rpc}): ${rpcStatus} (${result.rpc.latencyMs}ms)${result.rpc.error ? ` - ${result.rpc.error}` : ""}`,
      );

      const restStatus = result.rest.ok ? "OK" : "FAIL";
      console.log(
        `REST (${rest}): ${restStatus} (${result.rest.latencyMs}ms)${result.rest.error ? ` - ${result.rest.error}` : ""}`,
      );

      console.log("");
    }
  });

// Only parse CLI args when running as a script, not when imported by tests.
// Vitest sets the VITEST env var; we also check VITEST_WORKER_ID.
const _isTestEnv =
  typeof process !== "undefined" &&
  (process.env.VITEST === "true" ||
    process.env.VITEST_WORKER_ID !== undefined ||
    process.env.NODE_ENV === "test");

if (!_isTestEnv) {
  program.parse();
}

export { program };
