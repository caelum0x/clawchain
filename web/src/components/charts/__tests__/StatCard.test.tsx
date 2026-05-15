import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import StatCard from "../StatCard";

describe("StatCard", () => {
  it("renders title and value", () => {
    render(<StatCard title="Total Users" value={1234} />);
    expect(screen.getByTestId("stat-title")).toHaveTextContent("Total Users");
    expect(screen.getByTestId("stat-value")).toHaveTextContent("1234");
  });

  it("renders string value", () => {
    render(<StatCard title="Status" value="Active" />);
    expect(screen.getByTestId("stat-value")).toHaveTextContent("Active");
  });

  it("renders subtitle when provided", () => {
    render(<StatCard title="CPU" value="87%" subtitle="Last 5 minutes" />);
    expect(screen.getByText("Last 5 minutes")).toBeInTheDocument();
  });

  it("renders up trend indicator", () => {
    render(
      <StatCard title="Revenue" value="$50K" trend="up" trendValue="+12%" />,
    );
    expect(screen.getByText(/\+12%/)).toBeInTheDocument();
  });

  it("renders down trend indicator", () => {
    render(
      <StatCard title="Errors" value={42} trend="down" trendValue="-5%" />,
    );
    expect(screen.getByText(/-5%/)).toBeInTheDocument();
  });

  it("renders without trend when not provided", () => {
    const { container } = render(<StatCard title="Simple" value={99} />);
    expect(container.querySelector(".stat-trend")).not.toBeInTheDocument();
  });

  it("has data-testid stat-card", () => {
    render(<StatCard title="Test" value={0} />);
    expect(screen.getByTestId("stat-card")).toBeInTheDocument();
  });

  it("renders flat trend indicator", () => {
    render(
      <StatCard title="Stable" value="100" trend="flat" trendValue="0%" />,
    );
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  it("renders without subtitle when not provided", () => {
    const { container } = render(<StatCard title="X" value={1} />);
    // The subtitle div should not exist
    const divs = container.querySelectorAll("div");
    const subtitleDiv = Array.from(divs).find(
      (d) => d.style.fontSize === "0.8rem",
    );
    expect(subtitleDiv).toBeUndefined();
  });
});
