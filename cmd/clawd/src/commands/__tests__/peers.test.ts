/**
 * Tests for `clawd peers` — peer discovery, summary, and verification.
 *
 * Mocks config/peers libs. Skips network-dependent verify/prune tests
 * (those require TCP socket connections).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockConfigState: Record<string, unknown> = {
  chainId: "clawchain-1",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: true,
  nodeHome: "/test/.clawchain",
  denom: "uclaw",
  prefix: "claw",
  gasPrice: "0.025uclaw",
  seeds: "nodeid1@10.0.0.1:26656,nodeid2@10.0.0.2:26656",
  persistentPeers: "",
  nodeBinaryPath: "clawchaind",
};

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({ ...mockConfigState })),
  writeClawdConfig: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
}));

vi.mock("../../lib/peers.js", () => ({
  configurePeers: vi.fn(),
  getNodeId: vi.fn(() => "mynode123"),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(() => Promise.reject(new Error("not found"))),
}));

import {
  runPeersShow,
  runPeersSet,
  runPeersSummary,
} from "../peers.js";
import { loadClawdConfig, writeClawdConfig } from "../../lib/config.js";
import { configurePeers } from "../../lib/peers.js";

const mockedLoadConfig = vi.mocked(loadClawdConfig);
const mockedWriteConfig = vi.mocked(writeClawdConfig);
const mockedConfigurePeers = vi.mocked(configurePeers);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  mockedLoadConfig.mockReturnValue({ ...mockConfigState } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runPeersShow()
// ---------------------------------------------------------------------------

describe("runPeersShow", () => {
  it("prints peer address with default host", () => {
    runPeersShow();

    const output = logs.join("\n");
    expect(output).toContain("mynode123@localhost:26656");
  });

  it("prints peer address with custom host", () => {
    runPeersShow("my-host.com");

    const output = logs.join("\n");
    expect(output).toContain("mynode123@my-host.com:26656");
  });
});

// ---------------------------------------------------------------------------
// runPeersSet()
// ---------------------------------------------------------------------------

describe("runPeersSet", () => {
  it("updates seed peers in config", () => {
    runPeersSet({ seeds: "newnode@1.2.3.4:26656" });

    expect(mockedConfigurePeers).toHaveBeenCalledWith(
      expect.objectContaining({ seeds: "newnode@1.2.3.4:26656" }),
    );
    expect(mockedWriteConfig).toHaveBeenCalled();

    const output = logs.join("\n");
    expect(output).toContain("Peer configuration updated.");
    expect(output).toContain("Seeds:");
  });

  it("updates persistent peers in config", () => {
    runPeersSet({ persistentPeers: "persist@5.6.7.8:26656" });

    expect(mockedConfigurePeers).toHaveBeenCalledWith(
      expect.objectContaining({ persistentPeers: "persist@5.6.7.8:26656" }),
    );

    const output = logs.join("\n");
    expect(output).toContain("Persistent peers:");
  });

  it("handles configurePeers failure", () => {
    mockedConfigurePeers.mockImplementation(() => {
      throw new Error("toml parse error");
    });

    runPeersSet({ seeds: "bad" });

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// runPeersSummary()
// ---------------------------------------------------------------------------

describe("runPeersSummary", () => {
  it("displays peer summary in pretty format", () => {
    runPeersSummary({});

    const output = logs.join("\n");
    expect(output).toContain("Peer summary");
    expect(output).toContain("Chain ID:      clawchain-1");
    expect(output).toContain("Total seeds:   2");
    expect(output).toContain("Unique seeds:  2");
    expect(output).toContain("Duplicates:    0");
    expect(output).toContain("Invalid:       0");
  });

  it("detects duplicate seeds", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfigState,
      seeds: "nodeid1@10.0.0.1:26656,nodeid1@10.0.0.1:26656",
    } as any);

    runPeersSummary({});

    const output = logs.join("\n");
    expect(output).toContain("Duplicates:    1");
  });

  it("detects invalid seeds", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfigState,
      seeds: "nodeid1@10.0.0.1:26656,invalid-entry",
    } as any);

    runPeersSummary({});

    const output = logs.join("\n");
    expect(output).toContain("Invalid:       1");
  });

  it("shows no seeds when config has none", () => {
    mockedLoadConfig.mockReturnValue({
      ...mockConfigState,
      seeds: "",
    } as any);

    runPeersSummary({});

    const output = logs.join("\n");
    expect(output).toContain("Total seeds:   0");
  });

  it("outputs JSON when out=json", () => {
    runPeersSummary({ out: "json" });

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.chainId).toBe("clawchain-1");
    expect(parsed.total).toBe(2);
    expect(parsed.unique).toBe(2);
    expect(parsed.duplicateCount).toBe(0);
    expect(parsed.invalidCount).toBe(0);
    expect(parsed.hosts).toBeDefined();
  });

  it("lists hosts with their peer counts", () => {
    runPeersSummary({});

    const output = logs.join("\n");
    expect(output).toContain("Hosts:");
    expect(output).toContain("10.0.0.1");
    expect(output).toContain("10.0.0.2");
  });
});
