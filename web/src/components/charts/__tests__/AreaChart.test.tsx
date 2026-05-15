import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AreaChart from "../AreaChart";

describe("AreaChart", () => {
  const sampleData = [
    { label: "Mon", value: 10 },
    { label: "Tue", value: 25 },
    { label: "Wed", value: 18 },
    { label: "Thu", value: 32 },
    { label: "Fri", value: 27 },
  ];

  it("renders an SVG element", () => {
    const { container } = render(<AreaChart data={sampleData} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has data-testid area-chart", () => {
    render(<AreaChart data={sampleData} />);
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
  });

  it("has gradient fill path", () => {
    render(<AreaChart data={sampleData} />);
    const fillPath = screen.getByTestId("area-chart-fill");
    expect(fillPath).toBeInTheDocument();
    expect(fillPath.getAttribute("fill")).toMatch(/url\(#area-gradient-/);
  });

  it("has correct number of data points", () => {
    render(<AreaChart data={sampleData} />);
    const points = screen.getAllByTestId("area-chart-point");
    expect(points).toHaveLength(5);
  });

  it("renders line path element", () => {
    render(<AreaChart data={sampleData} />);
    const line = screen.getByTestId("area-chart-line");
    expect(line).toBeInTheDocument();
    expect(line.getAttribute("fill")).toBe("none");
  });

  it("handles empty data gracefully", () => {
    render(<AreaChart data={[]} />);
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("handles single data point", () => {
    render(<AreaChart data={[{ label: "Only", value: 42 }]} />);
    const points = screen.getAllByTestId("area-chart-point");
    expect(points).toHaveLength(1);
  });

  it("shows tooltip on hover", () => {
    const { container } = render(<AreaChart data={sampleData} />);
    const svg = container.querySelector("svg")!;

    // Simulate mouse move over the SVG
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 50 });

    const tooltip = container.querySelector('[data-testid="area-chart-tooltip"]');
    expect(tooltip).toBeInTheDocument();
  });

  it("hides tooltip on mouse leave", () => {
    const { container } = render(<AreaChart data={sampleData} />);
    const svg = container.querySelector("svg")!;

    fireEvent.mouseMove(svg, { clientX: 100, clientY: 50 });
    fireEvent.mouseLeave(svg);

    const tooltip = container.querySelector('[data-testid="area-chart-tooltip"]');
    expect(tooltip).not.toBeInTheDocument();
  });

  it("respects showGrid=false", () => {
    const { container } = render(
      <AreaChart data={sampleData} showGrid={false} />,
    );
    // With showGrid=false there should be no dashed grid lines
    const lines = container.querySelectorAll("line[stroke-dasharray]");
    expect(lines).toHaveLength(0);
  });

  it("applies custom color to line", () => {
    render(<AreaChart data={sampleData} color="#ff0000" />);
    const line = screen.getByTestId("area-chart-line");
    expect(line.getAttribute("stroke")).toBe("#ff0000");
  });

  it("renders a linearGradient in defs", () => {
    const { container } = render(<AreaChart data={sampleData} />);
    const gradient = container.querySelector("linearGradient");
    expect(gradient).toBeInTheDocument();
  });
});
