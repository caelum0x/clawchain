/**
 * Tests for `clawd up` — one-command operator runtime bootstrap.
 *
 * up orchestrates init -> join -> start, so we mock sub-commands
 * and test the orchestration/gating logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/test/.clawchain",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
  writeClawdConfig: vi.fn(),
}));

vi.mock("../../lib/mnemonic.js", () => ({
  mnemonicFileExists: vi.fn(() => true),
}));

vi.mock("../../lib/up-lock.js", () => ({
  acquireUpLockOrExit: vi.fn(() => vi.fn()),
}));

vi.mock("../init.js", () => ({
  runInit: vi.fn(() => Promise.resolve()),
}));

vi.mock("../join.js", () => ({
  runJoin: vi.fn(() => Promise.resolve()),
}));

vi.mock("../start.js", () => ({
  runStart: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/readiness.js", () => ({
  waitForIntegratedReadiness: vi.fn(() =>
    Promise.resolve({ ready: true, blockers: [] }),
  ),
  waitForStartupLifecycle: vi.fn(() =>
    Promise.resolve({ completed: true }),
  ),
  evaluateStartupLifecycle: vi.fn(() =>
    Promise.resolve({
      completed: true,
      currentStage: "messaging",
      stages: [
        { stage: "chain_connect", ok: true },
        { stage: "register", ok: true },
        { stage: "heartbeat", ok: true },
      ],
    }),
  ),
}));

vi.mock("../agent-flow.js", () => ({
  runAgentBootstrap: vi.fn(() =>
    Promise.resolve({ ok: true }),
  ),
}));

import { runUp } from "../up.js";
import type { UpOptions, UpRunReport } from "../up.js";
import { runInit } from "../init.js";
import { runJoin } from "../join.js";
import { runStart } from "../start.js";
import { mnemonicFileExists } from "../../lib/mnemonic.js";
import { writeClawdConfig } from "../../lib/config.js";

const mockedMnemonicExists = vi.mocked(mnemonicFileExists);
const mockedInit = vi.mocked(runInit);
const mockedJoin = vi.mocked(runJoin);
const mockedStart = vi.mocked(runStart);
const mockedWriteConfig = vi.mocked(writeClawdConfig);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockedMnemonicExists.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runUp()
// ---------------------------------------------------------------------------

describe("runUp", () => {
  it("exports runUp as a function", () => {
    expect(typeof runUp).toBe("function");
  });

  it("skips init when mnemonic exists", async () => {
    const report = await runUp({});

    expect(mockedInit).not.toHaveBeenCalled();
    expect(report.steps.initRan).toBe(false);
  });

  it("runs init when mnemonic is missing", async () => {
    mockedMnemonicExists.mockReturnValue(false);

    const report = await runUp({});

    expect(mockedInit).toHaveBeenCalled();
    expect(report.steps.initRan).toBe(true);
  });

  it("reports error when no mnemonic and skipInit is set", async () => {
    mockedMnemonicExists.mockReturnValue(false);

    const report = await runUp({ skipInit: true });

    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]).toContain("No mnemonic found");
  });

  it("calls start after init", async () => {
    const report = await runUp({});

    expect(mockedStart).toHaveBeenCalled();
    expect(report.steps.startRan).toBe(true);
  });

  it("skips join when no network options are provided", async () => {
    const report = await runUp({});

    expect(mockedJoin).not.toHaveBeenCalled();
    expect(report.steps.joinRan).toBe(false);
  });

  it("runs join when rpcUrl is provided", async () => {
    const report = await runUp({ rpcUrl: "http://rpc.example.com:26657" });

    expect(mockedJoin).toHaveBeenCalled();
    expect(report.steps.joinRan).toBe(true);
  });

  it("runs join when fromManifest is provided", async () => {
    const report = await runUp({ fromManifest: "manifest.json" });

    expect(mockedJoin).toHaveBeenCalled();
    expect(report.steps.joinRan).toBe(true);
  });

  it("returns a report with timestamps", async () => {
    const report = await runUp({});

    expect(report.startedAt).toBeDefined();
    expect(report.finishedAt).toBeDefined();
    expect(report.ok).toBe(true);
  });

  it("writes up snapshot to config", async () => {
    await runUp({});

    // writeClawdConfig should be called at least for the snapshot
    const calls = mockedWriteConfig.mock.calls;
    const lastCall = calls[calls.length - 1][0] as any;
    expect(lastCall.lastUp).toBeDefined();
    expect(lastCall.lastUp.lastUpAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Type checks
// ---------------------------------------------------------------------------

describe("Up types", () => {
  it("UpOptions has expected fields", () => {
    const opts: UpOptions = {
      skipInit: true,
      skipJoin: false,
      fromManifest: "manifest.json",
    };
    expect(opts.skipInit).toBe(true);
  });

  it("UpRunReport has expected structure", () => {
    const report: UpRunReport = {
      ok: true,
      startedAt: "2026-03-07T00:00:00Z",
      finishedAt: "2026-03-07T00:01:00Z",
      steps: {
        initRan: false,
        joinRan: false,
        startRan: true,
        readinessEnforced: false,
      },
      autoBootstrap: {
        attempted: false,
      },
      errors: [],
    };
    expect(report.ok).toBe(true);
  });
});
