/**
 * Tests for `clawd governance` subcommands — proposals list, proposal detail, params.
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

import { runGovernanceProposals, runGovernanceProposal, runGovernanceParams } from "../governance.js";

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
// runGovernanceProposals()
// ---------------------------------------------------------------------------

describe("runGovernanceProposals", () => {
  it("displays proposals table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          proposals: [
            {
              id: "1",
              title: "Increase gas limit",
              status: "PROPOSAL_STATUS_VOTING_PERIOD",
              proposer: "claw1proposer1234567890123",
              yes_count: "100",
              no_count: "5",
              abstain_count: "20",
              total_deposit: "10000000",
            },
            {
              id: "2",
              title: "Add new module",
              status: "PROPOSAL_STATUS_PASSED",
              proposer: "claw1proposer9876543210987",
              yes_count: "500",
              no_count: "10",
              abstain_count: "50",
              total_deposit: "50000000",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runGovernanceProposals({});

    const output = logs.join("\n");
    expect(output).toContain("Governance Proposals");
    expect(output).toContain("Increase gas limit");
    expect(output).toContain("Add new module");
    expect(output).toContain("PROPOSAL_STATUS_VOTING_PERIOD");
    expect(output).toContain("PROPOSAL_STATUS_PASSED");
    expect(output).toContain("10 CLAW");
    expect(output).toContain("50 CLAW");
  });

  it("shows message when no proposals found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ proposals: [] }),
    }) as unknown as typeof fetch;

    await runGovernanceProposals({});

    const output = logs.join("\n");
    expect(output).toContain("No proposals found.");
  });

  it("passes status filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ proposals: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runGovernanceProposals({ status: "PROPOSAL_STATUS_VOTING_PERIOD" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("status=PROPOSAL_STATUS_VOTING_PERIOD");
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
          proposals: [{ id: "1", title: "Test" }],
        }),
    }) as unknown as typeof fetch;

    await runGovernanceProposals({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.proposals).toHaveLength(1);
    expect(parsed.proposals[0].title).toBe("Test");
  });
});

// ---------------------------------------------------------------------------
// runGovernanceProposal()
// ---------------------------------------------------------------------------

describe("runGovernanceProposal", () => {
  it("displays single proposal detail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          proposal: {
            id: "42",
            title: "Upgrade chain",
            status: "PROPOSAL_STATUS_VOTING_PERIOD",
            proposer: "claw1creator",
            description: "Upgrade to v2.0",
            yes_count: "200",
            no_count: "10",
            abstain_count: "30",
            no_with_veto_count: "2",
            total_deposit: "25000000",
          },
        }),
    }) as unknown as typeof fetch;

    await runGovernanceProposal({ proposalId: 42 });

    const output = logs.join("\n");
    expect(output).toContain("Proposal #42");
    expect(output).toContain("Title:       Upgrade chain");
    expect(output).toContain("Status:      PROPOSAL_STATUS_VOTING_PERIOD");
    expect(output).toContain("Description: Upgrade to v2.0");
    expect(output).toContain("Yes:         200");
    expect(output).toContain("No:          10");
    expect(output).toContain("Abstain:     30");
    expect(output).toContain("No w/ Veto:  2");
    expect(output).toContain("Deposit:     25 CLAW");
  });

  it("handles 404 for non-existent proposal", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runGovernanceProposal({ proposalId: 999 });

    const output = logs.join("\n");
    expect(output).toContain("Proposal 999 not found.");
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
          proposal: {
            id: "42",
            title: "Test Proposal",
          },
        }),
    }) as unknown as typeof fetch;

    await runGovernanceProposal({ proposalId: 42, json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("42");
    expect(parsed.title).toBe("Test Proposal");
  });
});

// ---------------------------------------------------------------------------
// runGovernanceParams()
// ---------------------------------------------------------------------------

describe("runGovernanceParams", () => {
  it("displays governance parameters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          params: {
            min_deposit: "10000000",
            voting_period: "172800s",
            quorum: "0.334",
          },
        }),
    }) as unknown as typeof fetch;

    await runGovernanceParams({});

    const output = logs.join("\n");
    expect(output).toContain("Governance Parameters");
    expect(output).toContain("min_deposit");
    expect(output).toContain("voting_period");
    expect(output).toContain("quorum");
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
          params: {
            min_deposit: "10000000",
          },
        }),
    }) as unknown as typeof fetch;

    await runGovernanceParams({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.min_deposit).toBe("10000000");
  });
});
