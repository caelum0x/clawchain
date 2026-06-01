/**
 * Pure market-analytics helpers for @clawchain/sdk.
 *
 * The ClawChain chain does NOT store price history: a "series" is built by
 * SAMPLING the bonding-curve spot price (reserve/inventory) over time. These
 * helpers are PURE — no I/O, no client calls. Callers feed timestamped samples
 * (typically derived from {@link ModelMarket.snapshot} — see model-market.ts)
 * and these functions fold them into summary stats, append to an immutable ring
 * buffer, or detect threshold crossings for alerting.
 *
 * The spot price convention matches {@link ModelMarketSnapshot.curveSpotPrice}
 * and `web/src/lib/model-index.ts`: display-unit reserve-denom (CLAW) per 1
 * model token, or `null` when the curve is unfunded (no reserve / inventory).
 *
 * All functions are immutable: inputs are never mutated and every return value
 * is a fresh object/array.
 */

// ---------------------------------------------------------------------------
// Sample + stats shapes
// ---------------------------------------------------------------------------

/**
 * One timestamped observation of a ModelVault curve. `spotPrice` is the
 * display-unit reserve-per-token price (or `null` when unfunded); `reserve` and
 * `inventory` are the raw base-unit pool amounts (decimal strings, mirroring
 * {@link VaultPool}).
 */
export interface MarketSample {
  /** Unix epoch milliseconds the sample was taken. */
  timestamp: number;
  /** Curve spot price (reserve/inventory), or null when unfunded. */
  spotPrice: number | null;
  /** Reserve-coin amount held by the curve (base units, decimal string). */
  reserve: string;
  /** Model-token amount held by the curve (base units, decimal string). */
  inventory: string;
}

/**
 * Summary statistics computed over a series of {@link MarketSample}s. All price
 * fields are derived from the non-null `spotPrice`s only (unfunded samples are
 * skipped). When no sample carries a usable price, the price-derived fields are
 * `null` and `sampleCount` is 0.
 */
export interface MarketSeriesStats {
  /** First usable spot price (chronological order as supplied), or null. */
  first: number | null;
  /** Last usable spot price, or null. */
  last: number | null;
  /** Minimum usable spot price, or null. */
  min: number | null;
  /** Maximum usable spot price, or null. */
  max: number | null;
  /** Absolute change `last - first`, or null when either bound is missing. */
  changeAbs: number | null;
  /** Percent change `(last - first) / first * 100`, or null when unavailable. */
  changePct: number | null;
  /** Count of samples with a usable (finite, non-null) spot price. */
  sampleCount: number;
  /** Population standard deviation of the usable spot prices, or null. */
  volatility: number | null;
}

/** Direction a {@link crossedThreshold} test fires on. */
export type CrossDirection = "up" | "down";

// ---------------------------------------------------------------------------
// summarizeSeries
// ---------------------------------------------------------------------------

/**
 * Fold a series of samples into {@link MarketSeriesStats}. Samples are consumed
 * in the order supplied (callers keep them chronological); only finite, non-null
 * spot prices contribute. Volatility is the POPULATION standard deviation of the
 * usable prices. Returns a zeroed/`null` stats object for an empty or
 * all-unfunded series. Pure — `samples` is not mutated.
 */
export function summarizeSeries(
  samples: readonly MarketSample[],
): MarketSeriesStats {
  const prices = usablePrices(samples);
  const sampleCount = prices.length;

  if (sampleCount === 0) {
    return {
      first: null,
      last: null,
      min: null,
      max: null,
      changeAbs: null,
      changePct: null,
      sampleCount: 0,
      volatility: null,
    };
  }

  const first = prices[0];
  const last = prices[sampleCount - 1];
  let min = prices[0];
  let max = prices[0];
  let sum = 0;
  for (const price of prices) {
    if (price < min) min = price;
    if (price > max) max = price;
    sum += price;
  }

  const changeAbs = last - first;
  const changePct = first !== 0 ? (changeAbs / first) * 100 : null;

  return {
    first,
    last,
    min,
    max,
    changeAbs,
    changePct,
    sampleCount,
    volatility: populationStdDev(prices, sum / sampleCount),
  };
}

// ---------------------------------------------------------------------------
// addSample (immutable ring buffer)
// ---------------------------------------------------------------------------

/**
 * Append `sample` to `series`, returning a NEW capped array (immutable ring
 * buffer). When `maxLen` is given and the result would exceed it, the OLDEST
 * samples are dropped so the tail (most recent) is kept. `maxLen <= 0` yields an
 * empty array; an omitted `maxLen` keeps everything. The input `series` is never
 * mutated.
 */
export function addSample(
  series: readonly MarketSample[],
  sample: MarketSample,
  maxLen?: number,
): MarketSample[] {
  const appended = [...series, sample];
  if (maxLen === undefined) return appended;
  if (maxLen <= 0) return [];
  if (appended.length <= maxLen) return appended;
  return appended.slice(appended.length - maxLen);
}

// ---------------------------------------------------------------------------
// crossedThreshold (alerting)
// ---------------------------------------------------------------------------

/**
 * Report whether a price moved ACROSS `threshold` between two consecutive
 * samples, for alerting. `"up"` fires when `prev <= threshold < next`; `"down"`
 * fires when `prev >= threshold > next`. Returns `false` when either price is
 * null/non-finite (an unfunded boundary is not a crossing). Pure.
 */
export function crossedThreshold(
  prev: number | null,
  next: number | null,
  threshold: number,
  direction: CrossDirection,
): boolean {
  if (
    prev == null ||
    next == null ||
    !Number.isFinite(prev) ||
    !Number.isFinite(next) ||
    !Number.isFinite(threshold)
  ) {
    return false;
  }
  if (direction === "up") {
    return prev <= threshold && next > threshold;
  }
  return prev >= threshold && next < threshold;
}

// ---------------------------------------------------------------------------
// Pure internals
// ---------------------------------------------------------------------------

/** Extract finite, non-null spot prices in supplied order. */
function usablePrices(samples: readonly MarketSample[]): number[] {
  const prices: number[] = [];
  for (const sample of samples) {
    const price = sample?.spotPrice;
    if (price != null && Number.isFinite(price)) {
      prices.push(price);
    }
  }
  return prices;
}

/** Population standard deviation about `mean`; 0 for a single price. */
function populationStdDev(prices: readonly number[], mean: number): number {
  if (prices.length === 0) return 0;
  let sumSq = 0;
  for (const price of prices) {
    const diff = price - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / prices.length);
}
