// inference-stream.ts — SSE client for streaming inference results from the sidecar.

import { useState, useEffect, useRef, useCallback } from "react";

const SIDECAR_URL =
  (typeof window !== "undefined" && (window as any).__CLAW_SIDECAR_URL) ||
  (import.meta.env.VITE_CLAWCHAIN_SIDECAR_URL as string | undefined) ||
  (import.meta.env.PROD ? "/sidecar" : "http://localhost:8090");

export interface StreamEvent {
  type: "partial" | "complete" | "error";
  data: string;
  tx_hash?: string;
  tokens_used?: number;
}

export interface InferenceStreamState {
  tokens: string;
  status: "idle" | "connecting" | "streaming" | "complete" | "error";
  txHash: string;
  tokensUsed: number;
  error: string;
  start: () => void;
  stop: () => void;
}

/**
 * React hook that connects to the inference sidecar's SSE endpoint and
 * accumulates streamed tokens for a given job ID.
 */
export function useInferenceStream(jobId: string | null): InferenceStreamState {
  const [tokens, setTokens] = useState("");
  const [status, setStatus] = useState<InferenceStreamState["status"]>("idle");
  const [txHash, setTxHash] = useState("");
  const [tokensUsed, setTokensUsed] = useState(0);
  const [error, setError] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!jobId) return;

    // Reset state
    setTokens("");
    setTxHash("");
    setTokensUsed(0);
    setError("");
    setStatus("connecting");
    stop();

    const url = `${SIDECAR_URL}/stream/${jobId}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setStatus("streaming");
    };

    es.onmessage = (event) => {
      try {
        const parsed: StreamEvent = JSON.parse(event.data);

        switch (parsed.type) {
          case "partial":
            setTokens((prev) => prev + parsed.data);
            setStatus("streaming");
            break;

          case "complete":
            setTokens((prev) => prev + (parsed.data || ""));
            setTxHash(parsed.tx_hash || "");
            setTokensUsed(parsed.tokens_used || 0);
            setStatus("complete");
            es.close();
            break;

          case "error":
            setError(parsed.data);
            setStatus("error");
            es.close();
            break;
        }
      } catch {
        // Non-JSON event, ignore
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        // Normal close after complete/error
        return;
      }
      setError("Connection to inference sidecar lost");
      setStatus("error");
      es.close();
    };
  }, [jobId, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { tokens, status, txHash, tokensUsed, error, start, stop };
}
