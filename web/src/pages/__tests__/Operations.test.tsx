import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Operations from "../Operations";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

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

const mockFetch = vi.fn();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderOperations() {
  return render(
    <MemoryRouter>
      <Operations />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    // Default mock: reject all fetches (services are down)
    mockFetch.mockRejectedValue(new Error("not connected"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Renders page title
  it("renders page title", () => {
    renderOperations();

    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  // 2. Renders four tab buttons
  it("renders four tab buttons", () => {
    renderOperations();

    expect(screen.getByText("Launch Readiness")).toBeInTheDocument();
    expect(screen.getByText("Service Health")).toBeInTheDocument();
    expect(screen.getByText("Module Status")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });

  // 3. Default tab shows Launch Readiness with component completion
  it("shows Component Completion section on default Readiness tab", () => {
    renderOperations();

    expect(screen.getByText("Component Completion")).toBeInTheDocument();
    expect(screen.getByText("Blockchain Core")).toBeInTheDocument();
    expect(screen.getByText("Agent Runtime")).toBeInTheDocument();
    expect(screen.getByText("GPU Compute")).toBeInTheDocument();
    expect(screen.getByText("Web Dashboard")).toBeInTheDocument();
    expect(screen.getByText("TypeScript SDK")).toBeInTheDocument();
  });

  // 4. Readiness tab shows completion percentages
  it("shows completion percentages for components", () => {
    renderOperations();

    // "100%" appears for multiple components (Blockchain Core, Web Dashboard, TypeScript SDK, clawd CLI)
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getAllByText("95%").length).toBeGreaterThanOrEqual(1);
  });

  // 5. Readiness tab shows launch checklist
  it("shows launch checklist table with items", async () => {
    renderOperations();

    await waitFor(() => {
      expect(screen.getByText(/Launch Checklist/)).toBeInTheDocument();
      expect(screen.getByText("Unit tests pass")).toBeInTheDocument();
      expect(screen.getByText("Integration tests pass")).toBeInTheDocument();
      expect(screen.getByText("Security review signed off")).toBeInTheDocument();
      expect(screen.getByText("Genesis file validated")).toBeInTheDocument();
    });
  });

  // 6. Checklist items show categories
  it("shows category for each checklist item", async () => {
    renderOperations();

    await waitFor(() => {
      expect(screen.getAllByText("testing").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("security").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("infrastructure").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("operations").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("documentation").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 7. Checklist items show automated check results (PASS/FAIL/PENDING)
  it("shows automated checklist results after checks run", async () => {
    renderOperations();

    await waitFor(() => {
      // Some items auto-resolve to PASS, some stay PENDING (blocked items)
      const allStatuses = screen.getAllByText(/^(PASS|FAIL|PENDING)$/);
      expect(allStatuses.length).toBe(18);
      // Blocked items (3, 5, 6, 10) stay PENDING
      const pendingItems = screen.getAllByText("PENDING");
      expect(pendingItems.length).toBeGreaterThanOrEqual(3);
    });
  });

  // 8. Switching to Service Health tab
  it("switches to Service Health tab and shows checking message", async () => {
    // Return resolved promises for service health checks
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    renderOperations();

    const user = userEvent.setup();
    await user.click(screen.getByText("Service Health"));

    // "Service Health" appears in both the tab button and the h2 heading;
    // use heading role to target the h2 specifically
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: /Service Health/ })).toBeInTheDocument();
    });
  });

  // 9. Service Health tab shows service names after loading
  it("shows service names on Service Health tab after checks complete", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    renderOperations();

    const user = userEvent.setup();
    await user.click(screen.getByText("Service Health"));

    await waitFor(() => {
      expect(screen.getByText("Chain Node (RPC)")).toBeInTheDocument();
    });

    expect(screen.getByText("REST API")).toBeInTheDocument();
    expect(screen.getByText("Faucet")).toBeInTheDocument();
    expect(screen.getByText("GPU Provider")).toBeInTheDocument();
    expect(screen.getByText("Explorer")).toBeInTheDocument();
  });

  // 10. Switching to Module Status tab
  it("switches to Module Status tab and shows module table or loading", async () => {
    mockFetch.mockRejectedValue(new Error("not connected"));

    renderOperations();

    const user = userEvent.setup();
    await user.click(screen.getByText("Module Status"));

    // When modules tab is shown, modules load asynchronously
    // The h2 "Module Status" heading should be present
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Module Status" })).toBeInTheDocument();
    });
  });

  // 11. Switching to Network tab shows connect message when chain is down
  it("shows connect message on Network tab when chain is unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("not connected"));

    renderOperations();

    const user = userEvent.setup();
    await user.click(screen.getByText("Network"));

    await waitFor(() => {
      expect(
        screen.getByText(/Connect to chain to view live stats/),
      ).toBeInTheDocument();
    });
  });

  // 12. Network tab shows chain info when connected
  it("shows network info when chain returns valid data", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            result: {
              node_info: {
                network: "clawchain-testnet",
                moniker: "test-node",
                version: "0.38.0",
                other: { n_peers: "5" },
              },
              sync_info: {
                latest_block_height: "12345",
                latest_block_time: "2026-03-09T12:00:00Z",
              },
            },
          }),
        });
      }
      if (url.includes("validators")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pagination: { total: "8" } }),
        });
      }
      return Promise.reject(new Error("not found"));
    });

    renderOperations();

    const user = userEvent.setup();
    await user.click(screen.getByText("Network"));

    await waitFor(() => {
      expect(screen.getByText("Network Overview")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("clawchain-testnet")).toBeInTheDocument();
    });

    expect(screen.getByText("test-node")).toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
  });

  // 13. Tab switching back to readiness works
  it("can switch back to Launch Readiness from another tab", async () => {
    mockFetch.mockRejectedValue(new Error("not connected"));

    renderOperations();

    const user = userEvent.setup();
    await user.click(screen.getByText("Service Health"));
    await user.click(screen.getByText("Launch Readiness"));

    expect(screen.getByText("Component Completion")).toBeInTheDocument();
  });
});
