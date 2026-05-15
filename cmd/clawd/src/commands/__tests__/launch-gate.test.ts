/**
 * Tests for `clawd launch-gate` — mainnet launch readiness assessment.
 *
 * Tests runLaunchGate by mocking fetch and filesystem operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-testnet-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/test/.clawchain",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

// Mock paths
vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
  CLAWD_HOME: "/test/.clawd",
}));

// Mock node:fs — all files exist by default; individual tests override
const existsSyncMock = vi.fn((_path: string) => true);
const readFileSyncMock = vi.fn((path: string, _opts?: unknown) => {
  if (typeof path === "string" && path.includes("genesis.json")) {
    return Buffer.from(JSON.stringify({ chain_id: "clawchain-testnet-1", genesis_time: "2026-03-01T00:00:00Z" }));
  }
  if (typeof path === "string" && path.includes("security-review-checklist.md")) {
    return "## Review\n- [x] Approved and signed off";
  }
  return "";
});
const statSyncMock = vi.fn((_path: string) => ({ size: 1024 }));

vi.mock("node:fs", () => ({
  existsSync: (path: string) => existsSyncMock(path),
  readFileSync: (path: string, opts?: unknown) => readFileSyncMock(path, opts),
  statSync: (path: string) => statSyncMock(path),
}));

import { runLaunchGate, type LaunchGateReport } from "../launch-gate.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(true);
  readFileSyncMock.mockReset();
  readFileSyncMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("genesis.json")) {
      return Buffer.from(JSON.stringify({ chain_id: "clawchain-testnet-1", genesis_time: "2026-03-01T00:00:00Z" }));
    }
    if (typeof path === "string" && path.includes("security-review-checklist.md")) {
      return "## Review\n- [x] Approved and signed off";
    }
    return "";
  });
  statSyncMock.mockReset();
  statSyncMock.mockReturnValue({ size: 1024 });
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

/** Build a fetch mock where all automated REST checks return healthy data. */
function mockFetchAllPass(): void {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    const urlStr = String(url);

    // #9 validators
    if (urlStr.includes("/cosmos/staking/v1beta1/validators")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          validators: Array.from({ length: 7 }, (_, i) => ({ operator_address: `clawvaloper${i}` })),
        }),
      });
    }

    // #10 governance
    if (urlStr.includes("/clawchain/governance/v1/proposals")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          proposals: [{
            id: "1",
            status: "PROPOSAL_STATUS_PASSED",
            final_tally_result: { yes_count: "5", no_count: "0", abstain_count: "0" },
          }],
        }),
      });
    }

    // #12 latest block
    if (urlStr.includes("/cosmos/base/tendermint/v1beta1/blocks/latest")) {
      const now = new Date();
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          block: {
            header: {
              height: "200000",
              time: now.toISOString(),
              chain_id: "clawchain-testnet-1",
            },
          },
        }),
      });
    }

    return Promise.resolve({ ok: false, status: 404 });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runLaunchGate", () => {
  it("reports 'go' when all automated checks pass", async () => {
    mockFetchAllPass();

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runLaunchGate({ json: true });

    const output = stdoutSpy.join("");
    const report: LaunchGateReport = JSON.parse(output);

    expect(report.chainId).toBe("clawchain-testnet-1");
    // No automated failures when everything passes
    const automatedFails = report.criteria.filter((c) => c.automated && c.status === "fail");
    expect(automatedFails).toHaveLength(0);
    // Manual criteria should remain "manual" status
    const manualCriteria = report.criteria.filter((c) => c.status === "manual");
    expect(manualCriteria.length).toBeGreaterThan(0);
    // Criterion #1 should be manual
    const criterion1 = report.criteria.find((c) => c.id === 1);
    expect(criterion1?.status).toBe("manual");
  });

  it("reports 'no-go' with blocker when validator count < 5", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/cosmos/staking/v1beta1/validators")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            validators: [
              { operator_address: "clawvaloper1" },
              { operator_address: "clawvaloper2" },
            ],
          }),
        });
      }

      // Governance: return no proposals
      if (urlStr.includes("governance") || urlStr.includes("/cosmos/gov")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ proposals: [] }),
        });
      }

      // Blocks
      if (urlStr.includes("/cosmos/base/tendermint/v1beta1/blocks/latest")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            block: {
              header: {
                height: "200000",
                time: new Date().toISOString(),
              },
            },
          }),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runLaunchGate({ json: true });

    const output = stdoutSpy.join("");
    const report: LaunchGateReport = JSON.parse(output);

    expect(report.overallStatus).toBe("no-go");
    const validatorCriterion = report.criteria.find((c) => c.id === 9);
    expect(validatorCriterion?.status).toBe("fail");
    expect(validatorCriterion?.detail).toContain("2");
    expect(report.blockers.some((b) => b.includes("Min 5 validators"))).toBe(true);
  });

  it("reports fail when genesis file is missing", async () => {
    existsSyncMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("genesis.json")) {
        return false;
      }
      return true;
    });
    mockFetchAllPass();

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runLaunchGate({ json: true });

    const output = stdoutSpy.join("");
    const report: LaunchGateReport = JSON.parse(output);

    const genesisCriterion = report.criteria.find((c) => c.id === 8);
    expect(genesisCriterion?.status).toBe("fail");
    expect(genesisCriterion?.detail).toContain("not found");
  });

  it("outputs valid JSON with all required fields", async () => {
    mockFetchAllPass();

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runLaunchGate({ json: true });

    const output = stdoutSpy.join("");
    const report: LaunchGateReport = JSON.parse(output);

    expect(report.timestamp).toBeDefined();
    expect(report.chainId).toBe("clawchain-testnet-1");
    expect(typeof report.overallStatus).toBe("string");
    expect(typeof report.passed).toBe("number");
    expect(typeof report.failed).toBe("number");
    expect(typeof report.manual).toBe("number");
    expect(Array.isArray(report.criteria)).toBe(true);
    expect(report.criteria).toHaveLength(18);
    expect(Array.isArray(report.blockers)).toBe(true);

    // Each criterion has required fields
    for (const c of report.criteria) {
      expect(c.id).toBeGreaterThanOrEqual(1);
      expect(c.id).toBeLessThanOrEqual(18);
      expect(c.name).toBeTruthy();
      expect(["testing", "security", "network", "operations", "documentation"]).toContain(c.category);
      expect(["pass", "fail", "warn", "skip", "manual"]).toContain(c.status);
      expect(typeof c.detail).toBe("string");
      expect(typeof c.automated).toBe("boolean");
    }
  });

  it("manual criteria always show 'manual' status", async () => {
    mockFetchAllPass();

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runLaunchGate({ json: true });

    const output = stdoutSpy.join("");
    const report: LaunchGateReport = JSON.parse(output);

    // Criteria 1, 2, 11, 18 should always be manual
    const manualIds = [1, 2, 11, 18];
    for (const id of manualIds) {
      const c = report.criteria.find((cr) => cr.id === id);
      expect(c?.status).toBe("manual");
      expect(c?.automated).toBe(false);
    }
  });

  it("prints table format when json is not set", async () => {
    mockFetchAllPass();

    await runLaunchGate({});

    const output = logs.join("\n");
    expect(output).toContain("Launch Gate Assessment");
    expect(output).toContain("clawchain-testnet-1");
    expect(output).toContain("Overall:");
    expect(output).toContain("passed");
    // Should contain criterion names
    expect(output).toContain("Unit tests pass");
    expect(output).toContain("Min 5 validators");
  });
});
