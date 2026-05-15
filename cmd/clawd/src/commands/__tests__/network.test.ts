/**
 * Tests for `clawd network` subcommands — list, switch, add, remove, status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track networks file state for mocking
let mockNetworksFile = { active: "", custom: [] as any[] };
let mockConfigState = {
  chainId: "clawchain-1",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: true,
  nodeHome: "",
  denom: "uclaw",
  prefix: "claw",
  gasPrice: "0.025uclaw",
};

vi.mock("node:fs", () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith("networks.json")) {
      return JSON.stringify(mockNetworksFile);
    }
    if (path.endsWith("clawd.json")) {
      return JSON.stringify(mockConfigState);
    }
    throw new Error("ENOENT");
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    if (path.endsWith("networks.json")) {
      mockNetworksFile = JSON.parse(content);
    }
    if (path.endsWith("clawd.json")) {
      mockConfigState = JSON.parse(content);
    }
  }),
  mkdirSync: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({ ...mockConfigState })),
  writeClawdConfig: vi.fn((cfg: any) => {
    mockConfigState = { ...cfg };
  }),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWD_HOME: "/home/test/.clawd",
  CLAWD_CONFIG_PATH: "/home/test/.clawd/clawd.json",
}));

import {
  runNetworkList,
  runNetworkSwitch,
  runNetworkAdd,
  runNetworkRemove,
  runNetworkStatus,
} from "../network.js";
import { writeClawdConfig } from "../../lib/config.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  // Reset state
  mockNetworksFile = { active: "", custom: [] };
  mockConfigState = {
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  };
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runNetworkList()
// ---------------------------------------------------------------------------

describe("runNetworkList", () => {
  it("displays all preset networks", async () => {
    await runNetworkList({});

    const output = logs.join("\n");
    expect(output).toContain("Available Networks");
    expect(output).toContain("mainnet");
    expect(output).toContain("testnet");
    expect(output).toContain("local");
    expect(output).toContain("devnet");
    expect(output).toContain("(preset)");
  });

  it("shows custom networks alongside presets", async () => {
    mockNetworksFile = {
      active: "mynet",
      custom: [
        {
          name: "mynet",
          rpcUrl: "http://mynet:26657",
          restUrl: "http://mynet:1317",
          chainId: "mynet-1",
        },
      ],
    };

    await runNetworkList({});

    const output = logs.join("\n");
    expect(output).toContain("mynet");
    expect(output).toContain("(custom)");
    expect(output).toContain("http://mynet:26657");
    expect(output).toContain("Active: mynet");
  });

  it("marks active network with asterisk", async () => {
    mockNetworksFile = { active: "testnet", custom: [] };

    await runNetworkList({});

    const output = logs.join("\n");
    expect(output).toContain("testnet *");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runNetworkList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.networks).toBeInstanceOf(Array);
    expect(parsed.networks.length).toBeGreaterThanOrEqual(4);
    expect(parsed.networks.map((n: any) => n.name)).toContain("mainnet");
    expect(parsed.networks.map((n: any) => n.name)).toContain("testnet");
    expect(parsed.networks.map((n: any) => n.name)).toContain("local");
    expect(parsed.networks.map((n: any) => n.name)).toContain("devnet");
  });
});

// ---------------------------------------------------------------------------
// runNetworkSwitch()
// ---------------------------------------------------------------------------

describe("runNetworkSwitch", () => {
  it("switches to a preset network and updates config", async () => {
    await runNetworkSwitch({ name: "testnet" });

    const output = logs.join("\n");
    expect(output).toContain("Switched to network: testnet");
    expect(output).toContain("rpc-testnet.clawchain.io");
    expect(output).toContain("clawchain-testnet-1");
    expect(writeClawdConfig).toHaveBeenCalled();
  });

  it("switches to mainnet", async () => {
    await runNetworkSwitch({ name: "mainnet" });

    const output = logs.join("\n");
    expect(output).toContain("Switched to network: mainnet");
    expect(output).toContain("rpc.clawchain.io");
    expect(output).toContain("clawchain-1");
  });

  it("switches to local", async () => {
    await runNetworkSwitch({ name: "local" });

    const output = logs.join("\n");
    expect(output).toContain("Switched to network: local");
    expect(output).toContain("localhost:26657");
    expect(output).toContain("clawchain-local");
  });

  it("switches to a custom network", async () => {
    mockNetworksFile = {
      active: "",
      custom: [
        {
          name: "staging",
          rpcUrl: "http://staging:26657",
          restUrl: "http://staging:1317",
          chainId: "staging-1",
        },
      ],
    };

    await runNetworkSwitch({ name: "staging" });

    const output = logs.join("\n");
    expect(output).toContain("Switched to network: staging");
    expect(output).toContain("http://staging:26657");
  });

  it("rejects unknown network name", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runNetworkSwitch({ name: "nonexistent" }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Unknown network: nonexistent");
    exitSpy.mockRestore();
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runNetworkSwitch({ name: "devnet", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.switched).toBe(true);
    expect(parsed.network).toBe("devnet");
    expect(parsed.chainId).toBe("clawchain-devnet-1");
  });
});

// ---------------------------------------------------------------------------
// runNetworkAdd()
// ---------------------------------------------------------------------------

describe("runNetworkAdd", () => {
  it("adds a custom network", async () => {
    await runNetworkAdd({
      name: "staging",
      rpc: "http://staging:26657",
      rest: "http://staging:1317",
      chainId: "staging-1",
    });

    const output = logs.join("\n");
    expect(output).toContain("Added custom network: staging");
    expect(output).toContain("http://staging:26657");
    expect(output).toContain("staging-1");
  });

  it("rejects duplicate custom name", async () => {
    mockNetworksFile = {
      active: "",
      custom: [
        {
          name: "staging",
          rpcUrl: "http://staging:26657",
          restUrl: "http://staging:1317",
          chainId: "staging-1",
        },
      ],
    };

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runNetworkAdd({
        name: "staging",
        rpc: "http://staging2:26657",
        rest: "http://staging2:1317",
        chainId: "staging-2",
      }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Custom network already exists: staging");
    exitSpy.mockRestore();
  });

  it("rejects preset name", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runNetworkAdd({
        name: "mainnet",
        rpc: "http://fake:26657",
        rest: "http://fake:1317",
        chainId: "fake-1",
      }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Cannot overwrite preset network: mainnet");
    exitSpy.mockRestore();
  });

  it("rejects invalid URLs", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runNetworkAdd({
        name: "bad",
        rpc: "not-a-url",
        rest: "http://fine:1317",
        chainId: "bad-1",
      }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Invalid rpc URL");
    exitSpy.mockRestore();
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runNetworkAdd({
      name: "custom1",
      rpc: "http://custom:26657",
      rest: "http://custom:1317",
      chainId: "custom-1",
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.added).toBe(true);
    expect(parsed.network.name).toBe("custom1");
  });
});

// ---------------------------------------------------------------------------
// runNetworkRemove()
// ---------------------------------------------------------------------------

describe("runNetworkRemove", () => {
  it("removes a custom network", async () => {
    mockNetworksFile = {
      active: "",
      custom: [
        {
          name: "staging",
          rpcUrl: "http://staging:26657",
          restUrl: "http://staging:1317",
          chainId: "staging-1",
        },
      ],
    };

    await runNetworkRemove({ name: "staging" });

    const output = logs.join("\n");
    expect(output).toContain("Removed custom network: staging");
  });

  it("clears active when removing the active network", async () => {
    mockNetworksFile = {
      active: "staging",
      custom: [
        {
          name: "staging",
          rpcUrl: "http://staging:26657",
          restUrl: "http://staging:1317",
          chainId: "staging-1",
        },
      ],
    };

    await runNetworkRemove({ name: "staging" });

    // After removal, active should be cleared
    expect(mockNetworksFile.active).toBe("");
  });

  it("rejects removal of preset networks", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runNetworkRemove({ name: "mainnet" }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Cannot remove preset network: mainnet");
    exitSpy.mockRestore();
  });

  it("rejects removal of nonexistent network", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runNetworkRemove({ name: "nonexistent" }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Custom network not found: nonexistent");
    exitSpy.mockRestore();
  });

  it("outputs JSON when --json flag is set", async () => {
    mockNetworksFile = {
      active: "",
      custom: [
        {
          name: "staging",
          rpcUrl: "http://staging:26657",
          restUrl: "http://staging:1317",
          chainId: "staging-1",
        },
      ],
    };

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runNetworkRemove({ name: "staging", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.removed).toBe(true);
    expect(parsed.name).toBe("staging");
  });
});

// ---------------------------------------------------------------------------
// runNetworkStatus()
// ---------------------------------------------------------------------------

describe("runNetworkStatus", () => {
  it("shows network status with healthy RPC", async () => {
    mockNetworksFile = { active: "local", custom: [] };

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              sync_info: {
                latest_block_height: "12345",
                catching_up: false,
              },
              node_info: {
                network: "clawchain-1",
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: { n_peers: "5" },
          }),
      }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runNetworkStatus({});

    const output = logs.join("\n");
    expect(output).toContain("Network Status");
    expect(output).toContain("Network:     local");
    expect(output).toContain("Reachable:   yes");
    expect(output).toContain("Block Height: 12345");
    expect(output).toContain("Peers:       5");
    expect(output).toContain("Sync Status: synced");
  });

  it("shows unreachable when RPC is down", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("connection refused"),
    ) as unknown as typeof fetch;

    await runNetworkStatus({});

    const output = logs.join("\n");
    expect(output).toContain("Reachable:   no");
    expect(output).toContain("Block Height: unknown");
  });

  it("shows catching up sync status", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              sync_info: {
                latest_block_height: "100",
                catching_up: true,
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: { n_peers: "3" },
          }),
      }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runNetworkStatus({});

    const output = logs.join("\n");
    expect(output).toContain("Sync Status: catching up");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              sync_info: {
                latest_block_height: "999",
                catching_up: false,
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: { n_peers: "10" },
          }),
      }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runNetworkStatus({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.reachable).toBe(true);
    expect(parsed.blockHeight).toBe("999");
    expect(parsed.peerCount).toBe("10");
    expect(parsed.syncStatus).toBe("synced");
  });

  it("shows (none) when no active network", async () => {
    mockNetworksFile = { active: "", custom: [] };

    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("connection refused"),
    ) as unknown as typeof fetch;

    await runNetworkStatus({});

    const output = logs.join("\n");
    expect(output).toContain("Network:     (none)");
  });
});
