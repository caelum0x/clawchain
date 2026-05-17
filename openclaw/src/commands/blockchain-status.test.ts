import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

function createMockRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  } as unknown as import("../runtime.js").RuntimeEnv;
}

const mockFetch = vi.fn();

describe("blockchainStatusCommand", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("reports disabled when blockchain not enabled", async () => {
    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await blockchainStatusCommand(cfg, runtime);

    expect(result.enabled).toBe(false);
    expect(result.rpcReachable).toBe(false);
    expect(result.restReachable).toBe(false);
    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining("disabled"));
  });

  it("reports disabled in JSON mode", async () => {
    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await blockchainStatusCommand(cfg, runtime, { json: true });

    expect(result.enabled).toBe(false);
    const logCall = (runtime.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logCall);
    expect(parsed.enabled).toBe(false);
  });

  it("probes RPC and REST endpoints when enabled", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              node_info: { id: "abc123", network: "clawchain-testnet-1" },
              sync_info: { latest_block_height: "42000" },
            },
          }),
        };
      }
      return { ok: true, status: 200 };
    });

    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: {
        enabled: true,
        rpcUrl: "http://localhost:26657",
        restUrl: "http://localhost:1317",
      },
    };

    const result = await blockchainStatusCommand(cfg, runtime);

    expect(result.enabled).toBe(true);
    expect(result.rpcReachable).toBe(true);
    expect(result.restReachable).toBe(true);
    expect(result.blockHeight).toBe(42000);
    expect(result.nodeId).toBe("abc123");
    expect(result.network).toBe("clawchain-testnet-1");
  });

  it("handles unreachable endpoints gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true },
    };

    const result = await blockchainStatusCommand(cfg, runtime);

    expect(result.enabled).toBe(true);
    expect(result.rpcReachable).toBe(false);
    expect(result.restReachable).toBe(false);
    expect(result.blockHeight).toBeNull();
  });

  it("shows mnemonic configured when env var set", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubEnv("BLOCKCHAIN_MNEMONIC", "test mnemonic words here");

    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true },
    };

    const result = await blockchainStatusCommand(cfg, runtime);
    expect(result.agentAddress).toContain("configured");
  });

  it("JSON output includes all fields", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: {
        enabled: true,
        heartbeat: { enabled: true, intervalSeconds: 30 },
        autonomousLoop: { enabled: true },
        faucet: { enabled: true },
        node: { autoStart: true },
      },
    };

    const result = await blockchainStatusCommand(cfg, runtime, { json: true });

    expect(result.heartbeatEnabled).toBe(true);
    expect(result.heartbeatIntervalSeconds).toBe(30);
    expect(result.autonomousLoopEnabled).toBe(true);
    expect(result.faucetEnabled).toBe(true);
    expect(result.nodeAutoStart).toBe(true);
  });

  it("text output includes key details", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              node_info: { id: "node1", network: "clawchain-1" },
              sync_info: { latest_block_height: "100" },
            },
          }),
        };
      }
      return { ok: true, status: 200 };
    });

    const { blockchainStatusCommand } = await import("./blockchain-status.js");
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true, autoRegister: true },
    };

    await blockchainStatusCommand(cfg, runtime);

    const output = (runtime.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(output).toContain("ClawChain Status");
    expect(output).toContain("RPC reachable:   yes");
    expect(output).toContain("Block height:    100");
    expect(output).toContain("Network:         clawchain-1");
    expect(output).toContain("Auto-register:   yes");
  });
});
