import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { requestFaucet, getBalances, formatClaw } from "../lib/chain.ts";
import { isKeplrAvailable, connectKeplr } from "../lib/wallet.ts";
import { useToast } from "../hooks/useToast.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";

export default function Faucet() {
  useDocTitle("Faucet");
  const { addToast, updateToast } = useToast();
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; txHash?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Auto-check balance when address changes
  useEffect(() => {
    const addr = address.trim();
    if (!addr || !addr.startsWith("claw1") || addr.length < 20) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    getBalances(addr)
      .then((balances) => {
        if (cancelled) return;
        const uclaw = balances.find((b) => b.denom === "uclaw");
        setBalance(uclaw ? uclaw.amount : "0");
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [address, result]);

  async function handleKeplrAutofill() {
    try {
      const wallet = await connectKeplr();
      setAddress(wallet.address);
      addToast({ type: "success", title: "Wallet Connected", message: `Address: ${wallet.address.slice(0, 16)}...` });
    } catch (err: any) {
      addToast({ type: "error", title: "Wallet Error", message: err?.message ?? "Could not connect wallet" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = address.trim();
    if (!addr) return;
    if (!addr.startsWith("claw1")) {
      setResult({ ok: false, message: "Address must start with 'claw1'" });
      addToast({ type: "error", title: "Invalid Address", message: "Address must start with 'claw1'." });
      return;
    }
    setLoading(true);
    setResult(null);
    const loadingToastId = addToast({ type: "loading", title: "Requesting Tokens", message: "Sending faucet request..." });

    try {
      const res = await requestFaucet(addr);
      setResult(res);

      if (res.ok) {
        updateToast(loadingToastId, {
          type: "success",
          title: "Tokens Sent",
          message: res.message,
          txHash: res.txHash,
        });
      } else if (res.message.toLowerCase().includes("rate limit") || res.message.toLowerCase().includes("too many")) {
        updateToast(loadingToastId, {
          type: "warning",
          title: "Rate Limited",
          message: res.message,
        });
      } else {
        updateToast(loadingToastId, {
          type: "error",
          title: "Faucet Error",
          message: res.message,
        });
      }
    } catch (err: any) {
      const errMsg = err?.message ?? "Unknown error";
      setResult({ ok: false, message: errMsg });
      updateToast(loadingToastId, {
        type: "error",
        title: "Faucet Error",
        message: errMsg,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Testnet Faucet</h1>
      <p className="page-subtitle">Get free CLAW tokens for testing on the ClawChain testnet.</p>

      <div className="wallet-box" style={{ maxWidth: 600 }}>
        <h2>Request Tokens</h2>
        <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 20 }}>
          Enter your claw address below. You'll receive 10 CLAW (10,000,000 uclaw) per request.
          Rate limited to 1 request per address per hour.
        </p>

        {result && (
          <div className={`alert ${result.ok ? "success" : "error"}`}>
            {result.message}
            {result.txHash && (
              <>
                {" — "}
                <Link to={`/explorer/tx/${result.txHash}`}>View Transaction</Link>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>Wallet Address</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="claw1..."
                disabled={loading}
                style={{ flex: 1 }}
              />
              {isKeplrAvailable() && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleKeplrAutofill}
                  disabled={loading}
                  style={{ whiteSpace: "nowrap", fontSize: 13 }}
                >
                  Use Keplr
                </button>
              )}
            </div>
            {/* Balance display */}
            {address.trim().startsWith("claw1") && address.trim().length >= 20 && (
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text2)" }}>
                {balanceLoading ? (
                  "Checking balance..."
                ) : balance !== null ? (
                  <>Current balance: <strong style={{ color: "var(--text1)" }}>{formatClaw(balance)}</strong></>
                ) : (
                  "Could not fetch balance"
                )}
              </div>
            )}
          </div>
          <button type="submit" disabled={loading || !address.trim()}>
            {loading ? "Requesting..." : "Send Me Tokens"}
          </button>
        </form>
      </div>

      <div className="grid-2" style={{ maxWidth: 600, marginTop: 24, gap: 16 }}>
        <div className="card">
          <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Don't have a wallet?</h3>
          <p style={{ color: "var(--text2)", fontSize: 14, marginTop: 8 }}>
            <Link to="/wallet">Create one here</Link> in seconds, or use the CLI:
          </p>
          <code
            className="mono"
            style={{
              background: "var(--bg3)",
              padding: "8px 14px",
              borderRadius: "var(--radius)",
              display: "inline-block",
              fontSize: 13,
              marginTop: 12,
            }}
          >
            clawchaind keys add my-wallet
          </code>
        </div>

        <div className="card">
          <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Need more tokens?</h3>
          <p style={{ color: "var(--text2)", fontSize: 14, marginTop: 8 }}>
            For larger amounts, use the CLI faucet:
          </p>
          <code
            className="mono"
            style={{
              background: "var(--bg3)",
              padding: "8px 14px",
              borderRadius: "var(--radius)",
              display: "inline-block",
              fontSize: 13,
              marginTop: 12,
            }}
          >
            clawd faucet request claw1...
          </code>
        </div>
      </div>
    </>
  );
}
