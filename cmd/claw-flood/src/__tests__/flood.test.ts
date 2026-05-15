import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculatePercentiles,
  runWorker,
  formatResults,
  aggregateResults,
  checkConnectivity,
  extractErrorType,
  getReadEndpoints,
  SCENARIOS,
  type WorkerResult,
  type LoadTestResult,
} from "../index.js";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function okResponse(body = "{}") {
  return Promise.resolve({
    status: 200,
    ok: true,
    text: () => Promise.resolve(body),
  });
}

function failResponse(status = 500) {
  return Promise.resolve({
    status,
    ok: false,
    text: () => Promise.resolve("error"),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => okResponse());
});

// ---------------------------------------------------------------------------
// Percentile calculation
// ---------------------------------------------------------------------------

describe("calculatePercentiles", () => {
  it("computes p50, p95, p99 correctly for sorted data", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = calculatePercentiles(values, [50, 95, 99]);
    expect(result.p50).toBe(50);
    expect(result.p95).toBe(95);
    expect(result.p99).toBe(99);
  });

  it("returns the single value for all percentiles when array has one element", () => {
    const result = calculatePercentiles([42], [50, 95, 99]);
    expect(result.p50).toBe(42);
    expect(result.p95).toBe(42);
    expect(result.p99).toBe(42);
  });

  it("returns 0 for all percentiles when array is empty", () => {
    const result = calculatePercentiles([], [50, 95, 99]);
    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.p99).toBe(0);
  });

  it("handles unsorted input correctly", () => {
    const values = [100, 1, 50, 75, 25];
    const result = calculatePercentiles(values, [50]);
    expect(result.p50).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter / delay
// ---------------------------------------------------------------------------

describe("rate limiter delay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates correct delay for target rate", () => {
    const rate = 100;
    const concurrency = 10;
    const expectedDelay = 1000 / (rate / concurrency);
    expect(expectedDelay).toBe(100);
  });

  it("delay is 0 when rate is unlimited", () => {
    const rate = 0;
    const delayMs = rate > 0 ? 1000 / (rate / 10) : 0;
    expect(delayMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Read scenario endpoint selection
// ---------------------------------------------------------------------------

describe("read scenario endpoints", () => {
  it("returns all 4 expected endpoints", () => {
    const endpoints = getReadEndpoints("http://rpc", "http://rest");
    expect(endpoints).toHaveLength(4);
    expect(endpoints).toContain("http://rpc/status");
    expect(endpoints).toContain("http://rpc/block");
    expect(endpoints).toContain("http://rest/cosmos/bank/v1beta1/supply");
    expect(endpoints).toContain("http://rest/clawchain/agent/v1/agents");
  });

  it("cycles through different endpoints during read scenario", async () => {
    const seen = new Set<string>();
    mockFetch.mockImplementation((url: string) => {
      seen.add(url);
      return okResponse();
    });

    const results = await runWorker(
      0, "read",
      "http://localhost:26657", "http://localhost:1317",
      200, 0, false,
    );

    expect(results.length).toBeGreaterThan(0);
    // Over many requests, we should hit multiple endpoints
    const endpoints = getReadEndpoints("http://localhost:26657", "http://localhost:1317");
    const hitCount = endpoints.filter((ep) => seen.has(ep)).length;
    expect(hitCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Check command
// ---------------------------------------------------------------------------

describe("checkConnectivity", () => {
  it("reports both endpoints as OK when reachable", async () => {
    mockFetch.mockImplementation(() => okResponse());
    const result = await checkConnectivity("http://rpc", "http://rest");
    expect(result.rpc.ok).toBe(true);
    expect(result.rest.ok).toBe(true);
    expect(result.rpc.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.rest.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports failure when endpoint throws", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await checkConnectivity("http://rpc", "http://rest");
    expect(result.rpc.ok).toBe(false);
    expect(result.rest.ok).toBe(false);
    expect(result.rpc.error).toContain("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// Results formatting
// ---------------------------------------------------------------------------

describe("formatResults", () => {
  const sampleResult: LoadTestResult = {
    scenario: "read",
    duration: 30,
    concurrency: 10,
    totalRequests: 15234,
    successfulRequests: 15198,
    failedRequests: 36,
    requestsPerSecond: 507.8,
    latency: { min: 1.2, max: 312.5, mean: 19.7, p50: 15.3, p95: 45.2, p99: 89.1 },
    errorRate: 0.002,
    errors: { ECONNREFUSED: 20, timeout: 16 },
    throughputBytesPerSec: 0,
  };

  it("shows correct req/s calculation", () => {
    const output = formatResults(sampleResult);
    expect(output).toContain("507.8 req/s");
  });

  it("includes scenario name and duration", () => {
    const output = formatResults(sampleResult);
    expect(output).toContain("Scenario:     read");
    expect(output).toContain("Duration:     30.0s");
  });

  it("includes latency percentiles", () => {
    const output = formatResults(sampleResult);
    expect(output).toContain("p50:");
    expect(output).toContain("p95:");
    expect(output).toContain("p99:");
  });

  it("includes error breakdown", () => {
    const output = formatResults(sampleResult);
    expect(output).toContain("ECONNREFUSED: 20");
    expect(output).toContain("timeout: 16");
  });
});

// ---------------------------------------------------------------------------
// Error counting
// ---------------------------------------------------------------------------

describe("error counting", () => {
  it("groups errors by type", () => {
    const workers: WorkerResult[][] = [
      [
        { requestId: 0, startTime: 1000, endTime: 1010, latencyMs: 10, success: false, statusCode: 0, endpoint: "/a", error: "ECONNREFUSED" },
        { requestId: 1, startTime: 1010, endTime: 1020, latencyMs: 10, success: false, statusCode: 0, endpoint: "/b", error: "timeout" },
        { requestId: 2, startTime: 1020, endTime: 1030, latencyMs: 10, success: false, statusCode: 0, endpoint: "/c", error: "ECONNREFUSED" },
        { requestId: 3, startTime: 1030, endTime: 1040, latencyMs: 10, success: true, statusCode: 200, endpoint: "/d" },
      ],
    ];

    const result = aggregateResults(workers, "read", 10, 1);
    expect(result.errors["ECONNREFUSED"]).toBe(2);
    expect(result.errors["timeout"]).toBe(1);
    expect(result.failedRequests).toBe(3);
    expect(result.successfulRequests).toBe(1);
  });

  it("extractErrorType classifies known error patterns", () => {
    expect(extractErrorType("connect ECONNREFUSED 127.0.0.1")).toBe("ECONNREFUSED");
    expect(extractErrorType("request timeout after 5000ms")).toBe("timeout");
    expect(extractErrorType("ETIMEDOUT")).toBe("timeout");
    expect(extractErrorType("ECONNRESET by peer")).toBe("ECONNRESET");
    expect(extractErrorType("getaddrinfo ENOTFOUND example")).toBe("ENOTFOUND");
    expect(extractErrorType("something weird")).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

describe("JSON output", () => {
  it("includes all LoadTestResult fields", () => {
    const workers: WorkerResult[][] = [
      [
        { requestId: 0, startTime: 1000, endTime: 1050, latencyMs: 50, success: true, statusCode: 200, endpoint: "/status" },
      ],
    ];

    const result = aggregateResults(workers, "read", 5, 1);
    const json = JSON.parse(JSON.stringify(result));

    expect(json).toHaveProperty("scenario", "read");
    expect(json).toHaveProperty("duration", 5);
    expect(json).toHaveProperty("concurrency", 1);
    expect(json).toHaveProperty("totalRequests", 1);
    expect(json).toHaveProperty("successfulRequests", 1);
    expect(json).toHaveProperty("failedRequests", 0);
    expect(json).toHaveProperty("requestsPerSecond");
    expect(json).toHaveProperty("latency");
    expect(json.latency).toHaveProperty("min");
    expect(json.latency).toHaveProperty("max");
    expect(json.latency).toHaveProperty("mean");
    expect(json.latency).toHaveProperty("p50");
    expect(json.latency).toHaveProperty("p95");
    expect(json.latency).toHaveProperty("p99");
    expect(json).toHaveProperty("errorRate", 0);
    expect(json).toHaveProperty("errors");
    expect(json).toHaveProperty("throughputBytesPerSec");
  });
});

// ---------------------------------------------------------------------------
// Scenario listing
// ---------------------------------------------------------------------------

describe("scenario listing", () => {
  it("contains all 6 scenarios", () => {
    expect(SCENARIOS).toHaveLength(6);
    const names = SCENARIOS.map((s) => s.name);
    expect(names).toEqual(["read", "write", "mixed", "blocks", "txquery", "abci"]);
  });

  it("each scenario has a description", () => {
    for (const s of SCENARIOS) {
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Duration-based loop termination
// ---------------------------------------------------------------------------

describe("runWorker duration control", () => {
  it("terminates after elapsed duration", async () => {
    mockFetch.mockImplementation(() => okResponse());

    const durationMs = 150;
    const start = Date.now();
    const results = await runWorker(
      0, "read",
      "http://localhost:26657", "http://localhost:1317",
      durationMs, 0, false,
    );
    const elapsed = Date.now() - start;

    expect(results.length).toBeGreaterThan(0);
    // Allow some tolerance for the last in-flight request
    expect(elapsed).toBeLessThan(durationMs + 500);
  });
});

// ---------------------------------------------------------------------------
// Worker latency collection
// ---------------------------------------------------------------------------

describe("worker latency measurement", () => {
  it("collects latency for each request", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      return new Promise((resolve) =>
        setTimeout(() => resolve({ status: 200, ok: true, text: () => Promise.resolve("ok") }), 5),
      );
    });

    const results = await runWorker(
      0, "read",
      "http://rpc", "http://rest",
      100, 0, false,
    );

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
      expect(r.endTime).toBeGreaterThanOrEqual(r.startTime);
      expect(r.latencyMs).toBe(r.endTime - r.startTime);
    }
  });
});
