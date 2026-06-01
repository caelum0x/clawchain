/**
 * Side-by-side "model comparison" aggregate for @clawchain/sdk.
 *
 * This is PURE COMPOSITION over the round-1 {@link ModelMarket}: given a set of
 * labelled markets, it runs each market's existing {@link ModelMarket.snapshot}
 * in parallel and folds the results into a single typed
 * {@link ModelComparisonResult} — one per-vault row per market (label, contract,
 * curveSpotPrice, totalStaked, curveVsDexBps) plus derived cross-vault
 * aggregates (cheapest/dearest by spot price, highest-staked, and the basis-point
 * spread between the min and max spot price).
 *
 * Markets are supplied by the caller (no on-chain registry yet). A bad or
 * unreachable market degrades that ONE row to a null entry collected in
 * `errors`; it never fails the whole comparison. An empty market set yields an
 * empty comparison (no aggregates).
 *
 * `totalStaked` is the dividend pool's `pool_info.total_staked` (a Uint128
 * base-unit decimal string) carried through verbatim; spot prices and bps are
 * read straight off the snapshot. Cross-vault aggregates reference rows by their
 * stable index so duplicate labels stay unambiguous.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */
import type { ModelMarket } from "./model-market.js";

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/**
 * One labelled market's row in a comparison, folded from that market's
 * {@link ModelMarket.snapshot}. `curveSpotPrice`/`curveVsDexBps` are `null` when
 * the underlying snapshot could not derive them (unfunded curve / missing DEX);
 * `totalStaked` is the dividend pool's staked total as a base-unit decimal string.
 */
export interface ModelComparisonRow {
  /** Stable index of this row within the comparison (matches input order). */
  index: number;
  /** Caller-supplied display label for this market (may be non-unique). */
  label: string;
  /** Vault contract address this row describes. */
  contract: string;
  /**
   * Bonding-curve spot price (reserve-denom per model token), or null when the
   * curve has no inventory/reserves.
   */
  curveSpotPrice: number | null;
  /** Total model tokens staked in the dividend pool (base-unit decimal string). */
  totalStaked: string;
  /**
   * Curve price relative to the DEX mid, in basis points (positive = premium),
   * or null when either price was unavailable.
   */
  curveVsDexBps: number | null;
}

/** A per-market read failure, paired with the entry it came from. */
export interface ModelComparisonError {
  /** Stable index of the failed entry within the comparison. */
  index: number;
  /** Caller-supplied label for the failed market. */
  label: string;
  /** Vault contract address whose snapshot failed (best-effort). */
  contract: string;
  /** Human-readable error message (never leaks internals). */
  message: string;
}

/**
 * Cross-vault aggregates derived from the successful rows. Each "by price"
 * pointer references a row index (and carries its value) so callers can
 * highlight the winner without re-scanning. All fields are null when there are
 * no rows with the relevant signal (e.g. no priced rows -> no cheapest).
 */
export interface ModelComparisonAggregates {
  /** Row index of the lowest curve spot price, or null when none are priced. */
  cheapestIndex: number | null;
  /** The lowest curve spot price across rows, or null. */
  cheapestSpotPrice: number | null;
  /** Row index of the highest curve spot price, or null when none are priced. */
  dearestIndex: number | null;
  /** The highest curve spot price across rows, or null. */
  dearestSpotPrice: number | null;
  /** Row index of the largest `totalStaked`, or null when no rows. */
  highestStakedIndex: number | null;
  /** The largest `totalStaked` (base-unit decimal string), or null. */
  highestStaked: string | null;
  /**
   * Spread between the min and max curve spot price in basis points relative to
   * the min: `(max - min) / min * 1e4`. Null when fewer than two rows are priced
   * or the min is non-positive.
   */
  spreadBps: number | null;
}

/**
 * A single typed side-by-side comparison across many ModelVault markets. `rows`
 * holds one entry per successfully-snapshotted market (input order preserved by
 * `index`); unreachable markets surface in `errors`. `aggregates` is derived
 * only from successful rows.
 */
export interface ModelComparisonResult {
  /** Successfully-snapshotted market rows (one per healthy market). */
  rows: ModelComparisonRow[];
  /** Cross-vault aggregates derived from `rows`. */
  aggregates: ModelComparisonAggregates;
  /** Number of markets that were successfully read into `rows`. */
  marketCount: number;
  /** Per-market read failures — never aborts the whole comparison. */
  errors: ModelComparisonError[];
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** One labelled market to include in a comparison. */
export interface ModelComparisonEntry {
  /** Display label for this market (e.g. the model name). */
  label: string;
  /** The composed market to snapshot. */
  market: ModelMarket;
}

// ---------------------------------------------------------------------------
// ModelComparison
// ---------------------------------------------------------------------------

/**
 * Composes a set of labelled {@link ModelMarket}s into a single side-by-side
 * comparison. Holds no mutable state beyond its entries; `compare()` always
 * issues fresh snapshots and returns a new immutable object.
 */
export class ModelComparison {
  private readonly entries: ModelComparisonEntry[];

