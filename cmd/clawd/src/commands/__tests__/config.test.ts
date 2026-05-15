/**
 * Tests for `clawd config` subcommands — show, set, get, reset, validate, export, path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockConfig = {
  chainId: "clawchain-1",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: true,
  nodeHome: "",
  denom: "uclaw",
  prefix: "claw",
  gasPrice: "0.025uclaw",
};

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({ ...mockConfig })),
  writeClawdConfig: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  CLAWD_HOME: "/home/test/.clawd",
  CLAWD_CONFIG_PATH: "/home/test/.clawd/clawd.json",
}));

import {
  runConfigShow,
  runConfigSet,
  runConfigGet,
  runConfigReset,
  runConfigValidate,
  runConfigExport,
  runConfigPath,
} from "../config.js";
import { writeClawdConfig } from "../../lib/config.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
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
// runConfigShow()
// ---------------------------------------------------------------------------

describe("runConfigShow", () => {
  it("displays current config", async () => {
    await runConfigShow({});

    const output = logs.join("\n");
    expect(output).toContain("Current Configuration");
    expect(output).toContain("chainId");
    expect(output).toContain("clawchain-1");
    expect(output).toContain("rpcUrl");
    expect(output).toContain("http://localhost:26657");
    expect(output).toContain("denom");
    expect(output).toContain("uclaw");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runConfigShow({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.chainId).toBe("clawchain-1");
    expect(parsed.rpcUrl).toBe("http://localhost:26657");
    expect(parsed.denom).toBe("uclaw");
  });

  it("shows (not set) for undefined fields", async () => {
    await runConfigShow({});

    const output = logs.join("\n");
    // nodeHome is "" which should show as (not set)
    expect(output).toContain("(not set)");
  });
});

// ---------------------------------------------------------------------------
// runConfigSet()
// ---------------------------------------------------------------------------

describe("runConfigSet", () => {
  it("updates a valid config key", async () => {
    await runConfigSet({ key: "rpcUrl", value: "http://remote:26657" });

    const output = logs.join("\n");
    expect(output).toContain("Config updated: rpcUrl = http://remote:26657");
    expect(writeClawdConfig).toHaveBeenCalled();
  });

  it("rejects unknown keys", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runConfigSet({ key: "unknownKey", value: "test" }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Unknown or non-settable config key: unknownKey");
    exitSpy.mockRestore();
  });

  it("coerces boolean values for nodeAutoStart", async () => {
    await runConfigSet({ key: "nodeAutoStart", value: "true" });

    const lastCall = (writeClawdConfig as any).mock.calls.slice(-1)[0][0];
    expect(lastCall.nodeAutoStart).toBe(true);
  });

  it("coerces numeric values for faucetPort", async () => {
    await runConfigSet({ key: "faucetPort", value: "8080" });

    const lastCall = (writeClawdConfig as any).mock.calls.slice(-1)[0][0];
    expect(lastCall.faucetPort).toBe(8080);
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runConfigSet({ key: "chainId", value: "test-chain", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.key).toBe("chainId");
    expect(parsed.value).toBe("test-chain");
  });
});

// ---------------------------------------------------------------------------
// runConfigGet()
// ---------------------------------------------------------------------------

describe("runConfigGet", () => {
  it("returns the value for a valid key", async () => {
    await runConfigGet({ key: "chainId" });

    const output = logs.join("\n");
    expect(output).toContain("clawchain-1");
  });

  it("shows (not set) for empty values", async () => {
    await runConfigGet({ key: "nodeHome" });

    const output = logs.join("\n");
    expect(output).toContain("(not set)");
  });

  it("rejects unknown keys", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runConfigGet({ key: "nonexistentKey" }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Unknown config key: nonexistentKey");
    exitSpy.mockRestore();
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runConfigGet({ key: "rpcUrl", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.key).toBe("rpcUrl");
    expect(parsed.value).toBe("http://localhost:26657");
  });
});

// ---------------------------------------------------------------------------
// runConfigReset()
// ---------------------------------------------------------------------------

describe("runConfigReset", () => {
  it("resets config with --confirm flag", async () => {
    await runConfigReset({ confirm: true });

    const output = logs.join("\n");
    expect(output).toContain("Configuration reset to defaults.");
    expect(writeClawdConfig).toHaveBeenCalled();
  });

  it("refuses to reset without --confirm", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      runConfigReset({ confirm: false }),
    ).rejects.toThrow("exit");

    const output = logs.join("\n");
    expect(output).toContain("Run with --confirm to proceed");
    exitSpy.mockRestore();
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runConfigReset({ confirm: true, json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.reset).toBe(true);
    expect(parsed.config.chainId).toBe("clawchain-1");
  });
});

// ---------------------------------------------------------------------------
// runConfigValidate()
// ---------------------------------------------------------------------------

describe("runConfigValidate", () => {
  it("validates config and checks RPC connectivity", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    }) as unknown as typeof fetch;

    await runConfigValidate({});

    const output = logs.join("\n");
    expect(output).toContain("Configuration Validation");
    expect(output).toContain("[PASS] chainId");
    expect(output).toContain("[PASS] denom");
    expect(output).toContain("[PASS] prefix");
    expect(output).toContain("[PASS] rpcUrl");
    expect(output).toContain("[PASS] restUrl");
    expect(output).toContain("[PASS] rpcConnectivity");
    expect(output).toContain("Overall: VALID");
  });

  it("reports FAIL when RPC is not reachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as unknown as typeof fetch;

    await runConfigValidate({});

    const output = logs.join("\n");
    expect(output).toContain("[FAIL] rpcConnectivity");
    expect(output).toContain("Overall: INVALID");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    }) as unknown as typeof fetch;

    await runConfigValidate({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(true);
    expect(parsed.checks).toBeInstanceOf(Array);
    expect(parsed.checks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runConfigExport()
// ---------------------------------------------------------------------------

describe("runConfigExport", () => {
  it("exports config as KEY=VALUE lines", async () => {
    await runConfigExport({});

    const output = logs.join("\n");
    expect(output).toContain("CLAWD_CHAIN_ID='clawchain-1'");
    expect(output).toContain("CLAWD_RPC_URL='http://localhost:26657'");
    expect(output).toContain("CLAWD_DENOM='uclaw'");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runConfigExport({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.CLAWD_CHAIN_ID).toBe("clawchain-1");
    expect(parsed.CLAWD_RPC_URL).toBe("http://localhost:26657");
  });
});

// ---------------------------------------------------------------------------
// runConfigPath()
// ---------------------------------------------------------------------------

describe("runConfigPath", () => {
  it("displays config file path", async () => {
    await runConfigPath({});

    const output = logs.join("\n");
    expect(output).toContain("/home/test/.clawd/clawd.json");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runConfigPath({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.path).toBe("/home/test/.clawd/clawd.json");
  });
});
