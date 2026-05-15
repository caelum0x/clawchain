import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Home from "../Home";

const mockBlock = {
  height: "12345",
  time: new Date().toISOString(),
  hash: "ABCDEF1234567890ABCDEF1234567890",
  proposer: "proposer1",
  txCount: 3,
};

const mockAgents = [
  { address: "claw1abc", name: "Agent-1", endpoint: "", active: true, pubkey: "", supportedTools: [] },
  { address: "claw1def", name: "Agent-2", endpoint: "", active: true, pubkey: "", supportedTools: [] },
];

const mockValidators = [
  { moniker: "Val-1", operatorAddress: "clawvaloper1a", tokens: "5000000000", status: "BOND_STATUS_BONDED", commission: "0.1", jailed: false },
  { moniker: "Val-2", operatorAddress: "clawvaloper1b", tokens: "3000000000", status: "BOND_STATUS_BONDED", commission: "0.05", jailed: false },
];

const mockSupply = [{ denom: "uclaw", amount: "100000000000" }];

const mockBlocks = [
  { ...mockBlock, height: "12345" },
  { ...mockBlock, height: "12344" },
  { ...mockBlock, height: "12343" },
  { ...mockBlock, height: "12342" },
  { ...mockBlock, height: "12341" },
];

const mockTxs = [
  {
    hash: "TX1HASH1234567890123456",
    height: "12345",
    code: 0,
    gasUsed: "100",
    gasWanted: "200",
    memo: "",
    messages: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: { amount: [{ denom: "uclaw", amount: "1000000" }] } }],
  },
];

