import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import BarChart from "../BarChart";

describe("BarChart", () => {
  const sampleData = [
    { label: "Jan", value: 100 },
    { label: "Feb", value: 200 },
    { label: "Mar", value: 150 },
  ];

  it("renders correct number of bars", () => {
    render(<BarChart data={sampleData} title="Test Bar" />);
    const bars = screen.getAllByTestId("bar-chart-bar");
    expect(bars).toHaveLength(3);
  });

  it("renders title when provided", () => {
    render(<BarChart data={sampleData} title="Quarterly Revenue" />);
    expect(screen.getByText("Quarterly Revenue")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<BarChart data={[]} title="No Bars" />);
    expect(screen.getByText("No Bars")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders an SVG element with bars", () => {
    const { container } = render(<BarChart data={sampleData} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(0);
  });

  it("renders without title", () => {
    const { container } = render(<BarChart data={sampleData} />);
    expect(container.querySelector("h4")).not.toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    const { container } = render(
      <BarChart data={sampleData} title="Sales" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Sales");
  });

  it("uses default aria-label when no title", () => {
    const { container } = render(<BarChart data={sampleData} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Bar chart");
  });

  it("applies custom bar colors", () => {
    const coloredData = [
      { label: "A", value: 50, color: "#ff0000" },
      { label: "B", value: 75, color: "#00ff00" },
    ];
    const { container } = render(<BarChart data={coloredData} />);
    const rects = container.querySelectorAll("rect");
    // At least some rects should use the custom colors
    const fills = Array.from(rects).map((r) => r.getAttribute("fill"));
    expect(fills).toContain("#ff0000");
    expect(fills).toContain("#00ff00");
  });
});
