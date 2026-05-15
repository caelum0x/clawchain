import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import DonutChart from "../DonutChart";

describe("DonutChart", () => {
  const sampleData = [
    { label: "Bonded", value: 60, color: "#22c55e" },
    { label: "Unbonded", value: 30, color: "#eab308" },
    { label: "Pool", value: 10, color: "#6366f1" },
  ];

  it("renders legend items for each data point", () => {
    render(<DonutChart data={sampleData} title="Supply" />);
    const legendItems = screen.getAllByTestId("donut-legend-item");
    expect(legendItems).toHaveLength(3);
  });

  it("renders title when provided", () => {
    render(<DonutChart data={sampleData} title="Donut Title" />);
    expect(screen.getByText("Donut Title")).toBeInTheDocument();
  });

  it("shows total in center", () => {
    const data = [
      { label: "A", value: 40, color: "#ff0000" },
      { label: "B", value: 60, color: "#00ff00" },
    ];
    render(<DonutChart data={data} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<DonutChart data={[]} title="Empty Donut" />);
    expect(screen.getByText("Empty Donut")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders donut segments", () => {
    render(<DonutChart data={sampleData} />);
    const segments = screen.getAllByTestId("donut-segment");
    expect(segments).toHaveLength(3);
  });

  it("shows percentages in legend", () => {
    const data = [
      { label: "Alpha", value: 75, color: "#aaa" },
      { label: "Beta", value: 25, color: "#bbb" },
    ];
    render(<DonutChart data={data} />);
    expect(screen.getByText(/Alpha: 75.0%/)).toBeInTheDocument();
    expect(screen.getByText(/Beta: 25.0%/)).toBeInTheDocument();
  });

  it("renders an SVG element", () => {
    const { container } = render(<DonutChart data={sampleData} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    const { container } = render(
      <DonutChart data={sampleData} title="Token Distribution" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Token Distribution");
  });

  it("handles zero-total data", () => {
    const data = [
      { label: "A", value: 0, color: "#aaa" },
      { label: "B", value: 0, color: "#bbb" },
    ];
    render(<DonutChart data={data} title="Zero Total" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });
});
