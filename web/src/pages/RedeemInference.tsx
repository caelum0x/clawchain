import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import CopyButton from "../components/CopyButton.tsx";
import { useToast } from "../hooks/useToast.tsx";
import { shortAddr, getInferenceJob, formatClaw, type InferenceJob } from "../lib/chain.ts";
import {
  getModelTokens,
  formatTokenSupply,
  type ModelToken,
} from "../lib/model-tokens.ts";
import { buildRedeemCommand } from "../lib/redeem-command.ts";

/** Job lifecycle stages, ordered, for the simple status timeline. */
const TIMELINE_STAGES = ["pending", "running", "completed"] as const;
type Stage = (typeof TIMELINE_STAGES)[number];

/** Map an on-chain job status onto a timeline stage (failed/timeout collapse to running). */
function stageIndexForStatus(status: string): number {
  if (status === "completed") return 2;
  if (status === "running") return 1;
  if (status === "failed" || status === "timeout") return 1;
  return 0; // pending / unknown
}

function stageLabel(stage: Stage): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

/** Render the ordered status timeline (sparkline-free, dot + label per stage). */
function StatusTimeline({ status }: { status: string }) {
  const current = stageIndexForStatus(status);
  const isError = status === "failed" || status === "timeout";
  return (
    <div
      data-testid="job-timeline"
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}
    >
      {TIMELINE_STAGES.map((stage, i) => {
        const reached = i <= current;
        const isFinalError = isError && i === current;
        const color = isFinalError
          ? "#ef4444"
          : reached
            ? "var(--accent)"
            : "var(--text2)";
        return (
          <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: reached ? color : "transparent",
                  border: `2px solid ${color}`,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12, color, fontWeight: reached ? 600 : 400 }}>
                {isFinalError && i === current ? "Failed" : stageLabel(stage)}
              </span>
            </div>
            {i < TIMELINE_STAGES.length - 1 && (
              <span
                aria-hidden
                style={{
                  width: 24,
                  height: 2,
                  background: i < current ? "var(--accent)" : "var(--text2)",
                  opacity: i < current ? 1 : 0.4,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RedeemInference() {
  useDocTitle("Redeem for Inference");
  const { addToast } = useToast();

  // ---- Model token picker (for the redeem command) ----
  const [tokens, setTokens] = useState<ModelToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDenom, setSelectedDenom] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [prompt, setPrompt] = useState("");

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const t = await getModelTokens();
      setTokens(t);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load model tokens");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const mintedTokens = useMemo(() => tokens.filter((t) => t.hasToken), [tokens]);
  const selectedToken =
    mintedTokens.find((t) => t.denom === selectedDenom) ?? mintedTokens[0] ?? null;

  const build = useMemo<{ command: string | null; error: string | null }>(() => {
    if (!selectedToken) {
      return { command: null, error: null };
    }
    try {
      return {
        command: buildRedeemCommand({
          modelId: selectedToken.modelId,
          amount,
          input: prompt,
          denom: selectedToken.denom,
        }),
        error: null,
      };
    } catch (e: unknown) {
      return {
        command: null,
        error: e instanceof Error ? e.message : "Invalid redeem parameters",
      };
    }
  }, [selectedToken, amount, prompt]);

  const onShowToast = () => {
    if (!build.command) return;
    addToast({
      type: "info",
      title: "Run this from the clawd CLI",
      message:
        "Redeem burns the model token and opens an inference job in one tx — it runs via the CLI, not the browser.",
      duration: 6000,
    });
  };

  // ---- Track a job (poll getInferenceJob) ----
  const [jobIdInput, setJobIdInput] = useState("");
  const [trackedId, setTrackedId] = useState<number | null>(null);
  const [job, setJob] = useState<InferenceJob | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const pollJob = useCallback(async (id: number) => {
    setJobLoading(true);
    setJobError(null);
    try {
      const j = await getInferenceJob(id);
      if (!j) {
        setNotFound(true);
        setJob(null);
      } else {
        setNotFound(false);
        setJob(j);
      }
    } catch (e: unknown) {
      setJobError(e instanceof Error ? e.message : "Failed to load job");
    }
    setJobLoading(false);
  }, []);

  const onTrack = () => {
    const id = Number(jobIdInput.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setJobError("Enter a positive job id.");
      setNotFound(false);
      setJob(null);
      setTrackedId(null);
      return;
    }
    setTrackedId(id);
    pollJob(id);
  };

  // Auto-poll while a tracked job is not yet in a terminal state.
  useEffect(() => {
    if (trackedId == null) return;
    const isTerminal =
      job?.status === "completed" ||
      job?.status === "failed" ||
      job?.status === "timeout";
    if (isTerminal) return;
    const timer = setInterval(() => pollJob(trackedId), 4000);
    return () => clearInterval(timer);
  }, [trackedId, job?.status, pollJob]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading model tokens...</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Redeem for Inference</h1>
          <p className="page-subtitle">
            Close the P1 utility loop: burn a model token to open a real{" "}
            <Link to="/inference">inference job</Link>, then track it until a provider
            completes it. The browser only previews the <code>clawd</code> command &mdash;
            redeem runs from a host with your signer mnemonic. Testnet only &mdash; not
            financial advice.
          </p>
        </div>
      </div>

      {loadError && (
        <div
          className="card"
          data-testid="redeem-load-error"
          style={{ marginBottom: 24, background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
        >
          Failed to load model tokens: {loadError}
          <div style={{ marginTop: 8 }}>
            <button className="btn-outline" onClick={fetchTokens}>
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="stat-card">
          <h3>Issued Tokens</h3>
          <div className="value accent">{mintedTokens.length}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            redeemable for inference
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Selected Model</h3>
          <div className="value">{selectedToken?.symbol ?? "--"}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {selectedToken ? `ID ${selectedToken.modelId}` : "none"}
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Token Supply</h3>
          <div className="value">
            {selectedToken ? formatTokenSupply(selectedToken.supply) : "--"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {selectedToken ? selectedToken.symbol : "select a model"}
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Tracked Job</h3>
          <div className="value">{job ? `#${job.jobId}` : "--"}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {job ? job.status : "none tracked"}
          </div>
        </div>
      </div>

      {/* ==================== REDEEM (build command) ==================== */}
      <div className="card" data-testid="redeem-section" style={{ marginBottom: 24 }}>
        <h2>Burn &amp; Redeem</h2>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          Pick an issued model token, enter how much to burn and a prompt. We generate the
          exact <code>clawd model-token redeem</code> command &mdash; it burns the token
          (tokenfactory <code>MsgBurn</code>) and submits an inference job
          (<code>MsgSubmitInferenceJob</code>) in one transaction.
        </p>

        {mintedTokens.length === 0 ? (
          <div className="empty" data-testid="redeem-no-tokens">
            No issued model tokens yet &mdash; issue one with{" "}
            <code>clawd model-token issue</code> to make it redeemable.
          </div>
        ) : (
          <>
            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>Model token *</span>
                <select
                  value={selectedToken?.denom ?? ""}
                  onChange={(e) => setSelectedDenom(e.target.value)}
                  data-testid="redeem-model-select"
                  style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
                >
                  {mintedTokens.map((t) => (
                    <option key={t.denom} value={t.denom}>
                      {t.symbol} ({t.name || `Model #${t.modelId}`}) — ID {t.modelId}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>
                  Amount to burn ({selectedToken?.symbol ?? "tokens"}) *
                </span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  aria-label="Amount to burn"
                  data-testid="redeem-amount-input"
                  inputMode="numeric"
                  style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
                />
              </label>
            </div>

            {selectedToken && (
              <div
                className="mono"
                data-testid="redeem-denom"
                style={{ fontSize: 11, color: "var(--text2)", wordBreak: "break-all", marginBottom: 12 }}
              >
                denom: {selectedToken.denom}
              </div>
            )}

            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Prompt / input *</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter the prompt the provider will run..."
                aria-label="Inference prompt"
                data-testid="redeem-prompt-input"
                rows={4}
                style={{ padding: "6px 10px", width: "100%", marginTop: 4, fontFamily: "inherit" }}
              />
            </label>

            {/* Generated command */}
            <div data-testid="redeem-command-section">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <h3 style={{ margin: 0 }}>Generated clawd command</h3>
                {build.command && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CopyButton text={build.command} label="Copy redeem command" />
                    <button className="btn-outline" data-testid="redeem-toast-btn" onClick={onShowToast}>
                      How to run
                    </button>
                  </div>
                )}
              </div>

              {build.error ? (
                <div data-testid="redeem-command-error" style={{ color: "#ef4444" }}>
                  {build.error}
                </div>
              ) : build.command ? (
                <pre
                  data-testid="redeem-command"
                  className="mono"
                  style={{
                    background: "var(--bg2)",
                    borderRadius: 6,
                    padding: 12,
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    margin: 0,
                  }}
                >
                  {build.command}
                </pre>
              ) : (
                <div className="empty" data-testid="redeem-command-empty">
                  Enter an amount and a prompt to generate the redeem command.
                </div>
              )}
              <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>
                Run this from a host with your signer mnemonic (<code>clawd init</code> first).
                After it broadcasts, copy the printed JobID and track it below.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ==================== TRACK A JOB ==================== */}
      <div className="card" data-testid="track-section">
        <h2>Track a Job</h2>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>
          Enter the inference job id printed by <code>clawd model-token redeem</code>. We poll
          the modelregistry job until a provider completes it, then show the output.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={jobIdInput}
            onChange={(e) => setJobIdInput(e.target.value)}
            placeholder="Job id (e.g. 1)"
            aria-label="Job id"
            data-testid="track-job-input"
            inputMode="numeric"
            style={{ padding: "6px 10px", minWidth: 160 }}
          />
          <button className="btn" data-testid="track-job-btn" onClick={onTrack}>
            Track
          </button>
          {trackedId != null && (
            <button
              className="btn-outline"
              data-testid="track-refresh-btn"
              onClick={() => pollJob(trackedId)}
            >
              Refresh
            </button>
          )}
          {jobLoading && (
            <span style={{ fontSize: 12, color: "var(--text2)" }}>Polling...</span>
          )}
        </div>

        {jobError && (
          <p data-testid="track-error" style={{ color: "#ef4444", marginTop: 12 }}>
            {jobError}
          </p>
        )}

        {trackedId != null && notFound && !jobError && (
          <div className="empty" data-testid="track-not-found" style={{ marginTop: 16 }}>
            No job found for id #{trackedId} yet. If you just redeemed, give the tx a moment
            and refresh.
          </div>
        )}

        {job && (
          <div data-testid="track-job-detail" style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>Job #{job.jobId}</h3>
              <span
                className={`badge ${
                  job.status === "completed"
                    ? "success"
                    : job.status === "failed" || job.status === "timeout"
                      ? "error"
                      : "warning"
                }`}
              >
                {job.status}
              </span>
            </div>

            <StatusTimeline status={job.status} />

            <div
              className="grid-2"
              style={{ gap: 12, marginTop: 16, fontSize: 13 }}
            >
              <div>
                <strong>Model:</strong> {job.modelId}
              </div>
              <div>
                <strong>Payment:</strong>{" "}
                <span style={{ color: "var(--accent)" }}>{formatClaw(job.payment)}</span>
              </div>
              <div>
                <strong>Requester:</strong>{" "}
                {job.requester ? (
                  <Link to={`/explorer/account/${job.requester}`} className="mono">
                    {shortAddr(job.requester)}
                  </Link>
                ) : (
                  <span style={{ color: "var(--text2)" }}>--</span>
                )}
              </div>
              <div>
                <strong>Provider:</strong>{" "}
                {job.provider ? (
                  <Link to={`/explorer/account/${job.provider}`} className="mono">
                    {shortAddr(job.provider)}
                  </Link>
                ) : (
                  <span style={{ color: "var(--text2)" }}>Pending</span>
                )}
              </div>
              <div>
                <strong>Tokens:</strong> {job.gasUsed || "--"} / {job.maxTokens}
              </div>
            </div>

            {job.input && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 13 }}>Input:</strong>
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
                  {job.input}
                </div>
              </div>
            )}

            {job.status === "completed" && job.output ? (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>Output:</strong>
                  <CopyButton text={job.output} label="Copy output" />
                </div>
                <div
                  data-testid="track-job-output"
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
                  {job.output}
                </div>
              </div>
            ) : job.status !== "completed" && !job.errorMsg ? (
              <p
                data-testid="track-awaiting"
                style={{ fontSize: 12, color: "var(--text2)", marginTop: 12 }}
              >
                Awaiting a provider to serve this job. This view auto-refreshes every 4s.
              </p>
            ) : null}

            {job.errorMsg && (
              <div style={{ marginTop: 8, color: "#ef4444", fontSize: 13 }}>
                Error: {job.errorMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
