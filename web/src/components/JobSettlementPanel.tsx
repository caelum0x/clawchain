/**
 * Settlement-lifecycle UI for the "Redeem for Inference" job tracker.
 *
 * Two concerns, kept out of the page to keep RedeemInference.tsx focused:
 *   - JobSettlementDetail: read-only Attestation stat block + Disputed badge,
 *     rendered inside the job-detail card when the on-chain job carries those
 *     fields.
 *   - JobSettlementPanel: the build-msg-then-copy command generators for the
 *     provider usage attestation and the requester dispute, mirroring the
 *     redeem command-generator pattern on the same page.
 *
 * The browser never signs — it only previews the `clawchaind tx modelregistry`
 * commands a provider / requester runs from a host with their signer key.
 */

import { useMemo, useState } from "react";
import CopyButton from "./CopyButton.tsx";
import { useToast } from "../hooks/useToast.tsx";
import type { InferenceJob } from "../lib/chain.ts";
import { buildAttestCommand, buildDisputeCommand } from "../lib/settlement-command.ts";

/** Format a unix-seconds timestamp for display; returns "--" when unset. */
export function formatUnix(seconds: number): string {
  if (!seconds || seconds <= 0) return "--";
  return new Date(seconds * 1000).toLocaleString();
}

/** Shared style for a previewed CLI command block. */
const COMMAND_PRE_STYLE = {
  background: "var(--bg2)",
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-all" as const,
  margin: 0,
};

/**
 * Read-only settlement detail: a "Disputed" badge + reason + disputed-at, and an
 * "Attestation" stat block (hash, attested tokens, attested-at) when present.
 */
