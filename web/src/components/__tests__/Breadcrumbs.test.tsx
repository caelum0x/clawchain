import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import Breadcrumbs from "../Breadcrumbs";

function renderBreadcrumbs(items: Array<{ label: string; to?: string }>) {
  return render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>
  );
}

describe("Breadcrumbs", () => {
  it("renders Home link always", () => {
    renderBreadcrumbs([]);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders separator between items", () => {
    renderBreadcrumbs([{ label: "Explorer", to: "/explorer" }, { label: "Block #1" }]);
    const separators = screen.getAllByText(">");
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });

  it("last item is not a link and has aria-current", () => {
    renderBreadcrumbs([{ label: "Explorer", to: "/explorer" }, { label: "Block #1" }]);
    const lastItem = screen.getByText("Block #1");
    expect(lastItem.getAttribute("aria-current")).toBe("page");
    expect(lastItem.tagName).toBe("SPAN");
  });

  it("middle items are links", () => {
    renderBreadcrumbs([{ label: "Explorer", to: "/explorer" }, { label: "Block #1" }]);
    const link = screen.getByText("Explorer");
    expect(link.closest("a")).toBeTruthy();
  });

  it("empty items array shows just Home", () => {
    renderBreadcrumbs([]);
    const homeEl = screen.getByText("Home");
    expect(homeEl.getAttribute("aria-current")).toBe("page");
  });

  it("has breadcrumb nav landmark", () => {
    renderBreadcrumbs([{ label: "Test" }]);
    expect(screen.getByLabelText("Breadcrumb")).toBeInTheDocument();
  });
});
