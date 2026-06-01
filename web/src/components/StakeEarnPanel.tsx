import { useCallback, useEffect, useState } from "react";
import { chainConfig } from "../lib/config.ts";
import {
  buildClaimRewardsMsg,
  buildStakeMsg,
  buildUnstakeMsg,
  formatBaseUnits,
  formatRewardIndex,
  getVaultPoolInfo,
  getVaultStakeInfo,
  type VaultExecute,
  type VaultPoolInfo,
  type VaultStakeInfo,
} from "../lib/model-vault.ts";

/** Action emitted by the panel's controls (build-only, mirrors page convention). */
export type StakeEarnAction =
  | VaultExecute<{ stake: Record<string, never> }>
  | VaultExecute<{ unstake: { amount: string } }>
  | VaultExecute<{ claim_rewards: Record<string, never> }>;

export interface StakeEarnPanelProps {
  /** ModelVault contract address backing this model's dividend pool. */
  vaultAddress: string;
  /** the staked/earned model token denom (attached on stake). */
  modelDenom: string;
  /** display symbol for the model token, e.g. OPUS_4_8. */
  modelSymbol: string;
  /** connected wallet address, or null when disconnected. */
  address: string | null;
  /**
   * Called with a built (not broadcast) execute message when an action button
   * is pressed. Matches the page convention of previewing message shapes.
   */
  onAction?: (action: StakeEarnAction) => void;
}

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

export default function StakeEarnPanel({
  vaultAddress,
  modelDenom,
  modelSymbol,
  address,
  onAction,
}: StakeEarnPanelProps) {
  const [poolInfo, setPoolInfo] = useState<VaultPoolInfo | null>(null);
  const [stakeInfo, setStakeInfo] = useState<VaultStakeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pool = await getVaultPoolInfo(vaultAddress);
      setPoolInfo(pool);
      if (address) {
        const stake = await getVaultStakeInfo(vaultAddress, address);
        setStakeInfo(stake);
      } else {
        setStakeInfo(null);
      }
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load dividend pool");
    }
    setLoading(false);
  }, [vaultAddress, address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const emit = useCallback(
    (build: () => StakeEarnAction) => {
      setFormError(null);
      try {
        const action = build();
        onAction?.(action);
      } catch (e: unknown) {
        setFormError(e instanceof Error ? e.message : "Invalid amount");
      }
    },
    [onAction],
  );

  const onStake = () => emit(() => buildStakeMsg(vaultAddress, modelDenom, amount));
  const onUnstake = () => emit(() => buildUnstakeMsg(vaultAddress, amount));
  const onClaim = () => emit(() => buildClaimRewardsMsg(vaultAddress));

  return (
    <div className="card" data-testid="stake-earn-panel" style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2>Stake &amp; Earn</h2>
        <span style={{ fontSize: 12, color: "var(--text2)" }} className="mono">
          {modelSymbol}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
        Stake {modelSymbol} into its ModelVault dividend pool to earn pro-rata{" "}
        {RESERVE_LABEL} revenue (Synthetix-style). Claim accrued dividends any time.
      </p>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading dividend pool...</p>
        </div>
      ) : loadError ? (
        <div data-testid="stake-earn-error" style={{ color: "#ef4444" }}>
          Failed to load dividend pool: {loadError}
          <div style={{ marginTop: 8 }}>
            <button className="btn-outline" onClick={fetchData}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Pool + stake stats */}
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="card" data-testid="stake-stat-total">
              <h3>Total Staked</h3>
              <div className="value">
                {formatBaseUnits(poolInfo?.total_staked ?? "0")}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {modelSymbol}
              </div>
            </div>
            <div className="card" data-testid="stake-stat-index">
              <h3>Reward Index</h3>
              <div className="value">
                {formatRewardIndex(poolInfo?.reward_per_token_stored ?? "0")}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {RESERVE_LABEL} per token
              </div>
            </div>
            <div className="card" data-testid="stake-stat-staked">
              <h3>Your Stake</h3>
              <div className="value">
                {address ? formatBaseUnits(stakeInfo?.staked ?? "0") : "--"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {address ? modelSymbol : "Connect wallet"}
              </div>
            </div>
            <div className="card accent" data-testid="stake-stat-claimable">
              <h3>Claimable</h3>
              <div className="value accent">
                {address ? formatBaseUnits(stakeInfo?.claimable ?? "0") : "--"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {address ? RESERVE_LABEL : "Connect wallet"}
              </div>
            </div>
          </div>

          {/* Action controls */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${modelSymbol})`}
              aria-label="Stake amount"
              data-testid="stake-amount-input"
              inputMode="decimal"
              style={{ padding: "6px 10px", minWidth: 180 }}
            />
            <button
              className="btn"
              data-testid="stake-btn"
              onClick={onStake}
              disabled={!address}
            >
              Stake
            </button>
            <button
              className="btn-outline"
              data-testid="unstake-btn"
              onClick={onUnstake}
              disabled={!address}
            >
              Unstake
            </button>
            <button
              className="btn-outline"
              data-testid="claim-btn"
              onClick={onClaim}
              disabled={!address}
            >
              Claim Rewards
            </button>
          </div>

          {!address && (
            <p
              data-testid="stake-connect-hint"
              style={{ fontSize: 12, color: "var(--text2)", marginTop: 12 }}
            >
              Connect a wallet to stake, unstake, or claim dividends.
            </p>
          )}
          {formError && (
            <p data-testid="stake-form-error" style={{ color: "#ef4444", marginTop: 12 }}>
              {formError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
