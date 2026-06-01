import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import ExportMenu from "../components/ExportMenu.tsx";
import ModelMarketRow from "../components/ModelMarketRow.tsx";
import {
  getModelMarkets,
  sortMarketRows,
  type MarketSortKey,
  type ModelMarketRowData,
  type SortDirection,
} from "../lib/model-markets.ts";

interface Column {
  key: MarketSortKey;
  label: string;
}

const COLUMNS: Column[] = [
  { key: "symbol", label: "Symbol" },
  { key: "priceClaw", label: "Spot Price" },
  { key: "completedJobs", label: "Volume" },
  { key: "rating", label: "Rating" },
  { key: "providerCount", label: "Providers" },
];

export default function ModelMarkets() {
  useDocTitle("AI Stock Exchange");

  const [rows, setRows] = useState<ModelMarketRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<MarketSortKey>("completedJobs");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

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

  const toggleSort = (key: MarketSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  };

  const sorted = sortMarketRows(rows, sortKey, sortDir);

  const pricedCount = rows.filter((r) => r.priceClaw != null).length;
  const totalVolume = rows.reduce((acc, r) => acc + r.completedJobs, 0);

  const exportData = sorted.map((r) => ({
    modelId: r.modelId,
    symbol: r.symbol,
    name: r.name,
    denom: r.denom,
    priceClaw: r.priceClaw ?? "",
    completedJobs: r.completedJobs,
    rating: r.ratingCount > 0 ? r.rating : "",
    providerCount: r.providerCount,
  }));

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading AI stock exchange...</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">AI Stock Exchange</h1>
          <p className="page-subtitle">
            Markets overview of every issued AI model token &mdash; curve spot price,
            inference volume, rating, provider coverage, and a premium/discount-vs-curve
            signal. Click a market to open its full exchange view. Testnet only &mdash; not
            financial advice.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="card"
          data-testid="model-markets-error"
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

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="stat-card">
          <h3>Listed Markets</h3>
          <div className="value accent">{rows.length}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            issued model tokens
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>With DEX Price</h3>
          <div className="value">{pricedCount}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            TOKEN/CLAW pools found
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Total Volume</h3>
          <div className="value">{totalVolume}</div>
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

      {rows.length === 0 ? (
        <div className="empty" data-testid="model-markets-empty">
          No issued model tokens yet. Issue one with{" "}
          <code>clawd model-token issue</code> to list it on the exchange, then explore it
          on the <Link to="/model-exchange">Model Exchange</Link>.
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
            <h2>Markets ({rows.length})</h2>
            <ExportMenu data={exportData} filename="ai-model-markets" />
          </div>
          <table>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    data-testid={`market-th-${col.key}`}
                    aria-sort={
                      sortKey === col.key
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
                <th>vs Curve</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <ModelMarketRow key={row.denom} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h2>About these markets</h2>
        <p style={{ fontSize: 13, color: "var(--text2)" }}>
          Spot price is the DEX TOKEN/CLAW pool price when a pool exists. Volume is the
          count of completed on-chain inference jobs for the model. The
          <strong> vs Curve</strong> badge compares the DEX price against the ModelVault
          bonding-curve spot price for models with a known vault. Open a market to view
          full fundamentals and the Stake &amp; Earn dividend pool on the{" "}
          <Link to="/model-exchange">Model Exchange</Link>.
        </p>
      </div>
    </>
  );
}
