import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getComputeResources,
  getComputeLeases,
  getComputeJobs,
  getLatestBlock,
  buildLeaseComputeResourceMsg,
  buildSubmitComputeJobMsg,
  formatClaw,
  shortAddr,
  type ComputeResource,
  type ComputeLease,
  type ComputeJob,
} from "../lib/chain.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, type WalletState } from "../lib/wallet.ts";
import LiveGPUStatus from "../components/LiveGPUStatus.tsx";

type Tab = "resources" | "jobs" | "leases" | "submit" | "monitor";
type WizardStep = 1 | 2 | 3 | 4;
type JobType = "docker" | "script";

const WIZARD_LABELS = [
  "Select Resource",
  "Configure Job",
  "Review & Submit",
  "Confirmation",
];

export default function GPUCompute() {
  useDocTitle("GPU Compute");
  const [resources, setResources] = useState<ComputeResource[]>([]);
  const [leases, setLeases] = useState<ComputeLease[]>([]);
  const [jobs, setJobs] = useState<ComputeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("resources");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [currentHeight, setCurrentHeight] = useState(0);

  // Lease form
  const [leaseResourceId, setLeaseResourceId] = useState<string | null>(null);
  const [leaseDuration, setLeaseDuration] = useState("1");
  const [leaseSubmitting, setLeaseSubmitting] = useState(false);
  const [leaseStatus, setLeaseStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [wizardJobType, setWizardJobType] = useState<JobType>("docker");
  const [wizardDockerImage, setWizardDockerImage] = useState("");
  const [wizardCommand, setWizardCommand] = useState("");
  const [wizardEnvVars, setWizardEnvVars] = useState("");
  const [wizardScriptContent, setWizardScriptContent] = useState("");
  const [wizardMaxDuration, setWizardMaxDuration] = useState("1");
  const [wizardBudget, setWizardBudget] = useState("");
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardResult, setWizardResult] = useState<{ jobId: string; txHash: string } | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Job detail
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Job Monitor
  const [monitorJobId, setMonitorJobId] = useState<string | null>(null);
  const [monitorLogsExpanded, setMonitorLogsExpanded] = useState(false);

  async function loadData() {
    try {
      const [res, lse, jbs, blk] = await Promise.all([
        getComputeResources(),
        getComputeLeases(),
        getComputeJobs(),
        getLatestBlock(),
      ]);
      setResources(res);
      setLeases(lse);
      setJobs(jbs);
      setCurrentHeight(parseInt(blk.height) || 0);
    } catch { /* offline */ }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // Running timer for active jobs
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      console.error("Wallet connect failed:", e);
    }
  }

  async function handleLeaseResource(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address || !leaseResourceId) return;
    setLeaseSubmitting(true);
    setLeaseStatus(null);

    try {
      const msg = buildLeaseComputeResourceMsg(
        wallet.address,
        parseInt(leaseResourceId),
        parseInt(leaseDuration)
      );

      const result = await signAndBroadcast(wallet.address, [msg], "Lease GPU compute resource");

      if (result.code === 0) {
        setLeaseStatus({ type: "success", msg: `Lease created! Tx: ${result.txHash}` });
        setLeaseResourceId(null);
        setLeaseDuration("1");
        loadData();
      } else {
        setLeaseStatus({ type: "error", msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setLeaseStatus({ type: "error", msg: e.message });
    } finally {
      setLeaseSubmitting(false);
    }
  }

  // Wizard submission
  async function handleWizardSubmit() {
    if (!wallet?.address || !selectedResourceId) return;
    setWizardSubmitting(true);
    setWizardError(null);

    try {
      const budgetUclaw = String(Math.floor(parseFloat(wizardBudget) * 1_000_000));
      const dockerImage = wizardJobType === "docker" ? wizardDockerImage : "";
      const script = wizardJobType === "script" ? wizardScriptContent : wizardCommand;
      const selectedRes = resources.find((r) => r.id === selectedResourceId);
      const gpuType = selectedRes?.gpuModel || "any";

      const msg = buildSubmitComputeJobMsg(
        wallet.address,
        parseInt(selectedResourceId),
        dockerImage,
        script,
        gpuType,
        selectedRes?.gpuCount ?? 1,
        budgetUclaw
      );

      const result = await signAndBroadcast(wallet.address, [msg], "Submit GPU compute job");

      if (result.code === 0) {
        const jobId = result.txHash?.slice(0, 8) || "pending";
        setWizardResult({ jobId, txHash: result.txHash || "" });
        setWizardStep(4);
        loadData();
      } else {
        setWizardError(`Transaction failed (code ${result.code})`);
      }
    } catch (e: any) {
      setWizardError(e.message);
    } finally {
      setWizardSubmitting(false);
    }
  }

  function resetWizard() {
    setWizardStep(1);
    setSelectedResourceId(null);
    setWizardJobType("docker");
    setWizardDockerImage("");
    setWizardCommand("");
    setWizardEnvVars("");
    setWizardScriptContent("");
    setWizardMaxDuration("1");
    setWizardBudget("");
    setWizardResult(null);
    setWizardError(null);
  }

  const formatDuration = useCallback((startTimestamp: number): string => {
    if (!startTimestamp) return "--";
    const elapsed = Math.floor((now / 1000) - startTimestamp);
    if (elapsed < 0) return "0s";
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, [now]);

  if (loading) return <div className="loading" data-testid="loading"><div className="spinner" /><p>Loading GPU compute data...</p></div>;

  // Derive stats
  const totalResources = resources.length;
  const activeLeaseCount = leases.filter((l) => l.status === "active").length;
  const pendingJobs = jobs.filter((j) => j.status === "pending").length;
  const availableResources = resources.filter((r) => r.active && !r.currentLessee);

  const selectedResource = selectedResourceId ? resources.find((r) => r.id === selectedResourceId) : null;

  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "pending");

  const tabs: { key: Tab; label: string }[] = [
    { key: "resources", label: `Resources (${resources.length})` },
    { key: "jobs", label: `Jobs (${jobs.length})` },
    { key: "leases", label: `Leases (${leases.length})` },
    { key: "monitor", label: `Job Monitor (${runningJobs.length})` },
    { key: "submit", label: "Submit Job" },
  ];

  function statusBadgeClass(status: string): string {
    switch (status.toLowerCase()) {
      case "pending": return "warning";
      case "running": return "info";
      case "completed": return "success";
      case "failed": return "error";
      case "active": return "success";
      case "expired": return "warning";
      default: return "";
    }
  }

  function statusBadgeColor(status: string): string {
    switch (status.toLowerCase()) {
      case "pending": return "var(--yellow)";
      case "running": return "var(--accent)";
      case "completed": return "var(--green)";
      case "failed": return "var(--red)";
      default: return "var(--text2)";
    }
  }

  function jobStatusCssClass(status: string): string {
    switch (status.toLowerCase()) {
      case "pending": return "pending";
      case "running": return "running";
      case "completed": return "completed";
      case "failed": return "failed";
      default: return "";
    }
  }

  // Cost estimate for wizard
  function estimatedCost(): string {
    if (!selectedResource || !wizardMaxDuration) return "--";
    const pricePerHour = parseInt(selectedResource.pricePerHourUclaw) || 0;
    const hours = parseFloat(wizardMaxDuration) || 0;
    const totalUclaw = String(Math.floor(pricePerHour * hours));
    return formatClaw(totalUclaw);
  }

  // --- Wizard step validation ---
  function canProceedStep1(): boolean {
    return !!selectedResourceId;
  }

  function canProceedStep2(): boolean {
    if (wizardJobType === "docker" && !wizardDockerImage.trim()) return false;
    if (wizardJobType === "script" && !wizardScriptContent.trim()) return false;
    if (!wizardMaxDuration || parseFloat(wizardMaxDuration) <= 0) return false;
    if (!wizardBudget || parseFloat(wizardBudget) <= 0) return false;
    return true;
  }

  return (
    <>
      <h1 className="page-title">GPU Compute Marketplace</h1>
      <p className="page-subtitle">Lease GPU resources, submit compute jobs, and monitor workloads on ClawChain.</p>

      {/* Network stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Total Resources
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>{totalResources}</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Active Leases
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--green)" }}>{activeLeaseCount}</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Pending Jobs
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--yellow)" }}>{pendingJobs}</div>
        </div>
      </div>

      {/* Live GPU activity feed */}
      <LiveGPUStatus activeLeaseCount={activeLeaseCount} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key === "submit") resetWizard(); }}
            className={tab === t.key ? "" : "btn-outline"}
            style={{ fontSize: 13, padding: "8px 16px" }}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Lease modal overlay */}
      {leaseResourceId && (
        <div className="card" style={{ maxWidth: 500, marginBottom: 24 }}>
          <h3>Lease GPU Resource #{leaseResourceId}</h3>
          {!wallet?.connected ? (
            <div>
              <p>Connect your wallet to lease GPU compute.</p>
              <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleLeaseResource}>
              <p>Connected: <strong>{shortAddr(wallet.address)}</strong></p>
              <div style={{ marginBottom: "1rem" }}>
                <label>Duration (hours)</label>
                <input type="number" min="1" value={leaseDuration} onChange={(e) => setLeaseDuration(e.target.value)}
                  required style={{ width: "100%", padding: "0.5rem" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={leaseSubmitting}>
                  {leaseSubmitting ? "Leasing..." : "Confirm Lease"}
                </button>
                <button className="btn" type="button" onClick={() => setLeaseResourceId(null)}>Cancel</button>
              </div>
            </form>
          )}
          {leaseStatus && (
            <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: "0.5rem",
              background: leaseStatus.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: leaseStatus.type === "success" ? "#22c55e" : "#ef4444" }}>
              {leaseStatus.msg}
            </div>
          )}
        </div>
      )}

      {/* =========== RESOURCES TAB =========== */}
      {tab === "resources" && (
        resources.length === 0 ? (
          <div className="empty" data-testid="empty-resources">No GPU compute resources listed yet. Providers can register resources via the SDK or CLI.</div>
        ) : (
          <div className="gpu-grid" data-testid="resource-grid">
            {resources.map((r) => {
              const isAvailable = r.active && !r.currentLessee;
              const isBusy = !!r.currentLessee;
              const statusLabel = isAvailable ? "Available" : isBusy ? "Busy" : "Offline";
              const statusColor = isAvailable ? "#22c55e" : isBusy ? "#f59e0b" : "#ef4444";
              const utilization = isBusy ? 100 : 0;

              return (
                <div key={r.id} className="gpu-card" data-testid="resource-card">
                  {/* Header: GPU name + status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div className="gpu-name">{r.gpuModel || "Unknown GPU"}</div>
                      <div style={{ fontSize: 12, color: "var(--text2)" }}>{r.name}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }} data-testid="resource-status">{statusLabel}</span>
                    </div>
                  </div>

                  {/* Specs grid */}
                  <div className="gpu-specs">
                    <span className="gpu-spec-label">VRAM</span>
                    <span className="gpu-spec-value">{r.vramGb} GB</span>
                    <span className="gpu-spec-label">CUDA Cores</span>
                    <span className="gpu-spec-value">{r.gpuCount > 1 ? `${r.gpuCount}x` : "N/A"}</span>
                    <span className="gpu-spec-label">Tensor Cores</span>
                    <span className="gpu-spec-value">N/A</span>
                    <span className="gpu-spec-label">CPU / RAM</span>
                    <span className="gpu-spec-value">{r.cpuCores}C / {r.ramGb}GB</span>
                    <span className="gpu-spec-label">Storage</span>
                    <span className="gpu-spec-value">{r.storageGb} GB</span>
                    <span className="gpu-spec-label">Region</span>
                    <span className="gpu-spec-value">{r.region || "Global"}</span>
                  </div>

                  {/* Utilization bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>
                      <span>Utilization</span>
                      <span>{isBusy ? "In Use" : "Idle"}</span>
                    </div>
                    <div className="gpu-utilization">
                      <div
                        className="gpu-utilization-fill"
                        style={{ width: `${utilization}%` }}
                        data-testid="utilization-bar"
                      />
                    </div>
                  </div>

                  {/* Price + Provider row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Price/hr</div>
                      <div className="gpu-price">{formatClaw(r.pricePerHourUclaw)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Provider</div>
                      <Link to={`/explorer/account/${r.owner}`} className="mono" style={{ fontSize: 12 }}>
                        {shortAddr(r.owner)}
                      </Link>
                    </div>
                  </div>

                  {/* Tags */}
                  {r.tags && r.tags.length > 0 && (
                    <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {r.tags.map((t) => (
                        <span key={t} style={{ background: "var(--bg3)", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "var(--text2)", border: "1px solid var(--border)" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats */}
                  {r.totalLeases > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 8 }}>
                      {r.totalLeases} total leases / {formatClaw(r.totalRevenue)} earned
                    </div>
                  )}

                  {/* Rent button */}
                  {isAvailable && (
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", padding: "8px 16px" }}
                      onClick={() => setLeaseResourceId(r.id)}
                      data-testid="rent-button"
                    >
                      Rent
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* =========== JOBS TAB =========== */}
      {tab === "jobs" && (
        jobs.length === 0 ? (
          <div className="empty" data-testid="empty-jobs">No compute jobs found. Submit a job to get started.</div>
        ) : (
          <div data-testid="job-list">
            {jobs.map((j) => {
              const isExpanded = expandedJobId === j.id;
              const isRunning = j.status.toLowerCase() === "running";
              const duration = isRunning
                ? formatDuration(j.startedAt)
                : j.completedAt && j.startedAt
                  ? formatDuration(j.startedAt).replace(/s$/, "") // static display
                  : "--";

              // Rough cost based on elapsed time (mock)
              const accumulatedCost = j.startedAt
                ? formatClaw(String(Math.floor((now / 1000 - j.startedAt) * 100)))
                : "--";

              return (
                <div key={j.id} className="job-card" data-testid="job-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%" }}>
                    {/* Job ID */}
                    <div style={{ minWidth: 80 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Job ID</div>
                      <div className="mono" style={{ fontWeight: 600 }}>{j.id}</div>
                    </div>

                    {/* Status badge */}
                    <span className={`job-status ${jobStatusCssClass(j.status)}`} data-testid="job-status-badge">
                      {j.status}
                    </span>

                    {/* GPU resource */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>GPU</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{j.gpuType || "Any"}</div>
                    </div>

                    {/* Duration */}
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Duration</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: isRunning ? "var(--accent)" : "var(--text)" }}>
                        {duration}
                      </div>
                    </div>

                    {/* Cost */}
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Cost</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)" }}>{accumulatedCost}</div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn-outline"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => setExpandedJobId(isExpanded ? null : j.id)}
                        data-testid="view-details-btn"
                      >
                        {isExpanded ? "Hide" : "View Details"}
                      </button>
                      {(j.status === "pending" || j.status === "running") && (
                        <button
                          className="btn-outline"
                          style={{ padding: "4px 10px", fontSize: 12, color: "var(--red)", borderColor: "var(--red)" }}
                          data-testid="cancel-job-btn"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for running jobs */}
                  {isRunning && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: "60%",
                          background: "var(--accent)",
                          borderRadius: 2,
                          animation: "pulse 2s ease-in-out infinite",
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div data-testid="job-detail" style={{ marginTop: 12, padding: 12, background: "var(--bg3)", borderRadius: "var(--radius)", fontSize: 13 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><span style={{ color: "var(--text2)" }}>Submitter:</span> <Link to={`/explorer/account/${j.submitter}`} className="mono">{shortAddr(j.submitter)}</Link></div>
                        <div><span style={{ color: "var(--text2)" }}>Provider:</span> {j.provider ? <Link to={`/explorer/account/${j.provider}`} className="mono">{shortAddr(j.provider)}</Link> : "--"}</div>
                        <div><span style={{ color: "var(--text2)" }}>Docker Image:</span> {j.dockerImage || "--"}</div>
                        <div><span style={{ color: "var(--text2)" }}>Submitted:</span> {j.submittedAt ? new Date(j.submittedAt * 1000).toLocaleString() : "--"}</div>
                      </div>
                      {j.status === "completed" && j.result && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ color: "var(--text2)" }}>Result:</span>
                          <div className="mono" style={{ marginTop: 4, padding: 8, background: "var(--bg)", borderRadius: 4, wordBreak: "break-all" }}>{j.result}</div>
                        </div>
                      )}
                      {j.status === "failed" && j.errorMessage && (
                        <div style={{ marginTop: 8, color: "var(--red)" }}>
                          <span>Error:</span> {j.errorMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* =========== LEASES TAB =========== */}
      {tab === "leases" && (
        leases.length === 0 ? (
          <div className="empty" data-testid="empty-leases">No active leases. Lease a GPU resource to get started.</div>
        ) : (
          <div data-testid="lease-list">
            {leases.map((l) => {
              const remaining = l.endBlock - currentHeight;
              const isActive = l.status === "active" && remaining > 0;
              const totalBlocks = l.endBlock - l.startBlock;
              const elapsed = totalBlocks > 0 ? Math.max(0, totalBlocks - remaining) : 0;
              const progressPct = totalBlocks > 0 ? Math.min(100, Math.floor((elapsed / totalBlocks) * 100)) : 0;

              return (
                <div key={l.id} className="job-card" data-testid="lease-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%", flexWrap: "wrap" }}>
                    {/* Lease ID */}
                    <div style={{ minWidth: 80 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Lease</div>
                      <div className="mono" style={{ fontWeight: 600 }}>#{l.id}</div>
                    </div>

                    {/* Resource */}
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Resource</div>
                      <div className="mono" style={{ fontSize: 13 }}>#{l.resourceId}</div>
                    </div>

                    {/* Lessee */}
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Lessee</div>
                      <Link to={`/explorer/account/${l.lessee}`} className="mono" style={{ fontSize: 12 }}>
                        {shortAddr(l.lessee)}
                      </Link>
                    </div>

                    {/* Cost */}
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Cost</div>
                      <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>
                        {formatClaw(l.totalCostUclaw)}
                      </span>
                    </div>

                    {/* Status */}
                    <span className={`badge ${statusBadgeClass(l.status)}`} data-testid="lease-status">
                      {l.status}
                    </span>

                    {/* Remaining */}
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Remaining</div>
                      <span style={{ color: isActive ? "var(--green)" : "var(--text2)", fontWeight: 600, fontSize: 13 }}>
                        {isActive ? `${remaining} blocks` : remaining <= 0 ? "Expired" : "--"}
                      </span>
                    </div>

                    {/* Actions */}
                    {isActive && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} data-testid="renew-lease-btn">
                          Renew
                        </button>
                        <button className="btn-outline" style={{ padding: "4px 10px", fontSize: 12, color: "var(--red)", borderColor: "var(--red)" }} data-testid="cancel-lease-btn">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Time remaining progress bar */}
                  {isActive && totalBlocks > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${progressPct}%`,
                          background: progressPct > 80 ? "var(--red)" : progressPct > 50 ? "var(--yellow)" : "var(--green)",
                          borderRadius: 2,
                          transition: "width 0.3s",
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                        {progressPct}% elapsed ({elapsed} / {totalBlocks} blocks)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* =========== JOB MONITOR TAB =========== */}
      {tab === "monitor" && (
        (() => {
          const monitoredJob = monitorJobId ? jobs.find((j) => j.id === monitorJobId) : null;

          // Timeline step helpers
          function timelineStepStatus(job: ComputeJob, step: "submitted" | "running" | "completed"): "done" | "active" | "pending" | "failed" {
            const s = job.status.toLowerCase();
            if (step === "submitted") return "done";
            if (step === "running") {
              if (s === "pending") return "pending";
              if (s === "running") return "active";
              if (s === "failed") return "failed";
              return "done"; // completed
            }
            // step === "completed"
            if (s === "completed") return "done";
            if (s === "failed") return "failed";
            return "pending";
          }

          function timelineStepColor(status: "done" | "active" | "pending" | "failed"): string {
            switch (status) {
              case "done": return "var(--green)";
              case "active": return "var(--accent)";
              case "failed": return "var(--red)";
              default: return "var(--border)";
            }
          }

          // Resource utilization derived from job state
          function gpuUtil(job: ComputeJob): number {
            if (job.status === "running") return 100;
            return 0;
          }

          function memoryUtil(job: ComputeJob): number {
            if (job.status === "running") return 100;
            return 0;
          }

          // Cost breakdown
          function computeCostBreakdown(job: ComputeJob): { computeCost: string; networkFee: string; totalCost: string } {
            const elapsed = job.startedAt
              ? ((job.completedAt || Math.floor(now / 1000)) - job.startedAt)
              : 0;
            const hourlyRate = 5000000; // mock: 5 CLAW/hr
            const computeUclaw = Math.floor((elapsed / 3600) * hourlyRate);
            const networkFee = Math.floor(computeUclaw * 0.02); // 2% network fee
            const total = computeUclaw + networkFee;
            return {
              computeCost: formatClaw(String(computeUclaw)),
              networkFee: formatClaw(String(networkFee)),
              totalCost: formatClaw(String(total)),
            };
          }

          // Mock log output
          function mockLogOutput(job: ComputeJob): string {
            if (job.status === "pending") {
              return JSON.stringify({ status: "queued", message: "Job is waiting for resource allocation" }, null, 2);
            }
            if (job.status === "running") {
              return JSON.stringify({
                status: "running",
                container: job.dockerImage || "custom-script",
                gpu_device: "cuda:0",
                started: new Date(job.startedAt * 1000).toISOString(),
                logs: [
                  "[INFO] Initializing GPU context...",
                  "[INFO] Loading model weights...",
                  "[INFO] Training epoch 1/100 - loss: 0.4523",
                  "[INFO] Training epoch 2/100 - loss: 0.3891",
                  "[INFO] Checkpoint saved at step 200",
                ],
              }, null, 2);
            }
            if (job.status === "completed") {
              return JSON.stringify({
                status: "completed",
                result: job.result || "Success",
                completed: job.completedAt ? new Date(job.completedAt * 1000).toISOString() : "N/A",
                logs: [
                  "[INFO] Training complete",
                  "[INFO] Final loss: 0.0234",
                  "[INFO] Model saved to /output/model.pt",
                  "[INFO] Cleanup complete",
                ],
              }, null, 2);
            }
            // failed
            return JSON.stringify({
              status: "failed",
              error: job.errorMessage || "Unknown error",
              logs: [
                "[INFO] Initializing GPU context...",
                "[ERROR] CUDA out of memory",
                "[ERROR] Job terminated with exit code 137",
              ],
            }, null, 2);
          }

          return (
            <div data-testid="monitor-tab">
              {/* Job selector */}
              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 12px 0" }}>Select a Job to Monitor</h3>
                {jobs.length === 0 ? (
                  <div className="empty" data-testid="monitor-empty">No jobs available to monitor.</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {jobs.map((j) => (
                      <button
                        key={j.id}
                        className={monitorJobId === j.id ? "" : "btn-outline"}
                        style={{ padding: "6px 14px", fontSize: 12 }}
                        onClick={() => { setMonitorJobId(j.id); setMonitorLogsExpanded(false); }}
                        data-testid="monitor-job-select"
                      >
                        Job #{j.id} ({j.status})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Job detail panels */}
              {monitoredJob && (
                <div data-testid="monitor-detail">
                  {/* Status Timeline */}
                  <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ margin: "0 0 16px 0" }}>Status Timeline</h3>
                    <div data-testid="status-timeline" style={{ display: "flex", alignItems: "center", gap: 0 }}>
                      {(["submitted", "running", "completed"] as const).map((step, i) => {
                        const stepStatus = timelineStepStatus(monitoredJob, step);
                        const color = timelineStepColor(stepStatus);
                        const label = step.charAt(0).toUpperCase() + step.slice(1);
                        const timestamp = step === "submitted" && monitoredJob.submittedAt
                          ? new Date(monitoredJob.submittedAt * 1000).toLocaleTimeString()
                          : step === "running" && monitoredJob.startedAt
                            ? new Date(monitoredJob.startedAt * 1000).toLocaleTimeString()
                            : step === "completed" && monitoredJob.completedAt
                              ? new Date(monitoredJob.completedAt * 1000).toLocaleTimeString()
                              : "--";

                        return (
                          <div key={step} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : undefined }}>
                            {/* Step circle + label */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
                              <div
                                data-testid={`timeline-step-${step}`}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: color,
                                  color: stepStatus === "pending" ? "var(--text2)" : "#fff",
                                  fontWeight: 700,
                                  fontSize: 14,
                                  border: stepStatus === "active" ? "2px solid var(--accent)" : "none",
                                  boxShadow: stepStatus === "active" ? `0 0 8px var(--accent)` : "none",
                                  animation: stepStatus === "active" ? "pulse 2s ease-in-out infinite" : "none",
                                }}
                              >
                                {stepStatus === "done" ? "\u2713" : stepStatus === "failed" ? "\u2717" : i + 1}
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: stepStatus === "pending" ? "var(--text2)" : "var(--text)" }}>
                                {monitoredJob.status === "failed" && step === "completed" ? "Failed" : label}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{timestamp}</div>
                            </div>
                            {/* Connector line */}
                            {i < 2 && (
                              <div style={{
                                flex: 1,
                                height: 3,
                                background: stepStatus === "done" || (i === 0 && monitoredJob.status !== "pending") ? "var(--green)" : "var(--border)",
                                borderRadius: 2,
                                margin: "0 8px",
                                marginBottom: 32,
                              }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Resource Utilization */}
                  <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ margin: "0 0 16px 0" }}>Resource Utilization</h3>
                    <div data-testid="resource-utilization" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                      {/* GPU Utilization */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                          <span style={{ color: "var(--text2)", fontWeight: 500 }}>GPU Utilization</span>
                          <span data-testid="gpu-util-value" style={{ fontWeight: 700, color: "var(--accent)" }}>
                            {monitoredJob.status === "pending" ? "Waiting..." : `${gpuUtil(monitoredJob)}%`}
                          </span>
                        </div>
                        <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                          <div
                            data-testid="gpu-util-bar"
                            style={{
                              height: "100%",
                              width: `${gpuUtil(monitoredJob)}%`,
                              background: "var(--accent)",
                              borderRadius: 4,
                              transition: "width 0.5s",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
                          {monitoredJob.gpuType || "GPU"} {monitoredJob.gpuCount > 1 ? `x${monitoredJob.gpuCount}` : ""}
                        </div>
                      </div>

                      {/* Memory Utilization */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                          <span style={{ color: "var(--text2)", fontWeight: 500 }}>Memory Usage</span>
                          <span data-testid="memory-util-value" style={{ fontWeight: 700, color: "var(--green)" }}>
                            {monitoredJob.status === "pending" ? "Waiting..." : `${memoryUtil(monitoredJob)}%`}
                          </span>
                        </div>
                        <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                          <div
                            data-testid="memory-util-bar"
                            style={{
                              height: "100%",
                              width: `${memoryUtil(monitoredJob)}%`,
                              background: "var(--green)",
                              borderRadius: 4,
                              transition: "width 0.5s",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>VRAM</div>
                      </div>
                    </div>
                  </div>

                  {/* Cost Breakdown */}
                  <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ margin: "0 0 16px 0" }}>Cost Breakdown</h3>
                    {(() => {
                      const costs = computeCostBreakdown(monitoredJob);
                      return (
                        <div data-testid="cost-breakdown">
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                            <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                                Compute Cost
                              </div>
                              <div data-testid="cost-compute" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                                {costs.computeCost}
                              </div>
                            </div>
                            <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                                Network Fee (2%)
                              </div>
                              <div data-testid="cost-network" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                                {costs.networkFee}
                              </div>
                            </div>
                            <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                                Total Cost
                              </div>
                              <div data-testid="cost-total" style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                                {costs.totalCost}
                              </div>
                            </div>
                          </div>
                          {monitoredJob.status === "running" && (
                            <div style={{ fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>
                              Cost is accumulating in real-time while the job is running.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Logs Viewer */}
                  <div className="card" style={{ marginBottom: 24 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                      onClick={() => setMonitorLogsExpanded(!monitorLogsExpanded)}
                      data-testid="logs-toggle"
                    >
                      <h3 style={{ margin: 0 }}>Job Logs</h3>
                      <button
                        className="btn-outline"
                        style={{ padding: "4px 12px", fontSize: 12 }}
                      >
                        {monitorLogsExpanded ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    {monitorLogsExpanded && (
                      <div data-testid="logs-content" style={{ marginTop: 12 }}>
                        <pre
                          style={{
                            background: "var(--bg3)",
                            borderRadius: "var(--radius)",
                            padding: 16,
                            fontSize: 12,
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            maxHeight: 400,
                            overflow: "auto",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            margin: 0,
                          }}
                        >
                          {mockLogOutput(monitoredJob)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* =========== SUBMIT JOB TAB (WIZARD) =========== */}
      {tab === "submit" && (
        <div data-testid="submit-wizard">
          {/* Wallet connect check */}
          {!wallet?.connected ? (
            <div className="card" style={{ maxWidth: 600, textAlign: "center", padding: 32 }}>
              <h2 style={{ marginTop: 0, marginBottom: 12 }}>Submit Compute Job</h2>
              <p style={{ color: "var(--text2)", marginBottom: 16 }}>Connect your wallet to submit a GPU compute job.</p>
              <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
              </button>
            </div>
          ) : (
            <>
              {/* Wizard progress steps */}
              <div className="wizard-steps" data-testid="wizard-steps">
                {WIZARD_LABELS.map((label, i) => {
                  const stepNum = (i + 1) as WizardStep;
                  const isActive = wizardStep === stepNum;
                  const isComplete = wizardStep > stepNum;
                  return (
                    <div
                      key={i}
                      className={`wizard-step${isActive ? " active" : ""}${isComplete ? " complete" : ""}`}
                      data-testid={`wizard-step-${stepNum}`}
                    >
                      <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", lineHeight: "20px", fontSize: 11, fontWeight: 700, marginRight: 6,
                        background: isComplete ? "#22c55e" : isActive ? "var(--accent, #8b5cf6)" : "var(--border)",
                        color: isComplete || isActive ? "#fff" : "var(--text2)" }}>
                        {isComplete ? "\u2713" : stepNum}
                      </span>
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Select Resource */}
              {wizardStep === 1 && (
                <div data-testid="wizard-step1">
                  <h2 style={{ marginBottom: 16 }}>Step 1: Select a GPU Resource</h2>
                  {availableResources.length === 0 ? (
                    <div className="empty">No available GPU resources at this time.</div>
                  ) : (
                    <div className="gpu-grid">
                      {availableResources.map((r) => (
                        <div
                          key={r.id}
                          className={`gpu-card${selectedResourceId === r.id ? " selected" : ""}`}
                          onClick={() => setSelectedResourceId(r.id)}
                          data-testid="wizard-resource-card"
                        >
                          <div className="gpu-name">{r.gpuModel || "Unknown GPU"}</div>
                          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>{r.name}</div>
                          <div className="gpu-specs">
                            <span className="gpu-spec-label">VRAM</span>
                            <span className="gpu-spec-value">{r.vramGb} GB</span>
                            <span className="gpu-spec-label">GPU Count</span>
                            <span className="gpu-spec-value">x{r.gpuCount}</span>
                            <span className="gpu-spec-label">CPU / RAM</span>
                            <span className="gpu-spec-value">{r.cpuCores}C / {r.ramGb}GB</span>
                            <span className="gpu-spec-label">Storage</span>
                            <span className="gpu-spec-value">{r.storageGb} GB</span>
                          </div>
                          <div className="gpu-price">{formatClaw(r.pricePerHourUclaw)}/hr</div>
                          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                            Provider: <span className="mono">{shortAddr(r.owner)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selected resource summary */}
                  {selectedResource && (
                    <div className="card" style={{ marginTop: 16, padding: 12 }}>
                      <div style={{ fontSize: 13, color: "var(--text2)" }}>Selected:</div>
                      <div style={{ fontWeight: 700 }}>{selectedResource.gpuModel} - {selectedResource.name}</div>
                      <div style={{ fontSize: 13, color: "var(--accent)" }}>{formatClaw(selectedResource.pricePerHourUclaw)}/hr</div>
                    </div>
                  )}

                  <div className="wizard-nav">
                    <div />
                    <button
                      disabled={!canProceedStep1()}
                      onClick={() => setWizardStep(2)}
                      data-testid="wizard-next"
                    >
                      Next: Configure Job
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Configure Job */}
              {wizardStep === 2 && (
                <div data-testid="wizard-step2">
                  <h2 style={{ marginBottom: 16 }}>Step 2: Configure Job</h2>

                  {/* Job type radio */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "var(--text)" }}>Job Type</label>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="jobType"
                          value="docker"
                          checked={wizardJobType === "docker"}
                          onChange={() => setWizardJobType("docker")}
                          data-testid="radio-docker"
                          style={{ width: "auto" }}
                        />
                        <span>Docker</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="jobType"
                          value="script"
                          checked={wizardJobType === "script"}
                          onChange={() => setWizardJobType("script")}
                          data-testid="radio-script"
                          style={{ width: "auto" }}
                        />
                        <span>Script</span>
                      </label>
                    </div>
                  </div>

                  {/* Docker config */}
                  {wizardJobType === "docker" && (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontWeight: 500, color: "var(--text)" }}>Docker Image</label>
                        <input
                          type="text"
                          value={wizardDockerImage}
                          onChange={(e) => setWizardDockerImage(e.target.value)}
                          placeholder="e.g. nvidia/cuda:12.0-runtime"
                          data-testid="input-docker-image"
                        />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontWeight: 500, color: "var(--text)" }}>Command</label>
                        <input
                          type="text"
                          value={wizardCommand}
                          onChange={(e) => setWizardCommand(e.target.value)}
                          placeholder="python train.py --epochs 100"
                          data-testid="input-command"
                        />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontWeight: 500, color: "var(--text)" }}>Environment Variables</label>
                        <textarea
                          value={wizardEnvVars}
                          onChange={(e) => setWizardEnvVars(e.target.value)}
                          placeholder="KEY=value (one per line)"
                          rows={3}
                          style={{ fontFamily: "monospace", resize: "vertical" }}
                          data-testid="input-env-vars"
                        />
                      </div>
                    </>
                  )}

                  {/* Script config */}
                  {wizardJobType === "script" && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontWeight: 500, color: "var(--text)" }}>Script Content</label>
                      <textarea
                        value={wizardScriptContent}
                        onChange={(e) => setWizardScriptContent(e.target.value)}
                        placeholder="#!/bin/bash&#10;echo 'Hello GPU'"
                        rows={8}
                        style={{ fontFamily: "monospace", resize: "vertical" }}
                        data-testid="input-script"
                      />
                    </div>
                  )}

                  {/* Duration + Budget */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontWeight: 500, color: "var(--text)" }}>Max Duration (hours)</label>
                      <input
                        type="number"
                        min="1"
                        value={wizardMaxDuration}
                        onChange={(e) => setWizardMaxDuration(e.target.value)}
                        data-testid="input-max-duration"
                      />
                    </div>
                    <div>
                      <label style={{ fontWeight: 500, color: "var(--text)" }}>Budget (CLAW)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.000001"
                        value={wizardBudget}
                        onChange={(e) => setWizardBudget(e.target.value)}
                        placeholder="e.g. 100"
                        data-testid="input-budget"
                      />
                    </div>
                  </div>

                  <div className="wizard-nav">
                    <button className="btn-outline" onClick={() => setWizardStep(1)} data-testid="wizard-back">
                      Back
                    </button>
                    <button
                      disabled={!canProceedStep2()}
                      onClick={() => setWizardStep(3)}
                      data-testid="wizard-next"
                    >
                      Next: Review
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Review & Submit */}
              {wizardStep === 3 && (
                <div data-testid="wizard-step3">
                  <h2 style={{ marginBottom: 16 }}>Step 3: Review & Submit</h2>

                  <div className="card" style={{ marginBottom: 16 }}>
                    <h3 style={{ marginBottom: 12 }}>Job Summary</h3>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>GPU Resource</div>
                        <div style={{ fontWeight: 600 }}>{selectedResource?.gpuModel || "Unknown"}</div>
                        <div style={{ fontSize: 12, color: "var(--text2)" }}>{selectedResource?.name}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Provider</div>
                        <div className="mono" style={{ fontSize: 13 }}>{selectedResource ? shortAddr(selectedResource.owner) : "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Job Type</div>
                        <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{wizardJobType}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>
                          {wizardJobType === "docker" ? "Docker Image" : "Script"}
                        </div>
                        <div className="mono" style={{ fontSize: 12 }}>
                          {wizardJobType === "docker" ? wizardDockerImage : `${wizardScriptContent.slice(0, 40)}...`}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Max Duration</div>
                        <div style={{ fontWeight: 600 }}>{wizardMaxDuration} hour(s)</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Budget</div>
                        <div style={{ fontWeight: 600, color: "var(--accent)" }}>{wizardBudget} CLAW</div>
                      </div>
                    </div>

                    {/* Cost estimate */}
                    <div style={{ marginTop: 16, padding: 12, background: "var(--bg3)", borderRadius: "var(--radius)" }}>
                      <div style={{ fontSize: 13, color: "var(--text2)" }}>Estimated Cost</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }} data-testid="cost-estimate">{estimatedCost()}</div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>Based on {wizardMaxDuration} hour(s) at {selectedResource ? formatClaw(selectedResource.pricePerHourUclaw) : "--"}/hr</div>
                    </div>
                  </div>

                  {/* Warning */}
                  <div className="privacy-warning" style={{ marginBottom: 16 }}>
                    By submitting this job, you authorize spending up to {wizardBudget} CLAW from your wallet. Actual costs depend on job duration and resource usage.
                  </div>

                  {wizardError && (
                    <div style={{ marginBottom: 16, padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                      {wizardError}
                    </div>
                  )}

                  <div className="wizard-nav">
                    <button className="btn-outline" onClick={() => setWizardStep(2)} data-testid="wizard-back">
                      Back
                    </button>
                    <button
                      onClick={handleWizardSubmit}
                      disabled={wizardSubmitting}
                      data-testid="wizard-submit"
                    >
                      {wizardSubmitting ? "Submitting..." : "Submit Job"}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Confirmation */}
              {wizardStep === 4 && wizardResult && (
                <div data-testid="wizard-step4" style={{ textAlign: "center" }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 48, color: "var(--green)", marginBottom: 8 }}>&#10003;</div>
                    <h2>Job Submitted Successfully</h2>
                  </div>

                  <div className="card" style={{ maxWidth: 480, margin: "0 auto", marginBottom: 16, textAlign: "left" }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Job ID</div>
                      <div className="mono" style={{ fontWeight: 600, fontSize: 16 }} data-testid="confirmation-job-id">{wizardResult.jobId}</div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Status</div>
                      <span className="job-status pending">Pending</span>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Transaction Hash</div>
                      <div className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{wizardResult.txHash}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase" }}>Estimated Start</div>
                      <div style={{ fontSize: 13 }}>Within ~2-5 blocks (~10-25 seconds)</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button
                      className="btn-outline"
                      onClick={() => { setTab("jobs"); }}
                      data-testid="track-job-link"
                    >
                      Track Job
                    </button>
                    <button onClick={resetWizard} data-testid="submit-another">
                      Submit Another Job
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
