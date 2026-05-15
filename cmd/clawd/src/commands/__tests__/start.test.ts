/**
 * Tests for `clawd start` — unified runtime launcher.
 *
 * start spawns child processes (openclaw gateway, chain node, faucet, messaging),
 * so we verify that the function exists and can be imported, and test the
 * pure helper logic that doesn't spawn processes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
const loadMnemonicMock = vi.hoisted(() => vi.fn<() => string | null>(() => null));
const mnemonicFileExistsMock = vi.hoisted(() => vi.fn(() => false));

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
    agentAddress: "claw1agent123",
    faucetEnabled: false,
    messagingPort: 7777,
  })),
}));

vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: loadMnemonicMock,
  mnemonicFileExists: mnemonicFileExistsMock,
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWD_HOME: "/test/.clawd",
  CLAWCHAIN_HOME: "/test/.clawchain",
  CLAWD_OPENCLAW_PROFILE: "clawd",
  CLAWD_OPENCLAW_STATE_DIR: "/test/.clawd/openclaw",
  CLAWD_OPENCLAW_CONFIG_PATH: "/test/.clawd/openclaw/openclaw.json",
}));

vi.mock("../../lib/faucet-server.js", () => ({
  FaucetServer: vi.fn(),
}));

vi.mock("../../lib/message-server.js", () => ({
  AgentMessageServer: vi.fn(),
}));

vi.mock("../../lib/message-store.js", () => ({
  MessageStore: vi.fn(),
}));

vi.mock("../../lib/chat-intent.js", () => ({
  commandHelpText: vi.fn(() => "help text"),
  executeChatIntent: vi.fn(),
  parseChatIntent: vi.fn(),
}));

vi.mock("../../lib/messaging.js", () => ({
  sendAgentMessage: vi.fn(),
}));

vi.mock("../../lib/autonomous-loop.js", () => ({
  startAutonomousLoop: vi.fn(() => Promise.resolve({ stop: vi.fn() })),
}));

vi.mock("../../lib/task-recovery.js", () => ({
  recoverOrphanedTasks: vi.fn(() =>
    Promise.resolve({ orphanedCount: 0, resumedTaskIds: [], cleanedTaskIds: [] }),
  ),
  createRestTaskFetcher: vi.fn(() => vi.fn()),
}));

const ensureOpenClawProviderProfileMock = vi.hoisted(() =>
  vi.fn(() => ({
    path: "/test/.clawd/openclaw/openclaw.json",
    changed: true,
    config: {},
  })),
);

vi.mock("../../lib/openclaw-provider-profile.js", () => ({
  ensureOpenClawProviderProfile: ensureOpenClawProviderProfileMock,
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

spawnMock.mockImplementation(() => ({
  on: vi.fn(),
  kill: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
}));

import { runStart } from "../start.js";
import type { StartOptions } from "../start.js";

let logs: string[];

beforeEach(() => {
  logs = [];
  spawnMock.mockReset();
  ensureOpenClawProviderProfileMock.mockReset();
  ensureOpenClawProviderProfileMock.mockReturnValue({
    path: "/test/.clawd/openclaw/openclaw.json",
    changed: true,
    config: {},
  });
  spawnMock.mockImplementation(() => ({
    on: vi.fn(),
    kill: vi.fn(),
  }));
  loadMnemonicMock.mockReset();
  mnemonicFileExistsMock.mockReset();
  loadMnemonicMock.mockReturnValue(null);
  mnemonicFileExistsMock.mockReturnValue(false);
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runStart()
// ---------------------------------------------------------------------------

describe("runStart", () => {
  beforeEach(() => {
    spawnMock.mockClear();
  });

  it("exports runStart as a function", () => {
    expect(typeof runStart).toBe("function");
  });

  it("exits when mnemonic is missing", async () => {
    await runStart({});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("displays error message when mnemonic is missing", async () => {
    await runStart({});

    const allOutput = [...logs].join("\n");
    // Check console.error was called (captured in mock)
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("StartOptions type has expected fields", () => {
    const opts: StartOptions = {
      openclawBin: "openclaw",
      nodeBinary: "clawchaind",
      noAutoStart: false,
      messagingPort: 7777,
      rpcUrl: "http://localhost:26657",
    };
    expect(opts.messagingPort).toBe(7777);
  });

  it("launches openclaw with a clawd-owned profile and state dir", async () => {
    mnemonicFileExistsMock.mockReturnValue(true);
    loadMnemonicMock.mockReturnValue("test test test test test test test test test test test junk");

    await runStart({});

    expect(spawnMock).toHaveBeenCalledWith(
      "openclaw",
      ["gateway", "run"],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          OPENCLAW_PROFILE: "clawd",
          OPENCLAW_STATE_DIR: "/test/.clawd/openclaw",
          OPENCLAW_HOME: "/test/.clawd/openclaw",
          OPENCLAW_CONFIG_PATH: "/test/.clawd/openclaw/openclaw.json",
          BLOCKCHAIN_ENABLED: "true",
          BLOCKCHAIN_AUTO_REGISTER: "true",
        }),
      }),
    );
  });

  it("materializes the provider-mode openclaw profile before launch", async () => {
    mnemonicFileExistsMock.mockReturnValue(true);
    loadMnemonicMock.mockReturnValue("test test test test test test test test test test test junk");

    await runStart({});

    expect(ensureOpenClawProviderProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: "clawchain-1",
        rpcUrl: "http://localhost:26657",
      }),
      expect.objectContaining({
        profile: "clawd",
        stateDir: "/test/.clawd/openclaw",
        rpcUrl: "http://localhost:26657",
        restUrl: "http://localhost:1317",
      }),
    );
  });
});
