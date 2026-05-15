/**
 * Tests for `clawd agent add/list/remove/start/stop` subcommands.
 *
 * Tests the multi-agent session management commands by mocking
 * config, mnemonic, and key derivation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

// Mock mnemonic
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(
    () =>
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  ),
  mnemonicFileExists: vi.fn(() => true),
}));

// Mock @cosmjs/proto-signing
let derivedAddressIndex = 0;
vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn(async (_mnemonic: string, opts: any) => {
      // Extract the HD index from the path to generate unique addresses
      const path = opts?.hdPaths?.[0];
      let idx = derivedAddressIndex++;
      if (path) {
        // path is an array of Slip10RawIndex objects; the last one is the index
        idx = path[path.length - 1]?.index ?? idx;
      }
      return {
        getAccounts: vi.fn(async () => [
          {
            address: `claw1agent${idx}${"0".repeat(20)}`.slice(0, 44),
            pubkey: new Uint8Array(33),
          },
        ]),
      };
    }),
  },
}));

// Mock @cosmjs/crypto
vi.mock("@cosmjs/crypto", () => ({
  stringToPath: vi.fn((pathStr: string) => {
    // Parse "m/44'/118'/0'/0/N" into mock Slip10RawIndex objects
    const parts = pathStr.replace("m/", "").split("/");
    return parts.map((p) => {
      const hardened = p.endsWith("'");
      const value = parseInt(p.replace("'", ""), 10);
      return { index: value, hardened };
    });
  }),
}));

// Override CLAWD_HOME to use tmp dir
const originalEnv = { ...process.env };

import {
  runAgentAdd,
  runAgentList,
  runAgentRemove,
  runAgentStart,
  runAgentStop,
  loadAgentsFile,
} from "../agent-multi.js";

let logs: string[];
let exitCode: number | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "clawd-agent-multi-test-"));
  process.env.CLAWD_HOME = tmpDir;
  derivedAddressIndex = 0;
  logs = [];
  exitCode = undefined;

  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined) => {
    exitCode = typeof code === "number" ? code : 0;
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// runAgentAdd
// ---------------------------------------------------------------------------

describe("runAgentAdd", () => {
  it("adds an agent and prints confirmation", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });

    const output = logs.join("\n");
    expect(output).toContain("Agent added successfully");
    expect(output).toContain("Name:    alpha");
    expect(output).toContain("Index:   0");
    expect(output).toContain("Address:");
  });

  it("persists the agent to agents.json", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });

    const agents = loadAgentsFile();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("alpha");
    expect(agents[0].hdIndex).toBe(0);
    expect(agents[0].enabled).toBe(true);
  });

  it("rejects duplicate names", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });

    await expect(
      runAgentAdd({ name: "alpha", index: 1 }),
    ).rejects.toThrow("process.exit");
    expect(exitCode).toBe(1);
    expect(logs.join("\n")).toContain("already exists");
  });

  it("rejects duplicate HD indices", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });

    await expect(
      runAgentAdd({ name: "beta", index: 0 }),
    ).rejects.toThrow("process.exit");
    expect(exitCode).toBe(1);
    expect(logs.join("\n")).toContain("already in use");
  });

  it("outputs JSON with --json flag", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentAdd({ name: "alpha", index: 0, json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe("alpha");
    expect(parsed.hdIndex).toBe(0);
    expect(parsed.address).toMatch(/^claw1/);
  });

  it("stores capabilities when provided", async () => {
    await runAgentAdd({ name: "alpha", index: 0, capabilities: "search,compute" });

    const agents = loadAgentsFile();
    expect(agents[0].capabilities).toEqual(["search", "compute"]);
  });
});

// ---------------------------------------------------------------------------
// runAgentList
// ---------------------------------------------------------------------------

describe("runAgentList", () => {
  it("shows message when no agents configured", async () => {
    await runAgentList({});

    const output = logs.join("\n");
    expect(output).toContain("No agents configured");
  });

  it("displays agents in a table", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    await runAgentAdd({ name: "beta", index: 1 });
    logs = [];

    await runAgentList({});

    const output = logs.join("\n");
    expect(output).toContain("Agents (2)");
    expect(output).toContain("alpha");
    expect(output).toContain("beta");
    expect(output).toContain("Name");
    expect(output).toContain("Index");
    expect(output).toContain("Address");
  });

  it("outputs JSON with --json flag", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    logs = [];

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentList({ json: true });

    const parsed = JSON.parse(stdoutSpy.join(""));
    expect(parsed.agents).toBeDefined();
    expect(Array.isArray(parsed.agents)).toBe(true);
    expect(parsed.agents[0].name).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// runAgentRemove
// ---------------------------------------------------------------------------

describe("runAgentRemove", () => {
  it("removes an existing agent", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    await runAgentAdd({ name: "beta", index: 1 });
    logs = [];

    await runAgentRemove({ name: "alpha" });

    const output = logs.join("\n");
    expect(output).toContain('Agent "alpha" removed');

    const agents = loadAgentsFile();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("beta");
  });

  it("exits with error for nonexistent agent", async () => {
    await expect(
      runAgentRemove({ name: "ghost" }),
    ).rejects.toThrow("process.exit");
    expect(exitCode).toBe(1);
    expect(logs.join("\n")).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// runAgentStart
// ---------------------------------------------------------------------------

describe("runAgentStart", () => {
  it("starts a named agent", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    logs = [];

    await runAgentStart({ name: "alpha" });

    const output = logs.join("\n");
    expect(output).toContain('Starting agent "alpha"');
    expect(output).toContain("started");
  });

  it("starts all enabled agents when no name given", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    await runAgentAdd({ name: "beta", index: 1 });
    logs = [];

    await runAgentStart({});

    const output = logs.join("\n");
    expect(output).toContain("Starting 2 agent(s)");
    expect(output).toContain("alpha");
    expect(output).toContain("beta");
  });

  it("exits with error when no agents configured", async () => {
    await expect(runAgentStart({})).rejects.toThrow("process.exit");
    expect(exitCode).toBe(1);
  });

  it("exits with error when named agent not found", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    logs = [];

    await expect(runAgentStart({ name: "ghost" })).rejects.toThrow("process.exit");
    expect(exitCode).toBe(1);
    expect(logs.join("\n")).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// runAgentStop
// ---------------------------------------------------------------------------

describe("runAgentStop", () => {
  it("stops a named agent", async () => {
    await runAgentAdd({ name: "alpha", index: 0 });
    await runAgentStop({ name: "alpha" });

    const output = logs.join("\n");
    expect(output).toContain('Agent "alpha" stopped');
  });

  it("stops all agents when no name given", async () => {
    await runAgentStop({});

    const output = logs.join("\n");
    expect(output).toContain("All agents stopped");
  });
});
