import { useEffect, useState, useCallback, useMemo } from "react";
import useDocTitle from "../hooks/useDocTitle.ts";
import { chainConfig } from "../lib/config.ts";
import { getBalances, formatClaw, shortAddr, type AccountBalance } from "../lib/chain.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, type WalletState } from "../lib/wallet.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IBCChannel {
  state: string;
  ordering: string;
  counterparty: { port_id: string; channel_id: string };
  connection_hops: string[];
  version: string;
  port_id: string;
  channel_id: string;
}

interface IBCDenomTrace {
  path: string;
  base_denom: string;
}

interface ChainEntry {
  channelId: string;
  counterpartyChannelId: string;
  state: string;
  connectionId: string;
  portId: string;
}

interface TransferRecord {
  id: string;
  timestamp: number;
  sourceChain: string;
  destChain: string;
  token: string;
  amount: string;
  status: "pending" | "completed" | "failed";
  txHash: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REST = chainConfig.restEndpoint;

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed": return "success";
    case "pending": return "warning";
    case "failed": return "error";
    default: return "info";
  }
}

function channelStateLabel(state: string): { label: string; color: string } {
  const upper = state.toUpperCase();
  if (upper.includes("OPEN") && !upper.includes("INIT") && !upper.includes("TRY") && !upper.includes("CLOSED")) {
    return { label: "open", color: "var(--green, #22c55e)" };
  }
  if (upper.includes("INIT") || upper.includes("TRY")) {
    return { label: "init", color: "var(--yellow, #eab308)" };
  }
  return { label: "closed", color: "var(--red, #ef4444)" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Bridge() {
  useDocTitle("Bridge");

  const [channels, setChannels] = useState<ChainEntry[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [denomTraces, setDenomTraces] = useState<Map<string, IBCDenomTrace>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addressInput, setAddressInput] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

  const [selectedChannelIdx, setSelectedChannelIdx] = useState(0);
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Load IBC channels on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJSON<{ channels?: IBCChannel[] }>(
          `${REST}/ibc/core/channel/v1/channels`
        );
        const ibcChannels = (data.channels ?? [])
          .filter((c) => c.port_id === "transfer")
          .map((c) => ({
            channelId: c.channel_id,
            counterpartyChannelId: c.counterparty.channel_id,
            state: c.state,
            connectionId: c.connection_hops[0] ?? "",
            portId: c.port_id,
          }));
        if (!cancelled) setChannels(ibcChannels);
      } catch {
        if (!cancelled) setError("Failed to load IBC channels. Is the chain running?");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load balances when wallet address is set
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    async function loadBalances() {
      try {
        const bals = await getBalances(walletAddress);
        if (!cancelled) setBalances(bals);

        // Fetch IBC denom traces for IBC tokens
        const ibcDenoms = bals.filter((b) => b.denom.startsWith("ibc/"));
        const traces = new Map<string, IBCDenomTrace>();
        await Promise.all(
          ibcDenoms.map(async (b) => {
            try {
              const hash = b.denom.replace("ibc/", "");
              const data = await fetchJSON<{ denom_trace?: IBCDenomTrace }>(
                `${REST}/ibc/apps/transfer/v1/denom_traces/${hash}`
              );
              if (data.denom_trace) {
                traces.set(b.denom, data.denom_trace);
              }
            } catch { /* ignore individual trace failures */ }
          })
        );
        if (!cancelled) setDenomTraces(traces);
      } catch { /* ignore balance load failures */ }
    }
    loadBalances();
    return () => { cancelled = true; };
  }, [walletAddress]);

  const openChannels = useMemo(
    () => channels.filter((c) => channelStateLabel(c.state).label === "open"),
    [channels],
  );

  const selectedChannel = openChannels[selectedChannelIdx] ?? null;
  const token = balances[selectedTokenIdx] ?? null;

  const tokenLabel = useCallback(
    (bal: AccountBalance) => {
      if (bal.denom === chainConfig.coinMinimalDenom) return chainConfig.coinDenom;
      const trace = denomTraces.get(bal.denom);
      if (trace) return trace.base_denom.replace(/^u/, "").toUpperCase();
      return bal.denom.length > 12 ? `${bal.denom.slice(0, 8)}...` : bal.denom;
    },
    [denomTraces],
  );

  const tokenBalance = useCallback(
    (bal: AccountBalance) => {
      const raw = BigInt(bal.amount || "0");
      return (Number(raw) / 1_000_000).toFixed(6);
    },
    [],
  );

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (trimmed) setWalletAddress(trimmed);
  }

  const handleMaxClick = useCallback(() => {
    if (token) {
      setAmount(tokenBalance(token));
    }
  }, [token, tokenBalance]);

  const handleConnectWallet = useCallback(async () => {
    setTxStatus(null);
    try {
      const w = await connectKeplr();
      setWallet(w);
      // Also set as wallet address for balance loading
      setWalletAddress(w.address);
      setAddressInput(w.address);
    } catch (err: unknown) {
      setTxStatus({ msg: err instanceof Error ? err.message : "Failed to connect wallet", type: "error" });
    }
  }, []);

  const handleBridge = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0 || !selectedChannel || !token) return;
    if (!wallet) {
      setTxStatus({ msg: "Please connect your Keplr wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    setTransferring(true);

    try {
      // Convert display amount to minimal denom (multiply by 1e6)
      const minimalAmount = String(Math.floor(parseFloat(amount) * 1_000_000));
      const msg = {
        type: "cosmos-sdk/MsgTransfer",
        value: {
          source_port: "transfer",
          source_channel: selectedChannel.channelId,
          token: { denom: token.denom, amount: minimalAmount },
          sender: wallet.address,
          receiver: walletAddress,
          timeout_height: { revision_number: "0", revision_height: "0" },
          timeout_timestamp: String((Date.now() + 600000) * 1000000),
        },
      };
      const memo = `IBC Transfer via ${selectedChannel.channelId}`;
      const result = await signAndBroadcast(wallet.address, [msg], memo);

      const newRecord: TransferRecord = {
        id: `h-${Date.now()}`,
        timestamp: Date.now(),
        sourceChain: "ClawChain",
        destChain: selectedChannel.channelId,
        token: tokenLabel(token),
        amount,
        status: result.code === 0 ? "completed" : "failed",
        txHash: result.txHash || "Unknown",
      };
      setHistory((prev) => [newRecord, ...prev]);

      if (result.code === 0) {
        setTxStatus({ msg: `Transfer broadcast successfully! Tx hash: ${result.txHash}`, type: "success" });
      } else {
        setTxStatus({ msg: `Transaction failed with code ${result.code}. Tx hash: ${result.txHash}`, type: "error" });
      }
      setAmount("");
    } catch (err: unknown) {
      const newRecord: TransferRecord = {
        id: `h-${Date.now()}`,
        timestamp: Date.now(),
        sourceChain: "ClawChain",
        destChain: selectedChannel.channelId,
        token: tokenLabel(token),
        amount,
        status: "failed",
        txHash: "Signing rejected",
      };
      setHistory((prev) => [newRecord, ...prev]);
      setTxStatus({ msg: err instanceof Error ? err.message : "Transaction signing failed", type: "error" });
    }
    setTransferring(false);
  }, [amount, selectedChannel, token, tokenLabel, wallet, walletAddress]);

  const isValid = amount !== "" && parseFloat(amount) > 0 && selectedChannel != null && token != null;

  return (
    <div>
      <h1 className="page-title">Cross-Chain Bridge</h1>
      <p className="page-subtitle">
        Transfer tokens between ClawChain and connected IBC networks. Powered by
        the Inter-Blockchain Communication protocol.
      </p>

      {/* Wallet Connection */}
      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 16 }}>
        {wallet ? (
          <div style={{ fontSize: 13, color: "var(--green, #22c55e)" }}>
            Wallet connected: <span style={{ fontFamily: "monospace" }}>{shortAddr(wallet.address)}</span>
            {wallet.name && <span> ({wallet.name})</span>}
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleConnectWallet}
            disabled={!isKeplrAvailable()}
          >
            {isKeplrAvailable() ? "Connect Keplr Wallet" : "Keplr Not Detected"}
          </button>
        )}
      </div>

      {/* Tx Status */}
      {txStatus && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: txStatus.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: txStatus.type === "success" ? "#22c55e" : "#ef4444",
            wordBreak: "break-all",
          }}
          data-testid="bridge-tx-status"
        >
          {txStatus.msg}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: "1.5rem", padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading IBC channels...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* IBC Channel Status */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            {channels.length === 0 ? (
              <div style={{ color: "var(--text2)", fontSize: 14 }}>
                No IBC transfer channels found. Channels will appear once IBC connections are established.
              </div>
            ) : (
              channels.map((ch) => {
                const { label, color } = channelStateLabel(ch.state);
                return (
                  <div
                    key={ch.channelId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 16px",
                      background: "var(--bg2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{ch.channelId}</span>
                    <span className="bridge-channel-status">
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: color,
                        }}
                      />
                      <span className="mono" style={{ fontSize: 11 }}>
                        {ch.counterpartyChannelId}
                      </span>
                      <span style={{ color: "var(--text2)", textTransform: "capitalize" }}>
                        {label}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Wallet Address */}
          <div className="card" style={{ marginBottom: "1.5rem", maxWidth: "600px" }}>
            <form
              onSubmit={handleLookup}
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Enter your claw... address to load balances"
                style={{ flex: 1, padding: "0.5rem" }}
              />
              <button className="btn btn-primary" type="submit">
                Load
              </button>
            </form>
            {walletAddress && (
              <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text2)" }}>
                Wallet: <strong>{shortAddr(walletAddress)}</strong>
              </p>
            )}
          </div>

          {/* Bridge Form + Preview */}
          <div className="bridge-layout">
            {/* Form */}
            <div className="bridge-form" data-testid="bridge-form">
              <h3>Bridge Tokens</h3>

              {openChannels.length === 0 ? (
                <p style={{ color: "var(--text2)" }}>
                  No open IBC channels available for transfer.
                </p>
              ) : (
                <>
                  {/* Channel selector */}
                  <div className="bridge-field">
                    <label>IBC Channel</label>
                    <select
                      value={selectedChannelIdx}
                      onChange={(e) => setSelectedChannelIdx(Number(e.target.value))}
                    >
                      {openChannels.map((ch, i) => (
                        <option key={ch.channelId} value={i}>
                          {ch.channelId} (counterparty: {ch.counterpartyChannelId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Token selector */}
                  <div className="bridge-field">
                    <label>Token</label>
                    {balances.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--text2)" }}>
                        {walletAddress ? "No tokens found." : "Enter wallet address to see tokens."}
                      </p>
                    ) : (
                      <select
                        value={selectedTokenIdx}
                        onChange={(e) => {
                          setSelectedTokenIdx(Number(e.target.value));
                          setAmount("");
                        }}
                      >
                        {balances.map((b, i) => (
                          <option key={b.denom} value={i}>
                            {tokenLabel(b)} (Balance: {tokenBalance(b)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="bridge-field">
                    <label>Amount</label>
                    <div className="bridge-amount-row">
                      <input
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="0"
                        step="any"
                      />
                      <button
                        className="bridge-max-btn"
                        onClick={handleMaxClick}
                      >
                        MAX
                      </button>
                    </div>
                    {token && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text2)",
                          marginTop: 4,
                        }}
                      >
                        Available: {tokenBalance(token)} {tokenLabel(token)}
                      </div>
                    )}
                  </div>

                  {/* Bridge button */}
                  <button
                    onClick={handleBridge}
                    disabled={!isValid || transferring}
                    style={{
                      width: "100%",
                      marginTop: 16,
                      padding: "14px 24px",
                      fontSize: 16,
                      fontWeight: 700,
                      background: isValid ? "var(--accent2)" : "var(--bg3)",
                      color: isValid ? "#fff" : "var(--text2)",
                      border: "none",
                      borderRadius: "var(--radius)",
                      cursor: isValid && !transferring ? "pointer" : "not-allowed",
                      opacity: transferring ? 0.7 : 1,
                    }}
                  >
                    {transferring
                      ? "Bridging..."
                      : !amount || parseFloat(amount) <= 0
                        ? "Enter an amount"
                        : !selectedChannel
                          ? "Select a channel"
                          : `Bridge ${token ? tokenLabel(token) : "tokens"} via ${selectedChannel.channelId}`}
                  </button>
                </>
              )}
            </div>

            {/* Preview */}
            <div className="bridge-preview" data-testid="bridge-preview">
              <h3>Transfer Preview</h3>

              <div className="bridge-preview-row">
                <span className="bridge-preview-label">Source</span>
                <span className="bridge-preview-value">ClawChain</span>
              </div>

              <div className="bridge-preview-row">
                <span className="bridge-preview-label">IBC Channel</span>
                <span className="bridge-preview-value">
                  {selectedChannel?.channelId ?? "--"}
                </span>
              </div>

              <div className="bridge-preview-row">
                <span className="bridge-preview-label">Counterparty Channel</span>
                <span className="bridge-preview-value">
                  {selectedChannel?.counterpartyChannelId ?? "--"}
                </span>
              </div>

              <div className="bridge-preview-row">
                <span className="bridge-preview-label">Token</span>
                <span className="bridge-preview-value">
                  {token ? tokenLabel(token) : "--"}
                </span>
              </div>

              <div className="bridge-preview-row">
                <span className="bridge-preview-label">Amount</span>
                <span
                  className="bridge-preview-value"
                  style={{ color: amount ? "var(--accent)" : "var(--text2)" }}
                >
                  {amount ? `${amount} ${token ? tokenLabel(token) : ""}` : "--"}
                </span>
              </div>

              <div className="bridge-preview-row">
                <span className="bridge-preview-label">Connection</span>
                <span className="bridge-preview-value">
                  {selectedChannel?.connectionId ?? "--"}
                </span>
              </div>

              {amount && parseFloat(amount) > 0 && selectedChannel && token && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    background: "var(--bg)",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "var(--text2)",
                  }}
                >
                  You will send{" "}
                  <strong style={{ color: "var(--accent)" }}>
                    {amount} {tokenLabel(token)}
                  </strong>{" "}
                  from <strong style={{ color: "var(--text)" }}>ClawChain</strong>{" "}
                  via IBC channel <strong>{selectedChannel.channelId}</strong>.
                  The counterparty will receive tokens on their chain via{" "}
                  <strong>{selectedChannel.counterpartyChannelId}</strong>.
                </div>
              )}
            </div>
          </div>

          {/* Transfer History */}
          <div className="table-wrap" data-testid="bridge-history">
            <h2>Transfer History</h2>
            {history.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text2)",
                  fontSize: 14,
                }}
              >
                No bridge transfers in this session. Initiate your first cross-chain transfer above.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Token</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => (
                    <tr key={record.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {timeAgo(record.timestamp)}
                      </td>
                      <td>{record.sourceChain}</td>
                      <td>{record.destChain}</td>
                      <td>{record.token}</td>
                      <td style={{ fontWeight: 600 }}>{record.amount}</td>
                      <td>
                        <span
                          className={`badge ${statusBadgeClass(record.status)}`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {record.txHash}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
