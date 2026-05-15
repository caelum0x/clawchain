import { useEffect, useState, useRef, useCallback } from "react";
import { chainConfig } from "../lib/config.ts";
import useDocTitle from "../hooks/useDocTitle.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, type WalletState } from "../lib/wallet.ts";

/* ---------- Types ---------- */

interface IBCChannel {
  state: string;
  ordering: string;
  counterparty: { port_id: string; channel_id: string };
  connection_hops: string[];
  version: string;
  port_id: string;
  channel_id: string;
}

interface IBCConnection {
  id: string;
  client_id: string;
  state: string;
  counterparty: { client_id: string; connection_id: string; prefix: { key_prefix: string } };
  delay_period: string;
}

interface IBCClient {
  client_id: string;
  client_state: {
    "@type": string;
    chain_id?: string;
    latest_height?: { revision_number: string; revision_height: string };
  };
}

interface DenomTrace {
  path: string;
  base_denom: string;
}

interface DenomTraceEntry {
  denom_trace: DenomTrace;
}

interface RemoteAgent {
  address: string;
  name: string;
  source_chain: string;
  channel: string;
  capabilities: string[];
}

interface RecentTransfer {
  hash: string;
  height: string;
  timestamp: string;
  amount: string;
  denom: string;
  destination: string;
  status: string;
}

type TabName = "overview" | "channels" | "connections" | "clients" | "denoms" | "agents" | "transfer";

/* ---------- Helpers ---------- */

const REST = chainConfig.restEndpoint;

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function stateColor(state: string): string {
  const s = state.toUpperCase();
  if (s.includes("OPEN") && !s.includes("INIT") && !s.includes("TRY") && !s.includes("CLOSED"))
    return "var(--green, #22c55e)";
  if (s.includes("CLOSED") || s.includes("FROZEN")) return "var(--red, #ef4444)";
  if (s.includes("INIT") || s.includes("TRY")) return "var(--yellow, #eab308)";
  return "var(--text2, #888)";
}

function stateLabel(state: string): string {
  return state
    .replace("STATE_", "")
    .replace("CHANNEL_", "")
    .replace("CONNECTION_", "")
    .replace(/_/g, " ")
    .replace("OPEN", "Open")
    .replace("CLOSED", "Closed")
    .replace("INIT", "Init")
    .replace("TRY", "Try")
    .replace("FROZEN", "Frozen")
    .replace("UNINITIALIZED", "Uninitialized");
}

function shortType(fullType: string): string {
  const parts = fullType.split(".");
  const last = parts[parts.length - 1] || fullType;
  return last;
}

function truncateAddr(addr: string, prefix = 10, suffix = 6): string {
  if (addr.length <= prefix + suffix + 3) return addr;
  return `${addr.slice(0, prefix)}...${addr.slice(-suffix)}`;
}

/* ---------- Styles ---------- */

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid var(--border, #333)",
  color: "var(--text2)",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border, #222)",
  fontSize: 14,
};

const badgeBase: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: "18px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px",
  background: "var(--bg, #0a0a0a)",
  border: "1px solid var(--border, #333)",
  borderRadius: 6,
  color: "var(--text, #fff)",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 13,
  color: "var(--text2, #aaa)",
  fontWeight: 600,
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 16,
};

/* ---------- Component ---------- */

