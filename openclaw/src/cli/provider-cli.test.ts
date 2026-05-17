import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acquireLockMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const extractDelegatedArgsAfterMock = vi.hoisted(() => vi.fn(() => ["--require-ready"]));
const runDelegatedClawdUpMock = vi.hoisted(() => vi.fn(async () => 0));
const runDelegatedClawdUpJsonMock = vi.hoisted(() =>
  vi.fn(async () => ({ code: 0, report: { ok: true } })),
);

vi.mock("./up-cli.js", () => ({
  acquireOpenClawBootstrapLockOrExit: acquireLockMock,
  extractDelegatedArgsAfter: extractDelegatedArgsAfterMock,
  runDelegatedClawdUp: runDelegatedClawdUpMock,
  runDelegatedClawdUpJson: runDelegatedClawdUpJsonMock,
}));

import { registerProviderCli } from "./provider-cli.js";

describe("registerProviderCli", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    acquireLockMock.mockClear();
    extractDelegatedArgsAfterMock.mockReset();
    extractDelegatedArgsAfterMock.mockReturnValue(["--require-ready"]);
    runDelegatedClawdUpMock.mockClear();
    runDelegatedClawdUpJsonMock.mockClear();
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("registers provider enable", () => {
    const program = new Command();
    registerProviderCli(program);

    const provider = program.commands.find((cmd) => cmd.name() === "provider");
    expect(provider).toBeDefined();
    expect(provider?.commands.map((cmd) => cmd.name())).toContain("enable");
  });

  it("delegates provider enable to clawd up", async () => {
    process.argv = ["node", "openclaw", "provider", "enable", "--require-ready"];
    const program = new Command();
    registerProviderCli(program);

    await program.parseAsync(["provider", "enable"], { from: "user" });

    expect(acquireLockMock).toHaveBeenCalledWith("openclaw provider enable");
    expect(runDelegatedClawdUpMock).toHaveBeenCalledWith(["--require-ready"]);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("prints delegated json output when --json is present", async () => {
    process.argv = ["node", "openclaw", "provider", "enable", "--json"];
    extractDelegatedArgsAfterMock.mockReturnValue(["--json"]);
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
    const program = new Command();
    registerProviderCli(program);

    await program.parseAsync(["provider", "enable"], { from: "user" });

    expect(runDelegatedClawdUpJsonMock).toHaveBeenCalledWith(["--json"]);
    expect(JSON.parse(writes.join(""))).toEqual({ ok: true });
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
