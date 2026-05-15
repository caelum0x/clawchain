/**
 * WalletConnect button component for the ClawChain web dashboard.
 *
 * Displays a "Connect Wallet" button when disconnected, and shows the
 * connected address with a disconnect dropdown when connected.
 */

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  getWalletConnect,
  getActiveSessions,
  getConnectedAddress,
  isConnected as checkIsConnected,
  disconnectAll,
  type WalletConnectSession,
} from "../lib/walletconnect.ts";
import { shortAddr } from "../lib/chain.ts";

// ---------------------------------------------------------------------------
// Styles (inline, consistent with existing codebase patterns)
// ---------------------------------------------------------------------------

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid var(--accent, #7c3aed)",
  background: "transparent",
  color: "var(--accent, #7c3aed)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  position: "relative",
};

const connectedBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "var(--accent, #7c3aed)",
  color: "#fff",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  minWidth: 220,
  background: "var(--bg2, #1a1a2e)",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
  padding: 8,
  zIndex: 100,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 12px",
  border: "none",
  background: "transparent",
  color: "var(--text, #fff)",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 4,
};

const addressStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 12,
  color: "var(--text2, #aaa)",
  padding: "4px 12px",
};

const dotStyle: React.CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#22c55e",
};

const qrContainerStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const qrModalStyle: React.CSSProperties = {
  background: "var(--bg2, #1a1a2e)",
  borderRadius: 16,
  padding: 32,
  maxWidth: 400,
  width: "90%",
  textAlign: "center",
};

const qrUriStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 11,
  color: "var(--text2, #aaa)",
  wordBreak: "break-all",
  background: "var(--bg, #0a0a0a)",
  borderRadius: 8,
  padding: 12,
  margin: "16px 0",
  maxHeight: 120,
  overflow: "auto",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WalletConnectButton() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WalletConnectSession[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [pairingUri, setPairingUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refresh state from WC instance
  const refreshState = () => {
    const currentSessions = getActiveSessions();
    setSessions(currentSessions);
    setConnected(checkIsConnected());
    setAddress(getConnectedAddress());
  };

  // Poll for connection state changes
  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!pairingUri) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(pairingUri, { width: 200, margin: 1 })
      .then((dataUrl: string) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pairingUri]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Handle connect: init WC, create pairing URI, show QR
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const wc = await getWalletConnect();

      // Access the underlying client to create a pairing URI
      const client = (wc as any).client;
      if (!client) {
        throw new Error("WalletConnect client not ready");
      }

      const { uri, topic } = await client.core.pairing.create();
      setPairingUri(uri);
      setShowQR(true);

      // Wait for a session to be established (up to 2 minutes)
      const startCount = wc.getSessions().length;
      let attempts = 0;
      const maxAttempts = 120;

      const checkInterval = setInterval(() => {
        attempts++;
        const current = wc.getSessions();
        if (current.length > startCount) {
          clearInterval(checkInterval);
          setShowQR(false);
          setPairingUri(null);
          refreshState();
          setConnecting(false);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          setShowQR(false);
          setPairingUri(null);
          setConnecting(false);
        }
      }, 1000);
    } catch {
      setConnecting(false);
      setShowQR(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    setDropdownOpen(false);
    await disconnectAll();
    refreshState();
  };

  // Copy pairing URI to clipboard
  const handleCopyUri = () => {
    if (pairingUri) {
      navigator.clipboard.writeText(pairingUri).catch(() => {});
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {connected ? (
        <>
          <button
            style={connectedBtnStyle}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span style={dotStyle} />
            {address ? shortAddr(address) : "Connected"}
          </button>

          {dropdownOpen && (
            <div style={dropdownStyle}>
              {address && (
                <div style={addressStyle}>
                  {address}
                </div>
              )}
              {sessions.map((s) => (
                <div key={s.topic} style={{ ...addressStyle, fontSize: 11 }}>
                  {s.peerMeta.name} ({s.chainId})
                </div>
              ))}
              <hr style={{ border: "none", borderTop: "1px solid var(--border, #333)", margin: "4px 0" }} />
              <button
                style={{ ...dropdownItemStyle, color: "#ef4444" }}
                onClick={handleDisconnect}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
              >
                Disconnect
              </button>
            </div>
          )}
        </>
      ) : (
        <button
          style={btnStyle}
          onClick={handleConnect}
          disabled={connecting}
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}

      {/* QR / URI Modal */}
      {showQR && pairingUri && (
        <div style={qrContainerStyle} onClick={() => { setShowQR(false); setConnecting(false); }}>
          <div style={qrModalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#fff", margin: "0 0 8px", fontSize: 18 }}>
              Connect Wallet
            </h3>
            <p style={{ color: "var(--text2, #aaa)", fontSize: 14, margin: "0 0 16px" }}>
              Scan this QR code with your Claw Wallet mobile app, or copy the
              URI below and paste it in your wallet.
            </p>

            <div
              style={{
                width: 200,
                height: 200,
                margin: "0 auto 16px",
                background: "#fff",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="WalletConnect pairing QR"
                  width={200}
                  height={200}
                  style={{ borderRadius: 8 }}
                />
              ) : (
                <span style={{ color: "#333", fontSize: 12 }}>Generating QR...</span>
              )}
            </div>

            <div style={qrUriStyle}>{pairingUri}</div>

            <button
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "1px solid var(--accent, #7c3aed)",
                background: "transparent",
                color: "var(--accent, #7c3aed)",
                fontSize: 14,
                cursor: "pointer",
                fontWeight: 600,
              }}
              onClick={handleCopyUri}
            >
              Copy URI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
