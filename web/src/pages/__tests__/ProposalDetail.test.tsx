import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProposalDetail from "../ProposalDetail";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

vi.mock("../../lib/chain", () => ({
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
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
  disconnectWallet: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PROPOSER = "claw1proposer_long_enough_to_truncate_addr";

function makeProposalResponse(overrides: Record<string, unknown> = {}) {
  return {
    proposal: {
      id: "1",
      proposer: PROPOSER,
      title: "Increase Max Agents",
      description: "This proposal increases the maximum number of agents to 200.",
      status: "voting_period",
      deposit: { amount: "150000000", denom: "uclaw" },
      voting_end_time: new Date(Date.now() + 86_400_000).toISOString(),
      tally: {
        yes_count: "500",
        no_count: "100",
        abstain_count: "50",
        no_with_veto_count: "25",
      },
      param_changes: [
        { module: "agent", key: "max_agents", value: "200" },
      ],
      ...overrides,
    },
  };
}

function makeEmptyTallyProposal() {
  return makeProposalResponse({
    tally: {
      yes_count: "0",
      no_count: "0",
      abstain_count: "0",
      no_with_veto_count: "0",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupFetchMock(proposal = makeProposalResponse()) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(proposal),
  });
}

function renderProposalDetail(id = "1") {
  return render(
    <MemoryRouter initialEntries={[`/governance/${id}`]}>
      <Routes>
        <Route path="/governance/:id" element={<ProposalDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ProposalDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderProposalDetail();

    expect(screen.getByText("Loading proposal...")).toBeInTheDocument();
  });

  // 2. Shows proposal title and status after loading
  it("shows proposal title and status after loading", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText(/Increase Max Agents/)).toBeInTheDocument();
    });

    // "Voting Period" appears as both the status badge and in the timeline
    const vpElements = screen.getAllByText("Voting Period");
    expect(vpElements.length).toBeGreaterThanOrEqual(1);
  });

  // 3. Shows proposal description
  it("shows proposal description section", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText(/Increase Max Agents/)).toBeInTheDocument();
    });

    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(
      screen.getByText(/This proposal increases the maximum number of agents to 200/),
    ).toBeInTheDocument();
  });

  // 4. Shows vote tally with percentages
  it("shows vote tally bar and vote stats", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Vote Tally")).toBeInTheDocument();
    });

    // Vote stat labels (also appear on vote buttons, so use getAllByText)
    expect(screen.getAllByText("Yes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("No").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Abstain").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("No With Veto").length).toBeGreaterThanOrEqual(1);

    // Quorum and pass ratio
    expect(screen.getByText(/Quorum reached/)).toBeInTheDocument();
    expect(screen.getByText(/Pass ratio/)).toBeInTheDocument();
  });

  // 5. Shows no votes message when tally is empty
  it("shows no votes message when tally is empty", async () => {
    setupFetchMock(makeEmptyTallyProposal());
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Vote Tally")).toBeInTheDocument();
    });

    expect(screen.getByText("No votes cast yet.")).toBeInTheDocument();
  });

  // 6. Shows deposit progress bar
  it("shows deposit info with progress", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Deposit")).toBeInTheDocument();
    });

    // 150000000 uclaw = 150 CLAW; required is 100 CLAW (100000000)
    expect(screen.getByText(/Current: 150 CLAW/)).toBeInTheDocument();
    expect(screen.getByText(/Required: 100 CLAW/)).toBeInTheDocument();
    expect(screen.getByText("Minimum deposit met")).toBeInTheDocument();
  });

  // 7. Shows timeline with correct step for voting_period
  it("shows timeline with correct active steps", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Timeline")).toBeInTheDocument();
    });

    expect(screen.getByText("Submit")).toBeInTheDocument();
    // "Deposit Period" and "Voting Period" may appear in both the timeline and as a status badge
    const dpElements = screen.getAllByText("Deposit Period");
    expect(dpElements.length).toBeGreaterThanOrEqual(1);
    const vpTimelineElements = screen.getAllByText("Voting Period");
    expect(vpTimelineElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Execution")).toBeInTheDocument();
  });

  // 8. Shows parameter changes table
  it("shows parameter changes table when present", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Parameter Changes")).toBeInTheDocument();
    });

    expect(screen.getByText("agent")).toBeInTheDocument();
    expect(screen.getByText("max_agents")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  // 9. Shows vote buttons
  it("shows vote action buttons", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Cast Your Vote")).toBeInTheDocument();
    });

    // Vote buttons -- find all buttons, filter for vote buttons
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    expect(yesButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abstain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No With Veto" })).toBeInTheDocument();
  });

  // 10. Shows error state when fetch fails
  it("shows error state when fetch fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
    });

    // Should still show back link
    expect(screen.getByText(/Back to Governance/)).toBeInTheDocument();
  });

  // 11. Shows breadcrumb with governance link
  it("shows breadcrumb with governance link", async () => {
    setupFetchMock();
    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText(/Increase Max Agents/)).toBeInTheDocument();
    });

    const breadcrumbNav = screen.getByLabelText("Breadcrumb");
    expect(breadcrumbNav).toBeInTheDocument();
    const govLink = screen.getByText("Governance");
    expect(govLink.closest("a")).toHaveAttribute("href", "/governance");
  });

  // 12. Deposit below minimum shows percentage
  it("shows deposit percentage when below minimum", async () => {
    setupFetchMock(
      makeProposalResponse({
        deposit: { amount: "50000000", denom: "uclaw" },
        status: "deposit_period",
      }),
    );

    renderProposalDetail();

    await waitFor(() => {
      expect(screen.getByText("Deposit")).toBeInTheDocument();
    });

    expect(screen.getByText(/50\.0% of minimum deposit/)).toBeInTheDocument();
    // "Deposit Period" appears as both the status badge and in the timeline
    const dpElements = screen.getAllByText("Deposit Period");
    expect(dpElements.length).toBeGreaterThanOrEqual(1);
  });
});
