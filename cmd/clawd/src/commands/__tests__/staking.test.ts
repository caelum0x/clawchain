/**
 * Tests for `clawd staking` subcommands -- validators, delegations, rewards.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips delegate/undelegate/claim-rewards (they require signing client).
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
  runStakingValidators,
  runStakingDelegations,
  runStakingRewards,
} from "../staking.js";

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
// runStakingValidators()
// ---------------------------------------------------------------------------

describe("runStakingValidators", () => {
  it("displays validators table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          validators: [
            {
              description: { moniker: "Validator Alpha" },
              operator_address: "clawvaloper1aaaaaaaaaaaaaaaaaaa",
              tokens: "5000000000",
              commission: { commission_rates: { rate: "0.05" } },
              status: "BOND_STATUS_BONDED",
            },
            {
              description: { moniker: "Validator Beta" },
              operator_address: "clawvaloper1bbbbbbbbbbbbbbbbbbb",
              tokens: "3000000000",
              commission: { commission_rates: { rate: "0.10" } },
              status: "BOND_STATUS_BONDED",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runStakingValidators({});

    const output = logs.join("\n");
    expect(output).toContain("Validators (2)");
    expect(output).toContain("Validator Alpha");
    expect(output).toContain("Validator Beta");
    expect(output).toContain("5.0%");
    expect(output).toContain("10.0%");
    expect(output).toContain("Bonded");
  });

  it("shows message when no validators found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ validators: [] }),
    }) as unknown as typeof fetch;

    await runStakingValidators({});

    const output = logs.join("\n");
    expect(output).toContain("No validators found.");
  });

  it("sorts validators by token count descending", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          validators: [
            {
              description: { moniker: "Small" },
              operator_address: "clawvaloper1small",
              tokens: "1000000",
              commission: { commission_rates: { rate: "0.05" } },
              status: "BOND_STATUS_BONDED",
            },
            {
              description: { moniker: "Large" },
              operator_address: "clawvaloper1large",
              tokens: "9999999000000",
              commission: { commission_rates: { rate: "0.02" } },
              status: "BOND_STATUS_BONDED",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runStakingValidators({});

    const output = logs.join("\n");
    const largeIndex = output.indexOf("Large");
    const smallIndex = output.indexOf("Small");
    expect(largeIndex).toBeLessThan(smallIndex);
  });

  it("passes status filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ validators: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runStakingValidators({ status: "BOND_STATUS_UNBONDED" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("status=BOND_STATUS_UNBONDED");
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
          validators: [
            {
              description: { moniker: "Test" },
              tokens: "1000000",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runStakingValidators({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.validators).toBeDefined();
    expect(parsed.validators).toHaveLength(1);
    expect(parsed.validators[0].description.moniker).toBe("Test");
  });
});

// ---------------------------------------------------------------------------
// runStakingDelegations()
// ---------------------------------------------------------------------------

describe("runStakingDelegations", () => {
  it("displays delegations table for a given address", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          delegation_responses: [
            {
              delegation: {
                validator_address: "clawvaloper1validator12345678",
                shares: "5000000.000000000000000000",
              },
              balance: { denom: "uclaw", amount: "5000000" },
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runStakingDelegations({ address: "claw1delegator12345678901" });

    const output = logs.join("\n");
    expect(output).toContain("Delegations for");
    expect(output).toContain("5 CLAW");
  });

  it("shows message when no delegations found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ delegation_responses: [] }),
    }) as unknown as typeof fetch;

    await runStakingDelegations({ address: "claw1delegator12345678901" });

    const output = logs.join("\n");
    expect(output).toContain("No delegations found");
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
          delegation_responses: [
            {
              delegation: { validator_address: "clawvaloper1test" },
              balance: { denom: "uclaw", amount: "1000000" },
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runStakingDelegations({ address: "claw1test12345678901234567", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.delegations).toBeDefined();
    expect(parsed.delegations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runStakingRewards()
// ---------------------------------------------------------------------------

describe("runStakingRewards", () => {
  it("displays staking rewards from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          rewards: [
            {
              validator_address: "clawvaloper1validator12345678",
              reward: [{ denom: "uclaw", amount: "2500000.000000" }],
            },
          ],
          total: [{ denom: "uclaw", amount: "2500000.000000" }],
        }),
    }) as unknown as typeof fetch;

    await runStakingRewards({ address: "claw1delegator12345678901" });

    const output = logs.join("\n");
    expect(output).toContain("Staking Rewards for");
    expect(output).toContain("2.5 CLAW");
    expect(output).toContain("Total:");
  });

  it("shows no pending rewards when rewards list is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          rewards: [],
          total: [],
        }),
    }) as unknown as typeof fetch;

    await runStakingRewards({ address: "claw1delegator12345678901" });

    const output = logs.join("\n");
    expect(output).toContain("No pending rewards.");
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
          rewards: [{ validator_address: "clawvaloper1test", reward: [] }],
          total: [{ denom: "uclaw", amount: "1000000" }],
        }),
    }) as unknown as typeof fetch;

    await runStakingRewards({ address: "claw1test12345678901234567", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.rewards).toBeDefined();
    expect(parsed.total).toBeDefined();
  });
});
