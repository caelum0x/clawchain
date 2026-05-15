/**
 * Tests for `clawd model` subcommands — list, query, providers.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips register/inference (they require signing client).
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

import { runModelList, runModelQuery, runModelProviders } from "../model.js";

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
// runModelList()
// ---------------------------------------------------------------------------

describe("runModelList", () => {
  it("displays models table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [
            {
              id: 1,
              name: "GPT-Claw-7B",
              owner: "claw1owner12345678901234567890",
              version: "1.0",
              access_type: "paid",
              price_per_query: "500000",
              status: "active",
            },
            {
              id: 2,
              name: "Whisper-Claw",
              owner: "claw1owner99999999999999999999",
              version: "2.1",
              access_type: "free",
              price_per_query: "0",
              status: "active",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runModelList({});

    const output = logs.join("\n");
    expect(output).toContain("Models (2)");
    expect(output).toContain("GPT-Claw-7B");
    expect(output).toContain("Whisper-Claw");
    expect(output).toContain("paid");
    expect(output).toContain("free");
    expect(output).toContain("0.5 CLAW");
  });

  it("shows message when no models found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    }) as unknown as typeof fetch;

    await runModelList({});

    const output = logs.join("\n");
    expect(output).toContain("No models found.");
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
          models: [{ id: 1, name: "TestModel" }],
        }),
    }) as unknown as typeof fetch;

    await runModelList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.models).toHaveLength(1);
    expect(parsed.models[0].name).toBe("TestModel");
  });

  it("passes owner filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runModelList({ owner: "claw1myowner" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("owner=claw1myowner");
  });
});

// ---------------------------------------------------------------------------
// runModelQuery()
// ---------------------------------------------------------------------------

describe("runModelQuery", () => {
  it("displays single model detail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: {
            name: "GPT-Claw-7B",
            description: "A large language model",
            owner: "claw1owner12345678901234567890",
            version: "1.0",
            access_type: "paid",
            price_per_query: "1000000",
            endpoint: "https://api.claw.ai/v1/inference",
            status: "active",
          },
        }),
    }) as unknown as typeof fetch;

    await runModelQuery({ modelId: "1" });

    const output = logs.join("\n");
    expect(output).toContain("Model #1");
    expect(output).toContain("Name:        GPT-Claw-7B");
    expect(output).toContain("Description: A large language model");
    expect(output).toContain("Version:     1.0");
    expect(output).toContain("Access Type: paid");
    expect(output).toContain("1 CLAW");
    expect(output).toContain("Endpoint:    https://api.claw.ai/v1/inference");
  });

  it("handles 404 for non-existent model", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runModelQuery({ modelId: "999" });

    const output = logs.join("\n");
    expect(output).toContain("Model 999 not found.");
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
          model: {
            name: "TestModel",
            version: "2.0",
          },
        }),
    }) as unknown as typeof fetch;

    await runModelQuery({ modelId: "5", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe("TestModel");
    expect(parsed.version).toBe("2.0");
  });
});

// ---------------------------------------------------------------------------
// runModelProviders()
// ---------------------------------------------------------------------------

describe("runModelProviders", () => {
  it("displays inference providers table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          providers: [
            {
              address: "claw1provider123456789012345678",
              model_id: "1",
              endpoint: "https://provider1.claw.ai",
              price_per_query: "500000",
              active: true,
            },
            {
              address: "claw1provider999999999999999999",
              model_id: "2",
              endpoint: "https://provider2.claw.ai",
              price_per_query: "0",
              active: true,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runModelProviders({});

    const output = logs.join("\n");
    expect(output).toContain("Inference Providers (2)");
    expect(output).toContain("0.5 CLAW");
    expect(output).toContain("0 CLAW");
    expect(output).toContain("https://provider1.claw.ai");
  });

  it("shows message when no providers found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ providers: [] }),
    }) as unknown as typeof fetch;

    await runModelProviders({});

    const output = logs.join("\n");
    expect(output).toContain("No inference providers found.");
  });

  it("passes model_id filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ providers: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runModelProviders({ modelId: "42" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("model_id=42");
  });
});
