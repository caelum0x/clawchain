import { chainConfig } from "./config.ts";
import { queryWasmContract } from "./chain.ts";
import {
  getModel,
  getInferenceJobs,
  getInferenceProviders,
  type InferenceProvider,
} from "./chain.ts";

/**
 * Per-model "fundamentals" surface for the AI Model Exchange page — a
 * stock-style fact sheet that joins on-chain modelregistry / inference activity
 * with the ModelVault bonding-curve spot price.
 *
 * Reads only. Smart queries against the ModelVault contract use snake_case JSON
 * via {@link queryWasmContract}, mirroring the helpers in model-vault.ts. The
 * `quote` query keys MUST stay exact snake_case (`{quote:{side,amount}}`).
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** {"quote":{"side":...,"amount":...}} -> QuoteResponse from the vault. */
export interface VaultQuote {
  amount_out: string;
  denom_in: string;
  denom_out: string;
}

/** {"pool":{}} -> curve reserves (reserve_denom) / inventory (model_denom). */
export interface VaultPoolReserves {
  reserve: string;
  inventory: string;
}

/** Shaped fundamentals for one model token. All numbers are display-ready. */
export interface ModelFundamentals {
  modelId: string;
  /** completed inference jobs (proxy for traded "volume"). */
  completedJobs: number;
  /** total inference jobs seen for the model. */
  totalJobs: number;
  /** average provider latency in milliseconds (0 when unknown). */
  avgLatencyMs: number;
  /** model rating on a 0-5 scale (0 when unrated). */
  rating: number;
  /** number of ratings backing the score. */
  ratingCount: number;
  /** count of inference providers serving the model. */
  providerCount: number;
  /** count of providers currently online. */
  onlineProviders: number;
  /**
   * bonding-curve spot price in reserve-denom (CLAW) per 1 display unit of the
   * model token, or null when no vault / no liquidity.
   */
  spotPriceClaw: number | null;
}

// ---------------------------------------------------------------------------
// Vault queries (snake_case smart queries)
// ---------------------------------------------------------------------------

/** Query the curve reserves ({"pool":{}}). */
export async function getVaultPoolReserves(
  contract: string,
): Promise<VaultPoolReserves> {
  const data = (await queryWasmContract(contract, { pool: {} })) as
    | Partial<VaultPoolReserves>
    | undefined;
  return {
    reserve: String(data?.reserve ?? "0"),
    inventory: String(data?.inventory ?? "0"),
  };
}

/**
 * Query a hypothetical trade ({"quote":{"side":...,"amount":...}}). `side` is
 * the contract's TradeSide variant ("buy" | "sell") in snake_case.
 */
