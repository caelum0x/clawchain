import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import DepositProgress from "../DepositProgress";

describe("DepositProgress", () => {
  it("shows 'Minimum deposit met' when current >= required", () => {
    render(
      <DepositProgress currentAmount={150_000_000} requiredAmount={100_000_000} />,
    );
    expect(screen.getByTestId("deposit-status")).toHaveTextContent(
      "Minimum deposit met",
    );
  });

  it("shows percentage when deposit is below minimum", () => {
    render(
      <DepositProgress currentAmount={50_000_000} requiredAmount={100_000_000} />,
    );
    expect(screen.getByTestId("deposit-status")).toHaveTextContent(
      "50.0% of minimum deposit",
    );
  });

  it("displays current and required amounts using default formatter", () => {
    render(
      <DepositProgress currentAmount={75_000_000} requiredAmount={100_000_000} />,
    );
    expect(screen.getByTestId("deposit-current")).toHaveTextContent(
      "Current: 75 CLAW",
    );
    expect(screen.getByTestId("deposit-required")).toHaveTextContent(
      "Required: 100 CLAW",
    );
  });

  it("uses custom formatAmount when provided", () => {
    const customFormat = (amount: string) => `${amount} tokens`;
    render(
      <DepositProgress
        currentAmount={50}
        requiredAmount={100}
        formatAmount={customFormat}
      />,
    );
    expect(screen.getByTestId("deposit-current")).toHaveTextContent(
      "Current: 50 tokens",
    );
    expect(screen.getByTestId("deposit-required")).toHaveTextContent(
      "Required: 100 tokens",
    );
  });

  it("renders progressbar with correct aria attributes", () => {
    render(
      <DepositProgress currentAmount={25_000_000} requiredAmount={100_000_000} />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-label", "Deposit progress");
  });

  it("clamps progress bar at 100% when over-deposited", () => {
    render(
      <DepositProgress currentAmount={200_000_000} requiredAmount={100_000_000} />,
    );
    const bar = screen.getByRole("progressbar");
    // aria-valuenow should be capped at 100
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByTestId("deposit-status")).toHaveTextContent(
      "Minimum deposit met",
    );
  });

  it("handles zero required amount gracefully", () => {
    render(
      <DepositProgress currentAmount={100} requiredAmount={0} />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("handles zero current amount", () => {
    render(
      <DepositProgress currentAmount={0} requiredAmount={100_000_000} />,
    );
    expect(screen.getByTestId("deposit-status")).toHaveTextContent(
      "0.0% of minimum deposit",
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("has correct testid on wrapper", () => {
    render(
      <DepositProgress currentAmount={0} requiredAmount={100} />,
    );
    expect(screen.getByTestId("deposit-progress")).toBeInTheDocument();
  });

  it("applies green color when deposit is met", () => {
    render(
      <DepositProgress currentAmount={100_000_000} requiredAmount={100_000_000} />,
    );
    const fill = screen.getByTestId("deposit-bar-fill");
    // jsdom normalizes hex to rgb
    expect(fill.style.background).toBe("rgb(34, 197, 94)");
  });

  it("applies yellow color when deposit is not met", () => {
    render(
      <DepositProgress currentAmount={30_000_000} requiredAmount={100_000_000} />,
    );
    const fill = screen.getByTestId("deposit-bar-fill");
    // jsdom normalizes hex to rgb
    expect(fill.style.background).toBe("rgb(234, 179, 8)");
  });
});
