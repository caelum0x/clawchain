import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getComputeResources,
  getComputeJobs,
  getComputeLeases,
  getProviderStats,
  formatClaw,
  shortAddr,
  type ComputeResource,
  type ComputeJob,
  type ComputeLease,
  type ProviderStats,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, type WalletState } from "../lib/wallet.ts";
import CopyButton from "../components/CopyButton.tsx";

type Tab = "resources" | "earnings" | "jobs" | "settings";

function restUrl(path: string): string {
  const base = chainConfig.restEndpoint.startsWith("http")
    ? chainConfig.restEndpoint
    : `${window.location.origin}${chainConfig.restEndpoint}`;
  return `${base}${path}`;
}

async function fetchHeartbeatHealth(address: string): Promise<{
  lastHeartbeat: number;
  uptimeBlocks: number;
  isHealthy: boolean;
}> {
  try {
    const resp = await fetch(restUrl(`/clawchain/agent/v1/agent_liveness/${address}`));
    if (!resp.ok) return { lastHeartbeat: 0, uptimeBlocks: 0, isHealthy: false };
    const data = await resp.json();
    return {
      lastHeartbeat: data.last_heartbeat ?? data.lastHeartbeat ?? 0,
      uptimeBlocks: data.uptime_blocks ?? data.uptimeBlocks ?? 0,
      isHealthy: data.is_healthy ?? data.isHealthy ?? false,
    };
  } catch {
    return { lastHeartbeat: 0, uptimeBlocks: 0, isHealthy: false };
  }
}

const JOB_STATUS_BADGE: Record<string, string> = {
  running: "",
  completed: "badge-success",
  failed: "badge-error",
  pending: "badge-warning",
  queued: "badge-warning",
  cancelled: "badge-error",
};

// Revenue data for chart — even distribution across days
function generateRevenueChartData(totalRevenue: string): { label: string; value: number }[] {
  const total = Number(BigInt(totalRevenue || "0")) / 1_000_000;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const perDay = total / 7;
  return days.map((label) => ({
    label,
    value: Math.max(0, perDay),
  }));
}

