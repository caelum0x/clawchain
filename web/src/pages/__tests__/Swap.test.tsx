import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Swap from "../Swap";

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

function renderSwap() {
  return render(
    <MemoryRouter>
      <Swap />
    </MemoryRouter>,
  );
}

describe("Swap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockRejectedValue(new Error("not connected"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ClawDEX title and description", () => {
    renderSwap();
    expect(screen.getByText("ClawDEX")).toBeInTheDocument();
    expect(
      screen.getByText(/Decentralized exchange for the ClawChain ecosystem/),
    ).toBeInTheDocument();
  });

  it("shows Swap Tokens card", () => {
    renderSwap();
    expect(screen.getByText("Swap Tokens")).toBeInTheDocument();
    expect(screen.getByText("Open ClawDEX App →")).toBeInTheDocument();
  });

  it("shows Manage Liquidity card", () => {
    renderSwap();
    expect(screen.getByText("Manage Liquidity")).toBeInTheDocument();
    expect(screen.getByText("Browse Pools →")).toBeInTheDocument();
  });

  it("shows Pool Stats card with loading then empty state", async () => {
    renderSwap();

    await waitFor(() => {
      expect(
        screen.getByText(/No liquidity pools found/),
      ).toBeInTheDocument();
    });
  });

  it("shows About ClawDEX section with pool type info", () => {
    renderSwap();
    expect(screen.getByText("About ClawDEX")).toBeInTheDocument();
    expect(screen.getByText(/Astroport/)).toBeInTheDocument();
    expect(screen.getByText("XYK, Stable, Concentrated")).toBeInTheDocument();
    expect(screen.getByText("0.3%")).toBeInTheDocument();
    expect(screen.getByText("7 (multi-hop)")).toBeInTheDocument();
  });

  it("all external links have noopener noreferrer", () => {
    renderSwap();
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      if (link.getAttribute("target") === "_blank") {
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    });
  });

  it("shows pool count when pools are found", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/cosmwasm/wasm/v1/code?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code_infos: [{ code_id: "1" }],
          }),
        });
      }
      if (url.includes("/code/1/contracts")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            contracts: ["claw1pool_contract"],
          }),
        });
      }
      if (url.includes("/smart/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              assets: [
                { info: { native_token: { denom: "uclaw" } }, amount: "5000000" },
                { info: { native_token: { denom: "uatom" } }, amount: "3000000" },
              ],
              total_share: "4000000",
            },
          }),
        });
      }
      return Promise.reject(new Error("not found"));
    });

    renderSwap();

    await waitFor(() => {
      expect(screen.getByText(/active pool/)).toBeInTheDocument();
    });
  });
});