export function JobSettlementDetail({ job }: { job: InferenceJob }) {
  const hasAttestation =
    Boolean(job.attestationHash) || job.attestedOutputTokens > 0 || job.attestedAt > 0;
  return (
    <>
      {job.disputed && (
        <div
          data-testid="job-disputed"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 6,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          <span className="badge error" data-testid="job-disputed-badge">
            Disputed
          </span>
          {job.disputeReason && (
            <div data-testid="job-dispute-reason" style={{ marginTop: 6 }}>
              <strong>Reason:</strong> {job.disputeReason}
            </div>
          )}
          <div data-testid="job-disputed-at" style={{ marginTop: 4, fontSize: 12 }}>
            Disputed at: {formatUnix(job.disputedAt)}
          </div>
        </div>
      )}

      {hasAttestation && (
        <div
          data-testid="job-attestation"
          style={{ marginTop: 12, padding: 12, borderRadius: 6, background: "var(--bg2)" }}
        >
          <strong style={{ fontSize: 13 }}>Attestation</strong>
          <div className="grid-2" style={{ gap: 12, marginTop: 8, fontSize: 13 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <strong>Hash:</strong>{" "}
              <span
                className="mono"
                data-testid="job-attestation-hash"
                style={{ wordBreak: "break-all", fontSize: 12 }}
              >
                {job.attestationHash || "--"}
              </span>
            </div>
            <div>
              <strong>Attested tokens:</strong>{" "}
              <span data-testid="job-attested-tokens">
                {job.attestedOutputTokens > 0 ? job.attestedOutputTokens : "--"}
              </span>
            </div>
            <div>
              <strong>Attested at:</strong>{" "}
              <span data-testid="job-attested-at">{formatUnix(job.attestedAt)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface JobSettlementPanelProps {
  /** Loaded/entered job id to target; empty string disables generation. */
  jobId: string;
}

/**
 * Command generators: "Attest usage (provider)" and "Dispute job (requester)".
 * Each validates input via the settlement-command builders and previews the
 * exact tx with a copy button + how-to-run toast.
 */
export default function JobSettlementPanel({ jobId }: JobSettlementPanelProps) {
  const { addToast } = useToast();

  const [attestTokens, setAttestTokens] = useState("");
  const [attestHash, setAttestHash] = useState("");
  const [attestProvider, setAttestProvider] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeRequester, setDisputeRequester] = useState("");

  const attestBuild = useMemo<{ command: string | null; error: string | null }>(() => {
    if (!jobId) return { command: null, error: null };
    try {
      return {
        command: buildAttestCommand({
          jobId,
          outputTokens: attestTokens,
          attestationHash: attestHash,
          provider: attestProvider,
        }),
        error: null,
      };
    } catch (e: unknown) {
      return { command: null, error: e instanceof Error ? e.message : "Invalid attestation input" };
    }
  }, [jobId, attestTokens, attestHash, attestProvider]);

  const disputeBuild = useMemo<{ command: string | null; error: string | null }>(() => {
    if (!jobId) return { command: null, error: null };
    try {
      return {
        command: buildDisputeCommand({ jobId, reason: disputeReason, requester: disputeRequester }),
        error: null,
      };
    } catch (e: unknown) {
      return { command: null, error: e instanceof Error ? e.message : "Invalid dispute input" };
    }
  }, [jobId, disputeReason, disputeRequester]);

  const onAttestToast = () => {
    if (!attestBuild.command) return;
    addToast({
      type: "info",
      title: "Provider-gated tx",
      message:
        "Only the job's assigned provider can submit a usage attestation. Run this from the provider's host.",
      duration: 6000,
    });
  };

  const onDisputeToast = () => {
    if (!disputeBuild.command) return;
    addToast({
      type: "info",
      title: "Requester-gated tx",
      message:
        "Only the requester can dispute a job. Disputing slashes the provider's reputation — run from the requester's host.",
      duration: 6000,
    });
  };

  return (
    <div className="card" data-testid="settlement-section" style={{ marginTop: 24 }}>
      <h2>Settle a Job</h2>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
        After a provider serves a job they record a usage attestation; the requester can dispute
        it. The browser previews the exact <code>clawchaind tx modelregistry</code> commands &mdash;
        they run from a host with the relevant signer key.
        {jobId ? (
          <>
            {" "}
            Targeting job <code data-testid="settlement-job-id">#{jobId}</code>.
          </>
        ) : (
          <> Track or enter a job id above to target a job.</>
        )}
      </p>

      {/* ---- Attest usage (provider) ---- */}
      <div data-testid="attest-section" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Attest usage (provider)</h3>
        <div className="grid-2" style={{ gap: 16, marginBottom: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Output tokens *</span>
            <input
              value={attestTokens}
              onChange={(e) => setAttestTokens(e.target.value)}
              placeholder="1024"
              aria-label="Attested output tokens"
              data-testid="attest-tokens-input"
              inputMode="numeric"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Provider key (--from) *</span>
            <input
              value={attestProvider}
              onChange={(e) => setAttestProvider(e.target.value)}
              placeholder="provider"
              aria-label="Provider key"
              data-testid="attest-provider-input"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>Attestation hash *</span>
          <input
            value={attestHash}
            onChange={(e) => setAttestHash(e.target.value)}
            placeholder="sha256:..."
            aria-label="Attestation hash"
            data-testid="attest-hash-input"
            style={{ padding: "6px 10px", width: "100%", marginTop: 4, fontFamily: "monospace" }}
          />
        </label>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h4 style={{ margin: 0 }}>Generated command</h4>
          {attestBuild.command && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CopyButton text={attestBuild.command} label="Copy attest command" />
              <button className="btn-outline" data-testid="attest-toast-btn" onClick={onAttestToast}>
                How to run
              </button>
            </div>
          )}
        </div>
        {attestBuild.error ? (
          <div data-testid="attest-command-error" style={{ color: "#ef4444" }}>
            {attestBuild.error}
          </div>
        ) : attestBuild.command ? (
          <pre data-testid="attest-command" className="mono" style={COMMAND_PRE_STYLE}>
            {attestBuild.command}
          </pre>
        ) : (
          <div className="empty" data-testid="attest-command-empty">
            Track a job and enter output tokens, an attestation hash, and the provider key.
          </div>
        )}
      </div>

      {/* ---- Dispute job (requester) ---- */}
      <div data-testid="dispute-section">
        <h3 style={{ marginBottom: 8 }}>Dispute job (requester)</h3>
        <div className="grid-2" style={{ gap: 16, marginBottom: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Requester key (--from) *</span>
            <input
              value={disputeRequester}
              onChange={(e) => setDisputeRequester(e.target.value)}
              placeholder="requester"
              aria-label="Requester key"
              data-testid="dispute-requester-input"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>Reason *</span>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Output did not match the attestation..."
            aria-label="Dispute reason"
            data-testid="dispute-reason-input"
            rows={3}
            style={{ padding: "6px 10px", width: "100%", marginTop: 4, fontFamily: "inherit" }}
          />
        </label>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h4 style={{ margin: 0 }}>Generated command</h4>
          {disputeBuild.command && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CopyButton text={disputeBuild.command} label="Copy dispute command" />
              <button
                className="btn-outline"
                data-testid="dispute-toast-btn"
                onClick={onDisputeToast}
              >
                How to run
              </button>
            </div>
          )}
        </div>
        {disputeBuild.error ? (
          <div data-testid="dispute-command-error" style={{ color: "#ef4444" }}>
            {disputeBuild.error}
          </div>
        ) : disputeBuild.command ? (
          <pre data-testid="dispute-command" className="mono" style={COMMAND_PRE_STYLE}>
            {disputeBuild.command}
          </pre>
        ) : (
          <div className="empty" data-testid="dispute-command-empty">
            Track a job and enter a reason and the requester key.
          </div>
        )}
      </div>
    </div>
  );
}
