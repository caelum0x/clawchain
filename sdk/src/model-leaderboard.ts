/**
 * Pure model-ranking / leaderboard helpers for @clawchain/sdk.
 *
 * These functions turn per-model FUNDAMENTALS records into a ranked
 * leaderboard. They are PURE — no I/O, no client calls, no chain reads.
 * Callers supply the fundamentals (typically derived from `x/modelregistry`
 * job/rating data; see `cmd/clawd/src/commands/model-index.ts` and
 * `web/src/lib/model-index.ts`), and these helpers normalize each signal,
 * blend them with documented fixed weights, and sort.
 *
 * The composite scoring is the SAME weighted blend used by the clawd
 * `model-index` command (`computeIndexScore` in
 * `cmd/clawd/src/commands/model-index.ts`), so the SDK and CLI agree on a
 * model's index score for identical inputs. The one shape difference is the
 * latency unit: clawd carries `avgLatencySeconds`; this SDK input takes
 * `avgLatencyMs` for symmetry with `ModelMarketSnapshot`-style millisecond
 * fields, and converts to seconds internally before applying the SAME latency
 * factor (`60 / (60 + seconds)`).
 *
 * All functions are immutable: inputs are never mutated and every return value
 * is a fresh object/array.
 */

// ---------------------------------------------------------------------------
// Input + output shapes
// ---------------------------------------------------------------------------

/**
 * Per-model fundamentals — the raw signals that feed the composite index
 * score. Mirrors the on-chain inputs computed by the clawd `model-index`
 * command, with latency expressed in milliseconds here.
 */
export interface ModelFundamentals {
  /** Stable model identifier (used as the stable tie-break key). */
  modelId: string;
  /** Number of jobs with a terminal "completed" status. */
  completedJobs: number;
  /** Completed / total jobs, 0..1. */
  completionRate: number;
  /** Mean job latency in MILLISECONDS over completed jobs (0 when unknown). */
  avgLatencyMs: number;
  /** Registry RateModel score, 0..5. */
  rating: number;
  /** Number of distinct providers that served jobs for this model. */
  providerCount: number;
}

/**
 * The normalized 0..1 signal factors that contributed to a composite score.
 * Exposed on each {@link ModelRank} so callers can explain a ranking.
 */
export interface ModelScoreSignals {
  /** Saturating volume factor `completedJobs / (completedJobs + 50)`. */
  volume: number;
  /** Completion rate clamped to 0..1. */
  completion: number;
  /** Rating normalized `rating / 5`, clamped 0..1. */
  rating: number;
  /** Provider redundancy `providerCount / 5`, clamped 0..1. */
  provider: number;
  /** Latency factor `60 / (60 + seconds)`; neutral 0.5 when unknown. */
  latency: number;
}

/** One ranked model row in a leaderboard. */
export interface ModelRank {
  /** 1-based rank position (1 = highest score). */
  rank: number;
  /** Model identifier this row describes. */
  modelId: string;
  /** Composite index score, 0..1 (4-decimal precision). */
  score: number;
  /** The normalized signal factors that produced {@link score}. */
  signals: ModelScoreSignals;
}

// ---------------------------------------------------------------------------
// Scoring weights — MUST stay in sync with clawd `computeIndexScore`
// (cmd/clawd/src/commands/model-index.ts).
// ---------------------------------------------------------------------------

const WEIGHT_VOLUME = 0.35;
const WEIGHT_COMPLETION = 0.2;
const WEIGHT_RATING = 0.2;
const WEIGHT_PROVIDER = 0.15;
const WEIGHT_LATENCY = 0.1;

/** Saturation constant for the volume curve `n / (n + K)`. */
const VOLUME_SATURATION = 50;
/** Provider count at which the redundancy factor saturates to 1.0. */
const PROVIDER_SATURATION = 5;
/** Max registry rating, used to normalize `rating / RATING_MAX`. */
const RATING_MAX = 5;
/** Latency half-life in seconds: `LATENCY_HALFLIFE_S` -> factor 0.5. */
const LATENCY_HALFLIFE_S = 60;
/** Neutral latency factor used when no latency signal exists. */
const NEUTRAL_LATENCY = 0.5;
/** Milliseconds per second (latency input is ms; scoring is seconds). */
const MS_PER_S = 1000;

