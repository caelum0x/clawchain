import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Contracts from "../Contracts";

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

function renderContracts() {
  return render(
    <MemoryRouter>
      <Contracts />
    </MemoryRouter>,
  );
}

describe("Contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockRejectedValue(new Error("not connected"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Smart Contracts title and description", () => {
    renderContracts();
    expect(screen.getByText("Smart Contracts")).toBeInTheDocument();
    expect(
      screen.getByText(/Browse uploaded CosmWasm codes/),
    ).toBeInTheDocument();
  });

  it("shows three tab buttons", () => {
    renderContracts();
    const buttons = screen.getAllByRole("button");
    const tabLabels = buttons.map((b) => b.textContent);
    expect(tabLabels).toContain("Uploaded Codes");
    expect(tabLabels).toContain("Instances");
    expect(tabLabels).toContain("Query Contract");
  });

  it("shows loading state then empty message when no codes", async () => {
    renderContracts();

    await waitFor(() => {
      expect(
        screen.getByText(/No codes uploaded yet/),
      ).toBeInTheDocument();
    });
  });

  it("shows codes table when chain returns codes", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        code_infos: [
          { code_id: "1", creator: "claw1abc123def456", data_hash: "ABCDEF123456", instantiate_permission: { permission: "Everybody" } },
          { code_id: "2", creator: "claw1xyz789ghi012", data_hash: "789GHI012345", instantiate_permission: { permission: "OnlyAddress" } },
        ],
      }),
    });

    renderContracts();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    expect(screen.getByText("Everybody")).toBeInTheDocument();
    expect(screen.getByText("OnlyAddress")).toBeInTheDocument();
    expect(screen.getAllByText("View Instances").length).toBe(2);
  });

  it("switches to Query Contract tab", async () => {
    renderContracts();

    const user = userEvent.setup();
    await user.click(screen.getByText("Query Contract"));

    expect(screen.getByText("Contract Address")).toBeInTheDocument();
    expect(screen.getByText("Query Message (JSON)")).toBeInTheDocument();
    expect(screen.getByText("Execute Query")).toBeInTheDocument();
  });

  it("shows CosmWasm info section with runtime details", () => {
    renderContracts();
    expect(screen.getByText("CosmWasm on ClawChain")).toBeInTheDocument();
    expect(screen.getByText("CosmWasm 2.2 / wasmvm 3.0")).toBeInTheDocument();
    expect(screen.getByText("Rust → WASM")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("shows error when querying without address", async () => {
    renderContracts();

    const user = userEvent.setup();
    await user.click(screen.getByText("Query Contract"));
    await user.click(screen.getByText("Execute Query"));

    expect(screen.getByText("Enter a contract address")).toBeInTheDocument();
  });

  it("shows error for invalid JSON query message", async () => {
    renderContracts();

    const user = userEvent.setup();
    await user.click(screen.getByText("Query Contract"));

    const addrInput = screen.getByPlaceholderText("claw1...");
    await user.type(addrInput, "claw1abc");

    const textarea = document.querySelector("textarea");
    expect(textarea).toBeTruthy();
    await user.clear(textarea!);
    await user.type(textarea!, "not json");

    await user.click(screen.getByText("Execute Query"));

    await waitFor(() => {
      expect(screen.getByText("Invalid JSON query message")).toBeInTheDocument();
    });
  });
});
