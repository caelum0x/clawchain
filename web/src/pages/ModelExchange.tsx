import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import ExportMenu from "../components/ExportMenu.tsx";
import { shortAddr } from "../lib/chain.ts";
import {
  getModelTokens,
  formatTokenSupply,
  type ModelToken,
} from "../lib/model-tokens.ts";

export default function ModelExchange() {
  useDocTitle("AI Model Exchange");

  const [tokens, setTokens] = useState<ModelToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyMinted, setOnlyMinted] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getModelTokens({ withPrice: true });
      setTokens(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load AI model tokens");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = tokens.filter((t) => {
    if (onlyMinted && !t.hasToken) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.denom.toLowerCase().includes(q) ||
        t.issuer.toLowerCase().includes(q) ||
        t.modelId.includes(q)
      );
    }
    return true;
  });

  const mintedCount = tokens.filter((t) => t.hasToken).length;
  const pricedCount = tokens.filter((t) => t.priceClaw != null).length;

  const exportData = filtered.map((t) => ({
    modelId: t.modelId,
    name: t.name,
    symbol: t.symbol,
    denom: t.denom,
    issuer: t.issuer,
    supply: t.supply,
    minted: t.hasToken,
    priceClaw: t.priceClaw ?? "",
    framework: t.framework,
  }));

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading AI model tokens...</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">AI Model Exchange</h1>
          <p className="page-subtitle">
            Tokenized AI models &mdash; each registered model can be issued as a tradeable,
            redeemable tokenfactory denom. Read-first view; issue &amp; redeem are clawd commands.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="card"
          data-testid="model-exchange-error"
          style={{
            marginBottom: 24,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
        >
          Failed to load model tokens: {error}
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
          <h3>Registered Models</h3>
          <div className="value accent">{tokens.length}</div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Minted Tokens</h3>
          <div className="value">{mintedCount}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            tokenfactory denoms with supply
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
          <h3>Status</h3>
          <div>
            <span className="badge warning">Testnet</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>
            Not financial advice
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by model, symbol, denom, issuer..."
          aria-label="Search model tokens"
          data-testid="model-token-search"
          style={{ padding: "6px 10px", flex: 1, minWidth: 220 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={onlyMinted}
            onChange={(e) => setOnlyMinted(e.target.checked)}
            data-testid="filter-minted"
          />
          Minted only
        </label>
        {filtered.length > 0 && (
          <ExportMenu data={exportData} filename="ai-model-tokens" />
        )}
      </div>

      {/* Table / empty state */}
      {tokens.length === 0 ? (
        <div className="empty" data-testid="model-exchange-empty">
          No AI models registered yet. Register a model and issue its token with{" "}
          <code>clawd model-token issue</code> to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">No model tokens match your search or filter.</div>
      ) : (
        <div className="table-wrap">
          <h2>Model Tokens ({filtered.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Symbol</th>
                <th>Denom</th>
                <th>Issuer</th>
                <th>Supply</th>
                <th>Price (CLAW)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.denom} data-testid="model-token-row">
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name || `Model #${t.modelId}`}</div>
                    <div style={{ fontSize: 12, color: "var(--text2)" }}>
                      {t.description?.slice(0, 60)}
                      {(t.description?.length ?? 0) > 60 ? "..." : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                      ID {t.modelId} &middot; {t.framework || "--"}
                    </div>
                  </td>
                  <td className="mono">{t.symbol}</td>
                  <td className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
                    {t.denom}
                  </td>
                  <td>
                    <Link to={`/explorer/account/${t.issuer}`} className="mono">
                      {shortAddr(t.issuer)}
                    </Link>
                  </td>
                  <td>
                    {t.hasToken ? (
                      <span style={{ fontWeight: 600 }}>{formatTokenSupply(t.supply)}</span>
                    ) : (
                      <span style={{ color: "var(--text2)" }}>Not minted</span>
                    )}
                  </td>
                  <td>
                    {t.priceClaw != null ? (
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                        {t.priceClaw.toFixed(6)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text2)" }}>N/A</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${t.hasToken ? "success" : "warning"}`}>
                      {t.hasToken ? "Issued" : "Registered"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* How it works / actions (informational) */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Issue &amp; Redeem (CLI)</h2>
        <p style={{ marginBottom: 8 }}>
          AI model tokens are issued and redeemed with the <code>clawd</code> CLI. Issuing
          registers the model in <Link to="/models">modelregistry</Link>, creates a
          tokenfactory denom, and mints the initial supply.
        </p>
        <div
          style={{
            background: "var(--bg2)",
            borderRadius: 6,
            padding: 12,
            fontFamily: "monospace",
            fontSize: 13,
          }}
        >
          <div style={{ color: "var(--text2)", marginBottom: 4 }}># Issue a model token</div>
          <div>clawd model-token issue --model opus-4-8 --supply 1000000</div>
          <div style={{ color: "var(--text2)", marginTop: 8, marginBottom: 4 }}>
            # Redeem tokens for real inference
          </div>
          <div>
            clawd model-token redeem --model-id 1 --amount 100 --input &quot;Hello&quot;
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 12 }}>
          Trade issued tokens on the <Link to="/swap">DEX</Link>, run inference on the{" "}
          <Link to="/inference">AI Inference</Link> page, or browse all models in the{" "}
          <Link to="/models">model registry</Link>. Testnet only &mdash; not financial advice.
        </p>
      </div>
    </>
  );
}
