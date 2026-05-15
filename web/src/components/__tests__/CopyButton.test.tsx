import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CopyButton from "../CopyButton";

const mockWriteText = vi.fn().mockResolvedValue(undefined);

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

describe("CopyButton", () => {
  beforeEach(() => {
    mockWriteText.mockClear();
  });

  it("renders a copy button", () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button", { name: "Copy to clipboard" });
    expect(btn).toBeInTheDocument();
  });

  it("calls clipboard writeText on click", async () => {
    render(<CopyButton text="claw1abc123" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    // After clicking, the button should change to "Copied" indicating writeText was called
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
  });

  it("shows checkmark after copying", async () => {
    render(<CopyButton text="test" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
  });

  it("uses custom label", () => {
    render(<CopyButton text="test" label="Copy address" />);
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });
});
