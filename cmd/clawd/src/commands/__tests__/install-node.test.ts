/**
 * Tests for `clawd install-node` — node binary install and service setup.
 *
 * install-node writes files and manages system services, so we mock
 * child_process, fs, and config. We test the config update logic only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: false,
    nodeHome: "/test/.clawchain",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
    nodeBinaryPath: undefined,
  })),
  writeClawdConfig: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn((cmd: string, args: string[]) => {
    if (cmd === "which") return Buffer.from("/usr/local/bin/clawchaind\n");
    return Buffer.from("");
  }),
}));

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { runInstallNode } from "../install-node.js";
import type { InstallNodeOptions } from "../install-node.js";
import { writeClawdConfig } from "../../lib/config.js";

const mockedWriteConfig = vi.mocked(writeClawdConfig);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runInstallNode()
// ---------------------------------------------------------------------------

describe("runInstallNode", () => {
  it("exports runInstallNode as a function", () => {
    expect(typeof runInstallNode).toBe("function");
  });

  it("updates config with binary path and nodeHome", async () => {
    await runInstallNode({ noService: true });

    expect(mockedWriteConfig).toHaveBeenCalled();
    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.nodeAutoStart).toBe(true);
    expect(writtenConfig.nodeHome).toBe("/test/.clawchain");
  });

  it("prints runtime config summary", async () => {
    await runInstallNode({ noService: true });

    const output = logs.join("\n");
    expect(output).toContain("Node runtime config updated:");
    expect(output).toContain("binary:");
    expect(output).toContain("home:");
    expect(output).toContain("auto:   true");
  });

  it("skips service install with --no-service", async () => {
    await runInstallNode({ noService: true });

    const output = logs.join("\n");
    expect(output).toContain("Service install skipped");
    expect(output).toContain("Manual start:");
  });

  it("uses explicit binary path when provided", async () => {
    await runInstallNode({
      binaryPath: "/custom/bin/clawchaind",
      noService: true,
    });

    expect(mockedWriteConfig).toHaveBeenCalled();
    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.nodeBinaryPath).toBe("/custom/bin/clawchaind");
  });

  it("uses custom nodeHome when provided", async () => {
    await runInstallNode({
      nodeHome: "/custom/chain/home",
      noService: true,
    });

    expect(mockedWriteConfig).toHaveBeenCalled();
    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.nodeHome).toBe("/custom/chain/home");
  });
});
