import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import NotFound from "../NotFound";

function renderNotFound() {
  return render(
    <MemoryRouter>
      <NotFound />
    </MemoryRouter>,
  );
}

describe("NotFound", () => {
  it("renders 404 message", () => {
    renderNotFound();

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(
      screen.getByText(/does not exist or has been moved/i),
    ).toBeInTheDocument();
  });

  it("has link back to home", () => {
    renderNotFound();

    const homeLink = screen.getByRole("link", { name: /back to home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