export default function IBC() {
  useDocTitle("IBC");
  const [tab, setTab] = useState<TabName>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Data
  const [channels, setChannels] = useState<IBCChannel[]>([]);
  const [connections, setConnections] = useState<IBCConnection[]>([]);
  const [clients, setClients] = useState<IBCClient[]>([]);
  const [denomTraces, setDenomTraces] = useState<DenomTraceEntry[]>([]);
  const [remoteAgents, setRemoteAgents] = useState<RemoteAgent[]>([]);

  // Transfer form state
  const [txChannel, setTxChannel] = useState("");
  const [txRecipient, setTxRecipient] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDenom, setTxDenom] = useState("uclaw");
  const [txTimeoutHeight, setTxTimeoutHeight] = useState("1000");
  const [txMemo, setTxMemo] = useState("");
  const [txPreview, setTxPreview] = useState(false);
  const [recentTransfers, setRecentTransfers] = useState<RecentTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chRes, connRes, clientRes, denomRes, agentRes] = await Promise.allSettled([
        fetchJSON<{ channels: IBCChannel[] }>(`${REST}/ibc/core/channel/v1/channels`),
        fetchJSON<{ connections: IBCConnection[] }>(`${REST}/ibc/core/connection/v1/connections`),
        fetchJSON<{ client_states: IBCClient[] }>(`${REST}/ibc/core/client/v1/client_states`),
        fetchJSON<{ denom_traces: DenomTraceEntry[] }>(`${REST}/ibc/apps/transfer/v1/denom_traces`),
        fetchJSON<{ agents: RemoteAgent[] }>(`${REST}/clawchain/agent/v1/remote_agents`),
      ]);

      if (chRes.status === "fulfilled") setChannels(chRes.value.channels ?? []);
      if (connRes.status === "fulfilled") setConnections(connRes.value.connections ?? []);
      if (clientRes.status === "fulfilled") setClients(clientRes.value.client_states ?? []);
      if (denomRes.status === "fulfilled") setDenomTraces(denomRes.value.denom_traces ?? []);
      if (agentRes.status === "fulfilled") setRemoteAgents(agentRes.value.agents ?? []);

      const allRejected = [chRes, connRes, clientRes, denomRes, agentRes].every(
        (r) => r.status === "rejected"
      );
      if (allRejected) {
        setError("Cannot reach IBC endpoints. Is the chain running?");
      }

      setLastRefresh(new Date());
    } catch {
      setError("Failed to load IBC data.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllData();
    refreshTimer.current = setInterval(loadAllData, 30000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [loadAllData]);

  const tabList: { key: TabName; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "channels", label: "Channels" },
    { key: "connections", label: "Connections" },
    { key: "clients", label: "Clients" },
    { key: "denoms", label: "Denom Traces" },
    { key: "agents", label: "Remote Agents" },
    { key: "transfer", label: "Transfer" },
  ];

  const openChannels = channels.filter((c) => c.state.toUpperCase().includes("OPEN") && !c.state.toUpperCase().includes("INIT") && !c.state.toUpperCase().includes("TRY") && !c.state.toUpperCase().includes("CLOSED")).length;
  const openConnections = connections.filter((c) => c.state.toUpperCase().includes("OPEN") && !c.state.toUpperCase().includes("INIT") && !c.state.toUpperCase().includes("TRY")).length;

  const isConnected = channels.length > 0 || connections.length > 0 || clients.length > 0;

  return (
    <>
      <h1 className="page-title">IBC Explorer</h1>
      <p className="page-subtitle">
        Cross-chain Inter-Blockchain Communication
        {lastRefresh && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "var(--text2)" }}>
            Last refresh: {lastRefresh.toLocaleTimeString()} (auto-refreshes every 30s)
          </span>
        )}
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {tabList.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? "primary" : "secondary"}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && channels.length === 0 && connections.length === 0 && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading IBC data...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card" style={{ borderLeft: "3px solid var(--red, #ef4444)", marginBottom: 24 }}>
          <p style={{ color: "var(--red, #ef4444)", margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* ========== Overview Tab ========== */}
      {tab === "overview" && !loading && (
        <>
          {/* Connection status */}
          <div className="card" style={{ marginBottom: 24, textAlign: "center" }}>
            <h2
              style={{
                color: isConnected ? "var(--green, #22c55e)" : "var(--red, #ef4444)",
                fontSize: 22,
                margin: "0 0 8px",
              }}
            >
              {isConnected ? "[CONNECTED]" : "[DISCONNECTED]"}{" "}
              {isConnected ? "IBC Relaying Active" : "No IBC Activity Detected"}
            </h2>
            <p style={{ color: "var(--text2)", margin: 0 }}>
              {openChannels} open channel{openChannels !== 1 ? "s" : ""} | {openConnections} open connection{openConnections !== 1 ? "s" : ""} | {clients.length} light client{clients.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card">
              <h3>Total Channels</h3>
              <div className="value accent">{channels.length}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {openChannels} open
              </div>
            </div>
            <div className="card">
              <h3>Total Connections</h3>
              <div className="value accent">{connections.length}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {openConnections} open
              </div>
            </div>
            <div className="card">
              <h3>Light Clients</h3>
              <div className="value">{clients.length}</div>
            </div>
            <div className="card">
              <h3>Denom Traces</h3>
              <div className="value">{denomTraces.length}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {denomTraces.length} transferred token{denomTraces.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Remote agents summary */}
          {remoteAgents.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <h3>Remote Agents via IBC</h3>
              <p style={{ color: "var(--text2)", margin: "0 0 8px" }}>
                {remoteAgents.length} remote agent{remoteAgents.length !== 1 ? "s" : ""} discovered across chains
              </p>
            </div>
          )}
        </>
      )}

      {/* ========== Channels Tab ========== */}
      {tab === "channels" && (
        <>
          <h3>IBC Channels ({channels.length})</h3>
          {channels.length === 0 ? (
            <div className="empty">No IBC channels found. The chain may not have any IBC connections yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={thStyle}>Channel ID</th>
                    <th style={thStyle}>Port</th>
                    <th style={thStyle}>State</th>
                    <th style={thStyle}>Counterparty Channel</th>
                    <th style={thStyle}>Counterparty Port</th>
                    <th style={thStyle}>Connection Hops</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch, i) => (
                    <tr key={`${ch.channel_id}-${ch.port_id}-${i}`}>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {ch.channel_id}
                      </td>
                      <td style={tdStyle}>{ch.port_id}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeBase,
                            color: stateColor(ch.state),
                            background: `${stateColor(ch.state)}20`,
                          }}
                        >
                          {stateLabel(ch.state)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {ch.counterparty.channel_id || "-"}
                      </td>
                      <td style={tdStyle}>{ch.counterparty.port_id || "-"}</td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                        {ch.connection_hops?.join(", ") || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ========== Connections Tab ========== */}
      {tab === "connections" && (
        <>
          <h3>IBC Connections ({connections.length})</h3>
          {connections.length === 0 ? (
            <div className="empty">No IBC connections found.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={thStyle}>Connection ID</th>
                    <th style={thStyle}>Client ID</th>
                    <th style={thStyle}>State</th>
                    <th style={thStyle}>Counterparty Connection</th>
                    <th style={thStyle}>Counterparty Client</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn, i) => (
                    <tr key={`${conn.id}-${i}`}>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {conn.id}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {conn.client_id}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeBase,
                            color: stateColor(conn.state),
                            background: `${stateColor(conn.state)}20`,
                          }}
                        >
                          {stateLabel(conn.state)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {conn.counterparty?.connection_id || "-"}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {conn.counterparty?.client_id || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ========== Clients Tab ========== */}
      {tab === "clients" && (
        <>
          <h3>IBC Light Clients ({clients.length})</h3>
          {clients.length === 0 ? (
            <div className="empty">No IBC light clients found.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={thStyle}>Client ID</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Chain ID</th>
                    <th style={thStyle}>Latest Height</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((cl, i) => (
                    <tr key={`${cl.client_id}-${i}`}>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {cl.client_id}
                      </td>
                      <td style={tdStyle}>
                        {shortType(cl.client_state?.["@type"] ?? "Unknown")}
                      </td>
                      <td style={tdStyle}>
                        {cl.client_state?.chain_id || "-"}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {cl.client_state?.latest_height
                          ? `${cl.client_state.latest_height.revision_number}-${cl.client_state.latest_height.revision_height}`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ========== Denom Traces Tab ========== */}
      {tab === "denoms" && (
        <>
          <h3>IBC Denom Traces ({denomTraces.length})</h3>
          {denomTraces.length === 0 ? (
            <div className="empty">No IBC denom traces found. No tokens have been transferred via IBC yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={thStyle}>IBC Denom (Hash)</th>
                    <th style={thStyle}>Path</th>
                    <th style={thStyle}>Base Denom</th>
                  </tr>
                </thead>
                <tbody>
                  {denomTraces.map((entry, i) => {
                    const trace = entry.denom_trace ?? entry;
                    const dt = trace as DenomTrace;
                    const hash = dt.path && dt.base_denom
                      ? `ibc/${dt.path.replace(/\//g, "").toUpperCase().slice(0, 16)}...`
                      : "-";
                    return (
                      <tr key={i}>
                        <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                          {hash}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                          {dt.path || "-"}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600 }}>{dt.base_denom || "-"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ========== Transfer Tab ========== */}
      {tab === "transfer" && (
        <TransferTab
          channels={channels}
          denomTraces={denomTraces}
          txChannel={txChannel}
          setTxChannel={setTxChannel}
          txRecipient={txRecipient}
          setTxRecipient={setTxRecipient}
          txAmount={txAmount}
          setTxAmount={setTxAmount}
          txDenom={txDenom}
          setTxDenom={setTxDenom}
          txTimeoutHeight={txTimeoutHeight}
          setTxTimeoutHeight={setTxTimeoutHeight}
          txMemo={txMemo}
          setTxMemo={setTxMemo}
          txPreview={txPreview}
          setTxPreview={setTxPreview}
          recentTransfers={recentTransfers}
          setRecentTransfers={setRecentTransfers}
          transfersLoading={transfersLoading}
          setTransfersLoading={setTransfersLoading}
        />
      )}

      {/* ========== Remote Agents Tab ========== */}
      {tab === "agents" && (
        <>
          <h3>Remote Agents ({remoteAgents.length})</h3>
          <p style={{ color: "var(--text2)", marginBottom: 16 }}>
            AI agents discovered on other chains via IBC.
          </p>
          {remoteAgents.length === 0 ? (
            <div className="empty">No remote agents discovered via IBC yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={thStyle}>Agent Address</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Source Chain</th>
                    <th style={thStyle}>Channel</th>
                    <th style={thStyle}>Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {remoteAgents.map((agent, i) => (
                    <tr key={`${agent.address}-${i}`}>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                        {truncateAddr(agent.address)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600 }}>{agent.name || "Unnamed"}</span>
                      </td>
                      <td style={tdStyle}>{agent.source_chain || "-"}</td>
                      <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                        {agent.channel || "-"}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(agent.capabilities ?? []).length > 0 ? (
                            agent.capabilities.map((cap, ci) => (
                              <span
                                key={ci}
                                style={{
                                  ...badgeBase,
                                  color: "var(--accent, #3b82f6)",
                                  background: "var(--accent, #3b82f6)20",
                                }}
                              >
                                {cap}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: "var(--text2)" }}>-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

interface TransferTabProps {
  channels: IBCChannel[];
  denomTraces: DenomTraceEntry[];
  txChannel: string;
  setTxChannel: (v: string) => void;
  txRecipient: string;
  setTxRecipient: (v: string) => void;
  txAmount: string;
  setTxAmount: (v: string) => void;
  txDenom: string;
  setTxDenom: (v: string) => void;
  txTimeoutHeight: string;
  setTxTimeoutHeight: (v: string) => void;
  txMemo: string;
  setTxMemo: (v: string) => void;
  txPreview: boolean;
  setTxPreview: (v: boolean) => void;
  recentTransfers: RecentTransfer[];
  setRecentTransfers: (v: RecentTransfer[]) => void;
  transfersLoading: boolean;
  setTransfersLoading: (v: boolean) => void;
}

function TransferTab({
  channels,
  denomTraces,
  txChannel,
  setTxChannel,
  txRecipient,
  setTxRecipient,
  txAmount,
  setTxAmount,
  txDenom,
  setTxDenom,
  txTimeoutHeight,
  setTxTimeoutHeight,
  txMemo,
  setTxMemo,
  txPreview,
  setTxPreview,
  recentTransfers,
  setRecentTransfers,
  transfersLoading,
  setTransfersLoading,
}: TransferTabProps) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [sending, setSending] = useState(false);

  async function handleConnectWallet() {
    setTxStatus(null);
    try {
      const w = await connectKeplr();
      setWallet(w);
    } catch (err: unknown) {
      setTxStatus({ msg: err instanceof Error ? err.message : "Failed to connect wallet", type: "error" });
    }
  }

  const openChannels = channels.filter(
    (c) =>
      c.state.toUpperCase().includes("OPEN") &&
      !c.state.toUpperCase().includes("INIT") &&
      !c.state.toUpperCase().includes("TRY") &&
      !c.state.toUpperCase().includes("CLOSED")
  );

  const selectedChannel = channels.find((c) => c.channel_id === txChannel);

  // Build the list of available denoms: uclaw + any IBC denom traces
  const denomOptions: { value: string; label: string }[] = [
    { value: "uclaw", label: "uclaw (CLAW)" },
  ];
  denomTraces.forEach((entry) => {
    const trace = (entry.denom_trace ?? entry) as DenomTrace;
    if (trace.path && trace.base_denom) {
      const ibcDenom = `ibc/${trace.path.replace(/\//g, "").toUpperCase().slice(0, 16)}`;
      denomOptions.push({
        value: ibcDenom,
        label: `${trace.base_denom} (via ${trace.path})`,
      });
    }
  });

  // Load recent transfers for the selected channel
  const loadRecentTransfers = useCallback(async () => {
    if (!txChannel) {
      setRecentTransfers([]);
      return;
    }
    setTransfersLoading(true);
    try {
      const url = `${REST}/cosmos/tx/v1beta1/txs?events=send_packet.packet_src_channel='${txChannel}'&pagination.limit=10&order_by=ORDER_BY_DESC`;
      const data = await fetchJSON<{
        tx_responses?: Array<{
          txhash: string;
          height: string;
          timestamp: string;
          code: number;
          tx?: {
            body?: {
              messages?: Array<{
                "@type"?: string;
                token?: { denom?: string; amount?: string };
                receiver?: string;
              }>;
            };
          };
        }>;
      }>(url);
      const txResponses = data.tx_responses ?? [];
      const transfers: RecentTransfer[] = txResponses.map((r) => {
        const msgs = r.tx?.body?.messages ?? [];
        const transferMsg = msgs.find((m) =>
          (m["@type"] ?? "").includes("MsgTransfer")
        );
        return {
          hash: r.txhash ?? "",
          height: r.height ?? "",
          timestamp: r.timestamp ?? "",
          amount: transferMsg?.token?.amount ?? "-",
          denom: transferMsg?.token?.denom ?? "-",
          destination: transferMsg?.receiver
            ? truncateAddr(transferMsg.receiver)
            : "-",
          status: r.code === 0 ? "Success" : "Failed",
        };
      });
      setRecentTransfers(transfers);
    } catch {
      setRecentTransfers([]);
    }
    setTransfersLoading(false);
  }, [txChannel, setRecentTransfers, setTransfersLoading]);

  useEffect(() => {
    loadRecentTransfers();
  }, [loadRecentTransfers]);

  function buildMsgTransfer() {
    return {
      "@type": "/ibc.applications.transfer.v1.MsgTransfer",
      source_port: "transfer",
      source_channel: txChannel,
      token: {
        denom: txDenom,
        amount: txAmount,
      },
      sender: wallet?.address ?? "",
      receiver: txRecipient,
      timeout_height: {
        revision_number: "0",
        revision_height: String(
          parseInt(txTimeoutHeight) > 0 ? parseInt(txTimeoutHeight) : 1000
        ),
      },
      timeout_timestamp: "0",
      memo: txMemo || "",
    };
  }

  function handlePreview() {
    if (!txChannel || !txRecipient || !txAmount) {
      setTxStatus({ msg: "Please fill in Source Channel, Recipient Address, and Amount.", type: "error" });
      return;
    }
    setTxStatus(null);
    setTxPreview(true);
  }

  async function handleSendTransfer() {
    if (!wallet) {
      setTxStatus({ msg: "Please connect your Keplr wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    setSending(true);
    try {
      const msg = {
        type: "cosmos-sdk/MsgTransfer",
        value: {
          source_port: "transfer",
          source_channel: txChannel,
          token: { denom: txDenom, amount: txAmount },
          sender: wallet.address,
          receiver: txRecipient,
          timeout_height: { revision_number: "0", revision_height: "0" },
          timeout_timestamp: String((Date.now() + 600000) * 1000000),
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], txMemo || "");
      if (result.code === 0) {
        setTxStatus({ msg: `Transfer broadcast successfully! Tx hash: ${result.txHash}`, type: "success" });
      } else {
        setTxStatus({ msg: `Transaction failed with code ${result.code}. Tx hash: ${result.txHash}`, type: "error" });
      }
    } catch (err: unknown) {
      setTxStatus({ msg: err instanceof Error ? err.message : "Transaction signing failed", type: "error" });
    }
    setSending(false);
    setTxPreview(false);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Left column: Transfer Form */}
        <div className="card" style={{ flex: "1 1 400px", maxWidth: 540 }}>
          <h3 style={{ marginTop: 0 }}>IBC Transfer</h3>

          {/* Wallet Connection */}
          <div style={{ marginBottom: 16 }}>
            {wallet ? (
              <div style={{ fontSize: 13, color: "var(--green, #22c55e)" }}>
                Connected: <span style={{ fontFamily: "var(--mono, monospace)" }}>{wallet.address.slice(0, 12)}...{wallet.address.slice(-6)}</span>
                {wallet.name && <span> ({wallet.name})</span>}
              </div>
            ) : (
              <button
                className="primary"
                onClick={handleConnectWallet}
                disabled={!isKeplrAvailable()}
                style={{ fontSize: 13 }}
              >
                {isKeplrAvailable() ? "Connect Keplr Wallet" : "Keplr Not Detected"}
              </button>
            )}
          </div>

          {/* Tx Status */}
          {txStatus && (
            <div
              style={{
                marginBottom: 16,
                padding: "8px 12px",
                borderRadius: 6,
                background: txStatus.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                color: txStatus.type === "success" ? "var(--green, #22c55e)" : "var(--red, #ef4444)",
                fontSize: 13,
                wordBreak: "break-all",
              }}
              data-testid="ibc-tx-status"
            >
              {txStatus.msg}
            </div>
          )}

          {/* Source Channel */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Source Channel *</label>
            <select
              value={txChannel}
              onChange={(e) => {
                setTxChannel(e.target.value);
                setTxPreview(false);
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">-- Select Channel --</option>
              {openChannels.map((ch) => (
                <option key={ch.channel_id} value={ch.channel_id}>
                  {ch.channel_id} ({ch.counterparty.port_id}/{ch.counterparty.channel_id})
                </option>
              ))}
              {openChannels.length === 0 && channels.length > 0 && (
                <option value="" disabled>
                  No open channels available
                </option>
              )}
            </select>
            {channels.length === 0 && (
              <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>
                No IBC channels found. The chain may not have active IBC connections.
              </p>
            )}
          </div>

          {/* Recipient Address */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Recipient Address *</label>
            <input
              type="text"
              value={txRecipient}
              onChange={(e) => {
                setTxRecipient(e.target.value);
                setTxPreview(false);
              }}
              placeholder="cosmos1..., osmo1..., etc."
              style={inputStyle}
            />
            <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>
              The address on the destination chain that will receive the tokens.
            </p>
          </div>

          {/* Token Amount */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Token Amount *</label>
            <input
              type="number"
              min="1"
              step="1"
              value={txAmount}
              onChange={(e) => {
                setTxAmount(e.target.value);
                setTxPreview(false);
              }}
              placeholder="1000000"
              style={inputStyle}
            />
            <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>
              Amount in minimal denomination (e.g. 1000000 uclaw = 1 CLAW).
            </p>
          </div>

          {/* Denom Selector */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Denom</label>
            <select
              value={txDenom}
              onChange={(e) => {
                setTxDenom(e.target.value);
                setTxPreview(false);
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {denomOptions.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Timeout Height */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Timeout Height Offset</label>
            <input
              type="number"
              min="100"
              step="100"
              value={txTimeoutHeight}
              onChange={(e) => {
                setTxTimeoutHeight(e.target.value);
                setTxPreview(false);
              }}
              placeholder="1000"
              style={inputStyle}
            />
            <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>
              Blocks until timeout on the destination chain. Default: 1000 blocks.
            </p>
          </div>

          {/* Memo */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Memo (optional)</label>
            <input
              type="text"
              value={txMemo}
              onChange={(e) => {
                setTxMemo(e.target.value);
                setTxPreview(false);
              }}
              placeholder="Optional transfer memo"
              style={inputStyle}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="secondary"
              onClick={handlePreview}
              disabled={!txChannel || !txRecipient || !txAmount}
            >
              Preview Transfer
            </button>
            <button
              className="primary"
              onClick={handleSendTransfer}
              disabled={!txChannel || !txRecipient || !txAmount || sending}
            >
              {sending ? "Sending..." : "Send Transfer"}
            </button>
          </div>

          {/* Preview */}
          {txPreview && (
            <div
              className="card"
              style={{
                marginTop: 16,
                background: "var(--bg2, #111)",
                border: "1px solid var(--border, #333)",
              }}
            >
              <h4 style={{ marginTop: 0, marginBottom: 8 }}>Transfer Preview</h4>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 600, width: 140 }}>Channel</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>{txChannel}</td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>Counterparty</td>
                    <td style={tdStyle}>
                      {selectedChannel
                        ? `${selectedChannel.counterparty.port_id}/${selectedChannel.counterparty.channel_id}`
                        : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>Recipient</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", wordBreak: "break-all" }}>
                      {txRecipient}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>Amount</td>
                    <td style={tdStyle}>
                      {txAmount} {txDenom}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>Timeout</td>
                    <td style={tdStyle}>{txTimeoutHeight} blocks</td>
                  </tr>
                  {txMemo && (
                    <tr>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>Memo</td>
                      <td style={tdStyle}>{txMemo}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: "var(--bg, #0a0a0a)",
                  borderRadius: 6,
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: 200,
                  color: "var(--text2)",
                }}
              >
                {JSON.stringify(buildMsgTransfer(), null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right column: Info + Warning */}
        <div style={{ flex: "1 1 300px", maxWidth: 400 }}>
          {/* Transfer Info */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h4 style={{ marginTop: 0 }}>What is IBC Transfer?</h4>
            <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
              IBC (Inter-Blockchain Communication) transfer allows you to send tokens from
              ClawChain to another IBC-enabled blockchain. The tokens are locked on the source
              chain and a voucher is minted on the destination chain.
            </p>
            {selectedChannel && (
              <div
                style={{
                  padding: "8px 12px",
                  background: "var(--bg2, #111)",
                  borderRadius: 6,
                  marginTop: 8,
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: "var(--text2)" }}>
                  <strong>Selected Channel:</strong> {selectedChannel.channel_id}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
                  <strong>Counterparty Port:</strong> {selectedChannel.counterparty.port_id}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
                  <strong>Counterparty Channel:</strong> {selectedChannel.counterparty.channel_id}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
                  <strong>Connection:</strong> {selectedChannel.connection_hops?.[0] ?? "-"}
                </p>
              </div>
            )}
          </div>

          {/* Warning */}
          <div
            className="card"
            style={{
              borderLeft: "3px solid var(--yellow, #eab308)",
              background: "rgba(234, 179, 8, 0.05)",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--yellow, #eab308)", fontWeight: 600 }}>
              Warning
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>
              Tokens sent via IBC can only be returned through the same channel. If the channel
              closes, your tokens may become stranded on the destination chain. Always verify the
              recipient address and channel before sending.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Transfers */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>
            Recent Transfers
            {txChannel ? ` (${txChannel})` : ""}
          </h3>
          {txChannel && (
            <button className="secondary" onClick={loadRecentTransfers} style={{ fontSize: 12 }}>
              Refresh
            </button>
          )}
        </div>

        {!txChannel ? (
          <p style={{ color: "var(--text2)", margin: 0 }}>
            Select a source channel above to view recent IBC transfers.
          </p>
        ) : transfersLoading ? (
          <div className="loading">
            <div className="spinner" />
            <p>Loading recent transfers...</p>
          </div>
        ) : recentTransfers.length === 0 ? (
          <div className="empty">No recent transfers found for {txChannel}.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={thStyle}>Tx Hash</th>
                  <th style={thStyle}>Height</th>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Denom</th>
                  <th style={thStyle}>Destination</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransfers.map((tx, i) => (
                  <tr key={`${tx.hash}-${i}`}>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                      {tx.hash ? truncateAddr(tx.hash, 8, 8) : "-"}
                    </td>
                    <td style={tdStyle}>{tx.height || "-"}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {tx.timestamp
                        ? new Date(tx.timestamp).toLocaleString()
                        : "-"}
                    </td>
                    <td style={tdStyle}>{tx.amount}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{tx.denom}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                      {tx.destination}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeBase,
                          color:
                            tx.status === "Success"
                              ? "var(--green, #22c55e)"
                              : "var(--red, #ef4444)",
                          background:
                            tx.status === "Success"
                              ? "rgba(34, 197, 94, 0.15)"
                              : "rgba(239, 68, 68, 0.15)",
                        }}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
