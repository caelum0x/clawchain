import { getModelTokens, type ModelToken } from "./model-tokens.ts";
import {
  getModelFundamentals,
  indexScoreFromFundamentals,
} from "./model-index.ts";

/**
 * Data layer for the model-token Leaderboard page: enumerate every issued
 * (minted) model token, fetch its on-chain fundamentals best-effort, compute the
 * composite fundamentals index ({@link indexScoreFromFundamentals} — the SAME
 * weighting as `clawd model-index`), and rank by score descending.
 *
 * Reuses round-1..6 helpers — {@link getModelTokens} to enumerate and
 * {@link getModelFundamentals} to score — so no new query plumbing is added.
 * A single model's fetch failure resolves to a zero-score row rather than
 * failing the whole list.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */

/** One ranked row on the leaderboard. All fields are display-ready. */
export interface LeaderboardRow {
  /** 1-based rank after sorting by score desc. */
  rank: number;
  modelId: string;
  symbol: string;
  name: string;
  denom: string;
  /** composite fundamentals index, 0..1. */
  score: number;
  completedJobs: number;
  /** model rating on a 0-5 scale (0 when unrated). */
  rating: number;
  ratingCount: number;
  providerCount: number;
}

/**
 * Build the ranked leaderboard. Only issued (minted) tokens are scored, since an
 * unminted registration has no tradeable token. Rows are sorted by composite
 * index score descending and assigned 1-based ranks. Ties keep enumeration order
 * (stable sort), then rank by score.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const tokens = await getModelTokens();
  const minted = tokens.filter((t) => t.hasToken);
  const scored = await Promise.all(minted.map(buildScoredRow));
  return rankRows(scored);
}

/** Row shape before a rank is assigned. */
type ScoredRow = Omit<LeaderboardRow, "rank">;

async function buildScoredRow(token: ModelToken): Promise<ScoredRow> {
  const fundamentals = await safeFundamentals(token.modelId);
  const score = fundamentals ? indexScoreFromFundamentals(fundamentals) : 0;
  return {
    modelId: token.modelId,
    symbol: token.symbol,
    name: token.name,
    denom: token.denom,
    score,
    completedJobs: fundamentals?.completedJobs ?? 0,
    rating: fundamentals?.rating ?? 0,
    ratingCount: fundamentals?.ratingCount ?? 0,
    providerCount: fundamentals?.providerCount ?? 0,
  };
}

/**
 * Per-model fundamentals without a vault address (the curve price is not part of
 * the composite index). Resolves null on failure so one bad model never breaks
 * the leaderboard.
 */
async function safeFundamentals(modelId: string) {
  try {
    return await getModelFundamentals(modelId);
  } catch {
    return null;
  }
}

/**
 * Pure, immutable rank assignment: sort by score descending and stamp a 1-based
 * rank. Equal scores preserve the input order (Array.prototype.sort is stable).
 */
export function rankRows(rows: readonly ScoredRow[]): LeaderboardRow[] {
  return [...rows]
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Medal glyph for the top-3 ranks, or empty string for the rest. */
export function rankMedal(rank: number): string {
  if (rank === 1) return "🥇"; // gold
  if (rank === 2) return "🥈"; // silver
  if (rank === 3) return "🥉"; // bronze
  return "";
}
