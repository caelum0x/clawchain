import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Settings from "../Settings";

// Mock global fetch to prevent real network requests
const mockFetch = vi.fn();

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    chainId: "clawchain-test",
    chainName: "ClawChain Test",
    bech32Prefix: "claw",
    coinDenom: "CLAW",
    coinMinimalDenom: "uclaw",
    coinDecimals: 6,
    gasPrice: "0.025uclaw",
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
    faucetEndpoint: "http://localhost:8888",
    walletUrl: "http://localhost:3001",
  },
}));

vi.mock("../../lib/chain.ts", () => ({
  formatClaw: vi.fn((v: string) => `${v} CLAW`),
}));

function renderSettings() {
  return render(<Settings />);
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch to reject (node offline) for the initial loadNodeInfo call
    mockFetch.mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders settings sections with tab buttons", () => {
    renderSettings();

    expect(
      screen.getByText("Settings & Configuration"),
    ).toBeInTheDocument();

    // Tab buttons
    expect(
      screen.getByRole("button", { name: /chain configuration/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /module parameters/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /network stats/i }),
    ).toBeInTheDocument();
  });

  it("shows chain config section by default with configuration values", () => {
    renderSettings();

    expect(screen.getByText("Current Configuration")).toBeInTheDocument();

    // Check that chain config values are shown
    expect(screen.getByText("Chain ID")).toBeInTheDocument();
    expect(screen.getByText("clawchain-test")).toBeInTheDocument();
    expect(screen.getByText("Chain Name")).toBeInTheDocument();
    expect(screen.getByText("ClawChain Test")).toBeInTheDocument();
    expect(screen.getByText("RPC URL")).toBeInTheDocument();
    expect(screen.getByText("REST URL")).toBeInTheDocument();
    expect(screen.getByText("Denom")).toBeInTheDocument();
    expect(screen.getByText("Bech32 Prefix")).toBeInTheDocument();
    expect(screen.getByText("Gas Price")).toBeInTheDocument();
  });

  it("shows Node Info section", () => {
    renderSettings();

    expect(screen.getByText("Node Info")).toBeInTheDocument();
  });
});