  constructor(entries: ModelComparisonEntry[] = []) {
    const list = Array.isArray(entries) ? entries : [];
    // Normalize: drop entries without a market; coerce a blank label to the
    // market's contract so every row stays identifiable.
    this.entries = list
      .filter((entry): entry is ModelComparisonEntry => Boolean(entry?.market))
      .map((entry) => ({
        label: normalizeLabel(entry.label, entry.market),
        market: entry.market,
      }));
  }

  /** The labelled markets being compared, in input order. */
  get markets(): ReadonlyArray<ModelComparisonEntry> {
    return this.entries;
  }

  /**
   * Snapshot every market in parallel and fold the results into a fresh
   * {@link ModelComparisonResult}. A per-market failure degrades that row to an
   * `errors` entry instead of rejecting. An empty entry set yields an empty
   * comparison (no error).
   */
  async compare(): Promise<ModelComparisonResult> {
    const results = await Promise.all(
      this.entries.map((entry, index) => this.readRow(entry, index)),
    );

    const rows: ModelComparisonRow[] = [];
    const errors: ModelComparisonError[] = [];
    for (const result of results) {
      if (result.row) rows.push(result.row);
      else if (result.error) errors.push(result.error);
    }

    return {
      rows,
      aggregates: deriveAggregates(rows),
      marketCount: rows.length,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Snapshot one market and fold it into a row. Any failure resolves to an
   * `error` (never rejects), so one bad market can't sink the whole comparison.
   */
  private async readRow(
    entry: ModelComparisonEntry,
    index: number,
  ): Promise<{ row?: ModelComparisonRow; error?: ModelComparisonError }> {
    try {
      const snapshot = await entry.market.snapshot();
      return {
        row: {
          index,
          label: entry.label,
          contract: snapshot.contract,
          curveSpotPrice: snapshot.curveSpotPrice,
          totalStaked: snapshot.poolInfo.total_staked,
          curveVsDexBps: snapshot.curveVsDexBps,
        },
      };
    } catch (error: unknown) {
      return {
        error: {
          index,
          label: entry.label,
          contract: entry.market.contract,
          message: errorMessage(error),
        },
      };
    }
  }
}

/** Factory mirroring `createModelMarket` — returns a {@link ModelComparison}. */
export function createModelComparison(
  entries: ModelComparisonEntry[] = [],
): ModelComparison {
  return new ModelComparison(entries);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const BPS = 10_000;

/**
 * Fold rows into cross-vault aggregates: cheapest/dearest by curve spot price,
 * highest-staked, and the min/max spot-price spread in basis points. Rows with a
 * null spot price are ignored for price aggregates but still considered for
 * staked aggregates. All fields degrade to null when no qualifying row exists.
 */
function deriveAggregates(
  rows: ModelComparisonRow[],
): ModelComparisonAggregates {
  let cheapestIndex: number | null = null;
  let cheapestSpotPrice: number | null = null;
  let dearestIndex: number | null = null;
  let dearestSpotPrice: number | null = null;
  let highestStakedIndex: number | null = null;
  let highestStaked: bigint | null = null;

  for (const row of rows) {
    const price = row.curveSpotPrice;
    if (price != null && Number.isFinite(price)) {
      if (cheapestSpotPrice == null || price < cheapestSpotPrice) {
        cheapestSpotPrice = price;
        cheapestIndex = row.index;
      }
      if (dearestSpotPrice == null || price > dearestSpotPrice) {
        dearestSpotPrice = price;
        dearestIndex = row.index;
      }
    }

    const staked = parseUint(row.totalStaked);
    if (staked != null && (highestStaked == null || staked > highestStaked)) {
      highestStaked = staked;
      highestStakedIndex = row.index;
    }
  }

  return {
    cheapestIndex,
    cheapestSpotPrice,
    dearestIndex,
    dearestSpotPrice,
    highestStakedIndex,
    highestStaked: highestStaked == null ? null : highestStaked.toString(),
    spreadBps: spreadBps(cheapestSpotPrice, dearestSpotPrice),
  };
}

/**
 * Min/max spot-price spread in basis points relative to the min:
 * `(max - min) / min * 1e4`. Null when either bound is missing/non-finite or the
 * min is non-positive.
 */
function spreadBps(
  minSpot: number | null,
  maxSpot: number | null,
): number | null {
  if (
    minSpot == null ||
    maxSpot == null ||
    !Number.isFinite(minSpot) ||
    !Number.isFinite(maxSpot) ||
    minSpot <= 0
  ) {
    return null;
  }
  return Math.round(((maxSpot - minSpot) / minSpot) * BPS);
}

/** Parse a non-negative integer base-unit string to BigInt, or null if invalid. */
function parseUint(value: string): bigint | null {
  const trimmed = (value ?? "").trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

/** Coerce a blank/missing label to the market's contract address. */
function normalizeLabel(label: string | undefined, market: ModelMarket): string {
  const trimmed = (label ?? "").trim();
  return trimmed === "" ? market.contract : trimmed;
}

/** Narrow an unknown thrown value to a safe message string. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown error comparing market";
}
