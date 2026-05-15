/**
 * Tests for `clawd nodecard` — shareable node descriptor.
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
    moniker: "my-node",
    publicHost: "node1.example.com",
    faucetUrl: "http://faucet.example.com",
    messagingEndpoint: "http://node1.example.com:7777",
    nodeBinaryPath: "clawchaind",
  })),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
}));

vi.mock("../../lib/peers.js", () => ({
  getNodeId: vi.fn(() => "abc123def456"),
}));

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { runNodecard } from "../nodecard.js";

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
// runNodecard()
// ---------------------------------------------------------------------------

describe("runNodecard", () => {
  it("outputs JSON by default", () => {
    runNodecard({});

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.chainId).toBe("clawchain-1");
    expect(parsed.node.nodeId).toBe("abc123def456");
    expect(parsed.node.p2p).toContain("abc123def456@");
    expect(parsed.endpoints.rpc).toBe("http://localhost:26657");
    expect(parsed.endpoints.rest).toBe("http://localhost:1317");
  });

  it("uses default host from config", () => {
    runNodecard({});

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.node.host).toBe("node1.example.com");
    expect(parsed.node.p2p).toContain("@node1.example.com:");
  });

  it("overrides host when provided", () => {
    runNodecard({ host: "custom-host.com" });

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.node.host).toBe("custom-host.com");
  });

  it("includes faucet and messaging endpoints", () => {
    runNodecard({});

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.endpoints.faucet).toBe("http://faucet.example.com");
    expect(parsed.endpoints.messaging).toBe("http://node1.example.com:7777");
  });

  it("outputs pretty format when out=pretty", () => {
    runNodecard({ out: "pretty" });

    const output = logs.join("\n");
    expect(output).toContain("clawd nodecard");
    expect(output).toContain("chain:     clawchain-1");
    expect(output).toContain("node id:   abc123def456");
    expect(output).toContain("rpc:");
    expect(output).toContain("rest:");
    expect(output).toContain("faucet:");
    expect(output).toContain("messaging:");
  });

  it("uses custom p2p port when provided", () => {
    runNodecard({ p2pPort: 36656 });

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.node.p2pPort).toBe(36656);
    expect(parsed.node.p2p).toContain(":36656");
  });

  it("writes to file when writePath is set", () => {
    runNodecard({ writePath: "/tmp/nodecard.json", out: "pretty" });

    const output = logs.join("\n");
    expect(output).toContain("wrote:");
    expect(output).toContain("/tmp/nodecard.json");
  });
});
