import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import NetworkHealth from "../NetworkHealth";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetNetStatus = vi.fn();
const mockGetLatestBlock = vi.fn();
const mockGetRecentBlocks = vi.fn();
const mockGetValidators = vi.fn();
const mockGetTotalSupply = vi.fn();
const mockGetLiveAgents = vi.fn();
const mockGetTreeStats = vi.fn();
const mockGetModuleParams = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getNetStatus: (...args: unknown[]) => mockGetNetStatus(...args),
  getLatestBlock: (...args: unknown[]) => mockGetLatestBlock(...args),
  getRecentBlocks: (...args: unknown[]) => mockGetRecentBlocks(...args),
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
  getTotalSupply: (...args: unknown[]) => mockGetTotalSupply(...args),
  getLiveAgents: (...args: unknown[]) => mockGetLiveAgents(...args),
  getTreeStats: (...args: unknown[]) => mockGetTreeStats(...args),
  getModuleParams: (...args: unknown[]) => mockGetModuleParams(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
  timeAgo: vi.fn(() => "2s ago"),
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
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
    faucetEndpoint: "http://localhost:8888",
    walletUrl: "http://localhost:3001",
  },
}));

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
}));

const mockFetch = vi.fn();

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeNetStatus() {
  return {
    nodeInfo: { network: "clawchain-test", moniker: "test-node", version: "0.38.21" },
    syncInfo: {
      latestHeight: "5000",
      latestTime: new Date().toISOString(),
      catching_up: false,
    },
    validatorCount: 1,
  };
}

function makeBlock(height = "5000") {
  return {
    height,
    time: new Date().toISOString(),
    hash: "AABBCCDD",
    proposer: "P1",
    txCount: 2,
  };
}

function makeValidators(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    moniker: `Validator-${i + 1}`,
    operatorAddress: `clawvaloper${i}_long_enough_to_truncate_addr`,
    tokens: `${(count - i) * 1_000_000_000}`,
    status: "BOND_STATUS_BONDED",
    commission: "0.100000000000000000",
    jailed: false,
    description: { moniker: `Validator-${i + 1}` },
    operator_address: `clawvaloper${i}_long_enough_to_truncate_addr`,
    commission_rates: { rate: "0.1" },
  }));
}

function makeSupply() {
  return [
    { denom: "uclaw", amount: "1000000000000" },
  ];
}

function makeTreeStats() {
  return { leafCount: "42", root: "abcdef1234567890abcdef1234567890", depth: "6" };
}

function makeRecentBlocks() {
  const now = Date.now();
  return Array.from({ length: 5 }, (_, i) => ({
    height: String(5000 - i),
    time: new Date(now - i * 3000).toISOString(),
    hash: `HASH${i}`,
    proposer: "P1",
    txCount: i,
  }));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupAllMocks() {
  mockGetNetStatus.mockResolvedValue(makeNetStatus());
  mockGetLatestBlock.mockResolvedValue(makeBlock());
  mockGetValidators.mockResolvedValue(makeValidators());
  mockGetTotalSupply.mockResolvedValue(makeSupply());
  mockGetLiveAgents.mockResolvedValue([{ address: "claw1agent", name: "Agent1" }]);
  mockGetTreeStats.mockResolvedValue(makeTreeStats());
  mockGetRecentBlocks.mockResolvedValue(makeRecentBlocks());
  mockGetModuleParams.mockResolvedValue({ max_agents: "100", min_stake: "1000000" });

  // For REST API health check (direct fetch)
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
}

function renderNetworkHealth() {
  return render(
    <MemoryRouter>
      <NetworkHealth />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("NetworkHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Renders tab navigation buttons
  it("renders tab navigation buttons", async () => {
    setupAllMocks();
    renderNetworkHealth();

    expect(screen.getByRole("button", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /validators/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Module Params/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Block Times/i })).toBeInTheDocument();
  });

  // 2. Shows health check results on overview tab
  it("shows health check results on overview tab", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText("Health Checks")).toBeInTheDocument();
    });

    expect(screen.getByText("RPC Connection")).toBeInTheDocument();
    expect(screen.getByText("REST API")).toBeInTheDocument();
    expect(screen.getByText("Block Production")).toBeInTheDocument();
    expect(screen.getByText("Validators")).toBeInTheDocument();
    expect(screen.getByText("Agent System")).toBeInTheDocument();
    expect(screen.getByText("Privacy Module")).toBeInTheDocument();
  });

  // 3. Shows overall status indicator
  it("shows all systems operational when all checks pass", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText(/All Systems Operational/)).toBeInTheDocument();
    });
  });

  // 4. Shows chain info stat cards
  it("shows chain info stat cards on overview", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText("Block Height")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Supply")).toBeInTheDocument();
    expect(screen.getByText("Live Agents")).toBeInTheDocument();
    expect(screen.getByText("Privacy Leaves")).toBeInTheDocument();
  });

  // 5. Shows node info when chain info loads
  it("shows node info section when chain info loads", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText("Node Info")).toBeInTheDocument();
    });

    expect(screen.getByText("Moniker")).toBeInTheDocument();
    expect(screen.getByText("test-node")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("clawchain-test")).toBeInTheDocument();
  });

  // 6. Switching to validators tab shows validator table
  it("switching to validators tab shows validator list", async () => {
    setupAllMocks();
    renderNetworkHealth();

    // Wait for overview to load first
    await waitFor(() => {
      expect(screen.getByText("Health Checks")).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /validators/i }));

    await waitFor(() => {
      expect(screen.getByText(/Validators \(/)).toBeInTheDocument();
    });

    // Table headers
    expect(screen.getByText("Moniker")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Tokens")).toBeInTheDocument();
  });

  // 7. Switching to modules tab shows module buttons
  it("switching to modules tab shows module parameter buttons", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText("Health Checks")).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /Module Params/i }));

    await waitFor(() => {
      expect(screen.getByText("Module Parameters")).toBeInTheDocument();
    });

    // Module buttons
    expect(screen.getByRole("button", { name: "agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "privacy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "marketplace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "governance" })).toBeInTheDocument();
  });

  // 8. Clicking a module button loads its params
  it("clicking a module button loads its params", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText("Health Checks")).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /Module Params/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "agent" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "agent" }));

    await waitFor(() => {
      expect(mockGetModuleParams).toHaveBeenCalledWith("agent");
    });

    await waitFor(() => {
      expect(screen.getByText("max_agents")).toBeInTheDocument();
    });

    expect(screen.getByText("100")).toBeInTheDocument();
  });

  // 9. Switching to blocks tab shows block timing stats
  it("switching to blocks tab shows block timing stats", async () => {
    setupAllMocks();
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText("Health Checks")).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /Block Times/i }));

    await waitFor(() => {
      expect(screen.getByText("Recent Block Times")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Avg Block Time")).toBeInTheDocument();
    });

    expect(screen.getByText("Min")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByText("Blocks Sampled")).toBeInTheDocument();
  });

  // 10. Shows degraded status when a check warns
  it("shows degraded status when agents return empty", async () => {
    setupAllMocks();
    mockGetLiveAgents.mockResolvedValue([]);
    renderNetworkHealth();

    await waitFor(() => {
      expect(screen.getByText(/Degraded/)).toBeInTheDocument();
    });

    // Agent system check should show warn status
    expect(screen.getByText("Agent System")).toBeInTheDocument();
    expect(screen.getByText("0 live agent(s)")).toBeInTheDocument();
  });
});
