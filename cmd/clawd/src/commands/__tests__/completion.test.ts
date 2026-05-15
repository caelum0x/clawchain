/**
 * Tests for `clawd completion` command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));
const completionsDir = resolve(thisDir, "..", "..", "..", "completions");

function readCompletionFile(name: string): string {
  return readFileSync(resolve(completionsDir, name), "utf-8");
}

// Key top-level commands that MUST appear in every completion script
const REQUIRED_COMMANDS = [
  "status",
  "up",
  "init",
  "dashboard",
  "join",
  "doctor",
  "readiness",
  "bootstrap",
  "wallet",
  "agent",
  "gpu",
  "model",
  "skill",
  "escrow",
  "reputation",
  "intent",
  "task",
  "governance",
  "messaging",
  "negotiate",
  "privacy",
  "staking",
  "ibc",
  "query",
  "peers",
  "faucet",
  "incident",
  "autonomous",
  "completion",
  "nodecard",
  "start",
  "keys",
  "send",
  "agent-flow",
  "product-flow",
  "release-summary",
  "install-node",
];

describe("clawd completion bash", () => {
  const script = readCompletionFile("clawd.bash");

  it("is a valid-looking bash script", () => {
    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("complete -F _clawd clawd");
    expect(script).toContain("_clawd()");
    expect(script).toContain("COMPREPLY");
  });

  it("contains all top-level commands", () => {
    for (const cmd of REQUIRED_COMMANDS) {
      expect(script).toContain(cmd);
    }
  });

  it("contains agent subcommands", () => {
    expect(script).toContain("register");
    expect(script).toContain("info");
    expect(script).toContain("heartbeat");
    expect(script).toContain("rewards");
  });

  it("contains privacy subcommands", () => {
    expect(script).toContain("shield");
    expect(script).toContain("unshield");
    expect(script).toContain("tree-stats");
    expect(script).toContain("nullifier-check");
    expect(script).toContain("merkle-root");
    expect(script).toContain("root-history");
  });

  it("contains common flags", () => {
    expect(script).toContain("--json");
    expect(script).toContain("--address");
    expect(script).toContain("--chain-id");
  });
});

describe("clawd completion zsh", () => {
  const script = readCompletionFile("clawd.zsh");

  it("is a valid-looking zsh completion script", () => {
    expect(script).toContain("#compdef clawd");
    expect(script).toContain("_clawd");
    expect(script).toContain("_arguments");
    expect(script).toContain("_describe");
  });

  it("contains all top-level commands", () => {
    for (const cmd of REQUIRED_COMMANDS) {
      expect(script).toContain(cmd);
    }
  });

  it("contains command descriptions", () => {
    // Zsh format: 'command:description'
    expect(script).toContain("'status:Check chain node");
    expect(script).toContain("'agent:Manage agent registration");
    expect(script).toContain("'privacy:ZK privacy module");
  });

  it("contains flag completions with descriptions", () => {
    expect(script).toContain("--json");
    expect(script).toContain("--chain-id");
    expect(script).toContain("--address");
  });

  it("contains subcommands for agent", () => {
    expect(script).toContain("'register:Register this node as an agent");
    expect(script).toContain("'heartbeat:Send agent heartbeat");
  });
});

describe("clawd completion fish", () => {
  const script = readCompletionFile("clawd.fish");

  it("is a valid-looking fish completion script", () => {
    expect(script).toContain("complete -c clawd");
    expect(script).toContain("__clawd_no_subcommand");
    expect(script).toContain("__clawd_using_command");
  });

  it("contains all top-level commands", () => {
    for (const cmd of REQUIRED_COMMANDS) {
      expect(script).toContain(cmd);
    }
  });

  it("contains descriptions for commands", () => {
    expect(script).toContain("-d 'Check chain node");
    expect(script).toContain("-d 'Manage agent registration");
    expect(script).toContain("-d 'ZK privacy module");
  });

  it("contains flag completions", () => {
    expect(script).toContain("-l json");
    expect(script).toContain("-l chain-id");
    expect(script).toContain("-l address");
  });

  it("contains subcommands for gpu", () => {
    expect(script).toContain("'__clawd_using_command gpu'");
    expect(script).toContain("-a list -d 'List available GPU compute resources'");
    expect(script).toContain("-a lease -d 'Lease a GPU compute resource'");
  });
});

describe("clawd completion command", () => {
  let mockStdout: string[];
  let mockStderr: string[];
  let originalWrite: typeof process.stdout.write;
  let originalErrWrite: typeof process.stderr.write;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    mockStdout = [];
    mockStderr = [];
    originalWrite = process.stdout.write;
    originalErrWrite = process.stderr.write;
    originalExit = process.exit;

    process.stdout.write = ((chunk: string | Uint8Array) => {
      mockStdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrWrite;
    process.exit = originalExit;
  });

  it("outputs bash completion when called with 'bash'", async () => {
    const { runCompletion } = await import("../completion.js");
    runCompletion("bash");
    const output = mockStdout.join("");
    expect(output).toContain("#!/usr/bin/env bash");
    expect(output).toContain("complete -F _clawd clawd");
  });

  it("outputs zsh completion when called with 'zsh'", async () => {
    const { runCompletion } = await import("../completion.js");
    runCompletion("zsh");
    const output = mockStdout.join("");
    expect(output).toContain("#compdef clawd");
  });

  it("outputs fish completion when called with 'fish'", async () => {
    const { runCompletion } = await import("../completion.js");
    runCompletion("fish");
    const output = mockStdout.join("");
    expect(output).toContain("complete -c clawd");
  });

  it("exits with error for unknown shell", async () => {
    const { runCompletion } = await import("../completion.js");
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("process.exit");
    }) as typeof process.exit;

    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => runCompletion("powershell")).toThrow("process.exit");
    expect(exitCode).toBe(1);
    vi.restoreAllMocks();
  });
});
