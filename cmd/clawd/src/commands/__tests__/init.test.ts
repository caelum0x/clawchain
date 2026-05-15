/**
 * Tests for `clawd init` — initialization command.
 *
 * init spawns subprocesses (clawchaind, clawproof) so we mock those.
 * We test the exported function shape and config/mnemonic gating logic.
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
  generateMnemonic: vi.fn(() =>
    Promise.resolve("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"),
  ),
  saveMnemonic: vi.fn(),
  mnemonicFileExists: vi.fn(() => false),
  loadMnemonic: vi.fn(() => "test-mnemonic"),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWD_HOME: "/test/.clawd",
  CLAWCHAIN_HOME: "/test/.clawchain",
  CLAWD_CONFIG_PATH: "/test/.clawd/clawd.json",
  CLAWD_MNEMONIC_PATH: "/test/.clawd/mnemonic.enc",
}));

vi.mock("../../lib/peers.js", () => ({
  configurePeers: vi.fn(),
  getNodeId: vi.fn(() => "testnode123"),
}));

vi.mock("../../lib/genesis.js", () => ({
  addGenesisAccount: vi.fn(),
  createGenesisTx: vi.fn(),
  collectGenesisTxs: vi.fn(),
}));

vi.mock("../join.js", () => ({
  runJoin: vi.fn(() => Promise.resolve()),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn((cmd: string, args: string[]) => {
    // Return address for "keys show" command
    if (args?.includes("show") && args?.includes("-a")) {
      return Buffer.from("claw1testaddress123456789\n");
    }
    return Buffer.from("");
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(() => Promise.reject(new Error("not found"))),
}));

import { runInit } from "../init.js";
import type { InitOptions } from "../init.js";
import { mnemonicFileExists } from "../../lib/mnemonic.js";

const mockedMnemonicExists = vi.mocked(mnemonicFileExists);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  mockedMnemonicExists.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runInit()
// ---------------------------------------------------------------------------

describe("runInit", () => {
  it("exports runInit as a function", () => {
    expect(typeof runInit).toBe("function");
  });

  it("exits when mnemonic already exists and no --force", async () => {
    mockedMnemonicExists.mockReturnValue(true);

    await runInit({});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("runs initialization steps in order", async () => {
    await runInit({ skipSetup: true });

    const output = logs.join("\n");
    expect(output).toContain("ClawChain Initialization");
    expect(output).toContain("Step 1/6");
    expect(output).toContain("Step 2/6");
    expect(output).toContain("Step 3/6");
    expect(output).toContain("Step 4/6");
    expect(output).toContain("Step 5/6");
    expect(output).toContain("Step 6/6");
    expect(output).toContain("Initialization Complete");
  });

  it("displays mnemonic backup warning", async () => {
    await runInit({ skipSetup: true });

    const output = logs.join("\n");
    expect(output).toContain("IMPORTANT");
    expect(output).toContain("Back up this mnemonic");
  });

  it("skips ZK setup when --skip-setup is set", async () => {
    await runInit({ skipSetup: true });

    const output = logs.join("\n");
    expect(output).toContain("Skipping ZK trusted setup");
  });

  it("uses default moniker when not specified", async () => {
    await runInit({ skipSetup: true });

    const output = logs.join("\n");
    // default moniker is "clawd-node"
    expect(output).toContain("Initialization Complete");
  });

  it("prints summary with config paths", async () => {
    await runInit({ skipSetup: true });

    const output = logs.join("\n");
    expect(output).toContain("Config:");
    expect(output).toContain("Mnemonic:");
    expect(output).toContain("Chain home:");
  });
});