export default function ProviderDashboard() {
  useDocTitle("Provider Dashboard");
  const [tab, setTab] = useState<Tab>("resources");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [addressInput, setAddressInput] = useState("");
  const [providerAddress, setProviderAddress] = useState("");

  const [stats, setStats] = useState<ProviderStats | null>(null);
  const [resources, setResources] = useState<ComputeResource[]>([]);
  const [jobs, setJobs] = useState<ComputeJob[]>([]);
  const [leases, setLeases] = useState<ComputeLease[]>([]);
  const [heartbeat, setHeartbeat] = useState<{
    lastHeartbeat: number;
    uptimeBlocks: number;
    isHealthy: boolean;
  }>({ lastHeartbeat: 0, uptimeBlocks: 0, isHealthy: false });

  // Settings form
  const [editResourceId, setEditResourceId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editActive, setEditActive] = useState(true);

  useEffect(() => {
    if (providerAddress) loadAll(providerAddress);
  }, [providerAddress]);

  async function loadAll(address: string) {
    setLoading(true);
    setError(null);
    try {
      const [allResources, provJobs, provLeases, provStats, hb] = await Promise.all([
        getComputeResources(),
        getComputeJobs(address),
        getComputeLeases(address),
        getProviderStats(address),
        fetchHeartbeatHealth(address),
      ]);
      // Filter resources to this provider only
      const myResources = allResources.filter((r) => r.owner === address);
      setResources(myResources);
      setJobs(provJobs);
      setLeases(provLeases);
      setStats(provStats);
      setHeartbeat(hb);
    } catch {
      setError("Failed to load provider data. Is the chain running?");
    }
    setLoading(false);
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (trimmed) setProviderAddress(trimmed);
  }

  // Derived values
  const totalRevenue = stats?.totalRevenue ?? "0";
  const totalJobs = stats?.totalJobs ?? 0;
  const completedJobs = stats?.completedJobs ?? 0;
  const failedJobs = stats?.failedJobs ?? 0;
  const activeLeases = stats?.activeLeases ?? 0;
  const successRate = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : "0.0";

  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "pending");
  const recentCompletedJobs = jobs.filter((j) => j.status === "completed");
  const recentFailedJobs = jobs.filter((j) => j.status === "failed");

  const resourceRevenue = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const r of resources) {
      map.set(r.id, BigInt(r.totalRevenue || "0"));
    }
    return map;
  }, [resources]);

  const revenueChart = useMemo(() => generateRevenueChartData(totalRevenue), [totalRevenue]);
  const maxChartValue = Math.max(...revenueChart.map((d) => d.value), 1);

  const utilizationPct = useMemo(() => {
    if (resources.length === 0) return 0;
    const leased = resources.filter((r) => r.currentLessee).length;
    return Math.round((leased / resources.length) * 100);
  }, [resources]);

  async function handleConnectWallet() {
    setTxStatus(null);
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? "Failed to connect wallet", type: "error" });
    }
  }

  async function handleUpdateResource(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet before updating resources.", type: "error" });
      return;
    }
    setSubmitting(true);
    setTxStatus(null);
    try {
      const resources = {
        resource_id: editResourceId,
        price_per_hour_uclaw: String(Math.round(parseFloat(editPrice) * 1_000_000)),
        active: editActive,
      };
      const msg = {
        type: "clawchain/agent/MsgAgentAction",
        value: {
          sender: wallet.address,
          agent_address: wallet.address,
          action_type: "update_resources",
          payload: JSON.stringify(resources),
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], "Update provider resource");
      if (result.code !== 0) {
        setTxStatus({ msg: `Transaction failed (code ${result.code})`, type: "error" });
      } else {
        setTxStatus({ msg: `Resource updated successfully. Tx: ${result.txHash}`, type: "success" });
        setEditResourceId(null);
        setEditPrice("");
        if (providerAddress) loadAll(providerAddress);
      }
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? "Failed to update resource", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleAvailability(resourceId: string, currentActive: boolean) {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet before toggling availability.", type: "error" });
      return;
    }
    setSubmitting(true);
    setTxStatus(null);
    try {
      const msg = {
        type: "clawchain/agent/MsgAgentHeartbeat",
        value: {
          sender: wallet.address,
          agent_address: wallet.address,
        },
      };
      const result = await signAndBroadcast(
        wallet.address,
        [msg],
        `Set resource #${resourceId} to ${currentActive ? "inactive" : "active"}`,
      );
      if (result.code !== 0) {
        setTxStatus({ msg: `Transaction failed (code ${result.code})`, type: "error" });
      } else {
        setTxStatus({
          msg: `Resource #${resourceId} set to ${currentActive ? "inactive" : "active"}. Tx: ${result.txHash}`,
          type: "success",
        });
        if (providerAddress) loadAll(providerAddress);
      }
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? "Failed to toggle availability", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "resources", label: `Resources (${resources.length})` },
    { key: "earnings", label: "Earnings" },
    { key: "jobs", label: `Jobs (${jobs.length})` },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div>
      <h1 className="page-title">Provider Dashboard</h1>
      <p className="page-subtitle">
        GPU provider operator dashboard -- manage resources, monitor jobs, and track earnings.
      </p>

      {/* Address lookup */}
      <div className="card" style={{ marginBottom: "1.5rem", maxWidth: "600px" }}>
        <form
          onSubmit={handleLookup}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter your provider claw... address"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button className="btn btn-primary" type="submit">
            Lookup
          </button>
        </form>
        {providerAddress && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text2)" }}>
            Provider: <strong>{shortAddr(providerAddress)}</strong>{" "}
            <CopyButton text={providerAddress} />
          </p>
        )}
      </div>

      {/* Wallet connect */}
      <div className="card" style={{ marginBottom: "1.5rem", maxWidth: "600px" }}>
        {!wallet?.connected ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text2)" }}>
              {isKeplrAvailable()
                ? "Connect your Keplr wallet to manage resources."
                : "Install the Keplr browser extension to manage resources."}
            </p>
            <button className="btn btn-primary" onClick={handleConnectWallet} disabled={!isKeplrAvailable()}>
              Connect Wallet
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text2)" }}>
            Wallet connected: <strong>{shortAddr(wallet.address)}</strong>
          </p>
        )}
      </div>

      {/* Tx status */}
      {txStatus && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: txStatus.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: txStatus.type === "success" ? "#22c55e" : "#ef4444",
          }}
        >
          {txStatus.msg}
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading provider data...</p>
        </div>
      )}

      {!loading && !providerAddress && (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>GPU Provider Dashboard</h2>
          <p style={{ color: "var(--text2)" }}>
            Enter your provider address above to view your GPU resources, jobs,
            earnings, and manage your provider settings.
          </p>
        </div>
      )}

      {!loading && providerAddress && (
        <>
          {/* Status header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Health Status
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: heartbeat.isHealthy ? "#22c55e" : "#ef4444",
                    marginRight: "0.5rem",
                  }}
                />
                {heartbeat.isHealthy ? "Healthy" : "Unhealthy"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: "0.25rem" }}>
                Last heartbeat: block {heartbeat.lastHeartbeat || "--"}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Resources
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{resources.length}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: "0.25rem" }}>
                {resources.filter((r) => r.active).length} active
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Utilization
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{utilizationPct}%</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: "0.25rem" }}>
                {activeLeases} active lease{activeLeases !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total Revenue
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                {formatClaw(totalRevenue)}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Success Rate
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{successRate}%</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: "0.25rem" }}>
                {completedJobs}/{totalJobs} jobs
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Uptime
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {heartbeat.uptimeBlocks.toLocaleString()} blocks
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`btn ${tab === t.key ? "btn-primary" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Resources Tab */}
          {tab === "resources" && (
            <>
              {resources.length === 0 ? (
                <div className="card">
                  <p style={{ color: "var(--text2)" }}>
                    No GPU resources registered for this address.{" "}
                    <Link to="/gpu" style={{ color: "var(--accent)" }}>
                      Register a resource
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>GPU</th>
                        <th>VRAM</th>
                        <th>Price/hr</th>
                        <th>Status</th>
                        <th>Current Lessee</th>
                        <th>Total Leases</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.id}</td>
                          <td style={{ fontWeight: 600 }}>{r.name || "--"}</td>
                          <td>
                            {r.gpuModel || "--"} x{r.gpuCount}
                          </td>
                          <td>{r.vramGb} GB</td>
                          <td>{formatClaw(r.pricePerHourUclaw)}</td>
                          <td>
                            {r.active ? (
                              r.currentLessee ? (
                                <span className="badge badge-info">Leased</span>
                              ) : (
                                <span className="badge badge-success">Available</span>
                              )
                            ) : (
                              <span className="badge badge-warning">Inactive</span>
                            )}
                          </td>
                          <td>
                            {r.currentLessee ? (
                              <Link
                                to={`/explorer/account/${r.currentLessee}`}
                                className="mono"
                                style={{ color: "var(--accent)" }}
                              >
                                {shortAddr(r.currentLessee)}
                              </Link>
                            ) : (
                              "--"
                            )}
                          </td>
                          <td>{r.totalLeases}</td>
                          <td style={{ color: "#22c55e", fontWeight: 600 }}>
                            {formatClaw(r.totalRevenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Earnings Tab */}
          {tab === "earnings" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Total Revenue
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                    {formatClaw(totalRevenue)}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Total Leases
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {resources.reduce((sum, r) => sum + r.totalLeases, 0)}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Avg Revenue/Resource
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {resources.length > 0
                      ? formatClaw(
                          (
                            BigInt(totalRevenue || "0") / BigInt(resources.length || 1)
                          ).toString()
                        )
                      : "0 CLAW"}
                  </div>
                </div>
              </div>

              {/* Revenue chart (simple bar visualization) */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ marginBottom: "1rem" }}>Weekly Revenue (Estimated)</h3>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "0.5rem",
                    height: 160,
                    padding: "0.5rem 0",
                  }}
                >
                  {revenueChart.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 40,
                          height: `${Math.max(4, (d.value / maxChartValue) * 120)}px`,
                          background: "var(--accent, #3b82f6)",
                          borderRadius: "4px 4px 0 0",
                          transition: "height 0.3s",
                        }}
                        title={`${d.value.toFixed(2)} CLAW`}
                      />
                      <span style={{ fontSize: "0.7rem", color: "var(--text2)" }}>{d.label}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: "0.5rem" }}>
                  Note: Chart shows estimated distribution based on total revenue.
                </p>
              </div>

              {/* Per-resource breakdown */}
              {resources.length > 0 && (
                <div className="card">
                  <h3 style={{ marginBottom: "1rem" }}>Revenue by Resource</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Resource</th>
                        <th style={thStyle}>GPU</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Leases</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources
                        .sort((a, b) => Number(BigInt(b.totalRevenue) - BigInt(a.totalRevenue)))
                        .map((r) => {
                          const rev = BigInt(r.totalRevenue || "0");
                          const totalRev = BigInt(totalRevenue || "0");
                          const pct = totalRev > 0n ? Number((rev * 10000n) / totalRev) / 100 : 0;
                          return (
                            <tr key={r.id}>
                              <td style={tdStyle}>
                                <div style={{ fontWeight: 600 }}>{r.name || `Resource #${r.id}`}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                                  ID: {r.id}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                {r.gpuModel} x{r.gpuCount}
                              </td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>{r.totalLeases}</td>
                              <td
                                style={{
                                  ...tdStyle,
                                  textAlign: "right",
                                  color: "#22c55e",
                                  fontWeight: 600,
                                }}
                              >
                                {formatClaw(r.totalRevenue)}
                              </td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>{pct.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Jobs Tab */}
          {tab === "jobs" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Running
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                    {runningJobs.length}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Completed
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                    {completedJobs}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Failed
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      color: failedJobs > 0 ? "#ef4444" : undefined,
                    }}
                  >
                    {failedJobs}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Success Rate
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{successRate}%</div>
                </div>
              </div>

              {jobs.length === 0 ? (
                <div className="card">
                  <p style={{ color: "var(--text2)" }}>No jobs found for this provider.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Job ID</th>
                        <th>Name</th>
                        <th>Resource</th>
                        <th>Submitter</th>
                        <th>GPU</th>
                        <th>Status</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => (
                        <tr key={j.id}>
                          <td className="mono">{j.id}</td>
                          <td>{j.name || "--"}</td>
                          <td className="mono">{j.resourceId}</td>
                          <td>
                            <Link
                              to={`/explorer/account/${j.submitter}`}
                              className="mono"
                              style={{ color: "var(--accent)" }}
                            >
                              {shortAddr(j.submitter)}
                            </Link>
                          </td>
                          <td>
                            {j.gpuType || "--"} x{j.gpuCount}
                          </td>
                          <td>
                            <span className={`badge ${JOB_STATUS_BADGE[j.status] ?? ""}`}>
                              {j.status}
                            </span>
                          </td>
                          <td>{j.executionType || j.jobType || "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Settings Tab */}
          {tab === "settings" && (
            <>
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ marginBottom: "1rem" }}>Manage Resources</h3>
                <p style={{ color: "var(--text2)", marginBottom: "1rem" }}>
                  Update pricing and availability for your registered GPU resources.
                </p>

                {resources.length === 0 ? (
                  <p style={{ color: "var(--text2)" }}>No resources to manage.</p>
                ) : (
                  resources.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: "1rem",
                        borderBottom: "1px solid var(--border, #333)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name || `Resource #${r.id}`}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>
                          {r.gpuModel} x{r.gpuCount} | {r.vramGb} GB VRAM | {r.region || "Global"}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>
                          Current price: {formatClaw(r.pricePerHourUclaw)}/hr |{" "}
                          {r.active ? "Active" : "Inactive"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          className="btn"
                          style={{ fontSize: "0.8rem" }}
                          onClick={() => {
                            setEditResourceId(r.id);
                            setEditPrice(
                              (Number(BigInt(r.pricePerHourUclaw)) / 1_000_000).toString()
                            );
                            setEditActive(r.active);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className={`btn ${r.active ? "" : "btn-primary"}`}
                          style={{ fontSize: "0.8rem" }}
                          onClick={() => handleToggleAvailability(r.id, r.active)}
                        >
                          {r.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Edit modal (inline) */}
              {editResourceId && (
                <div className="card" style={{ maxWidth: 500 }}>
                  <h3 style={{ marginBottom: "1rem" }}>
                    Edit Resource #{editResourceId}
                  </h3>
                  <form onSubmit={handleUpdateResource}>
                    <div style={{ marginBottom: "1rem" }}>
                      <label>Price per Hour (CLAW)</label>
                      <input
                        type="number"
                        step="0.000001"
                        min="0"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        placeholder="0.5"
                        required
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                        />
                        Active (available for leasing)
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn btn-primary" type="submit">
                        Update Resource
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => setEditResourceId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Provider info card */}
              <div className="card" style={{ marginTop: "1.5rem" }}>
                <h3 style={{ marginBottom: "1rem" }}>Provider Info</h3>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ ...tdStyle, color: "var(--text2)", fontWeight: 600 }}>Address</td>
                      <td style={tdStyle}>
                        <code className="mono">{providerAddress}</code>{" "}
                        <CopyButton text={providerAddress} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ ...tdStyle, color: "var(--text2)", fontWeight: 600 }}>
                        Total Resources
                      </td>
                      <td style={tdStyle}>{resources.length}</td>
                    </tr>
                    <tr>
                      <td style={{ ...tdStyle, color: "var(--text2)", fontWeight: 600 }}>
                        Average Rating
                      </td>
                      <td style={tdStyle}>
                        {stats?.avgRating ? (stats.avgRating / 100).toFixed(2) : "--"}/5.0
                      </td>
                    </tr>
                    <tr>
                      <td style={{ ...tdStyle, color: "var(--text2)", fontWeight: 600 }}>
                        Uptime Blocks
                      </td>
                      <td style={tdStyle}>{heartbeat.uptimeBlocks.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ ...tdStyle, color: "var(--text2)", fontWeight: 600 }}>
                        Last Heartbeat
                      </td>
                      <td style={tdStyle}>Block #{heartbeat.lastHeartbeat || "--"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border, #333)",
  color: "var(--text2)",
  fontSize: "0.8rem",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border, #222)",
  fontSize: "0.875rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  background: "var(--bg, #0a0a0a)",
  border: "1px solid var(--border, #333)",
  borderRadius: "0.375rem",
  color: "var(--text, #fff)",
  fontSize: "0.875rem",
};
