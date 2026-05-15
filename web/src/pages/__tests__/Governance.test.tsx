import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Governance from "../Governance";

// Mock global fetch for the governance proposals API call
const mockFetch = vi.fn();

// Mock chain and wallet modules
vi.mock("../../lib/chain", () => ({
  formatClaw: vi.fn((v: string) => `${v} CLAW`),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
  getModuleParams: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/config", () => ({
  chainConfig: {
    chainId: "clawchain",
    chainName: "ClawChain",
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

vi.mock("../../lib/wallet", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
}));

function renderGovernance() {
  return render(
    <MemoryRouter>
      <Governance />
    </MemoryRouter>,
  );
}

describe("Governance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: proposals API returns empty list
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ proposals: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders proposals section", async () => {
    renderGovernance();

    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(
      screen.getByText(/Submit proposals and vote/i),
    ).toBeInTheDocument();

    // Tab buttons
    expect(
      screen.getByRole("button", { name: /Proposals/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Submit Proposal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cast Vote/i }),
    ).toBeInTheDocument();
  });

  it("shows loading state and then empty state", async () => {
    renderGovernance();

    // Initially shows loading text
    expect(screen.getByText("Loading proposals...")).toBeInTheDocument();

    // After fetch resolves, shows empty state
    await waitFor(() => {
      expect(
        screen.getByText(/No governance proposals yet/i),
      ).toBeInTheDocument();
    });
  });

  it("renders proposals when API returns data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        proposals: [
          {
            id: "1",
            title: "Increase Max Agents",
            description: "Double the agent limit",
            proposer: "claw1abc123def456ghi789jkl012mno345pqr678stu",
            status: "voting",
            deposit: "1000000",
            yes_votes: "500",
            no_votes: "100",
            abstain_votes: "50",
            submit_time: new Date().toISOString(),
            voting_end_time: new Date().toISOString(),
          },
        ],
      }),
    });

    renderGovernance();

    await waitFor(() => {
      expect(screen.getByText("Increase Max Agents")).toBeInTheDocument();
    });
  });
});
