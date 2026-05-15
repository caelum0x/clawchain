import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getModels,
  getInferenceJobs,
  getInferenceProviders,
  getInferencePricing,
  getInferenceJob,
  buildSubmitInferenceJobMsg,
  formatClaw,
  shortAddr,
  type ModelRecord,
  type InferenceJob,
  type InferenceProvider,
  type InferencePricing,
} from "../lib/chain.ts";
import {
  isKeplrAvailable,
  connectKeplr,
  signAndBroadcast,
  type WalletState,
} from "../lib/wallet.ts";
import { useInferenceStream } from "../lib/inference-stream.ts";
import ExportMenu from "../components/ExportMenu.tsx";

type Tab = "playground" | "jobs" | "providers";

const STATUS_FILTERS = ["all", "pending", "running", "completed", "failed", "timeout"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function Inference() {
  useDocTitle("AI Inference");

  const [tab, setTab] = useState<Tab>("playground");
  const [loading, setLoading] = useState(true);

  // Data
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [jobs, setJobs] = useState<InferenceJob[]>([]);
  const [providers, setProviders] = useState<InferenceProvider[]>([]);
  const [pricing, setPricing] = useState<InferencePricing | null>(null);

  // Wallet
  const [wallet, setWallet] = useState<WalletState | null>(null);

  // Submission form
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState("512");
  const [temperature, setTemperature] = useState("0.7");
  const [payment, setPayment] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Streaming
  const [streamJobId, setStreamJobId] = useState<string | null>(null);
  const stream = useInferenceStream(streamJobId);

  // Job history filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jobSearch, setJobSearch] = useState("");

  // Job detail
  const [selectedJob, setSelectedJob] = useState<InferenceJob | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [m, j, p] = await Promise.all([
        getModels().catch(() => []),
        getInferenceJobs().catch(() => []),
        getInferenceProviders().catch(() => []),
      ]);
      setModels(m);
      setJobs(j);
      setProviders(p);
    } catch {
      /* offline */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch pricing when model changes
  useEffect(() => {
    if (!modelId) {
      setPricing(null);
      return;
    }
    getInferencePricing(Number(modelId)).then(setPricing).catch(() => setPricing(null));
  }, [modelId]);

  async function handleConnect() {
    try {
      const w = await connectKeplr();
      setWallet(w);
    } catch {
      /* user rejected */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.connected || !modelId || !prompt.trim()) return;

    setSubmitting(true);
    setSubmitResult(null);
    setStreamJobId(null);

    try {
      const paymentUclaw = Math.floor(parseFloat(payment) * 1_000_000);
      const msg = buildSubmitInferenceJobMsg(
        wallet.address,
        Number(modelId),
        0, // latest version
        prompt.trim(),
        Number(maxTokens),
        temperature,
        String(paymentUclaw),
      );
      const res = await signAndBroadcast(wallet.address, [msg]);
      const txHash = res?.txHash ?? "";

      setSubmitResult({
        type: "success",
        msg: `Job submitted! TX: ${txHash.slice(0, 16)}...`,
      });

      // Refresh jobs
      getInferenceJobs().then(setJobs).catch(() => {});
    } catch (err: any) {
      setSubmitResult({ type: "error", msg: err?.message ?? "Failed to submit inference job" });
    }
    setSubmitting(false);
  }

  async function handleViewJob(jobId: string) {
    try {
      const job = await getInferenceJob(Number(jobId));
      setSelectedJob(job);
    } catch {
      /* offline */
    }
  }

  // Filter jobs
  const filteredJobs = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    if (jobSearch) {
      const q = jobSearch.toLowerCase();
      return (
        j.jobId.includes(q) ||
        j.requester.toLowerCase().includes(q) ||
        j.provider.toLowerCase().includes(q) ||
        j.modelId.includes(q)
      );
    }
    return true;
  });

  const exportData = filteredJobs.map((j) => ({
    jobId: j.jobId,
    modelId: j.modelId,
    requester: j.requester,
    provider: j.provider,
    status: j.status,
    payment: j.payment,
    maxTokens: j.maxTokens,
    tokensUsed: j.gasUsed,
  }));

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading inference data...</p>
      </div>
    );
  }

  const selectedModel = models.find((m) => String(m.id) === modelId);

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">AI Inference</h1>
          <p className="page-subtitle">
            Submit prompts to on-chain AI models and view streaming results
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="stat-card">
          <h3>Models Available</h3>
          <div className="value accent">{models.length}</div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Providers Online</h3>
          <div className="value accent">
            {providers.filter((p) => p.isOnline).length}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {providers.length} total
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Total Jobs</h3>
          <div className="value">{jobs.length}</div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Completed</h3>
          <div className="value">
            {jobs.filter((j) => j.status === "completed").length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {(["playground", "jobs", "providers"] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "tab active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t === "playground" ? "Playground" : t === "jobs" ? "Job History" : "Providers"}
          </button>
        ))}
      </div>

      {/* ==================== PLAYGROUND TAB ==================== */}
      {tab === "playground" && (
        <>
          <div className="card" style={{ maxWidth: 720, marginBottom: 24 }}>
            <h2>Submit Inference</h2>

            {!wallet?.connected ? (
              <div>
                <p style={{ marginBottom: 12 }}>
                  Connect your wallet to submit inference jobs to on-chain AI models.
                </p>
                <button
                  className="btn-primary"
                  onClick={handleConnect}
                  disabled={!isKeplrAvailable()}
                >
                  {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ marginBottom: 16 }}>
                  Connected: <strong>{shortAddr(wallet.address)}</strong> | Balance:{" "}
                  {formatClaw(wallet.balance)}
                </p>

                {/* Model selector */}
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="inf-model">Model</label>
                  <select
                    id="inf-model"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    required
                    style={{ width: "100%", padding: "0.5rem" }}
                  >
                    <option value="">Select a model...</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (ID: {m.id}) — {m.framework}
                        {m.accessType === "free" ? " [Free]" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedModel && (
                    <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                      {selectedModel.description}
                      {pricing && (
                        <span>
                          {" "}
                          | Price: {pricing.pricePerQuery !== "0" ? `${formatClaw(pricing.pricePerQuery)}/query` : ""}
                          {pricing.pricePerToken !== "0" ? ` ${formatClaw(pricing.pricePerToken)}/token` : ""}
                          {pricing.pricePerQuery === "0" && pricing.pricePerToken === "0" ? "Free" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Prompt */}
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="inf-prompt">Prompt</label>
                  <textarea
                    id="inf-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your prompt..."
                    rows={5}
                    required
                    style={{ width: "100%", padding: "0.5rem", fontFamily: "inherit" }}
                  />
                </div>

                {/* Parameters */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 16,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <label htmlFor="inf-tokens">Max Tokens</label>
                    <input
                      id="inf-tokens"
                      type="number"
                      min="1"
                      max="4096"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      style={{ width: "100%", padding: "0.5rem" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="inf-temp">Temperature</label>
                    <input
                      id="inf-temp"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      style={{ width: "100%", padding: "0.5rem" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="inf-payment">Payment (CLAW)</label>
                    <input
                      id="inf-payment"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      value={payment}
                      onChange={(e) => setPayment(e.target.value)}
                      required
                      style={{ width: "100%", padding: "0.5rem" }}
                    />
                  </div>
                </div>

                <button className="btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Run Inference"}
                </button>
              </form>
            )}

            {submitResult && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  background:
                    submitResult.type === "success"
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(239,68,68,0.15)",
                  color: submitResult.type === "success" ? "#22c55e" : "#ef4444",
                }}
              >
                {submitResult.msg}
              </div>
            )}
          </div>

          {/* Streaming Output */}
          {stream.status !== "idle" && (
            <div className="card" style={{ maxWidth: 720, marginBottom: 24 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Output
                {stream.status === "streaming" && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--accent)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    />
                    streaming
                  </span>
                )}
                {stream.status === "complete" && (
                  <span className="badge success">Complete</span>
                )}
                {stream.status === "error" && (
                  <span className="badge error">Error</span>
                )}
              </h2>
              <div
                data-testid="stream-output"
                style={{
                  background: "#0d1117",
                  borderRadius: 8,
                  padding: 16,
                  fontFamily: "monospace",
                  fontSize: 14,
                  whiteSpace: "pre-wrap",
                  maxHeight: 500,
                  overflow: "auto",
                  color: "#e6edf3",
                  border: "1px solid #30363d",
                  lineHeight: 1.6,
                }}
              >
                {stream.tokens ||
                  (stream.status === "connecting" ? "Connecting to inference sidecar..." : "")}
                {stream.status === "streaming" && (
                  <span style={{ opacity: 0.4 }}>|</span>
                )}
              </div>
              {stream.status === "complete" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "var(--text2)",
                    display: "flex",
                    gap: 16,
                  }}
                >
                  {stream.txHash && (
                    <span>
                      Tx:{" "}
                      <Link to={`/explorer/tx/${stream.txHash}`} className="mono">
                        {stream.txHash.slice(0, 12)}...
                      </Link>
                    </span>
                  )}
                  {stream.tokensUsed > 0 && <span>Tokens: {stream.tokensUsed}</span>}
                </div>
              )}
              {stream.error && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>
                  {stream.error}
                </div>
              )}
            </div>
          )}

          {/* Quick model listing */}
          {models.length > 0 && (
            <div className="table-wrap">
              <h2>Available Models</h2>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Framework</th>
                    <th>Access</th>
                    <th>Rating</th>
                    <th>Downloads</th>
                  </tr>
                </thead>
                <tbody>
                  {models.slice(0, 20).map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.id}</td>
                      <td>
                        <strong>{m.name}</strong>
                        <div style={{ fontSize: 12, color: "var(--text2)" }}>
                          {m.description?.slice(0, 60)}
                          {(m.description?.length ?? 0) > 60 ? "..." : ""}
                        </div>
                      </td>
                      <td className="mono">{m.framework}</td>
                      <td>
                        <span
                          className={`badge ${m.accessType === "free" ? "success" : ""}`}
                        >
                          {m.accessType || "free"}
                        </span>
                      </td>
                      <td>
                        {m.rating > 0 ? (
                          <span>
                            {(m.rating / 10).toFixed(1)} ({m.ratingCount})
                          </span>
                        ) : (
                          <span style={{ color: "var(--text2)" }}>--</span>
                        )}
                      </td>
                      <td>{m.totalDownloads ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================== JOBS TAB ==================== */}
      {tab === "jobs" && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg2)",
                color: "var(--text1)",
                fontSize: 13,
              }}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>

            <input
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Search by job ID, address..."
              style={{ padding: "6px 10px", flex: 1, minWidth: 200 }}
            />

            {filteredJobs.length > 0 && (
              <ExportMenu data={exportData} filename="inference-jobs" />
            )}
          </div>

          {/* Job detail modal */}
          {selectedJob && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>Job #{selectedJob.jobId}</h2>
                <button className="btn-outline" onClick={() => setSelectedJob(null)}>
                  Close
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <strong>Model:</strong> {selectedJob.modelId}
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  <span className={`badge ${selectedJob.status === "completed" ? "success" : selectedJob.status === "failed" ? "error" : "warning"}`}>
                    {selectedJob.status}
                  </span>
                </div>
                <div>
                  <strong>Requester:</strong>{" "}
                  <Link to={`/explorer/account/${selectedJob.requester}`} className="mono">
                    {shortAddr(selectedJob.requester)}
                  </Link>
                </div>
                <div>
                  <strong>Provider:</strong>{" "}
                  {selectedJob.provider ? (
                    <Link to={`/explorer/account/${selectedJob.provider}`} className="mono">
                      {shortAddr(selectedJob.provider)}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--text2)" }}>Pending</span>
                  )}
                </div>
                <div>
                  <strong>Payment:</strong>{" "}
                  <span style={{ color: "var(--accent)" }}>{formatClaw(selectedJob.payment)}</span>
                </div>
                <div>
                  <strong>Tokens:</strong> {selectedJob.gasUsed || "--"} / {selectedJob.maxTokens}
                </div>
              </div>
              {selectedJob.input && (
                <div style={{ marginTop: 12 }}>
                  <strong>Input:</strong>
                  <div
                    style={{
                      background: "var(--bg2)",
                      borderRadius: 6,
                      padding: 12,
                      marginTop: 4,
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                    }}
                  >
                    {selectedJob.input}
                  </div>
                </div>
              )}
              {selectedJob.output && (
                <div style={{ marginTop: 12 }}>
                  <strong>Output:</strong>
                  <div
                    style={{
                      background: "#0d1117",
                      borderRadius: 6,
                      padding: 12,
                      marginTop: 4,
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      fontFamily: "monospace",
                      color: "#e6edf3",
                      maxHeight: 400,
                      overflow: "auto",
                    }}
                  >
                    {selectedJob.output}
                  </div>
                </div>
              )}
              {selectedJob.errorMsg && (
                <div style={{ marginTop: 8, color: "#ef4444", fontSize: 13 }}>
                  Error: {selectedJob.errorMsg}
                </div>
              )}
            </div>
          )}

          {filteredJobs.length === 0 ? (
            <div className="empty">
              {jobs.length === 0
                ? "No inference jobs yet. Submit a prompt in the Playground tab."
                : "No jobs match the current filter."}
            </div>
          ) : (
            <div className="table-wrap">
              <h2>
                Inference Jobs ({filteredJobs.length}
                {statusFilter !== "all" ? ` ${statusFilter}` : ""})
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Model</th>
                    <th>Requester</th>
                    <th>Provider</th>
                    <th>Payment</th>
                    <th>Tokens</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.slice(0, 100).map((j) => {
                    const statusColor =
                      j.status === "completed"
                        ? "success"
                        : j.status === "failed" || j.status === "timeout"
                          ? "error"
                          : j.status === "running"
                            ? "warning"
                            : "";
                    return (
                      <tr key={j.jobId}>
                        <td className="mono">{j.jobId}</td>
                        <td className="mono">{j.modelId}</td>
                        <td>
                          <Link to={`/explorer/account/${j.requester}`} className="mono">
                            {shortAddr(j.requester)}
                          </Link>
                        </td>
                        <td>
                          {j.provider ? (
                            <Link to={`/explorer/account/${j.provider}`} className="mono">
                              {shortAddr(j.provider)}
                            </Link>
                          ) : (
                            <span style={{ color: "var(--text2)" }}>--</span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                            {formatClaw(j.payment)}
                          </span>
                        </td>
                        <td>
                          {j.gasUsed > 0 ? (
                            <span>
                              {j.gasUsed} / {j.maxTokens}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text2)" }}>
                              -- / {j.maxTokens}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${statusColor}`}>{j.status}</span>
                        </td>
                        <td>
                          <button
                            className="btn-outline"
                            style={{ fontSize: 12, padding: "2px 8px" }}
                            onClick={() => handleViewJob(j.jobId)}
                          >
                            View
                          </button>
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

      {/* ==================== PROVIDERS TAB ==================== */}
      {tab === "providers" && (
        <>
          {providers.length === 0 ? (
            <div className="empty">
              No inference providers registered yet. Providers can register via CLI or SDK.
            </div>
          ) : (
            <div className="table-wrap">
              <h2>Inference Providers ({providers.length})</h2>
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Models</th>
                    <th>Capacity</th>
                    <th>Active / Total Jobs</th>
                    <th>Earnings</th>
                    <th>Avg Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <tr key={p.address}>
                      <td>
                        <Link to={`/explorer/account/${p.address}`} className="mono">
                          {shortAddr(p.address)}
                        </Link>
                        {p.endpoint && (
                          <div style={{ fontSize: 11, color: "var(--text2)" }}>
                            {p.endpoint}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.modelIds.length > 0 ? p.modelIds.join(", ") : "--"}
                      </td>
                      <td>{p.maxConcurrent}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{p.activeJobs}</span>
                        <span style={{ color: "var(--text2)" }}> / {p.totalJobs}</span>
                      </td>
                      <td>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {formatClaw(p.totalEarnings)}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.avgLatencyMs > 0 ? `${p.avgLatencyMs}ms` : "--"}
                      </td>
                      <td>
                        <span className={`badge ${p.isOnline ? "success" : "warning"}`}>
                          {p.isOnline ? "Online" : "Offline"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Provider info */}
          <div className="card" style={{ marginTop: 24 }}>
            <h2>Become a Provider</h2>
            <p style={{ marginBottom: 8 }}>
              Register as an inference provider to serve AI model requests and earn CLAW tokens.
            </p>
            <div
              style={{
                background: "var(--bg2)",
                borderRadius: 6,
                padding: 12,
                fontFamily: "monospace",
                fontSize: 13,
              }}
            >
              <div style={{ color: "var(--text2)", marginBottom: 4 }}># Register via CLI</div>
              <div>clawd model register --name &quot;MyModel&quot; --framework pytorch --access-type per_query</div>
              <div style={{ color: "var(--text2)", marginTop: 8, marginBottom: 4 }}># Start sidecar</div>
              <div>./claw-inference-sidecar</div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
