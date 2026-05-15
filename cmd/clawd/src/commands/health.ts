/**
 * `clawd health` — comprehensive health checks for all ClawChain services.
 *
 * Subcommands:
 *   clawd health              Check health of all services
 *   clawd health watch        Continuous monitoring loop
 *   clawd health endpoints    List all configured service endpoints
 */

import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceCheckResult = {
  name: string;
  status: "UP" | "DOWN";
  responseTimeMs: number;
  details: string;
};

type ServiceDefinition = {
  name: string;
  url: string;
  port: number;
  protocol: "http" | "ws";
  check: (timeout: number) => Promise<ServiceCheckResult>;
};

export type HealthCheckOptions = {
  services?: string;
  rpc?: string;
  rest?: string;
  timeout?: number;
  json?: boolean;
};

export type HealthWatchOptions = {
  interval?: number;
  rpc?: string;
  rest?: string;
  json?: boolean;
};

export type HealthEndpointsOptions = {
  json?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimSlash(v: string): string {
  return v.replace(/\/+$/, "");
}

function getEndpoints(opts: { rpc?: string; rest?: string }) {
  const cfg = loadClawdConfig();
  const rpcUrl = trimSlash(opts.rpc ?? cfg.rpcUrl ?? "http://localhost:26657");
  const restUrl = trimSlash(opts.rest ?? cfg.restUrl ?? deriveRestFromRpc(rpcUrl));
  return { rpcUrl, restUrl };
}

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function timedFetch(
  url: string,
  timeoutMs: number,
): Promise<{ res: Response; elapsedMs: number }> {
  const start = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const elapsedMs = Math.round(performance.now() - start);
  return { res, elapsedMs };
}

// ---------------------------------------------------------------------------
// Individual service checkers
// ---------------------------------------------------------------------------

function checkChainNode(rpcUrl: string): (timeout: number) => Promise<ServiceCheckResult> {
  return async (timeout) => {
    const url = `${rpcUrl}/status`;
    try {
      const { res, elapsedMs } = await timedFetch(url, timeout);
      if (!res.ok) {
        return { name: "Chain Node", status: "DOWN", responseTimeMs: elapsedMs, details: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        result?: {
          node_info?: { version?: string };
          sync_info?: {
            latest_block_height?: string;
            catching_up?: boolean;
          };
        };
      };
      const height = data.result?.sync_info?.latest_block_height ?? "?";
      const catchingUp = data.result?.sync_info?.catching_up;
      const version = data.result?.node_info?.version ?? "";
      const parts = [`height=${height}`];
      if (catchingUp !== undefined) parts.push(`syncing=${String(catchingUp)}`);
      if (version) parts.push(`v${version}`);
      return { name: "Chain Node", status: "UP", responseTimeMs: elapsedMs, details: parts.join(", ") };
    } catch (err) {
      return { name: "Chain Node", status: "DOWN", responseTimeMs: 0, details: String(err) };
    }
  };
}

function checkRestApi(restUrl: string): (timeout: number) => Promise<ServiceCheckResult> {
  return async (timeout) => {
    const url = `${restUrl}/cosmos/base/tendermint/v1beta1/node_info`;
    try {
      const { res, elapsedMs } = await timedFetch(url, timeout);
      if (!res.ok) {
        return { name: "REST API", status: "DOWN", responseTimeMs: elapsedMs, details: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        default_node_info?: { network?: string; version?: string };
        application_version?: { version?: string; app_name?: string };
      };
      const network = data.default_node_info?.network ?? "";
      const appVersion = data.application_version?.version ?? "";
      const parts: string[] = [];
      if (network) parts.push(`chain=${network}`);
      if (appVersion) parts.push(`v${appVersion}`);
      return {
        name: "REST API",
        status: "UP",
        responseTimeMs: elapsedMs,
        details: parts.length > 0 ? parts.join(", ") : "reachable",
      };
    } catch (err) {
      return { name: "REST API", status: "DOWN", responseTimeMs: 0, details: String(err) };
    }
  };
}

function checkHttpService(
  name: string,
  url: string,
): (timeout: number) => Promise<ServiceCheckResult> {
  return async (timeout) => {
    try {
      const { res, elapsedMs } = await timedFetch(url, timeout);
      if (!res.ok) {
        return { name, status: "DOWN", responseTimeMs: elapsedMs, details: `HTTP ${res.status}` };
      }
      // Try to extract version from JSON response body
      let version = "";
      try {
        const body = (await res.json()) as { version?: string; status?: string };
        if (body.version) version = body.version;
      } catch {
        // Not JSON — that's fine for web frontends
      }
      return {
        name,
        status: "UP",
        responseTimeMs: elapsedMs,
        details: version ? `v${version}` : "reachable",
      };
    } catch (err) {
      return { name, status: "DOWN", responseTimeMs: 0, details: String(err) };
    }
  };
}

function checkWebService(
  name: string,
  url: string,
): (timeout: number) => Promise<ServiceCheckResult> {
  return async (timeout) => {
    try {
      const { res, elapsedMs } = await timedFetch(url, timeout);
      if (!res.ok) {
        return { name, status: "DOWN", responseTimeMs: elapsedMs, details: `HTTP ${res.status}` };
      }
      return { name, status: "UP", responseTimeMs: elapsedMs, details: "reachable" };
    } catch (err) {
      return { name, status: "DOWN", responseTimeMs: 0, details: String(err) };
    }
  };
}

function checkWebSocket(
  name: string,
  wsUrl: string,
): (timeout: number) => Promise<ServiceCheckResult> {
  return async (timeout) => {
    // Use a raw TCP-level probe by attempting an HTTP upgrade request.
    // Convert ws:// to http:// for the fetch-based probe.
    const httpUrl = wsUrl.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
    try {
      const start = performance.now();
      const res = await fetch(httpUrl, { signal: AbortSignal.timeout(timeout) });
      const elapsedMs = Math.round(performance.now() - start);
      // A WebSocket server may return 426 Upgrade Required, 400, or 200 — any response means the port is open.
      return {
        name,
        status: "UP",
        responseTimeMs: elapsedMs,
        details: `port open (HTTP ${res.status})`,
      };
    } catch (err) {
      const errStr = String(err);
      // If the error indicates a protocol mismatch but the connection was made, treat as UP.
      if (errStr.includes("upgrade") || errStr.includes("Upgrade")) {
        return { name, status: "UP", responseTimeMs: 0, details: "WebSocket endpoint detected" };
      }
      return { name, status: "DOWN", responseTimeMs: 0, details: errStr };
    }
  };
}

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

function buildServiceDefinitions(rpcUrl: string, restUrl: string): ServiceDefinition[] {
  return [
    {
      name: "Chain Node",
      url: rpcUrl,
      port: new URL(rpcUrl).port ? Number(new URL(rpcUrl).port) : 26657,
      protocol: "http",
      check: checkChainNode(rpcUrl),
    },
    {
      name: "REST API",
      url: restUrl,
      port: new URL(restUrl).port ? Number(new URL(restUrl).port) : 1317,
      protocol: "http",
      check: checkRestApi(restUrl),
    },
    {
      name: "Faucet",
      url: "http://localhost:8000/health",
      port: 8000,
      protocol: "http",
      check: checkHttpService("Faucet", "http://localhost:8000/health"),
    },
    {
      name: "Events",
      url: "http://localhost:8001/health",
      port: 8001,
      protocol: "http",
      check: checkHttpService("Events", "http://localhost:8001/health"),
    },
    {
      name: "Notifications",
      url: "http://localhost:8002/health",
      port: 8002,
      protocol: "http",
      check: checkHttpService("Notifications", "http://localhost:8002/health"),
    },
    {
      name: "Inference",
      url: "http://localhost:8003/health",
      port: 8003,
      protocol: "http",
      check: checkHttpService("Inference", "http://localhost:8003/health"),
    },
    {
      name: "GPU Provider",
      url: "http://localhost:9090/health",
      port: 9090,
      protocol: "http",
      check: checkHttpService("GPU Provider", "http://localhost:9090/health"),
    },
    {
      name: "Explorer",
      url: "http://localhost:5173",
      port: 5173,
      protocol: "http",
      check: checkWebService("Explorer", "http://localhost:5173"),
    },
    {
      name: "Web Dashboard",
      url: "http://localhost:3000",
      port: 3000,
      protocol: "http",
      check: checkWebService("Web Dashboard", "http://localhost:3000"),
    },
    {
      name: "DEX App",
      url: "http://localhost:3001",
      port: 3001,
      protocol: "http",
      check: checkWebService("DEX App", "http://localhost:3001"),
    },
    {
      name: "Docs Site",
      url: "http://localhost:3002",
      port: 3002,
      protocol: "http",
      check: checkWebService("Docs Site", "http://localhost:3002"),
    },
    {
      name: "OpenClaw Gateway",
      url: "ws://localhost:18789",
      port: 18789,
      protocol: "ws",
      check: checkWebSocket("OpenClaw Gateway", "ws://localhost:18789"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Core health check runner
// ---------------------------------------------------------------------------

async function runChecks(
  services: ServiceDefinition[],
  timeoutMs: number,
): Promise<ServiceCheckResult[]> {
  const promises = services.map((svc) => svc.check(timeoutMs));
  const settled = await Promise.allSettled(promises);

  return settled.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      name: services[i].name,
      status: "DOWN" as const,
      responseTimeMs: 0,
      details: String(result.reason),
    };
  });
}

function printHealthTable(results: ServiceCheckResult[]): void {
  const headers = ["Service", "Status", "Response Time", "Details"];
  const rows = results.map((r) => [
    r.name,
    r.status,
    r.responseTimeMs > 0 ? `${r.responseTimeMs}ms` : "-",
    r.details,
  ]);

  console.log(table(headers, rows));

  const healthy = results.filter((r) => r.status === "UP").length;
  const total = results.length;
  console.log(`\n${healthy}/${total} services healthy`);
}

function filterServices(
  definitions: ServiceDefinition[],
  filterStr?: string,
): ServiceDefinition[] {
  if (!filterStr || filterStr.trim().length === 0) {
    return definitions;
  }

  const names = filterStr
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  return definitions.filter((svc) => {
    const svcLower = svc.name.toLowerCase();
    return names.some(
      (n) => svcLower.includes(n) || svcLower.replace(/\s+/g, "-").includes(n),
    );
  });
}

// ---------------------------------------------------------------------------
// Public commands
// ---------------------------------------------------------------------------

/**
 * Check health of all ClawChain services.
 */
export async function runHealthCheck(opts: HealthCheckOptions): Promise<void> {
  const { rpcUrl, restUrl } = getEndpoints(opts);
  const timeoutMs = opts.timeout ?? 5000;
  const allServices = buildServiceDefinitions(rpcUrl, restUrl);
  const services = filterServices(allServices, opts.services);

  if (services.length === 0) {
    console.error("No services matched the filter. Available services:");
    for (const svc of allServices) {
      console.error(`  - ${svc.name}`);
    }
    process.exit(1);
  }

  const results = await runChecks(services, timeoutMs);

  if (opts.json) {
    const healthy = results.filter((r) => r.status === "UP").length;
    process.stdout.write(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          healthy,
          total: results.length,
          services: results,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("ClawChain Service Health\n");
  printHealthTable(results);
  console.log();
}

/**
 * Continuous health monitoring with periodic refresh.
 */
export async function runHealthWatch(opts: HealthWatchOptions): Promise<void> {
  const { rpcUrl, restUrl } = getEndpoints(opts);
  const intervalMs = (opts.interval ?? 10) * 1000;
  const services = buildServiceDefinitions(rpcUrl, restUrl);

  const runOnce = async () => {
    const results = await runChecks(services, 5000);
    const timestamp = new Date().toISOString();

    if (opts.json) {
      const healthy = results.filter((r) => r.status === "UP").length;
      process.stdout.write(
        JSON.stringify(
          {
            timestamp,
            healthy,
            total: results.length,
            services: results,
          },
          null,
          2,
        ) + "\n",
      );
    } else {
      // Clear terminal for a clean refresh
      process.stdout.write("\x1B[2J\x1B[H");
      console.log(`ClawChain Service Health  [${timestamp}]`);
      console.log(`Refresh every ${opts.interval ?? 10}s  (Ctrl+C to exit)\n`);
      printHealthTable(results);
      console.log();
    }
  };

  // Run immediately, then on interval
  await runOnce();
  const timer = setInterval(runOnce, intervalMs);

  // Graceful Ctrl+C shutdown
  const cleanup = () => {
    clearInterval(timer);
    if (!opts.json) {
      console.log("\nHealth watch stopped.");
    }
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

/**
 * List all configured service endpoints.
 */
export async function runHealthEndpoints(opts: HealthEndpointsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = trimSlash(cfg.rpcUrl ?? "http://localhost:26657");
  const restUrl = trimSlash(cfg.restUrl ?? deriveRestFromRpc(rpcUrl));
  const services = buildServiceDefinitions(rpcUrl, restUrl);

  if (opts.json) {
    const endpoints = services.map((svc) => ({
      name: svc.name,
      url: svc.url,
      port: svc.port,
      protocol: svc.protocol,
    }));
    process.stdout.write(JSON.stringify({ endpoints }, null, 2) + "\n");
    return;
  }

  console.log("ClawChain Service Endpoints\n");

  const headers = ["Service", "URL", "Port", "Protocol"];
  const rows = services.map((svc) => [
    svc.name,
    svc.url,
    String(svc.port),
    svc.protocol.toUpperCase(),
  ]);

  console.log(table(headers, rows));
  console.log();
}
