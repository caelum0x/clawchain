import { useNavigate } from "react-router-dom";
import { chainConfig } from "../lib/config.ts";
import {
  formatRating,
  priceVsIndex,
  type PriceVsIndex,
} from "../lib/model-index.ts";
import type { ModelMarketRowData } from "../lib/model-markets.ts";

export interface ModelMarketRowProps {
  /** shaped market row for one model token. */
  row: ModelMarketRowData;
}

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

const BADGE_LABELS: Record<PriceVsIndex, string> = {
  premium: "Premium",
  discount: "Discount",
  inline: "In line",
  "n/a": "No curve ref",
};

const BADGE_CLASS: Record<PriceVsIndex, string> = {
  premium: "success",
  discount: "error",
  inline: "",
  "n/a": "warning",
};

/** Format a CLAW-per-token price, or "N/A" when unknown. */
function formatPrice(price: number | null): string {
  if (price == null || !Number.isFinite(price)) return "N/A";
  return price.toFixed(6);
}

/**
 * A single clickable markets row. Clicking navigates to the existing
 * ModelExchange page; pressing Enter/Space does the same for keyboard users.
 *
 * The premium/discount badge reuses {@link priceVsIndex}: it compares the
 * model's DEX price against its bonding-curve spot price (when a vault price is
 * known), exactly like ModelFundamentals.
 */
export default function ModelMarketRow({ row }: ModelMarketRowProps) {
  const navigate = useNavigate();
  const indicator = priceVsIndex(row.priceClaw, row.spotPriceClaw);

  const open = () => navigate("/model-exchange");

  return (
    <tr
      data-testid="model-market-row"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open ${row.symbol} on the Model Exchange`}
      style={{ cursor: "pointer" }}
    >
      <td>
        <div style={{ fontWeight: 600 }} className="mono">
          {row.symbol}
        </div>
        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
          {row.name || `Model #${row.modelId}`} &middot; ID {row.modelId}
        </div>
      </td>
      <td>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
          {formatPrice(row.priceClaw)}
        </span>
        <div style={{ fontSize: 11, color: "var(--text2)" }}>{RESERVE_LABEL}</div>
      </td>
      <td>{row.completedJobs}</td>
      <td>{formatRating(row.rating, row.ratingCount)}</td>
      <td>
        {row.providerCount}
        <span style={{ fontSize: 11, color: "var(--text2)" }}>
          {" "}
          ({row.onlineProviders} online)
        </span>
      </td>
      <td>
        <span
          className={`badge ${BADGE_CLASS[indicator]}`}
          data-testid="model-market-badge"
        >
          {BADGE_LABELS[indicator]}
        </span>
      </td>
    </tr>
  );
}
