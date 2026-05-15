/**
 * Tests for `clawd upgrade` subcommands — check, info, prepare.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/tmp/test-clawchain-home",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

// Mock paths
vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/tmp/test-clawchain-home",
}));

// Mock fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { runUpgradeCheck, runUpgradeInfo, runUpgradePrepare } from "../upgrade.js";

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
// runUpgradeCheck
// ---------------------------------------------------------------------------

describe("runUpgradeCheck", () => {
  it("displays version info with no pending upgrade", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("node_info")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              default_node_info: { network: "clawchain-1" },
              application_version: {
                name: "clawchaind",
                app_name: "clawchaind",
                version: "1.0.0",
                cosmos_sdk_version: "v0.53.6",
              },
            }),
        });
      }
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: { sync_info: { latest_block_height: "12345" } },
            }),
        });
      }
      if (urlStr.includes("current_plan")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ plan: null }),
        });
      }
      if (urlStr.includes("module_versions")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              module_versions: [
                { name: "agent", version: "2" },
                { name: "privacy", version: "1" },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runUpgradeCheck({});

    const output = logs.join("\n");
    expect(output).toContain("Upgrade Check");
    expect(output).toContain("1.0.0");
    expect(output).toContain("v0.53.6");
    expect(output).toContain("12345");
    expect(output).toContain("Pending Upgrade:  none");
    expect(output).toContain("agent");
    expect(output).toContain("privacy");
  });

  it("shows pending upgrade with blocks remaining", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("node_info")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              default_node_info: { network: "clawchain-1" },
              application_version: {
                name: "clawchaind",
                version: "1.0.0",
                cosmos_sdk_version: "v0.53.6",
              },
            }),
        });
      }
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: { sync_info: { latest_block_height: "10000" } },
            }),
        });
      }
      if (urlStr.includes("current_plan")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              plan: {
                name: "v2",
                height: "20000",
                info: "Upgrade to v2 with new modules",
              },
            }),
        });
      }
      if (urlStr.includes("module_versions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ module_versions: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runUpgradeCheck({});

    const output = logs.join("\n");
    expect(output).toContain("Pending Upgrade:");
    expect(output).toContain("v2");
    expect(output).toContain("20000");
    expect(output).toContain("Blocks left:");
    expect(output).toContain("10000");
    expect(output).toContain("ETA:");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("node_info")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              default_node_info: { network: "clawchain-1" },
              application_version: { version: "1.0.0" },
            }),
        });
      }
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: { sync_info: { latest_block_height: "5000" } },
            }),
        });
      }
      if (urlStr.includes("current_plan")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ plan: null }),
        });
      }
      if (urlStr.includes("module_versions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ module_versions: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runUpgradeCheck({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.current_height).toBe("5000");
    expect(parsed.pending_upgrade).toBeNull();
    expect(parsed.module_versions).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runUpgradeInfo
// ---------------------------------------------------------------------------

describe("runUpgradeInfo", () => {
  it("shows info for an applied upgrade", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("current_plan")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              plan: {
                name: "v2",
                height: "15000",
                info: "Module migration upgrade",
              },
            }),
        });
      }
      if (urlStr.includes("applied_plan")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ height: "15000" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runUpgradeInfo({});

    const output = logs.join("\n");
    expect(output).toContain("Upgrade Info");
    expect(output).toContain("v2");
    expect(output).toContain("15000");
    expect(output).toContain("Applied:   yes");
  });

  it("shows no upgrade plan when none exists", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ plan: null }),
    }) as unknown as typeof fetch;

    await runUpgradeInfo({});

    const output = logs.join("\n");
    expect(output).toContain("No upgrade plan found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("current_plan")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              plan: { name: "v2", height: "15000", info: "test" },
            }),
        });
      }
      if (urlStr.includes("applied_plan")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ height: "0" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runUpgradeInfo({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.plan).toBeDefined();
    expect(parsed.plan.name).toBe("v2");
    expect(parsed.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runUpgradePrepare
// ---------------------------------------------------------------------------

describe("runUpgradePrepare", () => {
  it("creates upgrade directory structure", async () => {
    const { mkdirSync } = await import("node:fs");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ plan: null }),
    }) as unknown as typeof fetch;

    await runUpgradePrepare({ name: "v2" });

    const output = logs.join("\n");
    expect(output).toContain('Preparing upgrade "v2"');
    expect(output).toContain("cosmovisor/upgrades/v2/bin");
    expect(output).toContain("created");
    expect(mkdirSync).toHaveBeenCalled();
  });

  it("warns when plan name does not match specified name", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          plan: { name: "v3", height: "30000" },
        }),
    }) as unknown as typeof fetch;

    await runUpgradePrepare({ name: "v2" });

    const output = logs.join("\n");
    expect(output).toContain('pending upgrade is "v3"');
    expect(output).toContain('"v2"');
  });
});
