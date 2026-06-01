import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import { getModelMarkets, type ModelMarketRowData } from "../lib/model-markets.ts";
import { formatRating } from "../lib/model-index.ts";
import {
  loadWatchlist,
  saveWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isWatched,
} from "../lib/watchlist.ts";

/**
 * Watchlist page — pin model tokens and line them up side by side. Watched
 * model ids are persisted to localStorage (key `clawchain-model-watchlist`);
 * the underlying stats reuse the markets join {@link getModelMarkets} so the
 * numbers match the AI Stock Exchange exactly. Read-first; not financial advice.
 */

/** Format a CLAW-per-token price, or "N/A". */
function formatPriceClaw(price: number | null): string {
  if (price == null || !Number.isFinite(price)) return "N/A";
  return `${price.toFixed(6)}`;
}

/** One comparison row: extracts a numeric stat + a display string per model. */
interface CompareRow {
  label: string;
  /** numeric value used for best/worst highlighting; null = not comparable. */
  value: (r: ModelMarketRowData) => number | null;
  /** display string for the cell. */
  display: (r: ModelMarketRowData) => string;
  /** "high" = larger is better; "low" = smaller is better. */
  better: "high" | "low";
}

const COMPARE_ROWS: CompareRow[] = [
  {
    label: "Spot Price (CLAW)",
    value: (r) => r.priceClaw,
    display: (r) => formatPriceClaw(r.priceClaw),
    better: "high",
  },
  {
    label: "Volume (jobs)",
    value: (r) => r.completedJobs,
    display: (r) => String(r.completedJobs),
    better: "high",
  },
  {
    label: "Rating",
    value: (r) => (r.ratingCount > 0 ? r.rating : null),
    display: (r) => formatRating(r.rating, r.ratingCount),
    better: "high",
  },
  {
    label: "Providers",
    value: (r) => r.providerCount,
    display: (r) => `${r.onlineProviders}/${r.providerCount} online`,
    better: "high",
  },
];

/** Compute the best/worst column index for a compare row (null when no spread). */
function bestWorst(
  row: CompareRow,
  models: readonly ModelMarketRowData[],
): { best: number | null; worst: number | null } {
  const vals = models.map((m) => row.value(m));
  const known = vals
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v));
  if (known.length < 2) return { best: null, worst: null };

  let max = known[0];
  let min = known[0];
  for (const k of known) {
    if (k.v > max.v) max = k;
    if (k.v < min.v) min = k;
  }
  if (max.v === min.v) return { best: null, worst: null };

  const best = row.better === "high" ? max.i : min.i;
  const worst = row.better === "high" ? min.i : max.i;
  return { best, worst };
}

const GOOD = "rgba(34,197,94,0.18)";
const BAD = "rgba(239,68,68,0.14)";

