import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import { chainConfig } from "../lib/config.ts";
import {
  getVaultPoolReserves,
  getVaultSpotPrice,
  getVaultQuote,
  formatSpotPrice,
  type VaultPoolReserves,
  type VaultQuote,
} from "../lib/model-index.ts";
import { toBaseUnits, formatBaseUnits } from "../lib/model-vault.ts";
import {
  planBuy,
  planSell,
  planToTargetPrice,
  formatSimPrice,
  formatPriceImpact,
  type TradePlan,
} from "../lib/trade-sim.ts";

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

type SimMode = "buy" | "sell" | "target";

interface LoadedVault {
  pool: VaultPoolReserves;
  spotPriceClaw: number | null;
}

export default function TradeSimulator() {
  useDocTitle("Trade Simulator");

  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get("vault") ?? "");
  const [vault, setVault] = useState<string | null>(
    (searchParams.get("vault") ?? "").trim() || null,
  );
  const [loaded, setLoaded] = useState<LoadedVault | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<SimMode>("buy");
  const [amount, setAmount] = useState("");

  // Exact on-chain quote (buy/sell modes only) — fetched on demand.
  const [quote, setQuote] = useState<VaultQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const fetchData = useCallback(async (contract: string) => {
    setLoading(true);
    setError(null);
    try {
      const [pool, spotPriceClaw] = await Promise.all([
        getVaultPoolReserves(contract),
        getVaultSpotPrice(contract),
      ]);
      setLoaded({ pool, spotPriceClaw });
    } catch (e: unknown) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : "Failed to load vault state");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (vault) fetchData(vault);
    else setLoaded(null);
  }, [vault, fetchData]);

  // Reset transient quote whenever the inputs that produced it change.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
  }, [amount, mode, vault]);

  const onLoad = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Enter a ModelVault contract address");
      return;
    }
    setVault(trimmed);
    setSearchParams(trimmed ? { vault: trimmed } : {});
  };

  // Live client-side estimate (pure constant-product math).
  const { plan, planError } = useMemo((): {
    plan: TradePlan | null;
    planError: string | null;
  } => {
    if (!loaded) return { plan: null, planError: null };
    const trimmed = amount.trim();
    if (trimmed === "") return { plan: null, planError: null };
    try {
      if (mode === "target") {
        const target = Number(trimmed);
        return { plan: planToTargetPrice(loaded.pool, target), planError: null };
      }
      const base = toBaseUnits(trimmed);
      const p = mode === "buy" ? planBuy(loaded.pool, base) : planSell(loaded.pool, base);
      return { plan: p, planError: null };
    } catch (e: unknown) {
      return { plan: null, planError: e instanceof Error ? e.message : "Invalid input" };
    }
  }, [loaded, amount, mode]);

  // Confirm the estimate against the contract's exact {"quote":{}}.
  const onCheckOnChain = useCallback(async () => {
    if (!vault || !plan || plan.amountIn === "0") return;
    setQuoteError(null);
    setQuoteLoading(true);
    try {
      const q = await getVaultQuote(vault, plan.side, plan.amountIn);
      setQuote(q);
    } catch (e: unknown) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : "Failed to fetch on-chain quote");
    }
    setQuoteLoading(false);
  }, [vault, plan]);

  const inLabel = mode === "sell" ? "model token" : RESERVE_LABEL;
  const outLabel = plan?.side === "sell" ? RESERVE_LABEL : "model token";

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Trade Simulator</h1>
          <p className="page-subtitle">
            Model a buy, sell, or target-price move against any{" "}
            <strong>ModelVault</strong> constant-product curve. The estimate is computed
            client-side and <strong>ignores the vault fee</strong>; the on-chain quote
            beside it is exact. Paste a vault address or open with{" "}
            <code>?vault=claw1...</code>. Testnet only &mdash; not financial advice.
          </p>
        </div>
      </div>

      {/* Address input */}
      <div
        className="card"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onLoad();
          }}
          placeholder="ModelVault contract address (claw1...)"
          aria-label="ModelVault contract address"
          data-testid="trade-sim-input"
          className="mono"
          style={{ padding: "6px 10px", flex: 1, minWidth: 280 }}
        />
        <button className="btn" data-testid="trade-sim-load" onClick={onLoad}>
          Load
        </button>
      </div>

      {error && (
        <div
          className="card"
          data-testid="trade-sim-error"
          style={{ marginBottom: 24, background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
        >
          Failed to load vault: {error}
          {vault && (
            <div style={{ marginTop: 8 }}>
              <button className="btn-outline" onClick={() => fetchData(vault)}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {!vault ? (
        <div className="empty" data-testid="trade-sim-empty">
          Enter a ModelVault contract address to simulate trades. Find vault addresses on
          the <Link to="/model-exchange">Model Exchange</Link>, inspect one on the{" "}
          <Link to="/vault-inspector">Vault Inspector</Link>, or list markets on the{" "}
          <Link to="/model-markets">AI Stock Exchange</Link>.
        </div>
      ) : loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading vault state...</p>
        </div>
      ) : loaded ? (
        <>
          {/* Current curve state */}
          <div className="card" data-testid="trade-sim-pool" style={{ marginBottom: 24 }}>
            <h2>Current Curve</h2>
            <div className="grid-4" style={{ marginTop: 12 }}>
              <div className="card" data-testid="stat-card">
                <h3>Reserve</h3>
                <div className="value">{formatBaseUnits(loaded.pool.reserve)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  {RESERVE_LABEL}
                </div>
              </div>
              <div className="card" data-testid="stat-card">
                <h3>Inventory</h3>
                <div className="value">{formatBaseUnits(loaded.pool.inventory)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  model token
                </div>
              </div>
              <div className="card accent" data-testid="stat-card">
                <h3>Spot Price</h3>
                <div className="value accent">{formatSpotPrice(loaded.spotPriceClaw)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  {RESERVE_LABEL} per token
                </div>
              </div>
            </div>
          </div>

          {/* Simulator */}
          <div className="card" data-testid="trade-sim-panel">
            <h2>Simulate</h2>

            {/* Mode toggle */}
            <div
              role="tablist"
              aria-label="Simulation mode"
              style={{ display: "flex", gap: 8, margin: "12px 0 16px", flexWrap: "wrap" }}
            >
              {(
                [
                  ["buy", `Buy amount (${RESERVE_LABEL})`],
                  ["sell", "Sell amount (model)"],
                  ["target", "Target price"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? "btn" : "btn-outline"}
                  data-testid={`trade-sim-mode-${m}`}
                  onClick={() => setMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={
                  mode === "target"
                    ? `Target spot price (${RESERVE_LABEL} per token)`
                    : `Amount (${inLabel})`
                }
                aria-label={mode === "target" ? "Target spot price" : "Trade amount"}
                data-testid="trade-sim-amount"
                inputMode="decimal"
                style={{ padding: "6px 10px", minWidth: 240 }}
              />
              <button
                className="btn-outline"
                data-testid="trade-sim-check"
                onClick={onCheckOnChain}
                disabled={!plan || plan.amountIn === "0" || quoteLoading}
                title="Confirm the estimate against the contract's exact quote"
              >
                {quoteLoading ? "Checking..." : "Check on-chain quote"}
              </button>
            </div>

            {planError && (
              <p data-testid="trade-sim-plan-error" style={{ color: "#ef4444" }}>
                {planError}
              </p>
            )}

            {plan && !planError && (
              <>
                {mode === "target" && (
                  <p
                    data-testid="trade-sim-target-action"
                    style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}
                  >
                    To reach that price you would{" "}
                    <strong>{plan.side === "buy" ? "BUY" : "SELL"}</strong> the curve with{" "}
                    {formatBaseUnits(plan.amountIn)}{" "}
                    {plan.side === "buy" ? RESERVE_LABEL : "model token"}.
                  </p>
                )}

                <div className="grid-4">
                  <div className="card" data-testid="trade-sim-out">
                    <h3>Est. {outLabel} out</h3>
                    <div className="value accent">{formatBaseUnits(plan.amountOut)}</div>
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
                      estimate, fee excluded
                    </div>
                  </div>
                  <div className="card" data-testid="trade-sim-new-spot">
                    <h3>New Spot</h3>
                    <div className="value">{formatSimPrice(plan.spotAfter)}</div>
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
                      was {formatSimPrice(plan.spotBefore)}
                    </div>
                  </div>
                  <div className="card" data-testid="trade-sim-impact">
                    <h3>Price Impact</h3>
                    <div className="value">{formatPriceImpact(plan.priceImpact)}</div>
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
                      spot move
                    </div>
                  </div>
                  <div className="card" data-testid="trade-sim-onchain">
                    <h3>On-chain out</h3>
                    {quoteError ? (
                      <div style={{ color: "#ef4444", fontSize: 12 }}>{quoteError}</div>
                    ) : quote ? (
                      <>
                        <div className="value accent">
                          {formatBaseUnits(quote.amount_out)}
                        </div>
                        <div
                          className="mono"
                          style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}
                        >
                          {quote.denom_out || outLabel} (exact)
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text2)" }}>
                        Press &ldquo;Check on-chain quote&rdquo; for the exact figure.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
