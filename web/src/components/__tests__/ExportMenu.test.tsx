import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ExportMenu from "../ExportMenu";

// Mock the export utilities
vi.mock("../../lib/export", () => ({
  exportToCSV: vi.fn(),
  exportToJSON: vi.fn(),
}));

describe("ExportMenu", () => {
  const sampleData = [
    { name: "Alice", score: "90" },
    { name: "Bob", score: "85" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the export button", () => {
    render(<ExportMenu data={sampleData} filename="test" />);
    const btn = screen.getByRole("button", { name: "Export" });
    expect(btn).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    render(<ExportMenu data={sampleData} filename="test" />);
    const user = userEvent.setup();

    // Dropdown should not be visible initially
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Click the export button
    await user.click(screen.getByRole("button", { name: "Export" }));

    // Dropdown should now be visible
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("has CSV and JSON options in the dropdown", async () => {
    render(<ExportMenu data={sampleData} filename="test" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByRole("menuitem", { name: "Export CSV" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export JSON" })).toBeInTheDocument();
  });

  it("calls exportToCSV when CSV option is clicked", async () => {
    const { exportToCSV } = await import("../../lib/export");
    render(<ExportMenu data={sampleData} filename="report" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export CSV" }));

    expect(exportToCSV).toHaveBeenCalledWith(sampleData, "report");
  });

  it("calls exportToJSON when JSON option is clicked", async () => {
    const { exportToJSON } = await import("../../lib/export");
    render(<ExportMenu data={sampleData} filename="report" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export JSON" }));

    expect(exportToJSON).toHaveBeenCalledWith(sampleData, "report");
  });

  it("closes dropdown after selecting an option", async () => {
    render(<ExportMenu data={sampleData} filename="test" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Export CSV" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
