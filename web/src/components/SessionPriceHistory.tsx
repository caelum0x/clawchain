import { useCallback, useEffect, useRef, useState } from "react";
import { chainConfig } from "../lib/config.ts";
import { getVaultSpotPrice, formatSpotPrice } from "../lib/model-index.ts";
import { pushSample, seriesStats } from "../lib/price-series.ts";
import PriceSparkline from "./PriceSparkline.tsx";

/**
 * "Session price history" card for the Vault Inspector. The chain stores no
 * price history, so this builds a series client-side: with a start/stop toggle
 * (default stopped), it polls {@link getVaultSpotPrice} on an interval and
 * accumulates samples via {@link pushSample} into local state, rendering a
 * {@link PriceSparkline} plus summary stats. The interval is cleaned up on
 * unmount and whenever polling stops or the vault changes.
 */

export interface SessionPriceHistoryProps {
  /** ModelVault contract whose curve spot price we sample. */
  vaultAddress: string;
  /** poll cadence in milliseconds (defaults to 10s). */
  intervalMs?: number;
  /** maximum samples retained in the rolling series. */
  maxSamples?: number;
}

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"
const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_MAX_SAMPLES = 60;

function formatChangePct(changePct: number | null): string {
  if (changePct == null || !Number.isFinite(changePct)) return "--";
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}

export default function SessionPriceHistory({
  vaultAddress,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxSamples = DEFAULT_MAX_SAMPLES,
}: SessionPriceHistoryProps) {
  const [samples, setSamples] = useState<number[]>([]);
  const [polling, setPolling] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sample = useCallback(async () => {
    try {
      const price = await getVaultSpotPrice(vaultAddress);
      if (price == null || !Number.isFinite(price)) {
        setSampleError("No liquidity — spot price unavailable");
        return;
      }
      setSampleError(null);
      setSamples((prev) => pushSample(prev, price, maxSamples));
    } catch (e: unknown) {
      setSampleError(e instanceof Error ? e.message : "Failed to sample spot price");
    }
  }, [vaultAddress, maxSamples]);

  // Reset the series whenever the inspected vault changes.
  useEffect(() => {
    setSamples([]);
    setSampleError(null);
    setPolling(false);
  }, [vaultAddress]);

  // Drive the poll loop; clean up on stop / unmount / dependency change.
  useEffect(() => {
    if (!polling) return;
    void sample(); // immediate first sample
    timerRef.current = setInterval(() => {
      void sample();
    }, intervalMs);
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [polling, sample, intervalMs]);

  const stats = seriesStats(samples);
  const intervalSeconds = Math.round(intervalMs / 1000);

  return (
    <div className="card" data-testid="vault-price-history" style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2>Session price history</h2>
        <button
          className={polling ? "btn-outline" : "btn"}
          data-testid="price-history-toggle"
          onClick={() => setPolling((p) => !p)}
        >
          {polling ? "Stop" : "Start"} sampling
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
        The chain stores no price history. This samples the bonding-curve spot price
        every {intervalSeconds}s while running and charts it locally for this session
        (last {maxSamples} samples). Sampling is off by default.
      </p>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card accent" data-testid="price-stat-last">
          <h3>Last</h3>
          <div className="value accent">{formatSpotPrice(stats.last)}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {RESERVE_LABEL} per token
          </div>
        </div>
        <div className="card" data-testid="price-stat-change">
          <h3>Change</h3>
          <div className="value">{formatChangePct(stats.changePct)}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            first &rarr; last
          </div>
        </div>
        <div className="card" data-testid="price-stat-range">
          <h3>Range</h3>
          <div className="value" style={{ fontSize: 16 }}>
            {formatSpotPrice(stats.min)} &ndash; {formatSpotPrice(stats.max)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            min &ndash; max
          </div>
        </div>
        <div className="card" data-testid="price-stat-count">
          <h3>Samples</h3>
          <div className="value">{stats.count}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {polling ? "sampling…" : "stopped"}
          </div>
        </div>
      </div>

      <PriceSparkline samples={samples} />

      {sampleError && (
        <p data-testid="price-history-error" style={{ color: "#ef4444", marginTop: 12 }}>
          {sampleError}
        </p>
      )}
    </div>
  );
}
