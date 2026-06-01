import { seriesStats } from "../lib/price-series.ts";

/**
 * Dependency-free inline-SVG sparkline. Pure presentational: takes a number[]
 * of spot-price samples and renders a small polyline with min/max labels and a
 * last-value readout. No charting library, no state, no I/O.
 *
 * Samples are the bonding-curve spot price (reserve / inventory) sampled over a
 * session — see {@link pushSample} / {@link seriesStats} in lib/price-series.ts.
 */

export interface PriceSparklineProps {
  /** ordered spot-price samples (oldest -> newest). */
  samples: readonly number[];
  /** SVG width in px. */
  width?: number;
  /** SVG height in px. */
  height?: number;
  /** stroke colour for the polyline (defaults to the accent variable). */
  stroke?: string;
  /** how to format a numeric value for the labels (defaults to 6dp). */
  format?: (value: number) => string;
}

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 64;
const PAD = 4;

function defaultFormat(value: number): string {
  return value.toFixed(6);
}

/**
 * Map samples to SVG points. A flat series (min === max) draws a centred
 * horizontal line; a single sample draws a centred dot via two coincident
 * points. Returns the polyline `points` string and the y for first/last dots.
 */
function buildPoints(
  samples: readonly number[],
  width: number,
  height: number,
  min: number,
  max: number,
): { points: string; lastX: number; lastY: number } {
  const innerW = Math.max(width - PAD * 2, 1);
  const innerH = Math.max(height - PAD * 2, 1);
  const span = max - min;
  const n = samples.length;

  const toX = (i: number): number =>
    n <= 1 ? PAD + innerW / 2 : PAD + (i / (n - 1)) * innerW;
  const toY = (v: number): number =>
    span <= 0 ? PAD + innerH / 2 : PAD + innerH - ((v - min) / span) * innerH;

  const coords = samples.map((v, i) => [toX(i), toY(v)] as const);
  const points = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const lastCoord = coords[coords.length - 1] ?? [PAD + innerW / 2, PAD + innerH / 2];
  return { points, lastX: lastCoord[0], lastY: lastCoord[1] };
}

export default function PriceSparkline({
  samples,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  stroke = "var(--accent, #6366f1)",
  format = defaultFormat,
}: PriceSparklineProps) {
  const stats = seriesStats(samples);

  if (stats.count === 0 || stats.min == null || stats.max == null) {
    return (
      <div
        data-testid="price-sparkline-empty"
        style={{
          fontSize: 12,
          color: "var(--text2)",
          padding: "12px 0",
        }}
      >
        No samples yet — start polling to build the session price series.
      </div>
    );
  }

  const { points, lastX, lastY } = buildPoints(
    samples.filter((p) => Number.isFinite(p)),
    width,
    height,
    stats.min,
    stats.max,
  );

  return (
    <div data-testid="price-sparkline">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Spot price sparkline, ${stats.count} samples, last ${format(
          stats.last ?? 0,
        )}`}
        style={{ display: "block", overflow: "visible" }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          data-testid="price-sparkline-line"
        />
        <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text2)",
          marginTop: 4,
        }}
      >
        <span data-testid="price-sparkline-min">min {format(stats.min)}</span>
        <span data-testid="price-sparkline-last" className="mono accent">
          {format(stats.last ?? 0)}
        </span>
        <span data-testid="price-sparkline-max">max {format(stats.max)}</span>
      </div>
    </div>
  );
}
