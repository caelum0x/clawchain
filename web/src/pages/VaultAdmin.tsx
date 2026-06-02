import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import useCopyClipboard from "../hooks/useCopyClipboard.ts";
import { useToast } from "../hooks/useToast.tsx";
import { shortAddr } from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import {
  getVaultConfig,
  getVaultPoolInfo,
  formatBaseUnits,
  formatRewardIndex,
  toBaseUnits,
  type VaultConfig,
  type VaultPoolInfo,
} from "../lib/model-vault.ts";
import {
  getVaultPoolReserves,
  getVaultSpotPrice,
  formatSpotPrice,
  type VaultPoolReserves,
} from "../lib/model-index.ts";

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

interface AdminState {
  config: VaultConfig;
  pool: VaultPoolReserves;
  poolInfo: VaultPoolInfo;
  spotPriceClaw: number | null;
}

/**
 * Build the exact `clawd model-vault fund` command for seeding the vault.
 *
 * Flags verified against cmd/clawd/src/main.ts: `fund` takes
 * `--contract`, `--amount`, and `--denom` (the denom selects whether the
 * funds top up the bonding-curve reserve or its model-token inventory).
 */
function buildFundCommand(
  contract: string,
  amountHuman: string,
  denom: string,
): string {
  const amount = toBaseUnits(amountHuman);
  return `clawd model-vault fund --contract ${contract} --amount ${amount} --denom ${denom}`;
}

/**
 * Build the exact `clawd model-vault distribute` command. Flags verified
 * against cmd/clawd/src/main.ts: `distribute` takes `--contract` and
 * `--amount` (reserve-denom revenue paid pro-rata to stakers).
 */
function buildDistributeCommand(contract: string, amountHuman: string): string {
  const amount = toBaseUnits(amountHuman);
  return `clawd model-vault distribute --contract ${contract} --amount ${amount}`;
}

/** Whether the bonding curve has both legs seeded (tradeable). */
function isFunded(pool: VaultPoolReserves): boolean {
  let reserve = 0n;
  let inventory = 0n;
  try {
    reserve = BigInt(pool.reserve || "0");
    inventory = BigInt(pool.inventory || "0");
  } catch {
    return false;
  }
  return reserve > 0n && inventory > 0n;
}

