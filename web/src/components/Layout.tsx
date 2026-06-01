import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import useTheme from "../hooks/useTheme.ts";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts.ts";
import NotificationBell from "./NotificationBell.tsx";
import WalletConnectButton from "./WalletConnectButton.tsx";
import GlobalSearch from "./GlobalSearch.tsx";

export default function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  useKeyboardShortcuts();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <nav aria-label="Main navigation">
        <NavLink to="/" className="logo" onClick={closeMenu}>
          <img src="/claw.svg" alt="ClawChain" />
          ClawChain
        </NavLink>
        <GlobalSearch />
        <button
          className="nav-toggle"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? "\u2715" : "\u2630"}
        </button>
        <div className={`links${menuOpen ? " open" : ""}`}>
          <NavLink to="/explorer" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Explorer
          </NavLink>
          <NavLink to="/analytics" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Analytics
          </NavLink>
          <NavLink to="/validators" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Validators
          </NavLink>
          <NavLink to="/staking" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Staking
          </NavLink>
          <NavLink to="/tokenomics" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Tokenomics
          </NavLink>
          <NavLink to="/wallet" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Wallet
          </NavLink>
          <NavLink to="/portfolio" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Portfolio
          </NavLink>
          <NavLink to="/address-book" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Address Book
          </NavLink>
          <NavLink to="/faucet" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Faucet
          </NavLink>
          <NavLink to="/marketplace" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Marketplace
          </NavLink>
          <NavLink to="/escrows" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Escrows
          </NavLink>
          <NavLink to="/agents" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Agents
          </NavLink>
          <NavLink to="/tasks" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Tasks
          </NavLink>
          <NavLink to="/privacy" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Privacy
          </NavLink>
          <NavLink to="/messaging" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Messaging
          </NavLink>
          <NavLink to="/models" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Models
          </NavLink>
          <NavLink to="/model-exchange" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Model Exchange
          </NavLink>
          <NavLink to="/model-markets" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            AI Stock Exchange
          </NavLink>
          <NavLink to="/model-portfolio" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Model Portfolio
          </NavLink>
          <NavLink to="/inference" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            AI Inference
          </NavLink>
          <NavLink to="/gpu" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            GPU Compute
          </NavLink>
          <NavLink to="/provider" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Provider
          </NavLink>
          <NavLink to="/gpu-providers" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            GPU Providers
          </NavLink>
          <NavLink to="/reputation" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Reputation
          </NavLink>
          <NavLink to="/leaderboard" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Leaderboard
          </NavLink>
          <NavLink to="/governance" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Governance
          </NavLink>
          <NavLink to="/oracle" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Oracle
          </NavLink>
          <NavLink to="/validator-oracle" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Validator Oracle
          </NavLink>
          <NavLink to="/ibc" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            IBC
          </NavLink>
          <NavLink to="/swap" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Swap
          </NavLink>
          <NavLink to="/bridge" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Bridge
          </NavLink>
          <NavLink to="/contracts" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Contracts
          </NavLink>
          <NavLink to="/network" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Network
          </NavLink>
          <NavLink to="/health" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Health
          </NavLink>
          <NavLink to="/operations" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Operations
          </NavLink>
          <NavLink to="/api-docs" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            API Docs
          </NavLink>
          <NavLink to="/settings" onClick={closeMenu} className={({ isActive }) => isActive ? "active" : ""}>
            Settings
          </NavLink>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"}
          </button>
          <NotificationBell />
          <WalletConnectButton />
        </div>
      </nav>
      <main id="main-content" role="main">{children}</main>
      <footer role="contentinfo">ClawChain &mdash; Sovereign AI Agent Network</footer>
    </div>
  );
}
