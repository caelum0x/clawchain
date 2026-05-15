/**
 * Tests for `clawd faucet` — request tokens from a faucet endpoint.
 *
 * Tests runFaucetRequest by mocking fetch. Skips runFaucetServe
 * (requires signing client and long-running server).
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
    agentAddress: "claw1agent123456789012345678",
    faucetUrl: "http://localhost:8888",
  })),
}));

// Mock mnemonic
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

// Mock faucet-server (imported at module level)
vi.mock("../../lib/faucet-server.js", () => ({
  FaucetServer: vi.fn(),
}));

import { runFaucetRequest } from "../faucet.js";

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
// runFaucetRequest()
// ---------------------------------------------------------------------------

describe("runFaucetRequest", () => {
  it("displays success message after receiving tokens", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          amount: "10000000",
          denom: "uclaw",
          txHash: "AABB1234",
        }),
    }) as unknown as typeof fetch;

    await runFaucetRequest({});

    const output = logs.join("\n");
    expect(output).toContain("Requesting tokens from faucet");
    expect(output).toContain("Tokens received!");
    expect(output).toContain("10000000");
    expect(output).toContain("uclaw");
    expect(output).toContain("AABB1234");
  });

  it("uses custom faucet URL when --from is provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ amount: "1000", denom: "uclaw", txHash: "TX1" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runFaucetRequest({ from: "http://custom-faucet:9999" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("http://custom-faucet:9999");
  });

  it("sends POST request with address in body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ amount: "1000", denom: "uclaw", txHash: "TX2" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runFaucetRequest({});

    const callOpts = (fetchSpy as any).mock.calls[0][1];
    expect(callOpts.method).toBe("POST");
    const body = JSON.parse(callOpts.body);
    expect(body.address).toBe("claw1agent123456789012345678");
  });

  it("tries /faucet/request endpoint first", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ amount: "5000", denom: "uclaw", txHash: "TX3" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runFaucetRequest({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/faucet/request");
  });

  it("falls back to /send endpoint when /faucet/request returns 404", async () => {
    let callCount = 0;
    const fetchSpy = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: "not found" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ amount: "5000", denom: "uclaw", txHash: "FALLBACK" }),
      });
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runFaucetRequest({});

    expect((fetchSpy as any).mock.calls.length).toBe(2);
    const secondUrl = String((fetchSpy as any).mock.calls[1][0]);
    expect(secondUrl).toContain("/send");

    const output = logs.join("\n");
    expect(output).toContain("Tokens received!");
    expect(output).toContain("FALLBACK");
  });

  it("exits with error when no agent address is configured", async () => {
    // Temporarily override the config mock to have no agentAddress
    const { loadClawdConfig } = await import("../../lib/config.js");
    (loadClawdConfig as any).mockReturnValueOnce({
      chainId: "clawchain-1",
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      agentAddress: undefined,
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await runFaucetRequest({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("displays requesting message with address", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ amount: "1000", denom: "uclaw", txHash: "TX" }),
    }) as unknown as typeof fetch;

    await runFaucetRequest({});

    const output = logs.join("\n");
    expect(output).toContain("Address: claw1agent123456789012345678");
  });
});
