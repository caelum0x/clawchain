/**
 * Pure localStorage helpers for the model-token Watchlist page.
 *
 * The watchlist is a set of model ids (the stable key that joins the markets
 * view {@link getModelMarkets} with per-model fundamentals). All mutators are
 * immutable — they return a NEW string array and never touch the argument.
 * Reads/writes are best-effort (try/catch) so private-mode / quota errors are
 * non-fatal, mirroring the vault-list pattern in ModelPortfolio.tsx.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */

/** localStorage key for the persisted watched-model-id list. */
export const WATCHLIST_STORAGE_KEY = "clawchain-model-watchlist";

/**
 * Normalize + dedupe a raw id list: trims, drops empties, removes duplicates
 * while preserving first-seen order. Returns a NEW array.
 */
function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Load the persisted watchlist (best-effort). Returns a NEW normalized array;
 * an empty array when storage is unavailable or the value is malformed.
 */
export function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeIds(parsed.map((x) => String(x)));
  } catch {
    return [];
  }
}

/** Persist a watchlist (best-effort). Stores the normalized form as JSON. */
export function saveWatchlist(ids: readonly string[]): void {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalizeIds(ids)));
  } catch {
    // Storage unavailable (private mode / quota) — non-fatal.
  }
}

/**
 * Return a NEW list with `id` appended (deduped, order-preserving). Does not
 * mutate `current`. A blank id is a no-op (returns a normalized copy).
 */
export function addToWatchlist(current: readonly string[], id: string): string[] {
  return normalizeIds([...current, id]);
}

/** Return a NEW list with `id` removed. Does not mutate `current`. */
export function removeFromWatchlist(current: readonly string[], id: string): string[] {
  const target = String(id ?? "").trim();
  return normalizeIds(current.filter((x) => String(x).trim() !== target));
}

/** Whether `id` is present in the watchlist (after trim). */
export function isWatched(current: readonly string[], id: string): boolean {
  const target = String(id ?? "").trim();
  return current.some((x) => String(x).trim() === target);
}

/**
 * Toggle `id` in the watchlist: removes it when present, adds it otherwise.
 * Returns a NEW list. Convenience over branching at the call site.
 */
export function toggleWatchlist(current: readonly string[], id: string): string[] {
  return isWatched(current, id)
    ? removeFromWatchlist(current, id)
    : addToWatchlist(current, id);
}