export async function getVaultQuote(
  contract: string,
  side: "buy" | "sell",
  amount: string,
): Promise<VaultQuote> {
  const data = (await queryWasmContract(contract, {
    quote: { side, amount },
  })) as Partial<VaultQuote> | undefined;
  return {
    amount_out: String(data?.amount_out ?? "0"),
    denom_in: String(data?.denom_in ?? ""),
    denom_out: String(data?.denom_out ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Spot price (bonding curve)
// ---------------------------------------------------------------------------

/**
 * Derive the bonding-curve spot price: reserve-denom (CLAW) per 1 model token.
 *
 * The constant-product curve's marginal price is `reserve / inventory`, both
 * read from the {"pool":{}} query. Returns null when the vault is unfunded
 * (zero inventory) so callers can show "N/A" rather than a divide-by-zero.
 *
 * Decimals cancel (both denoms use {@link chainConfig.coinDecimals}), so the
 * raw base-unit ratio is already the display-unit spot price.
 */
export async function getVaultSpotPrice(
  contract: string,
): Promise<number | null> {
  try {
    const { reserve, inventory } = await getVaultPoolReserves(contract);
    const reserveN = Number(reserve);
    const inventoryN = Number(inventory);
    if (!Number.isFinite(reserveN) || !Number.isFinite(inventoryN)) return null;
    if (inventoryN <= 0 || reserveN <= 0) return null;
    return reserveN / inventoryN;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inference activity (modelregistry)
// ---------------------------------------------------------------------------

interface InferenceActivity {
  completedJobs: number;
  totalJobs: number;
  providerCount: number;
  onlineProviders: number;
  avgLatencyMs: number;
}

/** Average a set of providers' reported latencies, ignoring zero/unknown. */
function averageLatency(providers: InferenceProvider[]): number {
  const known = providers
    .map((p) => p.avgLatencyMs)
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  if (known.length === 0) return 0;
  const sum = known.reduce((acc, ms) => acc + ms, 0);
  return Math.round(sum / known.length);
}

/** Aggregate inference jobs + providers for a single model id. */
async function getInferenceActivity(modelId: number): Promise<InferenceActivity> {
  const [jobs, providers] = await Promise.all([
    getInferenceJobs(modelId),
    getInferenceProviders(modelId),
  ]);
  const completedJobs = jobs.filter(
    (j) => j.status.toLowerCase() === "completed" || j.status.toLowerCase() === "done",
  ).length;
  const onlineProviders = providers.filter((p) => p.isOnline).length;
  return {
    completedJobs,
    totalJobs: jobs.length,
    providerCount: providers.length,
    onlineProviders,
    avgLatencyMs: averageLatency(providers),
  };
}

// ---------------------------------------------------------------------------
// Fundamentals join
// ---------------------------------------------------------------------------

/**
 * Fetch + shape fundamentals for one model. `vaultAddress` is optional — when
 * present, the bonding-curve spot price is read from it; otherwise spotPriceClaw
 * is null. Always resolves (best-effort) so the panel can render partial data.
 */
export async function getModelFundamentals(
  modelId: string,
  vaultAddress?: string,
): Promise<ModelFundamentals> {
  const idNum = Number(modelId);
  const safeId = Number.isFinite(idNum) ? idNum : 0;

  const [record, activity, spotPriceClaw] = await Promise.all([
    getModel(safeId),
    getInferenceActivity(safeId),
    vaultAddress?.trim()
      ? getVaultSpotPrice(vaultAddress.trim())
      : Promise.resolve(null),
  ]);

  return {
    modelId,
    completedJobs: activity.completedJobs,
    totalJobs: activity.totalJobs,
    avgLatencyMs: activity.avgLatencyMs,
    rating: ratingToStars(record?.rating ?? 0, record?.ratingCount ?? 0),
    ratingCount: record?.ratingCount ?? 0,
    providerCount: activity.providerCount,
    onlineProviders: activity.onlineProviders,
    spotPriceClaw,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a modelregistry rating into a 0-5 star value. Ratings are stored as
 * a running average; unrated models (no ratingCount) clamp to 0. Values already
 * within 0-5 pass through; larger scales (e.g. basis points) are folded down.
 */
function ratingToStars(rating: number, ratingCount: number): number {
  if (!Number.isFinite(rating) || ratingCount <= 0) return 0;
  if (rating <= 5) return rating;
  if (rating <= 100) return rating / 20; // 0-100 scale
  return rating / 2000; // basis points (0-10000)
}

/** Format the bonding-curve spot price as a CLAW string, or "N/A". */
export function formatSpotPrice(spotPriceClaw: number | null): string {
  if (spotPriceClaw == null || !Number.isFinite(spotPriceClaw)) return "N/A";
  return `${spotPriceClaw.toFixed(6)} ${chainConfig.coinDenom}`;
}

/** Format an average latency (ms) compactly, e.g. "1.2s" or "850ms". */
export function formatLatency(avgLatencyMs: number): string {
  if (!Number.isFinite(avgLatencyMs) || avgLatencyMs <= 0) return "--";
  if (avgLatencyMs >= 1000) return `${(avgLatencyMs / 1000).toFixed(1)}s`;
  return `${Math.round(avgLatencyMs)}ms`;
}

/** Format a 0-5 rating as one decimal plus a star, or "Unrated". */
export function formatRating(rating: number, ratingCount: number): string {
  if (ratingCount <= 0 || rating <= 0) return "Unrated";
  return `${rating.toFixed(1)} ★`;
}

// ---------------------------------------------------------------------------
// Composite fundamentals index (0..1)
// ---------------------------------------------------------------------------

/**
 * Composite per-model fundamentals index in [0,1]. This is the web counterpart
 * of `computeIndexScore` in cmd/clawd/src/commands/model-index.ts and MUST keep
 * the SAME weights and factor curves so a model scores identically whether the
 * score is read off the CLI or rendered here:
 *
 *   volume      0.35  completedJobs / (completedJobs + 50)   (saturating)
 *   completion  0.20  completionRate (0..1)
 *   rating      0.20  ratingScore / 5
 *   providers   0.15  providerCount / 5                      (saturate at ~5)
 *   latency     0.10  60 / (60 + avgLatencySeconds), neutral 0.5 when unknown
 *
 * Inputs are the on-chain fundamentals the clawd command derives from
 * x/modelregistry; the formula is duplicated (not imported) only because clawd
 * is a separate Node CLI package — the weights are documented in both places so
 * they stay in lockstep.
 */
export function computeIndexScore(args: {
  completedJobs: number;
  completionRate: number;
  avgLatencySeconds: number;
  ratingScore: number;
  providerCount: number;
}): number {
  const volumeFactor = args.completedJobs / (args.completedJobs + 50);
  const completionFactor = clampUnit(args.completionRate);
  const ratingFactor = clampUnit(args.ratingScore / 5);
  const providerFactor = clampUnit(args.providerCount / 5);
  const latencyFactor =
    args.avgLatencySeconds > 0 ? 60 / (60 + args.avgLatencySeconds) : 0.5;

  const score =
    0.35 * volumeFactor +
    0.2 * completionFactor +
    0.2 * ratingFactor +
    0.15 * providerFactor +
    0.1 * latencyFactor;

  return round4(clampUnit(score));
}

/**
 * Compute the composite index score directly from a shaped {@link ModelFundamentals}.
 * Bridges the web fundamentals surface (jobs counts, latency in ms, 0-5 rating)
 * onto {@link computeIndexScore}'s on-chain input shape: completion rate is
 * derived from completed/total jobs and latency is converted ms -> seconds.
 */
export function indexScoreFromFundamentals(f: ModelFundamentals): number {
  const completionRate =
    f.totalJobs > 0 ? f.completedJobs / f.totalJobs : 0;
  return computeIndexScore({
    completedJobs: f.completedJobs,
    completionRate,
    avgLatencySeconds: f.avgLatencyMs > 0 ? f.avgLatencyMs / 1000 : 0,
    ratingScore: f.rating,
    providerCount: f.providerCount,
  });
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/** Format a 0..1 index score as a percent string, e.g. "73.4%". */
export function formatIndexScore(score: number): string {
  if (!Number.isFinite(score) || score < 0) return "0.0%";
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Compare a token's external (DEX) price against its bonding-curve spot price.
 * Returns a simple indicator the panel renders as a premium/discount signal.
 */
export type PriceVsIndex = "premium" | "discount" | "inline" | "n/a";

export function priceVsIndex(
  externalPriceClaw: number | null,
  spotPriceClaw: number | null,
): PriceVsIndex {
  if (
    externalPriceClaw == null ||
    spotPriceClaw == null ||
    !Number.isFinite(externalPriceClaw) ||
    !Number.isFinite(spotPriceClaw) ||
    spotPriceClaw <= 0
  ) {
    return "n/a";
  }
  const delta = (externalPriceClaw - spotPriceClaw) / spotPriceClaw;
  if (delta > 0.01) return "premium";
  if (delta < -0.01) return "discount";
  return "inline";
}