export default function VaultAdmin() {
  useDocTitle("Vault Admin");

  const { addToast } = useToast();
  const [, copy] = useCopyClipboard();

  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get("vault") ?? "");
  const [vault, setVault] = useState<string | null>(
    (searchParams.get("vault") ?? "").trim() || null,
  );
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owner-action form state (build-only; nothing is signed in the browser).
  const [fundAmount, setFundAmount] = useState("");
  const [fundTarget, setFundTarget] = useState<"reserve" | "inventory">("reserve");
  const [fundError, setFundError] = useState<string | null>(null);
  const [distributeAmount, setDistributeAmount] = useState("");
  const [distributeError, setDistributeError] = useState<string | null>(null);

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

  /** Copy a command string and confirm via toast. */
  const copyCommand = useCallback(
    (command: string, what: string) => {
      copy(command);
      addToast({
        type: "success",
        title: "Command copied",
        message: `Paste the ${what} command into your clawd-signing terminal.`,
      });
    },
    [copy, addToast],
  );

  const onCopyFund = () => {
    if (!vault) return;
    setFundError(null);
    try {
      const denom =
        fundTarget === "reserve"
          ? state?.config.reserve_denom ?? chainConfig.coinMinimalDenom
          : state?.config.model_denom ?? "";
      if (!denom) {
        throw new Error(
          "Vault model denom unknown — load the vault before building a fund command",
        );
      }
      const command = buildFundCommand(vault, fundAmount, denom);
      copyCommand(command, "fund");
    } catch (e: unknown) {
      setFundError(e instanceof Error ? e.message : "Invalid amount");
    }
  };

  const onCopyDistribute = () => {
    if (!vault) return;
    setDistributeError(null);
    try {
      const command = buildDistributeCommand(vault, distributeAmount);
      copyCommand(command, "distribute");
    } catch (e: unknown) {
      setDistributeError(e instanceof Error ? e.message : "Invalid amount");
    }
  };

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Vault Admin</h1>
          <p className="page-subtitle">
            Owner console for a <strong>ModelVault</strong> contract &mdash; check
            health (denoms, fee, reserves, spot price, total staked) and generate the
            exact <code>clawd</code> commands to fund the curve or distribute revenue.
            The browser never signs &mdash; copy a command and run it in your
            clawd-signing terminal. Paste a vault address or open with{" "}
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
          data-testid="vault-admin-input"
          className="mono"
          style={{ padding: "6px 10px", flex: 1, minWidth: 280 }}
        />
        <button className="btn" data-testid="vault-admin-load" onClick={onLoad}>
          Load
        </button>
      </div>

      {error && (
        <div
          className="card"
          data-testid="vault-admin-error"
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
        <div className="empty" data-testid="vault-admin-empty">
          Enter a ModelVault contract address to manage it. Find vault addresses on the{" "}
          <Link to="/model-exchange">Model Exchange</Link>, inspect read-only state on the{" "}
          <Link to="/vault-inspector">Vault Inspector</Link>, or list markets on the{" "}
          <Link to="/model-markets">AI Stock Exchange</Link>.
        </div>
      ) : loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading vault state...</p>
        </div>
      ) : state ? (
        <>
          {/* Owner health panel */}
          <div className="card" data-testid="vault-admin-health" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h2>Vault Health</h2>
              <span
                className={`badge ${isFunded(state.pool) ? "success" : "warning"}`}
                data-testid="vault-admin-funded-badge"
              >
                {isFunded(state.pool) ? "Funded" : "Unfunded"}
              </span>
            </div>

            <div className="grid-4" style={{ marginTop: 12 }}>
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
                <div className="value">{formatBaseUnits(state.poolInfo.total_staked)}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  model token &middot; index{" "}
                  {formatRewardIndex(state.poolInfo.reward_per_token_stored)}
                </div>
              </div>
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
            </div>
          </div>

          {/* Fund reserve / inventory */}
          <div className="card" data-testid="vault-admin-fund" style={{ marginBottom: 24 }}>
            <h2>Fund Reserve / Inventory</h2>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              Seed the bonding curve with {RESERVE_LABEL} reserve or model-token inventory.
              Choose a leg and amount; copy the generated <code>clawd</code> command and
              run it from the vault owner&apos;s keyring.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                Leg
                <select
                  value={fundTarget}
                  onChange={(e) =>
                    setFundTarget(e.target.value === "inventory" ? "inventory" : "reserve")
                  }
                  data-testid="vault-admin-fund-target"
                  style={{ padding: "6px 10px" }}
                >
                  <option value="reserve">Reserve ({RESERVE_LABEL})</option>
                  <option value="inventory">Inventory (model token)</option>
                </select>
              </label>
              <input
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder={
                  fundTarget === "reserve"
                    ? `Amount (${RESERVE_LABEL})`
                    : "Amount (model token)"
                }
                aria-label="Fund amount"
                data-testid="vault-admin-fund-amount"
                inputMode="decimal"
                style={{ padding: "6px 10px", minWidth: 180 }}
              />
              <button
                className="btn"
                data-testid="vault-admin-fund-copy"
                onClick={onCopyFund}
              >
                Copy fund command
              </button>
            </div>
            {fundError && (
              <p
                data-testid="vault-admin-fund-error"
                style={{ color: "#ef4444", marginTop: 12 }}
              >
                {fundError}
              </p>
            )}
          </div>

          {/* Distribute revenue */}
          <div
            className="card"
            data-testid="vault-admin-distribute"
            style={{ marginBottom: 24 }}
          >
            <h2>Distribute Revenue</h2>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              Pay {RESERVE_LABEL} revenue to stakers pro-rata (Synthetix-style). Enter an
              amount; copy the generated <code>clawd</code> command and run it from the
              vault owner&apos;s keyring.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                value={distributeAmount}
                onChange={(e) => setDistributeAmount(e.target.value)}
                placeholder={`Amount (${RESERVE_LABEL})`}
                aria-label="Distribute amount"
                data-testid="vault-admin-distribute-amount"
                inputMode="decimal"
                style={{ padding: "6px 10px", minWidth: 180 }}
              />
              <button
                className="btn"
                data-testid="vault-admin-distribute-copy"
                onClick={onCopyDistribute}
              >
                Copy distribute command
              </button>
            </div>
            {distributeError && (
              <p
                data-testid="vault-admin-distribute-error"
                style={{ color: "#ef4444", marginTop: 12 }}
              >
                {distributeError}
              </p>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
