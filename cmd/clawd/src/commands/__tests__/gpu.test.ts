/**
 * Tests for `clawd gpu` subcommands — list, jobs, status, leases.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips lease/submit-job (they require signing client).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

// Mock mnemonic (imported by module for signing commands)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

import { runGpuList, runGpuJobs, runGpuStatus, runGpuLeases } from "../gpu.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runGpuList()
// ---------------------------------------------------------------------------

describe("runGpuList", () => {
  it("displays GPU resources table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resources: [
            {
              id: 1,
              name: "A100-Node-1",
              gpu_model: "A100",
              gpu_count: 4,
              vram_gb: 80,
              price_per_hour_uclaw: "5000000",
              active: true,
              region: "us-east",
            },
            {
              id: 2,
              name: "H100-Node-2",
              gpu_model: "H100",
              gpu_count: 8,
              vram_gb: 80,
              price_per_hour_uclaw: "10000000",
              active: true,
              region: "eu-west",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runGpuList({});

    const output = logs.join("\n");
    expect(output).toContain("GPU Resources (2)");
    expect(output).toContain("A100-Node-1");
    expect(output).toContain("H100-Node-2");
    expect(output).toContain("A100");
    expect(output).toContain("H100");
    expect(output).toContain("80 GB");
    expect(output).toContain("us-east");
    expect(output).toContain("eu-west");
  });

  it("shows message when no GPU resources found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: [] }),
    }) as unknown as typeof fetch;

    await runGpuList({});

    const output = logs.join("\n");
    expect(output).toContain("No GPU resources found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resources: [{ id: 1, name: "TestGPU", gpu_model: "A100" }],
        }),
    }) as unknown as typeof fetch;

    await runGpuList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].name).toBe("TestGPU");
  });

  it("passes available filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runGpuList({ available: true });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("only_available=true");
  });
});

// ---------------------------------------------------------------------------
// runGpuJobs()
// ---------------------------------------------------------------------------

describe("runGpuJobs", () => {
  it("displays compute jobs table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jobs: [
            {
              id: 1,
              status: "completed",
              job_type: "inference",
              gpu_type: "A100",
              submitter: "claw1submitter1234567890123456",
              provider: "claw1provider1234567890123456",
              result_hash: "abc123",
            },
            {
              id: 2,
              status: "running",
              job_type: "training",
              gpu_type: "H100",
              submitter: "claw1submitter9999999999999999",
              provider: "claw1provider9999999999999999",
              result_hash: "",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runGpuJobs({});

    const output = logs.join("\n");
    expect(output).toContain("Compute Jobs (2)");
    expect(output).toContain("[DONE]");
    expect(output).toContain("[RUNNING]");
    expect(output).toContain("inference");
    expect(output).toContain("training");
    expect(output).toContain("abc123");
  });

  it("shows message when no jobs found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobs: [] }),
    }) as unknown as typeof fetch;

    await runGpuJobs({});

    const output = logs.join("\n");
    expect(output).toContain("No compute jobs found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jobs: [{ id: 1, status: "pending" }],
        }),
    }) as unknown as typeof fetch;

    await runGpuJobs({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0].status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// runGpuStatus()
// ---------------------------------------------------------------------------

describe("runGpuStatus", () => {
  it("displays single job detail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          job: {
            status: "completed",
            name: "my-training-run",
            job_type: "training",
            execution_type: "docker",
            gpu_type: "A100",
            gpu_count: 4,
            submitter: "claw1submitter1234567890123456",
            provider: "claw1provider1234567890123456",
            resource_id: 1,
            lease_id: 10,
            docker_image: "nvcr.io/nvidia/pytorch:latest",
            result_hash: "deadbeef",
          },
        }),
    }) as unknown as typeof fetch;

    await runGpuStatus({ jobId: 42 });

    const output = logs.join("\n");
    expect(output).toContain("Compute Job #42");
    expect(output).toContain("[DONE]");
    expect(output).toContain("my-training-run");
    expect(output).toContain("training");
    expect(output).toContain("docker");
    expect(output).toContain("A100");
    expect(output).toContain("deadbeef");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          job: {
            status: "running",
            name: "test-job",
          },
        }),
    }) as unknown as typeof fetch;

    await runGpuStatus({ jobId: 5, json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe("running");
    expect(parsed.name).toBe("test-job");
  });
});

// ---------------------------------------------------------------------------
// runGpuLeases()
// ---------------------------------------------------------------------------

describe("runGpuLeases", () => {
  it("displays leases table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          leases: [
            {
              id: 1,
              resource_id: 10,
              lessee: "claw1lessee12345678901234567890",
              provider: "claw1provider1234567890123456",
              start_block: 100,
              end_block: 200,
              total_cost: "5000000",
              status: "active",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runGpuLeases({});

    const output = logs.join("\n");
    expect(output).toContain("Compute Leases (1)");
    expect(output).toContain("active");
    expect(output).toContain("5 CLAW");
  });

  it("shows message when no leases found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ leases: [] }),
    }) as unknown as typeof fetch;

    await runGpuLeases({});

    const output = logs.join("\n");
    expect(output).toContain("No active leases found.");
  });
});
