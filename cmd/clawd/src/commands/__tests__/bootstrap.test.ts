/**
 * Tests for `clawd bootstrap` — one-command operator onboarding.
 *
 * Bootstrap orchestrates install-node -> join -> doctor, so we mock all
 * sub-commands and verify the orchestration logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn(() => Promise.resolve()),
}));

vi.mock("../install-node.js", () => ({
  runInstallNode: vi.fn(() => Promise.resolve()),
}));

vi.mock("../join.js", () => ({
  runJoin: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/readiness.js", () => ({
  waitForIntegratedReadiness: vi.fn(() =>
    Promise.resolve({ ready: true, blockers: [] }),
  ),
}));

import { runBootstrap } from "../bootstrap.js";
import type { BootstrapOptions } from "../bootstrap.js";
import { runDoctor } from "../doctor.js";
import { runInstallNode } from "../install-node.js";
import { runJoin } from "../join.js";
import { waitForIntegratedReadiness } from "../../lib/readiness.js";

const mockedInstallNode = vi.mocked(runInstallNode);
const mockedJoin = vi.mocked(runJoin);
const mockedDoctor = vi.mocked(runDoctor);
const mockedWaitForReadiness = vi.mocked(waitForIntegratedReadiness);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runBootstrap()
// ---------------------------------------------------------------------------

describe("runBootstrap", () => {
  it("exports runBootstrap as a function", () => {
    expect(typeof runBootstrap).toBe("function");
  });

  it("calls install-node, join, and doctor in sequence", async () => {
    await runBootstrap({});

    expect(mockedInstallNode).toHaveBeenCalled();
    expect(mockedJoin).toHaveBeenCalled();
    expect(mockedDoctor).toHaveBeenCalled();
  });

  it("prints orchestration header", async () => {
    await runBootstrap({});

    const output = logs.join("\n");
    expect(output).toContain("clawd bootstrap");
    expect(output).toContain("install-node");
    expect(output).toContain("join");
    expect(output).toContain("doctor");
  });

  it("passes options to install-node", async () => {
    await runBootstrap({
      binaryPath: "/usr/bin/clawchaind",
      nodeHome: "/opt/clawchain",
      noService: true,
    });

    expect(mockedInstallNode).toHaveBeenCalledWith(
      expect.objectContaining({
        binaryPath: "/usr/bin/clawchaind",
        nodeHome: "/opt/clawchain",
        noService: true,
      }),
    );
  });

  it("passes options to join", async () => {
    await runBootstrap({
      chainId: "clawchain-2",
      rpcUrl: "http://rpc.example.com:26657",
      seeds: "node@10.0.0.1:26656",
    });

    expect(mockedJoin).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: "clawchain-2",
        rpcUrl: "http://rpc.example.com:26657",
        seeds: "node@10.0.0.1:26656",
      }),
    );
  });

  it("does not run readiness when requireReady is not set", async () => {
    await runBootstrap({});

    expect(mockedWaitForReadiness).not.toHaveBeenCalled();
  });

  it("runs readiness when requireReady is true", async () => {
    await runBootstrap({ requireReady: true, readyTimeoutSeconds: 30 });

    expect(mockedWaitForReadiness).toHaveBeenCalled();
    const output = logs.join("\n");
    expect(output).toContain("waiting for integrated readiness");
  });

  it("throws when readiness times out", async () => {
    mockedWaitForReadiness.mockResolvedValue({
      ready: false,
      blockers: [{ name: "chain_rpc", detail: "unreachable" }],
    } as any);

    await expect(
      runBootstrap({ requireReady: true, readyTimeoutSeconds: 10 }),
    ).rejects.toThrow("readiness timed out");
  });
});
