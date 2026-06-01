import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import { useToast } from "../hooks/useToast.tsx";
import { shortAddr } from "../lib/chain.ts";
import { getConnectedAddress } from "../lib/walletconnect.ts";
import { buildClaimRewardsMsg, formatBaseUnits } from "../lib/model-vault.ts";
import {
  getModelPortfolio,
  parseVaultList,
  type ModelPortfolio as ModelPortfolioData,
} from "../lib/model-portfolio.ts";

const VAULTS_STORAGE_KEY = "clawchain-model-portfolio-vaults";

/** Load the persisted newline-separated vault list (best-effort). */
function loadStoredVaults(): string {
  try {
    return localStorage.getItem(VAULTS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Persist the raw vault textarea contents (best-effort). */
function storeVaults(raw: string): void {
  try {
    localStorage.setItem(VAULTS_STORAGE_KEY, raw);
  } catch {
    // Storage unavailable (private mode / quota) — non-fatal.
  }
}

export default function ModelPortfolio() {
  useDocTitle("Model Portfolio");
  const { addToast } = useToast();

  const connectedAddress = getConnectedAddress();

  const [address, setAddress] = useState(connectedAddress ?? "");
  const [vaultText, setVaultText] = useState(loadStoredVaults);
  const [portfolio, setPortfolio] = useState<ModelPortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vaultList = useMemo(() => parseVaultList(vaultText), [vaultText]);
  const vaultKey = vaultList.join(",");

  const fetchData = useCallback(async () => {
    const holder = address.trim();
    if (holder === "" || vaultList.length === 0) {
      setPortfolio(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getModelPortfolio(holder, vaultList);
      setPortfolio(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    }
    setLoading(false);
    // vaultList is derived from vaultText; key on its serialized form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, vaultKey]);

  // Auto-load once on mount when an address + persisted vaults are present.
  useEffect(() => {
    if (address.trim() && vaultList.length > 0) {
      fetchData();
    }
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVaultTextChange = (value: string) => {
    setVaultText(value);
    storeVaults(value);
  };

  const onClaim = (contract: string) => {
    try {
      // Build (not broadcast) the claim message — matches the read-first
      // convention of the model pages; broadcast is a clawd command.
      buildClaimRewardsMsg(contract);
      addToast({
        type: "info",
        title: "Claim message built",
        message: `claim_rewards for ${shortAddr(contract)} — broadcast with: clawd model-vault claim --contract ${contract}`,
      });
    } catch (e: unknown) {
      addToast({
        type: "error",
        title: "Failed to build claim",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const positions = portfolio?.positions ?? [];
  const totals = portfolio?.totalClaimableByDenom ?? {};
  const totalEntries = Object.entries(totals);

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Model Portfolio</h1>
          <p className="page-subtitle">
            Your model-token stakes and claimable dividends across ModelVault
            contracts. There is no on-chain model&rarr;vault registry yet, so add
            the vault addresses you hold below &mdash; the list is saved in your
            browser. Read-first view; claim is a{" "}
            <Link to="/model-exchange">clawd</Link> command. Testnet only &mdash;
            not financial advice.
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
            Holder address
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="claw1... (defaults to connected wallet)"
            aria-label="Holder address"
            data-testid="model-portfolio-address-input"
            className="mono"
            style={{ padding: "6px 10px", width: "100%", maxWidth: 520 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
            ModelVault contract addresses (one per line)
          </label>
          <textarea
            value={vaultText}
            onChange={(e) => onVaultTextChange(e.target.value)}
            placeholder={"claw1vault...\nclaw1othervault..."}
            aria-label="ModelVault contract addresses"
            data-testid="model-portfolio-vaults-input"
            rows={4}
            className="mono"
            style={{
              padding: "6px 10px",
              width: "100%",
              maxWidth: 520,
              resize: "vertical",
            }}
          />
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {vaultList.length} vault{vaultList.length === 1 ? "" : "s"} listed
          </div>
        </div>
        <button
          className="btn"
          data-testid="model-portfolio-load-btn"
          onClick={fetchData}
          disabled={loading || !address.trim() || vaultList.length === 0}
        >
          {loading ? "Loading..." : "Load Portfolio"}
        </button>
      </div>

      {error && (
        <div
          className="card"
          data-testid="model-portfolio-error"
          style={{
            marginBottom: 24,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
        >
          Failed to load portfolio: {error}
          <div style={{ marginTop: 8 }}>
            <button className="btn-outline" onClick={fetchData}>
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Total claimable + summary stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="stat-card">
          <h3>Positions</h3>
          <div className="value accent">{positions.length}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            vaults queried
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Active Stakes</h3>
          <div className="value">{portfolio?.activeCount ?? 0}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            non-zero staked
          </div>
        </div>
        <div className="card accent" data-testid="stat-card">
          <h3>Total Claimable</h3>
          {totalEntries.length === 0 ? (
            <div className="value accent">--</div>
          ) : (
            totalEntries.map(([denom, amount]) => (
              <div
                key={denom}
                className="value accent"
                data-testid="model-portfolio-total-claimable"
              >
                {formatBaseUnits(amount)}{" "}
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{denom}</span>
              </div>
            ))
          )}
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            per reserve denom
          </div>
        </div>
        <div className="card" data-testid="stat-card">
          <h3>Errors</h3>
          <div className="value">{portfolio?.errorCount ?? 0}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            vaults failed to load
          </div>
        </div>
      </div>

      {/* Positions table / states */}
      {loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading portfolio...</p>
        </div>
      ) : portfolio === null ? (
        <div className="empty" data-testid="model-portfolio-empty">
          Enter a holder address and at least one ModelVault contract address to
          view your stakes and claimable dividends.
        </div>
      ) : positions.length === 0 ? (
        <div className="empty" data-testid="model-portfolio-empty">
          No positions to show. Add ModelVault contract addresses above.
        </div>
      ) : (
        <div className="table-wrap">
          <h2>Positions ({positions.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Vault</th>
                <th>Model Denom</th>
                <th>Staked</th>
                <th>Claimable</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.contract} data-testid="model-portfolio-position-row">
                  <td>
                    <Link to={`/explorer/account/${p.contract}`} className="mono">
                      {shortAddr(p.contract)}
                    </Link>
                  </td>
                  <td className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
                    {p.error ? (
                      <span style={{ color: "#ef4444" }}>{p.error}</span>
                    ) : (
                      p.modelDenom || "--"
                    )}
                  </td>
                  <td>
                    {p.error ? (
                      "--"
                    ) : (
                      <span style={{ fontWeight: 600 }}>{formatBaseUnits(p.staked)}</span>
                    )}
                  </td>
                  <td>
                    {p.error ? (
                      "--"
                    ) : (
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                        {formatBaseUnits(p.claimable)}{" "}
                        <span style={{ fontSize: 11, color: "var(--text2)" }}>
                          {p.reserveDenom}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-outline"
                      data-testid="model-portfolio-claim-btn"
                      onClick={() => onClaim(p.contract)}
                      disabled={!!p.error || BigInt(p.claimable || "0") === 0n}
                    >
                      Claim
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h2>About this portfolio</h2>
        <p style={{ fontSize: 13, color: "var(--text2)" }}>
          Each position joins the vault&apos;s <code>config</code> (model and
          reserve denoms) with your <code>stake_info</code> (staked amount and
          live claimable dividends). Claimable totals are grouped by reserve denom
          and never summed across different denoms. The <strong>Claim</strong>{" "}
          button previews the <code>claim_rewards</code> message; broadcast it with{" "}
          <code>clawd model-vault claim --contract &lt;vault&gt;</code>. Explore and
          stake into vaults on the{" "}
          <Link to="/model-exchange">Model Exchange</Link>.
        </p>
      </div>
    </>
  );
}
