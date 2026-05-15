/**
 * Tests for `clawd skill` subcommands — list.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips create/purchase (they require signing client).
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

import { runSkillList } from "../skill.js";

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
// runSkillList()
// ---------------------------------------------------------------------------

describe("runSkillList", () => {
  it("displays skills table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skills: [
            {
              id: 1,
              name: "Code Review",
              owner: "claw1owner12345678901234567890",
              price: "1000000",
              active: true,
              purchase_count: 15,
            },
            {
              id: 2,
              name: "Data Analysis",
              owner: "claw1owner99999999999999999999",
              price: "2500000",
              active: true,
              purchase_count: 42,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runSkillList({});

    const output = logs.join("\n");
    expect(output).toContain("Marketplace Skills (2)");
    expect(output).toContain("Code Review");
    expect(output).toContain("Data Analysis");
    expect(output).toContain("1 CLAW");
    expect(output).toContain("2.5 CLAW");
    expect(output).toContain("15");
    expect(output).toContain("42");
  });

  it("shows message when no skills found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;

    await runSkillList({});

    const output = logs.join("\n");
    expect(output).toContain("No skills found.");
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
          skills: [{ id: 1, name: "TestSkill", price: "500000" }],
        }),
    }) as unknown as typeof fetch;

    await runSkillList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].name).toBe("TestSkill");
  });

  it("uses search endpoint when search option is provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runSkillList({ search: "inference" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/skills/search/inference");
  });

  it("uses category endpoint when category option is provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runSkillList({ category: "ml" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/skills/category/ml");
  });

  it("uses owner endpoint when owner option is provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runSkillList({ owner: "claw1myowner12345" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/skills/owner/claw1myowner12345");
  });

  it("uses default skills endpoint when no filter provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runSkillList({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toMatch(/\/clawchain\/marketplace\/v1\/skills$/);
  });

  it("displays dash for skill without price", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skills: [
            {
              id: 3,
              name: "Free Skill",
              owner: "claw1freeowner",
              active: true,
              purchase_count: 0,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runSkillList({});

    const output = logs.join("\n");
    expect(output).toContain("Marketplace Skills (1)");
    expect(output).toContain("Free Skill");
    // price should show dash since it's undefined
    expect(output).toContain("-");
  });

  it("shows active status in table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skills: [
            {
              id: 4,
              name: "Inactive Skill",
              owner: "claw1owner",
              price: "100000",
              active: false,
              purchase_count: 10,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runSkillList({});

    const output = logs.join("\n");
    expect(output).toContain("false");
  });
});
