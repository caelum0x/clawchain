import { getModelFundamentals } from "./model-index.ts";
import { getModelTokens, type ModelToken } from "./model-tokens.ts";

/**
 * Markets-overview data layer for the AI Stock Exchange page. Joins the
 * read-first model-token view ({@link getModelTokens}) with per-model
 * fundamentals ({@link getModelFundamentals}) into a flat, sortable row shape.
 *
 * Reuses round-1 helpers — no new query plumbing. The DEX-derived `priceClaw`
 * is the market spot price; completed inference jobs are the "24h-ish" volume
 * proxy, mirroring the single-model Fundamentals panel.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */

/** One row in the markets table. All fields are display-ready. */
export interface ModelMarketRowData {
  modelId: string;
  symbol: string;
  name: string;
  denom: string;
  /** DEX-derived CLAW-per-token price (the market spot), or null. */
  priceClaw: number | null;
  /** bonding-curve spot price, when a vault price is known (else null). */
  spotPriceClaw: number | null;
  /** completed inference jobs — the volume proxy. */
  completedJobs: number;
  /** model rating on a 0-5 scale (0 when unrated). */
  rating: number;
  ratingCount: number;
  /** number of inference providers serving the model. */
  providerCount: number;
  onlineProviders: number;
}

/** Sortable columns exposed by the markets table. */
export type MarketSortKey =
  | "symbol"
  | "priceClaw"
  | "completedJobs"
  | "rating"
  | "providerCount";

export type SortDirection = "asc" | "desc";

/**
 * Build the markets rows: only issued (minted) tokens are tradeable markets, so
 * unminted registrations are excluded. Fundamentals are fetched best-effort per
 * model; a single model's failure does not fail the whole list.
 */
export async function getModelMarkets(): Promise<ModelMarketRowData[]> {
  const tokens = await getModelTokens({ withPrice: true });
  const minted = tokens.filter((t) => t.hasToken);
  const rows = await Promise.all(minted.map(buildMarketRow));
  return rows;
}

async function buildMarketRow(token: ModelToken): Promise<ModelMarketRowData> {
  const fundamentals = await safeFundamentals(token.modelId);
  return {
    modelId: token.modelId,
    symbol: token.symbol,
    name: token.name,
    denom: token.denom,
    priceClaw: token.priceClaw,
    spotPriceClaw: fundamentals?.spotPriceClaw ?? null,
    completedJobs: fundamentals?.completedJobs ?? 0,
    rating: fundamentals?.rating ?? 0,
    ratingCount: fundamentals?.ratingCount ?? 0,
    providerCount: fundamentals?.providerCount ?? 0,
    onlineProviders: fundamentals?.onlineProviders ?? 0,
  };
}

/**
 * Per-model fundamentals without a vault address (no curve price in the
 * overview — that lives on the per-model page). Resolves null on failure so one
 * bad model never breaks the table.
 */
async function safeFundamentals(modelId: string) {
  try {
    return await getModelFundamentals(modelId);
  } catch {
    return null;
  }
}

/**
 * Pure, immutable sort. String columns sort lexicographically; numeric columns
 * sort by value with nulls always pushed to the bottom regardless of direction.
 */
export function sortMarketRows(
  rows: readonly ModelMarketRowData[],
  key: MarketSortKey,
  direction: SortDirection,
): ModelMarketRowData[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "symbol") {
      return a.symbol.localeCompare(b.symbol) * factor;
    }
    const av = numericField(a, key);
    const bv = numericField(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last
    if (bv == null) return -1;
    return (av - bv) * factor;
  });
}

function numericField(
  row: ModelMarketRowData,
  key: Exclude<MarketSortKey, "symbol">,
): number | null {
  switch (key) {
    case "priceClaw":
      return row.priceClaw;
    case "completedJobs":
      return row.completedJobs;
    case "rating":
      return row.ratingCount > 0 ? row.rating : null;
    case "providerCount":
      return row.providerCount;
  }
}
