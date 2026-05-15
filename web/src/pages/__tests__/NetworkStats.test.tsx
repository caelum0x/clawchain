import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NetworkStats from "../NetworkStats";

// Mock chain API
vi.mock("../../lib/chain.ts", () => ({
  getNetStatus: vi.fn().mockResolvedValue({
    nodeInfo: { network: "clawchain-test", moniker: "test-node", version: "0.38.21" },
    syncInfo: {
      latestHeight: "5000",
      latestTime: new Date().toISOString(),
      catching_up: false,
    },
    validatorCount: 1,
  }),
  getRecentBlocks: vi.fn().mockResolvedValue([
    { height: "5000", time: new Date().toISOString(), hash: "AAAA", proposer: "P1", txCount: 1 },
    {
      height: "4999",
      time: new Date(Date.now() - 3000).toISOString(),
      hash: "BBBB",
      proposer: "P1",
      txCount: 0,
    },
  ]),
  shortHash: vi.fn((h: string) =>
    h.length > 16 ? `${h.slice(0, 8)}...${h.slice(-8)}` : h,
  ),
  timeAgo: vi.fn(() => "2s ago"),
  CHAIN_RPC: "http://localhost:26657",
}));

// Mock config
vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    rpcEndpoint: "http://localhost:26657",
    restEndpoint: "http://localhost:1317",
    chainId: "clawchain-test",
  },
}));

// Mock global fetch for RPC/REST calls not covered by chain.ts mock
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/net_info")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            n_peers: "3",
            peers: [
              {
                node_info: { id: "peer1abc", moniker: "Validator-A", network: "clawchain-test" },
                remote_ip: "10.0.0.1",
                connection_status: {
                  SendMonitor: { Bytes: "1024" },
                  RecvMonitor: { Bytes: "2048" },
                  Duration: "60000000000",
                },
                is_outbound: true,
              },
              {
                node_info: { id: "peer2def", moniker: "Validator-B", network: "clawchain-test" },
                remote_ip: "10.0.0.2",
                connection_status: {
                  SendMonitor: { Bytes: "512" },
                  RecvMonitor: { Bytes: "768" },
                  Duration: "120000000000",
                },
                is_outbound: false,
              },
            ],
          },
        }),
    });
  }

  if (url.includes("/dump_consensus_state")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            round_state: {
              "height/round/step": "5001/0/1",
              validators: { validators: [{ address: "V1" }, { address: "V2" }] },
              votes: [],
            },
          },
        }),
    });
  }

  if (url.includes("/status")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            node_info: {
              id: "abc123nodeidentifier",
              moniker: "test-node",
              network: "clawchain-test",
              protocol_version: { p2p: "8", block: "11", app: "0" },
              listen_addr: "tcp://0.0.0.0:26656",
            },
            sync_info: {
              catching_up: false,
              latest_block_hash: "AABBCCDD11223344AABBCCDD11223344AABBCCDD11223344AABBCCDD11223344",
              latest_app_hash: "EEFF0011EEFF0011EEFF0011EEFF0011EEFF0011EEFF0011EEFF0011EEFF0011",
              earliest_block_height: "1",
              earliest_block_time: "2026-01-01T00:00:00Z",
            },
          },
        }),
    });
  }

  if (url.includes("/node_info")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          default_node_info: {
            network: "clawchain-test",
            other: { genesis_time: "2026-01-01T00:00:00Z" },
          },
          application_version: {
            app_name: "clawchaind",
            version: "1.0.0",
            cosmos_sdk_version: "v0.53.6",
            go_version: "go1.22",
            git_commit: "abc123def456",
          },
        }),
    });
  }

  if (url.includes("/validatorsets/1")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ validators: [{ address: "V1" }] }),
    });
  }

  if (url.includes("/module_versions")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          module_versions: [
            { name: "agent", version: "1" },
            { name: "bank", version: "4" },
            { name: "privacy", version: "1" },
          ],
        }),
    });
  }

  // Default fallback
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

function renderNetworkStats() {
  return render(
    <MemoryRouter>
      <NetworkStats />
    </MemoryRouter>,
  );
}

describe("NetworkStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders loading state initially", () => {
    renderNetworkStats();
    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.getByText("Loading network statistics...")).toBeInTheDocument();
  });

  it("renders network overview stat cards after loading", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("network-overview")).toBeInTheDocument();
    });

    // Check stat card headings within the overview section
    const overviewSection = screen.getByTestId("network-overview");
    expect(overviewSection).toBeInTheDocument();

    // Use getAllByText for labels that appear in multiple sections (e.g. "Chain ID")
    const chainIdElements = screen.getAllByText("Chain ID");
    expect(chainIdElements.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("Block Height")).toBeInTheDocument();
    expect(screen.getByText("Peer Count")).toBeInTheDocument();
    expect(screen.getByText("Avg Block Time")).toBeInTheDocument();
    expect(screen.getByText("Network Version")).toBeInTheDocument();
    expect(screen.getByText("Uptime")).toBeInTheDocument();
  });

  it("shows peer table section", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("peer-table-section")).toBeInTheDocument();
    });
  });

  it("shows consensus status section", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("consensus-section")).toBeInTheDocument();
    });

    expect(screen.getByText("Consensus Status")).toBeInTheDocument();
  });

  it("shows node info section", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("node-info-section")).toBeInTheDocument();
    });

    expect(screen.getByText("Node Info")).toBeInTheDocument();
  });

  it("shows genesis info section", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("genesis-section")).toBeInTheDocument();
    });

    expect(screen.getByText("Genesis Info")).toBeInTheDocument();
  });

  it("shows module versions section", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("module-versions-section")).toBeInTheDocument();
    });
  });

  it("has a refresh button", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("refresh-btn")).toBeInTheDocument();
    });

    const btn = screen.getByTestId("refresh-btn");
    expect(btn.textContent).toMatch(/Pause|Resume/);
  });

  it("shows last updated indicator", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByTestId("last-updated")).toBeInTheDocument();
    });

    expect(screen.getByTestId("last-updated").textContent).toMatch(/Updated \d+s ago/);
  });

  it("renders the page title", async () => {
    renderNetworkStats();

    await waitFor(() => {
      expect(screen.getByText("Network Statistics")).toBeInTheDocument();
    });
  });
});
