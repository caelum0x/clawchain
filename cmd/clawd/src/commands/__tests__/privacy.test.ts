/**
 * Tests for `clawd privacy` subcommands -- tree-stats, nullifier-check, merkle-root, root-history.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips shield/unshield (they require signing client).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// Mock mnemonic (imported by module for signing commands)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

import {
  runPrivacyTreeStats,
  runPrivacyNullifierCheck,
  runPrivacyMerkleRoot,
  runPrivacyRootHistory,
} from "../privacy.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runPrivacyTreeStats()
// ---------------------------------------------------------------------------

describe("runPrivacyTreeStats", () => {
  it("displays tree stats from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          leaf_count: "42",
          depth: "20",
          root: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        }),
    }) as unknown as typeof fetch;

    await runPrivacyTreeStats({});

    const output = logs.join("\n");
    expect(output).toContain("Privacy Merkle Tree");
    expect(output).toContain("Leaf Count: 42");
    expect(output).toContain("Depth:      20");
    expect(output).toContain("Root:       abcdef1234567890");
  });

  it("shows default values when fields are missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runPrivacyTreeStats({});

    const output = logs.join("\n");
    expect(output).toContain("Leaf Count: 0");
    expect(output).toContain("Depth:      0");
    expect(output).toContain("Root:       N/A");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          leaf_count: "10",
          depth: "5",
          root: "deadbeef",
        }),
    }) as unknown as typeof fetch;

    await runPrivacyTreeStats({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.leaf_count).toBe("10");
    expect(parsed.depth).toBe("5");
    expect(parsed.root).toBe("deadbeef");
  });
});

// ---------------------------------------------------------------------------
// runPrivacyNullifierCheck()
// ---------------------------------------------------------------------------

describe("runPrivacyNullifierCheck", () => {
  it("reports nullifier as spent when exists is true", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ exists: true }),
    }) as unknown as typeof fetch;

    await runPrivacyNullifierCheck({ nullifier: "abcdef1234567890abcdef1234567890" });

    const output = logs.join("\n");
    expect(output).toContain("has been spent");
  });

  it("reports nullifier as NOT spent when exists is false", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ exists: false }),
    }) as unknown as typeof fetch;

    await runPrivacyNullifierCheck({ nullifier: "0000111122223333444455556666777788889999" });

    const output = logs.join("\n");
    expect(output).toContain("has NOT been spent");
  });

  it("passes nullifier in the URL path", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ exists: false }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runPrivacyNullifierCheck({ nullifier: "my_nullifier_hash" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("nullifier_exists/my_nullifier_hash");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ exists: true }),
    }) as unknown as typeof fetch;

    await runPrivacyNullifierCheck({ nullifier: "test_nullifier", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.nullifier).toBe("test_nullifier");
    expect(parsed.exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runPrivacyMerkleRoot()
// ---------------------------------------------------------------------------

describe("runPrivacyMerkleRoot", () => {
  it("displays current Merkle root", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          root: "cafebabe12345678cafebabe12345678cafebabe12345678cafebabe12345678",
        }),
    }) as unknown as typeof fetch;

    await runPrivacyMerkleRoot({});

    const output = logs.join("\n");
    expect(output).toContain("Current Merkle Root:");
    expect(output).toContain("cafebabe12345678");
  });

  it("shows N/A when root is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runPrivacyMerkleRoot({});

    const output = logs.join("\n");
    expect(output).toContain("Current Merkle Root: N/A");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ root: "abc123" }),
    }) as unknown as typeof fetch;

    await runPrivacyMerkleRoot({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.root).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// runPrivacyRootHistory()
// ---------------------------------------------------------------------------

describe("runPrivacyRootHistory", () => {
  it("displays root history entries", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          roots: [
            "root_aaa111",
            "root_bbb222",
            "root_ccc333",
          ],
        }),
    }) as unknown as typeof fetch;

    await runPrivacyRootHistory({});

    const output = logs.join("\n");
    expect(output).toContain("Merkle Root History (3 entries)");
    expect(output).toContain("1. root_aaa111");
    expect(output).toContain("2. root_bbb222");
    expect(output).toContain("3. root_ccc333");
  });

  it("shows message when no root history found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ roots: [] }),
    }) as unknown as typeof fetch;

    await runPrivacyRootHistory({});

    const output = logs.join("\n");
    expect(output).toContain("No root history found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          roots: ["root_1", "root_2"],
        }),
    }) as unknown as typeof fetch;

    await runPrivacyRootHistory({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.roots).toBeDefined();
    expect(parsed.roots).toHaveLength(2);
    expect(parsed.roots[0]).toBe("root_1");
  });
});
