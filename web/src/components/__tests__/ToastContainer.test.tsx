import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ToastContainer from "../ToastContainer";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockRemoveToast = vi.fn();
let mockToasts: Array<{
  id: string;
  type: "success" | "error" | "info" | "warning" | "loading";
  title: string;
  message?: string;
  txHash?: string;
  duration?: number;
}> = [];

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    toasts: mockToasts,
    removeToast: mockRemoveToast,
  }),
}));

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToasts = [];
  });

  it("renders empty container when no toasts", () => {
    render(<ToastContainer />);
    const container = screen.getByRole("status");
    expect(container).toBeInTheDocument();
    expect(container.children).toHaveLength(0);
  });

  it("renders a success toast", () => {
    mockToasts = [{ id: "t1", type: "success", title: "Transaction Sent" }];
    render(<ToastContainer />);
    expect(screen.getByText("Transaction Sent")).toBeInTheDocument();
  });

  it("renders an error toast with message", () => {
    mockToasts = [
      {
        id: "t1",
        type: "error",
        title: "Failed",
        message: "Insufficient balance",
      },
    ];
    render(<ToastContainer />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
  });

  it("renders tx hash link when txHash provided", () => {
    mockToasts = [
      { id: "t1", type: "success", title: "Sent", txHash: "ABC123DEF" },
    ];
    render(<ToastContainer />);
    const link = screen.getByText("View Tx");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/explorer/tx/ABC123DEF");
  });

  it("renders multiple toasts", () => {
    mockToasts = [
      { id: "t1", type: "success", title: "Toast One" },
      { id: "t2", type: "error", title: "Toast Two" },
      { id: "t3", type: "info", title: "Toast Three" },
    ];
    render(<ToastContainer />);
    expect(screen.getByText("Toast One")).toBeInTheDocument();
    expect(screen.getByText("Toast Two")).toBeInTheDocument();
    expect(screen.getByText("Toast Three")).toBeInTheDocument();
  });

  it("has close button on each toast", () => {
    mockToasts = [{ id: "t1", type: "info", title: "Closable" }];
    render(<ToastContainer />);
    const closeBtn = screen.getByRole("button", { name: "Close toast" });
    expect(closeBtn).toBeInTheDocument();
  });

  it("renders toast type icon", () => {
    mockToasts = [{ id: "t1", type: "warning", title: "Watch out" }];
    render(<ToastContainer />);
    // Warning icon is ⚠ (U+26A0)
    expect(screen.getByText("\u26A0")).toBeInTheDocument();
  });

  it("renders progress bar for non-loading toasts", () => {
    mockToasts = [{ id: "t1", type: "success", title: "Done" }];
    const { container } = render(<ToastContainer />);
    const progress = container.querySelector(".toast-progress");
    expect(progress).not.toBeNull();
  });

  it("does not render progress bar for loading toasts with zero duration", () => {
    mockToasts = [{ id: "t1", type: "loading", title: "Loading..." }];
    const { container } = render(<ToastContainer />);
    const progress = container.querySelector(".toast-progress");
    expect(progress).toBeNull();
  });
});
