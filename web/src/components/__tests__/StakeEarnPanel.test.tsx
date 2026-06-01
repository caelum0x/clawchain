import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StakeEarnPanel, { type StakeEarnAction } from "../StakeEarnPanel";

vi.mock("../../lib/model-vault.ts", async () => {
  const actual = await vi.importActual<typeof import("../../lib/model-vault.ts")>(
    "../../lib/model-vault.ts",
  );
  return {
    ...actual,
    // keep the real (pure) builders + formatters, mock only the network queries
    getVaultPoolInfo: vi.fn(),
    getVaultStakeInfo: vi.fn(),
  };
});

const vaultMod = await import("../../lib/model-vault.ts");
const getVaultPoolInfo = vaultMod.getVaultPoolInfo as ReturnType<typeof vi.fn>;
const getVaultStakeInfo = vaultMod.getVaultStakeInfo as ReturnType<typeof vi.fn>;

const VAULT = "claw1vault00000000000000000000000000000000000";
const MODEL_DENOM = "factory/claw1issuer/opus_4_8";
const USER = "claw1user0000000000000000000000000000000000";

function renderPanel(
  props: Partial<React.ComponentProps<typeof StakeEarnPanel>> = {},
) {
  const onAction = vi.fn();
  render(
    <StakeEarnPanel
      vaultAddress={VAULT}
      modelDenom={MODEL_DENOM}
      modelSymbol="OPUS_4_8"
      address={USER}
      onAction={onAction}
      {...props}
    />,
  );
  return { onAction };
}

describe("StakeEarnPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVaultPoolInfo.mockResolvedValue({
      total_staked: "5000000",
      reward_per_token_stored: "500000000000000000", // 0.5 * 1e18
    });
    getVaultStakeInfo.mockResolvedValue({ staked: "2000000", claimable: "750000" });
  });

  it("renders pool + stake stats from queried data", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("stake-stat-total")).toBeInTheDocument();
    });

    // total_staked 5000000 -> 5
    expect(screen.getByTestId("stake-stat-total").querySelector(".value")?.textContent).toBe(
      "5",
    );
    // reward index 0.5 * 1e18 -> 0.5
    expect(screen.getByTestId("stake-stat-index").querySelector(".value")?.textContent).toBe(
      "0.5",
    );
    // user staked 2000000 -> 2
    expect(screen.getByTestId("stake-stat-staked").querySelector(".value")?.textContent).toBe(
      "2",
    );
    // claimable 750000 -> 0.75
    expect(
      screen.getByTestId("stake-stat-claimable").querySelector(".value")?.textContent,
    ).toBe("0.75");
  });

  it("does not query stake_info and shows placeholders when no address", async () => {
    renderPanel({ address: null });

    await waitFor(() => {
      expect(screen.getByTestId("stake-connect-hint")).toBeInTheDocument();
    });
    expect(getVaultStakeInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId("stake-stat-staked").querySelector(".value")?.textContent).toBe(
      "--",
    );
    expect((screen.getByTestId("stake-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("emits a snake_case stake{} action with model_denom funds", async () => {
    const { onAction } = renderPanel();
    await waitFor(() => screen.getByTestId("stake-amount-input"));

    await userEvent.type(screen.getByTestId("stake-amount-input"), "2.5");
    fireEvent.click(screen.getByTestId("stake-btn"));

    expect(onAction).toHaveBeenCalledWith({
      contract: VAULT,
      msg: { stake: {} },
      funds: [{ denom: MODEL_DENOM, amount: "2500000" }],
    } satisfies StakeEarnAction);
  });

  it("emits a snake_case unstake{amount} action with no funds", async () => {
    const { onAction } = renderPanel();
    await waitFor(() => screen.getByTestId("stake-amount-input"));

    await userEvent.type(screen.getByTestId("stake-amount-input"), "1");
    fireEvent.click(screen.getByTestId("unstake-btn"));

    expect(onAction).toHaveBeenCalledWith({
      contract: VAULT,
      msg: { unstake: { amount: "1000000" } },
      funds: [],
    });
  });

  it("emits a snake_case claim_rewards{} action", async () => {
    const { onAction } = renderPanel();
    await waitFor(() => screen.getByTestId("claim-btn"));

    fireEvent.click(screen.getByTestId("claim-btn"));

    expect(onAction).toHaveBeenCalledWith({
      contract: VAULT,
      msg: { claim_rewards: {} },
      funds: [],
    });
  });

  it("rejects non-positive amounts with a validation error and does not emit", async () => {
    const { onAction } = renderPanel();
    await waitFor(() => screen.getByTestId("stake-amount-input"));

    await userEvent.type(screen.getByTestId("stake-amount-input"), "0");
    fireEvent.click(screen.getByTestId("stake-btn"));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("stake-form-error").textContent).toMatch(/greater than zero/i);
  });

  it("shows an error state when the pool query fails", async () => {
    getVaultPoolInfo.mockRejectedValue(new Error("rpc down"));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("stake-earn-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/rpc down/)).toBeInTheDocument();
  });
});
