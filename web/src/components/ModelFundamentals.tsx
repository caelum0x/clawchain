import { useCallback, useEffect, useState } from "react";
import { chainConfig } from "../lib/config.ts";
import {
  formatLatency,
  formatRating,
  formatSpotPrice,
  getModelFundamentals,
  priceVsIndex,
  type ModelFundamentals as ModelFundamentalsData,
  type PriceVsIndex,
} from "../lib/model-index.ts";

export interface ModelFundamentalsProps {
  /** modelregistry model id whose fundamentals to load. */
  modelId: string;
  /** display symbol for the model token, e.g. OPUS_4_8. */
  modelSymbol: string;
  /** ModelVault contract address backing the bonding-curve price, if any. */
  vaultAddress?: string;
  /**
   * external (DEX-derived) CLAW-per-token price, when known. Compared against
   * the bonding-curve spot price to derive a premium/discount indicator.
   */
  externalPriceClaw?: number | null;
}

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

const INDEX_LABELS: Record<PriceVsIndex, string> = {
  premium: "Premium vs curve",
  discount: "Discount vs curve",
  inline: "In line with curve",
  "n/a": "No DEX reference",
};

const INDEX_COLORS: Record<PriceVsIndex, string> = {
  premium: "#22c55e",
  discount: "#ef4444",
  inline: "var(--text2)",
  "n/a": "var(--text2)",
};

export default function ModelFundamentals({
  modelId,
  modelSymbol,
  vaultAddress,
  externalPriceClaw = null,
}: ModelFundamentalsProps) {
  const [data, setData] = useState<ModelFundamentalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const fundamentals = await getModelFundamentals(modelId, vaultAddress);
      setData(fundamentals);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load fundamentals");
    }
    setLoading(false);
  }, [modelId, vaultAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const indicator = priceVsIndex(externalPriceClaw, data?.spotPriceClaw ?? null);

  return (
    <div className="card" data-testid="model-fundamentals-panel" style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2>Fundamentals</h2>
        <span style={{ fontSize: 12, color: "var(--text2)" }} className="mono">
          {modelSymbol}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
        Stock-style fact sheet for {modelSymbol}: on-chain inference activity, provider
        coverage, and the ModelVault bonding-curve spot price &mdash; the curve&apos;s
        marginal {RESERVE_LABEL} value per token.
      </p>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading fundamentals...</p>
        </div>
      ) : loadError ? (
        <div data-testid="model-fundamentals-error" style={{ color: "#ef4444" }}>
          Failed to load fundamentals: {loadError}
          <div style={{ marginTop: 8 }}>
            <button className="btn-outline" onClick={fetchData}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Fundamentals grid */}
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="card" data-testid="fundamentals-stat-volume">
              <h3>Completed Volume</h3>
              <div className="value">{data?.completedJobs ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                of {data?.totalJobs ?? 0} inference jobs
              </div>
            </div>
            <div className="card" data-testid="fundamentals-stat-latency">
              <h3>Avg Latency</h3>
              <div className="value">{formatLatency(data?.avgLatencyMs ?? 0)}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                across providers
              </div>
            </div>
            <div className="card" data-testid="fundamentals-stat-rating">
              <h3>Rating</h3>
              <div className="value">
                {formatRating(data?.rating ?? 0, data?.ratingCount ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {(data?.ratingCount ?? 0)} ratings
              </div>
            </div>
            <div className="card" data-testid="fundamentals-stat-providers">
              <h3>Providers</h3>
              <div className="value">{data?.providerCount ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {data?.onlineProviders ?? 0} online
              </div>
            </div>
          </div>

          {/* Spot price + price-vs-index indicator */}
          <div
            className="card accent"
            data-testid="fundamentals-spot-price"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h3>Spot Price (bonding curve)</h3>
              <div className="value accent">
                {formatSpotPrice(data?.spotPriceClaw ?? null)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                marginal {RESERVE_LABEL} per {modelSymbol}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                data-testid="fundamentals-price-index"
                style={{ fontSize: 13, fontWeight: 600, color: INDEX_COLORS[indicator] }}
              >
                {INDEX_LABELS[indicator]}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {externalPriceClaw != null
                  ? `DEX: ${externalPriceClaw.toFixed(6)} ${RESERVE_LABEL}`
                  : "No DEX pool price"}
              </div>
            </div>
          </div>

          {!vaultAddress?.trim() && (
            <p
              data-testid="fundamentals-no-vault"
              style={{ fontSize: 12, color: "var(--text2)", marginTop: 12 }}
            >
              Enter a ModelVault contract address above to load the bonding-curve spot price.
            </p>
          )}
        </>
      )}
    </div>
  );
}
