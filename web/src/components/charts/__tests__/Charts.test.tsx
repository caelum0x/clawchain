import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LineChart from "../LineChart";
import BarChart from "../BarChart";
import DonutChart from "../DonutChart";
import StatCard from "../StatCard";

describe("LineChart", () => {
  it("renders SVG with correct number of points", () => {
    const data = [
      { label: "A", value: 10 },
      { label: "B", value: 20 },
      { label: "C", value: 30 },
      { label: "D", value: 15 },
    ];
    render(<LineChart data={data} title="Test Line" />);
    const points = screen.getAllByTestId("line-chart-point");
    expect(points).toHaveLength(4);
  });

  it("renders title when provided", () => {
    const data = [{ label: "X", value: 5 }];
    render(<LineChart data={data} title="My Line Chart" />);
    expect(screen.getByText("My Line Chart")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<LineChart data={[]} title="Empty Chart" />);
    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders an SVG element", () => {
    const data = [
      { label: "A", value: 10 },
      { label: "B", value: 20 },
    ];
    const { container } = render(<LineChart data={data} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});

describe("BarChart", () => {
  it("renders correct number of bars", () => {
    const data = [
      { label: "Jan", value: 100 },
      { label: "Feb", value: 200 },
      { label: "Mar", value: 150 },
    ];
    render(<BarChart data={data} title="Test Bar" />);
    const bars = screen.getAllByTestId("bar-chart-bar");
    expect(bars).toHaveLength(3);
  });

  it("renders title when provided", () => {
    const data = [{ label: "Q1", value: 50 }];
    render(<BarChart data={data} title="Quarterly Revenue" />);
    expect(screen.getByText("Quarterly Revenue")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<BarChart data={[]} title="No Bars" />);
    expect(screen.getByText("No Bars")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders an SVG element with bars", () => {
    const data = [
      { label: "A", value: 10 },
      { label: "B", value: 20 },
    ];
    const { container } = render(<BarChart data={data} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});

describe("DonutChart", () => {
  it("renders legend items for each data point", () => {
    const data = [
      { label: "Bonded", value: 60, color: "#22c55e" },
      { label: "Unbonded", value: 30, color: "#eab308" },
      { label: "Pool", value: 10, color: "#6366f1" },
    ];
    render(<DonutChart data={data} title="Supply" />);
    const legendItems = screen.getAllByTestId("donut-legend-item");
    expect(legendItems).toHaveLength(3);
  });

  it("renders title when provided", () => {
    const data = [{ label: "Test", value: 100, color: "#ff0000" }];
    render(<DonutChart data={data} title="Donut Title" />);
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
    const data = [
      { label: "X", value: 50, color: "#aaa" },
      { label: "Y", value: 50, color: "#bbb" },
    ];
    render(<DonutChart data={data} />);
    const segments = screen.getAllByTestId("donut-segment");
    expect(segments).toHaveLength(2);
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
});

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
});
