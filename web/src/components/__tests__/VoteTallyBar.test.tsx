import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import VoteTallyBar from "../VoteTallyBar";

describe("VoteTallyBar", () => {
  it("shows 'No votes yet' when all tally values are zero", () => {
    render(
      <VoteTallyBar tally={{ yes: 0, no: 0, abstain: 0, noWithVeto: 0 }} />,
    );
    expect(screen.getByText("No votes yet")).toBeInTheDocument();
  });

  it("renders the stacked bar with correct aria label", () => {
    render(
      <VoteTallyBar tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }} />,
    );
    const bar = screen.getByRole("img");
    expect(bar).toHaveAttribute(
      "aria-label",
      expect.stringContaining("74.1% Yes"),
    );
    expect(bar).toHaveAttribute(
      "aria-label",
      expect.stringContaining("14.8% No"),
    );
  });

  it("renders all four segments when all values are non-zero", () => {
    render(
      <VoteTallyBar tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }} />,
    );
    expect(screen.getByTestId("tally-yes")).toBeInTheDocument();
    expect(screen.getByTestId("tally-no")).toBeInTheDocument();
    expect(screen.getByTestId("tally-abstain")).toBeInTheDocument();
    expect(screen.getByTestId("tally-veto")).toBeInTheDocument();
  });

  it("omits segments with zero value", () => {
    render(
      <VoteTallyBar tally={{ yes: 100, no: 0, abstain: 0, noWithVeto: 0 }} />,
    );
    expect(screen.getByTestId("tally-yes")).toBeInTheDocument();
    expect(screen.queryByTestId("tally-no")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tally-abstain")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tally-veto")).not.toBeInTheDocument();
  });

  it("shows legend by default in non-compact mode", () => {
    render(
      <VoteTallyBar tally={{ yes: 300, no: 100, abstain: 50, noWithVeto: 50 }} />,
    );
    // Legend items contain these labels
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Abstain")).toBeInTheDocument();
    expect(screen.getByText("No With Veto")).toBeInTheDocument();
  });

  it("hides legend when showLegend is false", () => {
    render(
      <VoteTallyBar
        tally={{ yes: 300, no: 100, abstain: 50, noWithVeto: 50 }}
        showLegend={false}
      />,
    );
    // Legend labels should not appear (the bar segment titles still exist)
    expect(screen.queryByText("60.0%")).not.toBeInTheDocument();
  });

  it("shows quorum and pass status by default", () => {
    render(
      <VoteTallyBar tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }} />,
    );
    expect(screen.getByText("Quorum reached")).toBeInTheDocument();
    expect(screen.getByText(/Pass ratio/)).toBeInTheDocument();
    expect(screen.getByText(/passing/)).toBeInTheDocument();
  });

  it("shows quorum not reached when totalBonded is provided and votes are low", () => {
    render(
      <VoteTallyBar
        tally={{ yes: 10, no: 5, abstain: 2, noWithVeto: 1 }}
        totalBonded={10000}
        quorumThreshold={0.334}
      />,
    );
    expect(screen.getByText(/Quorum not reached/)).toBeInTheDocument();
  });

  it("shows quorum line when totalBonded is provided", () => {
    render(
      <VoteTallyBar
        tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }}
        totalBonded={2000}
      />,
    );
    expect(screen.getByTestId("quorum-line")).toBeInTheDocument();
    expect(screen.getByText(/33.4% quorum/)).toBeInTheDocument();
  });

  it("does not show quorum line when totalBonded is not provided", () => {
    render(
      <VoteTallyBar tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }} />,
    );
    expect(screen.queryByTestId("quorum-line")).not.toBeInTheDocument();
  });

  it("hides status text when showStatus is false", () => {
    render(
      <VoteTallyBar
        tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }}
        showStatus={false}
      />,
    );
    expect(screen.queryByText("Quorum reached")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pass ratio/)).not.toBeInTheDocument();
  });

  it("shows not passing when no votes exceed yes votes", () => {
    render(
      <VoteTallyBar tally={{ yes: 100, no: 500, abstain: 50, noWithVeto: 25 }} />,
    );
    expect(screen.getByText(/not passing/)).toBeInTheDocument();
  });

  it("renders compact mode with thin bar and percentage text", () => {
    render(
      <VoteTallyBar
        tally={{ yes: 500, no: 100, abstain: 50, noWithVeto: 25 }}
        compact
      />,
    );
    // Compact shows percentage text
    expect(screen.getByText(/74% Yes/)).toBeInTheDocument();
    // Should not show legend or status in compact mode
    expect(screen.queryByText("Quorum reached")).not.toBeInTheDocument();
  });

  it("has correct testid on wrapper", () => {
    render(
      <VoteTallyBar tally={{ yes: 100, no: 0, abstain: 0, noWithVeto: 0 }} />,
    );
    expect(screen.getByTestId("vote-tally-bar")).toBeInTheDocument();
  });
});