// ---------------------------------------------------------------------------
// computeIndexScore
// ---------------------------------------------------------------------------

/**
 * Compute a model's composite index score in [0,1] from its fundamentals.
 *
 * A model scores higher with more completed volume, a higher completion rate, a
 * stronger registry rating, and broader provider participation. Latency folds
 * in as an inverse factor (faster is better), or a neutral 0.5 when no latency
 * signal exists. Each signal is normalized to 0..1, multiplied by its fixed
 * weight, and summed; weights match the clawd `model-index` command so the SDK
 * and CLI produce the same score for identical inputs. Returns the score
 * rounded to 4 decimals; non-finite inputs are treated as 0.
 */
export function computeIndexScore(f: Readonly<ModelFundamentals>): number {
  return round4(clamp01(blend(scoreSignals(f))));
}

/**
 * Compute the normalized 0..1 {@link ModelScoreSignals} for a fundamentals
 * record (the per-factor breakdown behind {@link computeIndexScore}).
 */
export function scoreSignals(
  f: Readonly<ModelFundamentals>,
): ModelScoreSignals {
  const completedJobs = nonNegative(f.completedJobs);
  const providerCount = nonNegative(f.providerCount);
  const avgLatencyMs = nonNegative(f.avgLatencyMs);

  // Volume: saturating curve so a few jobs already register but large counts
  // don't dominate. completedJobs / (completedJobs + 50) -> 0..1.
  const volume = completedJobs / (completedJobs + VOLUME_SATURATION);
  // Completion rate is already 0..1.
  const completion = clamp01(toFinite(f.completionRate));
  // Rating 0..5 normalized to 0..1.
  const rating = clamp01(toFinite(f.rating) / RATING_MAX);
  // Providers: more redundancy is healthier; saturate at ~5 providers.
  const provider = clamp01(providerCount / PROVIDER_SATURATION);
  // Latency: 0s -> 1.0, decaying; 60s -> ~0.5. Neutral 0.5 with no signal.
  const avgLatencySeconds = avgLatencyMs / MS_PER_S;
  const latency =
    avgLatencySeconds > 0
      ? LATENCY_HALFLIFE_S / (LATENCY_HALFLIFE_S + avgLatencySeconds)
      : NEUTRAL_LATENCY;

  return { volume, completion, rating, provider, latency };
}

// ---------------------------------------------------------------------------
// rankModels
// ---------------------------------------------------------------------------

/**
 * Rank a set of model fundamentals into a {@link ModelRank} leaderboard, sorted
 * DESCENDING by composite score. Ties are broken deterministically by `modelId`
 * (lexicographic ascending), making the sort stable and reproducible. Each row
 * carries its 1-based `rank`, score, and the normalized signal breakdown. The
 * input array is not mutated.
 */
export function rankModels(
  fundamentals: readonly ModelFundamentals[],
): ModelRank[] {
  const scored = fundamentals.map((f) => ({
    modelId: f.modelId,
    score: computeIndexScore(f),
    signals: scoreSignals(f),
  }));

  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0;
  });

  return sorted.map((row, i) => ({
    rank: i + 1,
    modelId: row.modelId,
    score: row.score,
    signals: row.signals,
  }));
}

// ---------------------------------------------------------------------------
// Pure internals
// ---------------------------------------------------------------------------

/** Weighted sum of the normalized signals using the fixed clawd weights. */
function blend(s: ModelScoreSignals): number {
  return (
    WEIGHT_VOLUME * s.volume +
    WEIGHT_COMPLETION * s.completion +
    WEIGHT_RATING * s.rating +
    WEIGHT_PROVIDER * s.provider +
    WEIGHT_LATENCY * s.latency
  );
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/** Finite value or 0 (defensive: callers feed untrusted on-chain-derived data). */
function toFinite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

/** Finite, non-negative value or 0. */
function nonNegative(x: number): number {
  const v = toFinite(x);
  return v > 0 ? v : 0;
}
