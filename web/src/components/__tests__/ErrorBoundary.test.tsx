import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ErrorBoundary from "../ErrorBoundary";

// Suppress console.error output from React error boundary logging
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function ProblemChild(): React.JSX.Element {
  throw new Error("Test error");
}

function GoodChild() {
  return <div data-testid="good-child">Everything is fine</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("good-child")).toBeInTheDocument();
    expect(screen.getByText("Everything is fine")).toBeInTheDocument();
  });

  it("shows error UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reload/i }),
    ).toBeInTheDocument();
  });

  it("shows ClawChain branding in error state", () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText("ClawChain")).toBeInTheDocument();
  });
});
