import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MiniSparkline from "../MiniSparkline";

describe("MiniSparkline", () => {
  const sampleValues = [5, 12, 8, 20, 15, 22, 18];

  it("renders an SVG element", () => {
    const { container } = render(<MiniSparkline values={sampleValues} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has data-testid sparkline", () => {
    render(<MiniSparkline values={sampleValues} />);
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
  });

  it("has polyline element", () => {
    render(<MiniSparkline values={sampleValues} />);
    const line = screen.getByTestId("sparkline-line");
    expect(line).toBeInTheDocument();
    expect(line.tagName.toLowerCase()).toBe("polyline");
  });

  it("accepts custom width and height", () => {
    render(<MiniSparkline values={sampleValues} width={120} height={40} />);
    const svg = screen.getByTestId("sparkline");
    expect(svg.getAttribute("width")).toBe("120");
    expect(svg.getAttribute("height")).toBe("40");
    expect(svg.getAttribute("viewBox")).toBe("0 0 120 40");
  });

  it("uses default width=80 and height=24", () => {
    render(<MiniSparkline values={sampleValues} />);
    const svg = screen.getByTestId("sparkline");
    expect(svg.getAttribute("width")).toBe("80");
    expect(svg.getAttribute("height")).toBe("24");
  });

  it("accepts custom color", () => {
    render(<MiniSparkline values={sampleValues} color="#ff6600" />);
    const line = screen.getByTestId("sparkline-line");
    expect(line.getAttribute("stroke")).toBe("#ff6600");
  });

  it("handles empty values array", () => {
    render(<MiniSparkline values={[]} />);
    const svg = screen.getByTestId("sparkline");
    expect(svg).toBeInTheDocument();
    // No polyline should be rendered for empty data
    expect(svg.querySelector("polyline")).not.toBeInTheDocument();
  });

  it("handles single value", () => {
    render(<MiniSparkline values={[42]} />);
    const line = screen.getByTestId("sparkline-line");
    expect(line).toBeInTheDocument();
    // Points should contain a single coordinate
    const points = line.getAttribute("points") || "";
    expect(points.split(" ")).toHaveLength(1);
  });

  it("renders without labels or axes", () => {
    const { container } = render(<MiniSparkline values={sampleValues} />);
    // No text elements should be present
    const texts = container.querySelectorAll("text");
    expect(texts).toHaveLength(0);
  });

  it("polyline has correct number of coordinate pairs", () => {
    render(<MiniSparkline values={sampleValues} />);
    const line = screen.getByTestId("sparkline-line");
    const points = (line.getAttribute("points") || "").split(" ");
    expect(points).toHaveLength(sampleValues.length);
  });
});
