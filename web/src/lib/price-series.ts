/**
 * Web-local price-series helpers for the Vault Inspector's session price
 * history. The chain does NOT store price history, so a "series" is built by
 * sampling the bonding-curve spot price (reserve / inventory) over time via
 * {@link getVaultSpotPrice} and accumulating the samples client-side.
 *
 * Pure functions only — no React, no I/O. Mirrors the SDK model-analytics
 * shape conceptually (first / last / min / max / changePct) but stays
 * web-local so the dashboard owns its own session state.
 */

/** Summary statistics over a finite price series. */
export interface SeriesStats {
  /** first (oldest) sample, or null when the series is empty. */
  first: number | null;
  /** last (newest) sample, or null when the series is empty. */
  last: number | null;
  /** minimum sample, or null when the series is empty. */
  min: number | null;
  /** maximum sample, or null when the series is empty. */
  max: number | null;
  /**
   * percent change from first to last, e.g. 12.5 for +12.5%. Null when the
   * series is empty or the first sample is not a positive, finite number.
   */
  changePct: number | null;
  /** number of samples in the series. */
  count: number;
}

/**
 * Append `price` to `series`, returning a NEW array capped at `maxLen` (oldest
 * samples dropped from the front). Non-finite prices are ignored and the
 * original array is returned unchanged. Never mutates the input.
 */
export function pushSample(
  series: readonly number[],
  price: number,
  maxLen: number,
): number[] {
  if (!Number.isFinite(price)) return series.slice();
  if (!Number.isFinite(maxLen) || maxLen <= 0) {
    throw new Error("pushSample: maxLen must be a positive number");
  }
  const next = [...series, price];
  const overflow = next.length - Math.floor(maxLen);
  return overflow > 0 ? next.slice(overflow) : next;
}

/**
 * Compute summary statistics over `series`. Empty series yields all-null
 * fields with `count: 0` so callers can render a placeholder rather than
 * dividing by zero.
 */
export function seriesStats(series: readonly number[]): SeriesStats {
  const finite = series.filter((p) => Number.isFinite(p));
  if (finite.length === 0) {
    return { first: null, last: null, min: null, max: null, changePct: null, count: 0 };
  }

  const first = finite[0];
  const last = finite[finite.length - 1];
  let min = first;
  let max = first;
  for (const p of finite) {
    if (p < min) min = p;
    if (p > max) max = p;
  }

  const changePct =
    Number.isFinite(first) && first > 0 ? ((last - first) / first) * 100 : null;

  return { first, last, min, max, changePct, count: finite.length };
}
