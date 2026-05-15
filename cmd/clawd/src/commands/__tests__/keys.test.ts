/**
 * Tests for `clawd keys` — forwards arguments to clawchaind keys.
 *
 * Tests the runKeys function by mocking execFileSync.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/custom/home",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

// Mock paths
vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/default/.clawchain",
  CLAWD_HOME: "/default/.clawd",
}));

// Mock child_process
const mockExecFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
}));

import { runKeys } from "../keys.js";

beforeEach(() => {
  mockExecFileSync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runKeys()
// ---------------------------------------------------------------------------

describe("runKeys", () => {
  it("calls clawchaind keys with correct home directory", () => {
    runKeys(["list"]);

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const [bin, args] = mockExecFileSync.mock.calls[0];
    expect(bin).toBe("clawchaind");
    expect(args).toContain("keys");
    expect(args).toContain("--home");
    expect(args).toContain("/custom/home");
    expect(args).toContain("list");
  });

  it("includes --keyring-backend test flag", () => {
    runKeys(["list"]);

    const [, args] = mockExecFileSync.mock.calls[0];
    expect(args).toContain("--keyring-backend");
    expect(args).toContain("test");
  });

  it("passes arbitrary arguments through", () => {
    runKeys(["add", "mykey", "--recover"]);

    const [, args] = mockExecFileSync.mock.calls[0];
    expect(args).toContain("add");
    expect(args).toContain("mykey");
    expect(args).toContain("--recover");
  });

  it("passes empty args array correctly", () => {
    runKeys([]);

    const [, args] = mockExecFileSync.mock.calls[0];
    expect(args).toEqual(["keys", "--home", "/custom/home", "--keyring-backend", "test"]);
  });

  it("uses CLAWCHAIND_PATH env var when set", () => {
    const original = process.env.CLAWCHAIND_PATH;
    process.env.CLAWCHAIND_PATH = "/usr/local/bin/custom-clawchaind";

    runKeys(["show", "mykey"]);

    const [bin] = mockExecFileSync.mock.calls[0];
    expect(bin).toBe("/usr/local/bin/custom-clawchaind");

    if (original === undefined) {
      delete process.env.CLAWCHAIND_PATH;
    } else {
      process.env.CLAWCHAIND_PATH = original;
    }
  });

  it("exits with code 1 when execFileSync throws", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("command not found");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    runKeys(["list"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("uses stdio inherit for output", () => {
    runKeys(["list"]);

    const [, , opts] = mockExecFileSync.mock.calls[0];
    expect(opts).toEqual({ stdio: "inherit" });
  });
});