export default function Watchlist() {
  useDocTitle("Watchlist");

  const [rows, setRows] = useState<ModelMarketRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<string[]>(loadWatchlist);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const markets = await getModelMarkets();
      setRows(markets);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load model markets");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onAdd = useCallback((id: string) => {
    setWatched((cur) => {
      const next = addToWatchlist(cur, id);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const onRemove = useCallback((id: string) => {
    setWatched((cur) => {
      const next = removeFromWatchlist(cur, id);
      saveWatchlist(next);
      return next;
    });
  }, []);

  // The pinned models, in watchlist order, joined to live market stats. Models
  // that are watched but no longer issued are dropped (best-effort).
  const watchedModels = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.modelId, r] as const));
    return watched
      .map((id) => byId.get(id))
      .filter((r): r is ModelMarketRowData => r != null);
  }, [rows, watched]);

  // Candidates to add: issued markets not already watched.
  const candidates = useMemo(
    () => rows.filter((r) => !isWatched(watched, r.modelId)),
    [rows, watched],
  );

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading watchlist...</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p className="page-subtitle">
            Pin AI model tokens and compare them side by side &mdash; spot price,
            inference volume, rating, and provider coverage. Your pinned list is
            saved in this browser. Read-first view; trade on the{" "}
            <Link to="/model-exchange">Model Exchange</Link>. Testnet only &mdash;
            not financial advice.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="card"
          data-testid="watchlist-error"
          style={{
            marginBottom: 24,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
        >
          Failed to load model markets: {error}
          <div style={{ marginTop: 8 }}>
            <button className="btn-outline" onClick={fetchData}>
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="stat-card">
          <h3>Pinned</h3>
          <div className="value accent">{watchedModels.length}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            models on your watchlist
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Available Markets</h3>
          <div className="value">{rows.length}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            issued model tokens
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Watched Volume</h3>
          <div className="value">
            {watchedModels.reduce((acc, r) => acc + r.completedJobs, 0)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            completed inference jobs
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Status</h3>
          <div>
            <span className="badge warning">Testnet</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>
            Not financial advice
          </div>
        </div>
      </div>

      {/* Compare view */}
      {watchedModels.length === 0 ? (
        <div className="empty" data-testid="watchlist-empty">
          Your watchlist is empty. Pin a model from the list below to compare it
          here, or browse all markets on the{" "}
          <Link to="/model-markets">AI Stock Exchange</Link>.
        </div>
      ) : (
        <div className="table-wrap" data-testid="watchlist-compare">
          <h2>Compare ({watchedModels.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Stat</th>
                {watchedModels.map((m) => (
                  <th key={m.modelId} data-testid="watchlist-compare-col">
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="mono">{m.symbol}</span>
                      <span style={{ fontSize: 11, color: "var(--text2)" }}>
                        {m.name}
                      </span>
                      <button
                        className="btn-outline"
                        data-testid="watchlist-remove-btn"
                        onClick={() => onRemove(m.modelId)}
                        style={{ alignSelf: "flex-start", padding: "2px 8px", fontSize: 11 }}
                      >
                        Unpin
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((cr) => {
                const { best, worst } = bestWorst(cr, watchedModels);
                return (
                  <tr key={cr.label} data-testid="watchlist-compare-row">
                    <td style={{ fontWeight: 600 }}>{cr.label}</td>
                    {watchedModels.map((m, idx) => {
                      const bg =
                        idx === best ? GOOD : idx === worst ? BAD : undefined;
                      const isBest = idx === best;
                      const isWorst = idx === worst;
                      return (
                        <td
                          key={m.modelId}
                          data-testid="watchlist-compare-cell"
                          data-best={isBest ? "true" : undefined}
                          data-worst={isWorst ? "true" : undefined}
                          style={{ background: bg }}
                        >
                          {cr.display(m)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / manage list */}
      {rows.length === 0 ? (
        <div className="empty" data-testid="watchlist-markets-empty" style={{ marginTop: 24 }}>
          No issued model tokens yet. Issue one with{" "}
          <code>clawd model-token issue</code> to list it, then pin it here.
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 24 }}>
          <h2>All Markets ({rows.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Spot Price</th>
                <th>Volume</th>
                <th>Rating</th>
                <th>Providers</th>
                <th>Watch</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pinned = isWatched(watched, r.modelId);
                return (
                  <tr key={r.modelId} data-testid="watchlist-market-row">
                    <td>
                      <Link to="/model-markets" className="mono">
                        {r.symbol}
                      </Link>
                    </td>
                    <td>{formatPriceClaw(r.priceClaw)}</td>
                    <td>{r.completedJobs}</td>
                    <td>{formatRating(r.rating, r.ratingCount)}</td>
                    <td>
                      {r.onlineProviders}/{r.providerCount}
                    </td>
                    <td>
                      {pinned ? (
                        <button
                          className="btn-outline"
                          data-testid="watchlist-toggle-btn"
                          onClick={() => onRemove(r.modelId)}
                        >
                          Unpin
                        </button>
                      ) : (
                        <button
                          className="btn"
                          data-testid="watchlist-toggle-btn"
                          onClick={() => onAdd(r.modelId)}
                          disabled={candidates.length === 0}
                        >
                          Pin
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h2>About the watchlist</h2>
        <p style={{ fontSize: 13, color: "var(--text2)" }}>
          Pinned models are stored as model ids in your browser&apos;s
          localStorage (<code>clawchain-model-watchlist</code>) &mdash; nothing is
          written on-chain. The compare table reuses the same join as the{" "}
          <Link to="/model-markets">AI Stock Exchange</Link>, so the spot price,
          volume, rating, and provider numbers line up. In each compare row the
          best value is highlighted green and the worst red.
        </p>
      </div>
    </>
  );
}
