import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const mockFetch = vi.fn();

// Mock child_process for detectBinaryExists
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "/usr/local/bin/clawproof"),
}));

describe("checkBlockchainHealth", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("returns not configured when blockchain disabled", async () => {
    const { checkBlockchainHealth } = await import("./blockchain-health.js");
    const cfg: OpenClawConfig = {};

    const report = await checkBlockchainHealth(cfg);

    expect(report.configured).toBe(false);
    expect(report.issues).toHaveLength(0);
    expect(report.tips.length).toBeGreaterThan(0);
  });

  it("reports healthy when all checks pass", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              sync_info: { latest_block_height: "1000", catching_up: false },
            },
          }),
        };
      }
      return { ok: true, status: 200 };
    });

    const { checkBlockchainHealth } = await import("./blockchain-health.js");
    const cfg: OpenClawConfig = {
      blockchain: {
        enabled: true,
        rpcUrl: "http://localhost:26657",
        restUrl: "http://localhost:1317",
        mnemonic: "test mnemonic words",
      },
    };

    const report = await checkBlockchainHealth(cfg);

    expect(report.configured).toBe(true);
    expect(report.rpcReachable).toBe(true);
    expect(report.restReachable).toBe(true);
    expect(report.blockHeight).toBe(1000);
    expect(report.syncing).toBe(false);
    expect(report.mnemonicConfigured).toBe(true);
    expect(report.proofBinaryAvailable).toBe(true);
  });

  it("reports issues when endpoints unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { checkBlockchainHealth } = await import("./blockchain-health.js");
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true, mnemonic: "test" },
    };

    const report = await checkBlockchainHealth(cfg);

    expect(report.rpcReachable).toBe(false);
    expect(report.restReachable).toBe(false);
    expect(report.issues.length).toBeGreaterThanOrEqual(2);
    expect(report.issues.some((i) => i.includes("RPC"))).toBe(true);
    expect(report.issues.some((i) => i.includes("REST"))).toBe(true);
  });

  it("reports syncing node as issue", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              sync_info: { latest_block_height: "50", catching_up: true },
            },
          }),
        };
      }
      return { ok: true, status: 200 };
    });

    const { checkBlockchainHealth } = await import("./blockchain-health.js");
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true, mnemonic: "test" },
    };

    const report = await checkBlockchainHealth(cfg);

    expect(report.syncing).toBe(true);
    expect(report.issues.some((i) => i.includes("syncing"))).toBe(true);
  });

  it("reports missing mnemonic", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubEnv("BLOCKCHAIN_MNEMONIC", "");

    const { checkBlockchainHealth } = await import("./blockchain-health.js");
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true },
    };

    const report = await checkBlockchainHealth(cfg);

    expect(report.mnemonicConfigured).toBe(false);
    expect(report.issues.some((i) => i.includes("mnemonic"))).toBe(true);
  });
});

describe("formatBlockchainHealthSummary", () => {
  it("formats not configured", async () => {
    const { formatBlockchainHealthSummary } = await import("./blockchain-health.js");
    const summary = formatBlockchainHealthSummary({
      configured: false,
      rpcReachable: false,
      restReachable: false,
      blockHeight: null,
      syncing: false,
      mnemonicConfigured: false,
      proofBinaryAvailable: false,
      issues: [],
      tips: [],
    });
    expect(summary).toContain("not configured");
  });

  it("formats healthy status", async () => {
    const { formatBlockchainHealthSummary } = await import("./blockchain-health.js");
    const summary = formatBlockchainHealthSummary({
      configured: true,
      rpcReachable: true,
      restReachable: true,
      blockHeight: 42000,
      syncing: false,
      mnemonicConfigured: true,
      proofBinaryAvailable: true,
      issues: [],
      tips: [],
    });
    expect(summary).toContain("healthy");
    expect(summary).toContain("42000");
  });

  it("formats degraded status with issues", async () => {
    const { formatBlockchainHealthSummary } = await import("./blockchain-health.js");
    const summary = formatBlockchainHealthSummary({
      configured: true,
      rpcReachable: false,
      restReachable: true,
      blockHeight: null,
      syncing: false,
      mnemonicConfigured: true,
      proofBinaryAvailable: false,
      issues: ["RPC unreachable", "clawproof missing"],
      tips: ["Check RPC URL", "Install clawproof"],
    });
    expect(summary).toContain("degraded");
    expect(summary).toContain("RPC unreachable");
    expect(summary).toContain("clawproof missing");
    expect(summary).toContain("Check RPC URL");
  });
});
