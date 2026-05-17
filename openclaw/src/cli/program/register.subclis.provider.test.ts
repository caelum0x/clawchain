import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { registerProviderCli } = vi.hoisted(() => {
  const register = vi.fn((program: Command) => {
    const provider = program.command("provider");
    provider.command("enable").action(() => {});
  });
  return { registerProviderCli: register };
});

vi.mock("../provider-cli.js", () => ({ registerProviderCli }));

const { registerSubCliCommands } = await import("./register.subclis.js");

describe("registerSubCliCommands provider placeholder", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENCLAW_DISABLE_LAZY_SUBCOMMANDS;
    registerProviderCli.mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
  });

  it("includes provider in the placeholder command list", () => {
    process.argv = ["node", "openclaw"];
    const program = new Command();
    registerSubCliCommands(program, process.argv);

    const names = program.commands.map((cmd) => cmd.name());
    expect(names).toContain("provider");
    expect(registerProviderCli).not.toHaveBeenCalled();
  });
});
