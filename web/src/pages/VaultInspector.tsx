import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import StakeEarnPanel from "../components/StakeEarnPanel.tsx";
import { shortAddr } from "../lib/chain.ts";
import { getConnectedAddress } from "../lib/walletconnect.ts";
import { chainConfig } from "../lib/config.ts";
import {
  getVaultConfig,
  getVaultPoolInfo,
  formatBaseUnits,
  formatRewardIndex,
  type VaultConfig,
  type VaultPoolInfo,
} from "../lib/model-vault.ts";
import {
  getVaultPoolReserves,
  getVaultSpotPrice,
  formatSpotPrice,
  type VaultPoolReserves,
} from "../lib/model-index.ts";
import QuoteCalculator from "../components/VaultQuoteCalculator.tsx";

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

interface VaultState {
  config: VaultConfig;
  pool: VaultPoolReserves;
  poolInfo: VaultPoolInfo;
  spotPriceClaw: number | null;
}

export default function VaultInspector() {
  useDocTitle("Vault Inspector");

  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get("vault") ?? "");
  const [vault, setVault] = useState<string | null>(
    (searchParams.get("vault") ?? "").trim() || null,
  );
  const [state, setState] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedAddress = getConnectedAddress();

  const fetchData = useCallback(async (contract: string) => {
    setLoading(true);
    setError(null);
    try {
      const [config, pool, poolInfo, spotPriceClaw] = await Promise.all([
        getVaultConfig(contract),
        getVaultPoolReserves(contract),
        getVaultPoolInfo(contract),
        getVaultSpotPrice(contract),
      ]);
      setState({ config, pool, poolInfo, spotPriceClaw });
    } catch (e: unknown) {
      setState(null);
      setError(e instanceof Error ? e.message : "Failed to load vault state");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (vault) fetchData(vault);
    else setState(null);
  }, [vault, fetchData]);

  const onLoad = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Enter a ModelVault contract address");
      return;
    }
    setVault(trimmed);
    setSearchParams(trimmed ? { vault: trimmed } : {});
  };

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Vault Inspector</h1>
          <p className="page-subtitle">
            Deep read-only view of any <strong>ModelVault</strong> contract &mdash; config,
            bonding-curve reserves &amp; spot price, dividend-pool state, a buy/sell quote
            calculator, and (when connected) your stake position. Paste a vault address or
            open with <code>?vault=claw1...</code>. Testnet only &mdash; not financial advice.
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
          data-testid="vault-inspector-input"
          className="mono"
          style={{ padding: "6px 10px", flex: 1, minWidth: 280 }}
        />
        <button className="btn" data-testid="vault-inspector-load" onClick={onLoad}>
          Inspect
        </button>
      </div>

      {error && (
        <div
          className="card"
          data-testid="vault-inspector-error"
          style={{
            marginBottom: 24,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
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
        <div className="empty" data-testid="vault-inspector-empty">
          Enter a ModelVault contract address to inspect its full state. Find vault
          addresses on the <Link to="/model-exchange">Model Exchange</Link> or list
          markets on the <Link to="/model-markets">AI Stock Exchange</Link>.
        </div>
      ) : loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading vault state...</p>
        </div>
      ) : state ? (
        <>
          {/* Config */}
          <div className="card" data-testid="vault-config" style={{ marginBottom: 24 }}>
            <h2>Config</h2>
            <div className="grid-4" style={{ marginTop: 12 }}>
              <div className="card" data-testid="stat-card">
                <h3>Model Denom</h3>
                <div
                  className="mono"
                  style={{ fontSize: 12, wordBreak: "break-all", marginTop: 4 }}
                >
                  {state.config.model_denom || "--"}
                </div>
              </div>
              <div className="card" data-testid="stat-card">
                <h3>Reserve Denom</h3>
                <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                  {state.config.reserve_denom || "--"}
                </div>
              </div>
              <div className="card" data-testid="stat-card">
                <h3>Owner</h3>
                <div style={{ marginTop: 4 }}>
                  {state.config.owner ? (
                    <Link
                      to={`/explorer/account/${state.config.owner}`}
                      className="mono"
                      style={{ fontSize: 12 }}
                    >
                      {shortAddr(state.config.owner)}
                    </Link>
                  ) : (
                    "--"
                  )}
                </div>
              </div>
              <div className="card" data-testid="stat-card">
                <h3>Fee</h3>
                <div className="value">{(state.config.fee_bps / 100).toFixed(2)}%</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  {state.config.fee_bps} bps
                </div>
              </div>
            </div>
          </div>

          {/* Pool (curve) */}
          <div className="card" data-testid="vault-pool" style={{ marginBottom: 24 }}>
            <h2>Bonding Curve Pool</h2>
            <div className="grid-4" style={{ marginTop: 12 }}>
              <div className="card" data-testid="stat-card">
                <h3>Reserve</h3>
                <div className="value">{formatBaseUnits(state.pool.reserve)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  {RESERVE_LABEL}
                </div>
              </div>
              <div className="card" data-testid="stat-card">
                <h3>Inventory</h3>
                <div className="value">{formatBaseUnits(state.pool.inventory)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  model token
                </div>
              </div>
              <div className="card accent" data-testid="stat-card">
                <h3>Spot Price</h3>
                <div className="value accent">{formatSpotPrice(state.spotPriceClaw)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  {RESERVE_LABEL} per token
                </div>
              </div>
              <div className="card" data-testid="stat-card">
                <h3>Total Staked</h3>
                <div className="value">
                  {formatBaseUnits(state.poolInfo.total_staked)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  model token &middot; index{" "}
                  {formatRewardIndex(state.poolInfo.reward_per_token_stored)}
                </div>
              </div>
            </div>
          </div>

          {/* Quote calculator */}
          <QuoteCalculator
            vaultAddress={vault}
            modelDenom={state.config.model_denom}
            reserveDenom={state.config.reserve_denom}
          />

          {/* Embedded stake/earn for the connected user */}
          <StakeEarnPanel
            vaultAddress={vault}
            modelDenom={state.config.model_denom}
            modelSymbol={state.config.model_denom || "model"}
            address={connectedAddress}
          />
        </>
      ) : null}
    </>
  );
}
