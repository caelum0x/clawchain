import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import ExportMenu from "../components/ExportMenu.tsx";
import { formatIndexScore, formatRating } from "../lib/model-index.ts";
import {
  getLeaderboard,
  rankMedal,
  type LeaderboardRow,
} from "../lib/leaderboard.ts";

/**
 * Model-token Leaderboard: ranks every issued AI model token by its composite
 * fundamentals index (the same weighting as `clawd model-index`). Distinct from
 * the agents/validators Leaderboard at /leaderboard — this one lives at
 * /model-leaderboard alongside the model pages.
 */

/** Render the index score as a labelled progress bar (0..1 -> 0..100%). */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score * 100));
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {formatIndexScore(score)}
      </div>
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--border, rgba(148,163,184,0.25))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

export default function ModelLeaderboard() {
  useDocTitle("Model Leaderboard");

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const leaderboard = await getLeaderboard();
      setRows(leaderboard);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const topScore = rows.length > 0 ? rows[0].score : 0;
  const ratedCount = rows.filter((r) => r.ratingCount > 0).length;
  const avgScore =
    rows.length > 0
      ? rows.reduce((acc, r) => acc + r.score, 0) / rows.length
      : 0;

  const exportData = rows.map((r) => ({
    rank: r.rank,
    modelId: r.modelId,
    symbol: r.symbol,
    name: r.name,
    indexScore: r.score,
    completedJobs: r.completedJobs,
    rating: r.ratingCount > 0 ? r.rating : "",
    providerCount: r.providerCount,
  }));

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading model leaderboard...</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Model Leaderboard</h1>
          <p className="page-subtitle">
            Every issued AI model token ranked by its composite fundamentals index
            &mdash; a 0&ndash;100% score combining inference volume, completion rate,
            rating, provider coverage, and latency (the same weighting as{" "}
            <code>clawd model-index</code>). Testnet only &mdash; not financial advice.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="card"
          data-testid="model-leaderboard-error"
          style={{
            marginBottom: 24,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
        >
          Failed to load leaderboard: {error}
          <div style={{ marginTop: 8 }}>
            <button className="btn-outline" onClick={fetchData}>
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="stat-card">
          <h3>Ranked Models</h3>
          <div className="value accent">{rows.length}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            issued model tokens
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Top Score</h3>
          <div className="value">{formatIndexScore(topScore)}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {rows.length > 0 ? rows[0].symbol : "--"}
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Average Score</h3>
          <div className="value">{formatIndexScore(avgScore)}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            across all models
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Rated Models</h3>
          <div className="value">{ratedCount}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            carry a registry rating
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty" data-testid="model-leaderboard-empty">
          No issued model tokens yet. Issue one with{" "}
          <code>clawd model-token issue</code> to rank it here, then explore it on the{" "}
          <Link to="/model-exchange">Model Exchange</Link>.
        </div>
      ) : (
        <div className="table-wrap">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h2>Rankings ({rows.length})</h2>
            <ExportMenu data={exportData} filename="ai-model-leaderboard" />
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>Index Score</th>
                <th>Volume</th>
                <th>Rating</th>
                <th>Providers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.denom} data-testid="leaderboard-row">
                  <td>
                    <span style={{ fontWeight: 600 }}>{row.rank}</span>
                    {rankMedal(row.rank) ? (
                      <span
                        style={{ marginLeft: 6 }}
                        aria-label={`Rank ${row.rank}`}
                      >
                        {rankMedal(row.rank)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }} className="mono">
                      {row.symbol}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}
                    >
                      {row.name || `Model #${row.modelId}`} &middot; ID {row.modelId}
                    </div>
                  </td>
                  <td data-testid="leaderboard-score">
                    <ScoreBar score={row.score} />
                  </td>
                  <td>{row.completedJobs}</td>
                  <td>{formatRating(row.rating, row.ratingCount)}</td>
                  <td>{row.providerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h2>About the index</h2>
        <p style={{ fontSize: 13, color: "var(--text2)" }}>
          The composite fundamentals index weights inference volume (35%), completion
          rate (20%), registry rating (20%), provider coverage (15%), and latency
          (10%) into a single 0&ndash;100% score &mdash; identical to the{" "}
          <code>clawd model-index compute</code> weighting. Open a model on the{" "}
          <Link to="/model-exchange">Model Exchange</Link> or compare markets on the{" "}
          <Link to="/model-markets">AI Stock Exchange</Link>.
        </p>
      </div>
    </>
  );
}
