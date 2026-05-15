/**
 * Tests for `clawd join` — configure operator for existing network.
 *
 * Mocks config, peers, and fetch. Tests config update logic and
 * manifest/nodecard loading.
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
    agentAddress: "claw1testaddr",
    messagingPort: 7777,
  })),
  writeClawdConfig: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
}));

vi.mock("../../lib/peers.js", () => ({
  configurePeers: vi.fn(),
  getNodeId: vi.fn(() => "testnode123"),
}));

vi.mock("../../lib/manifest-security.js", () => ({
  parseTrustedManifestPubkeys: vi.fn(() => []),
  shouldRequireSignedManifest: vi.fn(() => false),
  verifyManifestSignatures: vi.fn(() =>
    Promise.resolve({ ok: false, detail: "no signatures" }),
  ),
}));

vi.mock("node:crypto", () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => "abc123"),
  })),
}));

vi.mock("node:fs", () => ({
  existsSync: () => false,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(() => Promise.reject(new Error("not found"))),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

import { runJoin } from "../join.js";
import type { JoinOptions } from "../join.js";
import { writeClawdConfig } from "../../lib/config.js";

const mockedWriteConfig = vi.mocked(writeClawdConfig);

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runJoin()
// ---------------------------------------------------------------------------

describe("runJoin", () => {
  it("exports runJoin as a function", () => {
    expect(typeof runJoin).toBe("function");
  });

  it("saves explicit RPC and REST URLs to config", async () => {
    await runJoin({
      rpcUrl: "http://rpc.example.com:26657",
      restUrl: "http://rest.example.com:1317",
    });

    expect(mockedWriteConfig).toHaveBeenCalled();
    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.rpcUrl).toBe("http://rpc.example.com:26657");
    expect(writtenConfig.restUrl).toBe("http://rest.example.com:1317");
  });

  it("saves chain ID to config", async () => {
    await runJoin({ chainId: "clawchain-testnet-1" });

    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.chainId).toBe("clawchain-testnet-1");
  });

  it("saves seeds to config", async () => {
    await runJoin({ seeds: "node1@10.0.0.1:26656,node2@10.0.0.2:26656" });

    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.seeds).toBe("node1@10.0.0.1:26656,node2@10.0.0.2:26656");
  });

  it("prints join configuration summary", async () => {
    await runJoin({
      rpcUrl: "http://rpc.test:26657",
      chainId: "clawchain-2",
    });

    const output = logs.join("\n");
    expect(output).toContain("Join configuration saved.");
    expect(output).toContain("Chain ID:");
    expect(output).toContain("RPC URL:");
    expect(output).toContain("REST URL:");
  });

  it("derives REST URL from RPC when not provided", async () => {
    await runJoin({
      rpcUrl: "http://rpc.example.com:26657",
    });

    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.restUrl).toBe("http://rpc.example.com:1317");
  });

  it("saves faucet URL when provided", async () => {
    await runJoin({ faucetUrl: "http://faucet.example.com" });

    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.faucetUrl).toBe("http://faucet.example.com");
  });

  it("saves messaging endpoint from host", async () => {
    await runJoin({ host: "myhost.example.com" });

    const writtenConfig = mockedWriteConfig.mock.calls[0][0] as any;
    expect(writtenConfig.messagingEndpoint).toContain("myhost.example.com");
  });

  it("prints share peer address", async () => {
    await runJoin({});

    const output = logs.join("\n");
    expect(output).toContain("Share peer address:");
  });
});
