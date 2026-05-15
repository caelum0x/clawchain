import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Layout from "../Layout";

// Mock useTheme hook
vi.mock("../../hooks/useTheme.ts", () => ({
  default: () => ({ theme: "dark" as const, toggleTheme: vi.fn() }),
}));

// Mock useKeyboardShortcuts hook
vi.mock("../../hooks/useKeyboardShortcuts.ts", () => ({
  default: vi.fn(),
  KB_EVENTS: { FOCUS_SEARCH: "kb:focus-search", ESCAPE: "kb:escape" },
}));

// Mock NotificationBell — it uses WebSocket hooks internally
vi.mock("../NotificationBell.tsx", () => ({
  default: () => <div data-testid="notification-bell">NotificationBell</div>,
}));

// Mock WalletConnectButton — it uses QRCode and WalletConnect internally
vi.mock("../WalletConnectButton.tsx", () => ({
  default: () => (
    <div data-testid="wallet-connect-button">WalletConnectButton</div>
  ),
}));

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div data-testid="child-content">Hello</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nav with all navigation links", () => {
    renderLayout();

    const expectedLinks = [
      "Explorer",
      "Analytics",
      "Validators",
      "Staking",
      "Tokenomics",
      "Wallet",
      "Faucet",
      "Marketplace",
      "Escrows",
      "Agents",
      "Tasks",
      "Privacy",
      "Messaging",
      "Models",
      "AI Inference",
      "GPU Compute",
      "Reputation",
      "Governance",
      "IBC",
      "Health",
      "Settings",
    ];

    for (const linkText of expectedLinks) {
      expect(screen.getByRole("link", { name: linkText })).toBeInTheDocument();
    }
  });

  it("logo links to home", () => {
    renderLayout();

    const logoLink = screen.getByRole("link", { name: /ClawChain/i });
    expect(logoLink).toHaveAttribute("href", "/");
  });

  it("theme toggle button is present", () => {
    renderLayout();

    const toggleButton = screen.getByRole("button", {
      name: /switch to light mode/i,
    });
    expect(toggleButton).toBeInTheDocument();
  });

  it("renders NotificationBell", () => {
    renderLayout();

    expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
  });

  it("renders WalletConnectButton", () => {
    renderLayout();

    expect(screen.getByTestId("wallet-connect-button")).toBeInTheDocument();
  });

  it("renders children in the main area", () => {
    renderLayout();

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("renders footer with branding text", () => {
    renderLayout();

    expect(
      screen.getByText(/Sovereign AI Agent Network/i),
    ).toBeInTheDocument();
  });
});
