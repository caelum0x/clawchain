/**
 * Tests for clawd config loading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock the fs module and paths before importing config
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  CLAWD_CONFIG_PATH: "/tmp/test-clawd/clawd.json",
}));

import { readFileSync } from "node:fs";
import { loadClawdConfig, writeClawdConfig } from "../config.js";
import { mkdirSync, writeFileSync } from "node:fs";

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadClawdConfig()
// ---------------------------------------------------------------------------

describe("loadClawdConfig", () => {
  it("returns defaults when config file does not exist", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const config = loadClawdConfig();
    expect(config.chainId).toBe("clawchain-1");
    expect(config.rpcUrl).toBe("http://localhost:26657");
    expect(config.restUrl).toBe("http://localhost:1317");
    expect(config.nodeAutoStart).toBe(true);
    expect(config.denom).toBe("uclaw");
    expect(config.prefix).toBe("claw");
    expect(config.gasPrice).toBe("0.025uclaw");
  });

  it("merges file values with defaults", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        chainId: "testnet-5",
        rpcUrl: "http://remote:26657",
        agentAddress: "claw1abc",
      }),
    );

    const config = loadClawdConfig();
    expect(config.chainId).toBe("testnet-5");
    expect(config.rpcUrl).toBe("http://remote:26657");
    expect(config.agentAddress).toBe("claw1abc");
    // Defaults should still be present for fields not in file
    expect(config.nodeAutoStart).toBe(true);
    expect(config.denom).toBe("uclaw");
  });

  it("file values override defaults", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        nodeAutoStart: false,
        denom: "uatom",
      }),
    );

    const config = loadClawdConfig();
    expect(config.nodeAutoStart).toBe(false);
    expect(config.denom).toBe("uatom");
  });

  it("returns defaults when file contains invalid JSON", () => {
    mockedReadFileSync.mockReturnValue("not valid json {{{");

    const config = loadClawdConfig();
    expect(config.chainId).toBe("clawchain-1");
    expect(config.rpcUrl).toBe("http://localhost:26657");
  });

  it("loads optional fields when present", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        seeds: "node1@host:port",
        persistentPeers: "node2@host:port",
        faucetUrl: "http://faucet:8080",
        faucetEnabled: true,
        faucetPort: 9090,
        messagingPort: 7777,
        publicHost: "myhost.com",
      }),
    );

    const config = loadClawdConfig();
    expect(config.seeds).toBe("node1@host:port");
    expect(config.persistentPeers).toBe("node2@host:port");
    expect(config.faucetUrl).toBe("http://faucet:8080");
    expect(config.faucetEnabled).toBe(true);
    expect(config.faucetPort).toBe(9090);
    expect(config.messagingPort).toBe(7777);
    expect(config.publicHost).toBe("myhost.com");
  });
});

// ---------------------------------------------------------------------------
// writeClawdConfig()
// ---------------------------------------------------------------------------

describe("writeClawdConfig", () => {
  it("creates directory and writes JSON file", () => {
    const config = {
      chainId: "test-1",
      rpcUrl: "http://localhost:26657",
      nodeAutoStart: true,
      nodeHome: "",
    };

    writeClawdConfig(config as any);

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true },
    );
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/tmp/test-clawd/clawd.json",
      expect.stringContaining('"chainId": "test-1"'),
    );
  });

  it("writes pretty-printed JSON with trailing newline", () => {
    const config = {
      chainId: "test-1",
      rpcUrl: "http://localhost:26657",
      nodeAutoStart: false,
      nodeHome: "/home/test",
    };

    writeClawdConfig(config as any);

    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent.endsWith("\n")).toBe(true);
    // Should be indented (pretty-printed)
    expect(writtenContent).toContain("  ");
    // Should be valid JSON
    expect(() => JSON.parse(writtenContent)).not.toThrow();
  });
});
