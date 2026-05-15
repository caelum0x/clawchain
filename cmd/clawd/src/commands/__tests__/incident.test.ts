/**
 * Tests for `clawd incident` — enter/exit/status incident mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockConfig: Record<string, unknown> = {
  chainId: "clawchain-1",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: true,
  nodeHome: "/test/.clawchain",
  denom: "uclaw",
  prefix: "claw",
  gasPrice: "0.025uclaw",
  seeds: "node1@10.0.0.1:26656",
  persistentPeers: "node2@10.0.0.2:26656",
};

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({ ...mockConfig })),
  writeClawdConfig: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
  CLAWD_HOME: "/test/.clawd",
}));

vi.mock("../../lib/peers.js", () => ({
  configurePeers: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: () => false,
}));

import { runIncidentEnter, runIncidentStatus, runIncidentExit } from "../incident.js";
import { loadClawdConfig, writeClawdConfig } from "../../lib/config.js";

const mockedLoadConfig = vi.mocked(loadClawdConfig);
const mockedWriteConfig = vi.mocked(writeClawdConfig);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Reset config mock to default state
  mockedLoadConfig.mockReturnValue({ ...mockConfig } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runIncidentEnter()
// ---------------------------------------------------------------------------

describe("runIncidentEnter", () => {
  it("enters incident mode and prints confirmation", () => {
    runIncidentEnter({});

    const output = logs.join("\n");
    expect(output).toContain("Incident mode entered.");
    expect(output).toContain("active: true");
    expect(output).toContain("reason: operator-triggered");
  });

  it("sets custom reason when provided", () => {
    runIncidentEnter({ reason: "network-partition" });

    const output = logs.join("\n");
    expect(output).toContain("reason: network-partition");
  });

  it("shows already active when incident mode is on", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfig,
      incidentMode: { active: true, reason: "test" },
    } as any);

    runIncidentEnter({});

    const output = logs.join("\n");
    expect(output).toContain("already active");
  });

  it("does not write config in dry run mode", () => {
    runIncidentEnter({ dryRun: true });

    const output = logs.join("\n");
    expect(output).toContain("dry_run: true");
    expect(mockedWriteConfig).not.toHaveBeenCalled();
  });

  it("records peers_isolated in output", () => {
    runIncidentEnter({});

    const output = logs.join("\n");
    expect(output).toContain("peers_isolated:");
  });
});

// ---------------------------------------------------------------------------
// runIncidentStatus()
// ---------------------------------------------------------------------------

describe("runIncidentStatus", () => {
  it("prints inactive when no incident mode", () => {
    runIncidentStatus();

    const output = logs.join("\n");
    expect(output).toContain("active: false");
  });

  it("prints active state when incident is active", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfig,
      incidentMode: {
        active: true,
        enteredAt: "2026-03-07T00:00:00Z",
        reason: "network-partition",
      },
    } as any);

    runIncidentStatus();

    const output = logs.join("\n");
    expect(output).toContain("active: true");
    expect(output).toContain("reason: network-partition");
    expect(output).toContain("entered_at: 2026-03-07T00:00:00Z");
  });

  it("outputs JSON when out=json", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfig,
      incidentMode: { active: true, reason: "test" },
    } as any);

    runIncidentStatus({ out: "json" });

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.active).toBe(true);
    expect(parsed.reason).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// runIncidentExit()
// ---------------------------------------------------------------------------

describe("runIncidentExit", () => {
  it("prints not active when no incident", () => {
    runIncidentExit({});

    const output = logs.join("\n");
    expect(output).toContain("not active");
  });

  it("exits incident mode when active", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfig,
      incidentMode: {
        active: true,
        enteredAt: "2026-03-07T00:00:00Z",
        reason: "network-partition",
        isolation: {
          peersIsolated: true,
          previousSeeds: "node1@10.0.0.1:26656",
          previousPersistentPeers: "node2@10.0.0.2:26656",
        },
      },
    } as any);

    runIncidentExit({});

    const output = logs.join("\n");
    expect(output).toContain("Incident mode exited.");
    expect(output).toContain("active: false");
  });

  it("does not write config in dry run mode", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfig,
      incidentMode: { active: true, reason: "test" },
    } as any);

    runIncidentExit({ dryRun: true });

    const output = logs.join("\n");
    expect(output).toContain("dry_run: true");
    expect(mockedWriteConfig).not.toHaveBeenCalled();
  });
});
