import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LineChart from "../LineChart";

describe("LineChart", () => {
  const sampleData = [
    { label: "A", value: 10 },
    { label: "B", value: 20 },
    { label: "C", value: 30 },
    { label: "D", value: 15 },
  ];

  it("renders SVG with correct number of points", () => {
    render(<LineChart data={sampleData} title="Test Line" />);
    const points = screen.getAllByTestId("line-chart-point");
    expect(points).toHaveLength(4);
  });

  it("renders title when provided", () => {
    render(<LineChart data={sampleData} title="My Line Chart" />);
    expect(screen.getByText("My Line Chart")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<LineChart data={[]} title="Empty Chart" />);
    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders an SVG element", () => {
    const { container } = render(<LineChart data={sampleData} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a polyline element", () => {
    const { container } = render(<LineChart data={sampleData} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeInTheDocument();
  });

  it("renders without title", () => {
    const { container } = render(<LineChart data={sampleData} />);
    expect(container.querySelector("h4")).not.toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    const { container } = render(
      <LineChart data={sampleData} title="Revenue" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Revenue");
  });

  it("uses default aria-label when no title", () => {
    const { container } = render(<LineChart data={sampleData} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Line chart");
  });
});
