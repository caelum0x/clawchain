import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ValidatorOracle from "../ValidatorOracle";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderValidatorOracle() {
  return render(
    <MemoryRouter>
      <ValidatorOracle />
    </MemoryRouter>,
  );
}

function mockAllEndpoints(overrides?: {
  feeder?: string;
  missCounter?: string;
  prevote?: { hash: string; voter: string; submit_block: string } | null;
  vote?: { exchange_rate_tuples: { denom: string; exchange_rate: string }[]; voter: string } | null;
}) {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ feeder_addr: overrides?.feeder ?? "claw1feeder123" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ miss_counter: overrides?.missCounter ?? "5" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aggregate_prevote: overrides?.prevote !== undefined
          ? overrides.prevote
          : { hash: "abc123", voter: "clawvaloper1test", submit_block: "100" },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aggregate_vote: overrides?.vote !== undefined
          ? overrides.vote
          : {
              exchange_rate_tuples: [{ denom: "uusd", exchange_rate: "1.25" }],
              voter: "clawvaloper1test",
            },
      }),
    });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ValidatorOracle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders page title and subtitle", () => {
    renderValidatorOracle();

    expect(screen.getByText("Validator Oracle")).toBeInTheDocument();
    expect(
      screen.getByText(/Monitor oracle voting health for a specific validator/),
    ).toBeInTheDocument();
  });

  it("renders input field and Load button", () => {
    renderValidatorOracle();

    expect(screen.getByPlaceholderText("clawvaloper1...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  });

  it("shows error when Load is clicked with empty input", async () => {
    renderValidatorOracle();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(screen.getByText("Please enter a validator address.")).toBeInTheDocument();
  });

  it("shows error when address does not start with clawvaloper", async () => {
    renderValidatorOracle();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("clawvaloper1..."), "cosmos1invalid");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(
      screen.getByText('Address must start with "clawvaloper".'),
    ).toBeInTheDocument();
  });

  it("shows loading state when fetching data", async () => {
    // Return pending promises so component stays in loading
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderValidatorOracle();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("clawvaloper1..."), "clawvaloper1test");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(screen.getByText("Loading validator oracle data...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
  });

  it("displays all oracle data after successful load", async () => {
    mockAllEndpoints();

    renderValidatorOracle();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("clawvaloper1..."), "clawvaloper1test");
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText("Oracle Health Score")).toBeInTheDocument();
    });

    // Health status should be Healthy (miss_counter = 5)
    expect(screen.getByText("Healthy")).toBeInTheDocument();

    // Feeder delegation
    expect(screen.getByText("Feeder Delegation")).toBeInTheDocument();
    expect(screen.getByText("claw1feeder123")).toBeInTheDocument();

    // Miss counter
    expect(screen.getByText("Miss Counter")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();

    // Prevote
    expect(screen.getByText("Current Prevote")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();

    // Vote
    expect(screen.getByText("Current Vote")).toBeInTheDocument();
    expect(screen.getByText("uusd")).toBeInTheDocument();
    expect(screen.getByText("1.25")).toBeInTheDocument();
  });

  it("shows Warning health status when miss counter is between 10 and 50", async () => {
    mockAllEndpoints({ missCounter: "25" });

    renderValidatorOracle();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("clawvaloper1..."), "clawvaloper1test");
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText("Warning")).toBeInTheDocument();
    });

    // High Misses badge should appear (> 20)
    expect(screen.getByText("High Misses")).toBeInTheDocument();
  });

  it("shows Critical health status when miss counter exceeds 50", async () => {
    mockAllEndpoints({ missCounter: "75" });

    renderValidatorOracle();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("clawvaloper1..."), "clawvaloper1test");
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });

    expect(screen.getByText("High Misses")).toBeInTheDocument();
  });

  it("shows fallback messages when prevote and vote are null", async () => {
    mockAllEndpoints({ prevote: null, vote: null });

    renderValidatorOracle();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("clawvaloper1..."), "clawvaloper1test");
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText("No pending prevote found.")).toBeInTheDocument();
    });

    expect(screen.getByText("No aggregate vote found.")).toBeInTheDocument();
  });
});
