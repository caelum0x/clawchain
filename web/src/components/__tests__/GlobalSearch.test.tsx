import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GlobalSearch from "../GlobalSearch";

// Track navigations
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  );
}

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input", () => {
    renderSearch();
    expect(screen.getByLabelText("Global search")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/search blocks/i)
    ).toBeInTheDocument();
  });

  it("shows dropdown on typing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        validators: [
          {
            description: { moniker: "TestValidator" },
            operator_address: "clawvaloper1abc123def456ghi789",
          },
        ],
        agents: [],
      }),
    });

    renderSearch();
    const input = screen.getByLabelText("Global search");

    await user.type(input, "Test");
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });

  it("navigates to block on block height input", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        block: {
          header: { height: "42", time: "2026-03-07T00:00:00Z" },
        },
      }),
    });

    renderSearch();
    const input = screen.getByLabelText("Global search");

    await user.type(input, "42");
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Block #42")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Block #42"));
    expect(mockNavigate).toHaveBeenCalledWith("/explorer/block/42");
  });

  it("navigates to tx on hash input", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const txHash =
      "AABBCCDDEE112233445566778899AABBCCDDEEFF0011223344556677889900AB";

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        tx_response: {
          txhash: txHash,
          height: "100",
        },
      }),
    });

    renderSearch();
    const input = screen.getByLabelText("Global search");

    await user.type(input, txHash);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText(/AABBCCDD/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/AABBCCDD/));
    expect(mockNavigate).toHaveBeenCalledWith(`/explorer/tx/${txHash}`);
  });

  it("navigates to account on claw1 address input", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const address = "claw1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu";

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        account: {
          address,
          account_number: "5",
          sequence: "1",
        },
      }),
    });

    renderSearch();
    const input = screen.getByLabelText("Global search");

    await user.type(input, address);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Account")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Account"));
    expect(mockNavigate).toHaveBeenCalledWith(
      `/explorer/account/${address}`
    );
  });

  it("closes dropdown on escape", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        block: {
          header: { height: "10", time: "2026-03-07T00:00:00Z" },
        },
      }),
    });

    renderSearch();
    const input = screen.getByLabelText("Global search");

    await user.type(input, "10");
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows no results message", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    });

    renderSearch();
    const input = screen.getByLabelText("Global search");

    await user.type(input, "nonexistent_query_xyz");
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });
});
