/**
 * Tests for wallet balance and related utilities from wallet.ts.
 *
 * Tests the pure functions (parseClawAmount, formatClaw, toChainIdentifier)
 * and mocks network calls for runWalletBalance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config and mnemonic
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
    agentAddress: "claw1testaddr123456789",
  })),
}));

vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"),
  mnemonicFileExists: vi.fn(() => true),
}));

// Mock @cosmjs/stargate to avoid actual network connections
vi.mock("@cosmjs/stargate", () => ({
  StargateClient: {
    connect: vi.fn(),
  },
  SigningStargateClient: {
    connectWithSigner: vi.fn(),
  },
  GasPrice: {
    fromString: vi.fn(() => ({})),
  },
}));

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn(),
  },
}));

import { parseClawAmount, formatClaw, toChainIdentifier, runWalletBalance } from "../wallet.js";
import { StargateClient } from "@cosmjs/stargate";

const mockedStargateConnect = vi.mocked(StargateClient.connect);

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// parseClawAmount() - pure function
// ---------------------------------------------------------------------------

describe("parseClawAmount", () => {
  it("parses whole CLAW amounts to uclaw", () => {
    expect(parseClawAmount("1")).toBe("1000000");
    expect(parseClawAmount("5")).toBe("5000000");
    expect(parseClawAmount("100")).toBe("100000000");
  });

  it("parses fractional CLAW amounts", () => {
    expect(parseClawAmount("1.5")).toBe("1500000");
    expect(parseClawAmount("0.000001")).toBe("1");
    expect(parseClawAmount("1.234567")).toBe("1234567");
  });

  it("pads short decimal fractions", () => {
    expect(parseClawAmount("1.1")).toBe("1100000");
    expect(parseClawAmount("2.01")).toBe("2010000");
  });

  it("throws on invalid amounts", () => {
    expect(() => parseClawAmount("abc")).toThrow("Invalid amount");
    expect(() => parseClawAmount("-1")).toThrow("Invalid amount");
    expect(() => parseClawAmount("1.1234567")).toThrow("Invalid amount"); // too many decimals
  });

  it("handles zero", () => {
    expect(parseClawAmount("0")).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// formatClaw() from wallet.ts - pure function
// ---------------------------------------------------------------------------

describe("formatClaw (wallet)", () => {
  it("formats whole amounts", () => {
    expect(formatClaw("1000000")).toBe("1 CLAW");
    expect(formatClaw("0")).toBe("0 CLAW");
  });

  it("formats fractional amounts", () => {
    expect(formatClaw("1500000")).toBe("1.5 CLAW");
    expect(formatClaw("123")).toBe("0.000123 CLAW");
  });

  it("handles empty string", () => {
    expect(formatClaw("")).toBe("0 CLAW");
  });
});

// ---------------------------------------------------------------------------
// toChainIdentifier() - pure function
// ---------------------------------------------------------------------------

describe("toChainIdentifier", () => {
  it("normalizes clawchain-1 to clawchain", () => {
    expect(toChainIdentifier("clawchain-1")).toBe("clawchain");
  });

  it("normalizes clawchain-testnet-5 to clawchain-testnet", () => {
    expect(toChainIdentifier("clawchain-testnet-5")).toBe("clawchain-testnet");
  });

  it("strips numeric suffix from other chain IDs", () => {
    expect(toChainIdentifier("cosmoshub-4")).toBe("cosmoshub");
  });

  it("returns as-is when no dash suffix", () => {
    expect(toChainIdentifier("localchain")).toBe("localchain");
  });

  it("is case-insensitive", () => {
    expect(toChainIdentifier("ClawChain-1")).toBe("clawchain");
  });
});

// ---------------------------------------------------------------------------
// runWalletBalance() - mocked network
// ---------------------------------------------------------------------------

describe("runWalletBalance", () => {
  it("displays balance when chain is reachable", async () => {
    const mockClient = {
      getBalance: vi.fn().mockResolvedValue({ denom: "uclaw", amount: "5000000" }),
      getAllBalances: vi.fn().mockResolvedValue([{ denom: "uclaw", amount: "5000000" }]),
      disconnect: vi.fn(),
    };
    mockedStargateConnect.mockResolvedValue(mockClient as any);

    await runWalletBalance({});

    const output = logs.join("\n");
    expect(output).toContain("Address: claw1testaddr123456789");
    expect(output).toContain("Balance: 5 CLAW");
    expect(output).toContain("5000000 uclaw");
  });

  it("displays zero balance correctly", async () => {
    const mockClient = {
      getBalance: vi.fn().mockResolvedValue({ denom: "uclaw", amount: "0" }),
      getAllBalances: vi.fn().mockResolvedValue([{ denom: "uclaw", amount: "0" }]),
      disconnect: vi.fn(),
    };
    mockedStargateConnect.mockResolvedValue(mockClient as any);

    await runWalletBalance({});

    const output = logs.join("\n");
    expect(output).toContain("Balance: 0 CLAW");
  });

  it("displays multiple denom balances", async () => {
    const mockClient = {
      getBalance: vi.fn().mockResolvedValue({ denom: "uclaw", amount: "5000000" }),
      getAllBalances: vi.fn().mockResolvedValue([
        { denom: "uclaw", amount: "5000000" },
        { denom: "uatom", amount: "1000000" },
      ]),
      disconnect: vi.fn(),
    };
    mockedStargateConnect.mockResolvedValue(mockClient as any);

    await runWalletBalance({});

    const output = logs.join("\n");
    expect(output).toContain("All balances:");
    expect(output).toContain("5000000 uclaw");
    expect(output).toContain("1000000 uatom");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    const mockClient = {
      getBalance: vi.fn().mockResolvedValue({ denom: "uclaw", amount: "3000000" }),
      getAllBalances: vi.fn().mockResolvedValue([{ denom: "uclaw", amount: "3000000" }]),
      disconnect: vi.fn(),
    };
    mockedStargateConnect.mockResolvedValue(mockClient as any);

    await runWalletBalance({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.address).toBe("claw1testaddr123456789");
    expect(parsed.amount).toBe("3000000");
    expect(parsed.denom).toBe("uclaw");
  });
});