// Mock all chain API calls used by Home
vi.mock("../../lib/chain.ts", () => ({
  getNetStatus: vi.fn().mockResolvedValue({
    nodeInfo: { network: "clawchain", moniker: "node0", version: "0.38" },
    syncInfo: { latestHeight: "12345", latestTime: new Date().toISOString(), catching_up: false },
    validatorCount: 2,
  }),
  getLatestBlock: vi.fn().mockResolvedValue({
    height: "12345",
    time: new Date().toISOString(),
    hash: "ABCDEF1234567890ABCDEF1234567890",
    proposer: "proposer1",
    txCount: 3,
  }),
  getTotalSupply: vi.fn().mockResolvedValue([{ denom: "uclaw", amount: "100000000000" }]),
  getLiveAgents: vi.fn().mockResolvedValue([
    { address: "claw1abc", name: "Agent-1", endpoint: "", active: true, pubkey: "", supportedTools: [] },
    { address: "claw1def", name: "Agent-2", endpoint: "", active: true, pubkey: "", supportedTools: [] },
  ]),
  getValidators: vi.fn().mockResolvedValue([
    { moniker: "Val-1", operatorAddress: "clawvaloper1a", tokens: "5000000000", status: "BOND_STATUS_BONDED", commission: "0.1", jailed: false },
    { moniker: "Val-2", operatorAddress: "clawvaloper1b", tokens: "3000000000", status: "BOND_STATUS_BONDED", commission: "0.05", jailed: false },
  ]),
  getRecentBlocks: vi.fn().mockResolvedValue([
    { height: "12345", time: new Date().toISOString(), hash: "H1", proposer: "p", txCount: 3 },
    { height: "12344", time: new Date().toISOString(), hash: "H2", proposer: "p", txCount: 1 },
    { height: "12343", time: new Date().toISOString(), hash: "H3", proposer: "p", txCount: 0 },
    { height: "12342", time: new Date().toISOString(), hash: "H4", proposer: "p", txCount: 2 },
    { height: "12341", time: new Date().toISOString(), hash: "H5", proposer: "p", txCount: 0 },
  ]),
  getTxsByHeight: vi.fn().mockResolvedValue([
    {
      hash: "TX1HASH1234567890123456",
      height: "12345",
      code: 0,
      gasUsed: "100",
      gasWanted: "200",
      memo: "",
      messages: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: { amount: [{ denom: "uclaw", amount: "1000000" }] } }],
    },
  ]),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    const whole = n / 1_000_000n;
    return `${whole} CLAW`;
  }),
  timeAgo: vi.fn(() => "0s ago"),
  shortAddr: vi.fn((a: string) => (a.length > 16 ? `${a.slice(0, 10)}...${a.slice(-6)}` : a)),
  shortHash: vi.fn((h: string) => (h.length > 16 ? `${h.slice(0, 8)}...${h.slice(-8)}` : h)),
}));

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    chainId: "clawchain",
    chainName: "ClawChain",
    bech32Prefix: "claw",
    coinDenom: "CLAW",
    coinMinimalDenom: "uclaw",
    coinDecimals: 6,
    gasPrice: "0.025uclaw",
    restEndpoint: "/api",
    rpcEndpoint: "/rpc",
    faucetEndpoint: "/faucet",
    walletUrl: "http://localhost:3001",
  },
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders hero section with title", () => {
    renderHome();
    const hero = document.querySelector("[data-testid='hero-section']");
    expect(hero).toBeTruthy();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toContain("Sovereign");
    expect(heading.textContent).toContain("AI");
    expect(heading.textContent).toContain("Agent Network");
  });

  it("has hero CTA buttons with correct links", () => {
    renderHome();

    const explorerLink = screen.getByRole("link", { name: /explore chain/i });
    expect(explorerLink).toHaveAttribute("href", "/explorer");

    const agentLink = screen.getByRole("link", { name: /launch agent/i });
    expect(agentLink).toHaveAttribute("href", "/agents");

    const faucetLink = screen.getByRole("link", { name: /get testnet tokens/i });
    expect(faucetLink).toHaveAttribute("href", "/faucet");
  });

  it("shows live network stats after data loads", async () => {
    renderHome();

    await waitFor(() => {
      const statsSection = document.querySelector("[data-testid='network-stats']");
      expect(statsSection).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Block Height")).toBeInTheDocument();
      expect(screen.getByText("12,345")).toBeInTheDocument();
    });

    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Active Agents")).toBeInTheDocument();
    expect(screen.getByText("Total Supply")).toBeInTheDocument();
    expect(screen.getByText("Validators")).toBeInTheDocument();
    expect(screen.getByText("Staking Ratio")).toBeInTheDocument();
  });

  it("ecosystem grid shows all 6 features", () => {
    renderHome();

    const grid = document.querySelector("[data-testid='ecosystem-grid']");
    expect(grid).toBeTruthy();

    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Agent Economy")).toBeInTheDocument();
    expect(screen.getByText("GPU Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Model Registry")).toBeInTheDocument();
    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("IBC Connected")).toBeInTheDocument();

    const cards = document.querySelectorAll("[data-testid='ecosystem-card']");
    expect(cards.length).toBe(6);
  });

  it("ecosystem cards link to correct pages", () => {
    renderHome();

    const privacyLink = screen.getByText("Privacy").closest("a");
    expect(privacyLink).toHaveAttribute("href", "/privacy");

    const agentLink = screen.getByText("Agent Economy").closest("a");
    expect(agentLink).toHaveAttribute("href", "/agents");

    const gpuLink = screen.getByText("GPU Marketplace").closest("a");
    expect(gpuLink).toHaveAttribute("href", "/gpu");

    const modelLink = screen.getByText("Model Registry").closest("a");
    expect(modelLink).toHaveAttribute("href", "/models");

    const govLink = screen.getByText("Governance").closest("a");
    expect(govLink).toHaveAttribute("href", "/governance");

    const ibcLink = screen.getByText("IBC Connected").closest("a");
    expect(ibcLink).toHaveAttribute("href", "/ibc");
  });

  it("How It Works shows 3 steps", () => {
    renderHome();

    const section = document.querySelector("[data-testid='how-it-works']");
    expect(section).toBeTruthy();

    expect(screen.getByText("Install")).toBeInTheDocument();
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText("Earn")).toBeInTheDocument();

    expect(screen.getByText("npm i -g @clawchain/clawd")).toBeInTheDocument();
  });

  it("activity feed shows recent blocks", async () => {
    renderHome();

    await waitFor(() => {
      const blocks = document.querySelectorAll("[data-testid='activity-block']");
      expect(blocks.length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Latest Blocks")).toBeInTheDocument();
    expect(screen.getByText("Latest Transactions")).toBeInTheDocument();
  });

  it("terminal box shows clawd up", () => {
    renderHome();

    const terminal = document.querySelector("[data-testid='terminal-box']");
    expect(terminal).toBeTruthy();

    // "clawd up" appears in both How It Works and terminal box, so use getAllByText
    const clawdUpElements = screen.getAllByText("clawd up");
    expect(clawdUpElements.length).toBeGreaterThanOrEqual(2);

    // The terminal box specifically contains the prompt and command
    expect(terminal!.querySelector(".terminal-prompt")).toBeTruthy();
    expect(terminal!.querySelector(".terminal-cmd")?.textContent).toBe("clawd up");
  });

  it("shows Get Started heading", () => {
    renderHome();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("has footer links for SDK, Discord, and GitHub", () => {
    renderHome();
    expect(screen.getByText("SDK")).toBeInTheDocument();
    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });
});
