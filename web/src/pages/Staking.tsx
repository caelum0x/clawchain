import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getValidators,
  getDelegations,
  formatClaw,
  shortAddr,
  type Validator,
  type Delegation,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, WalletState } from "../lib/wallet.ts";

type Tab = "overview" | "delegations" | "validators" | "rewards";

interface RewardEntry {
  validatorAddress: string;
  reward: string;
}

interface RewardsResponse {
  total: string;
  rewards: RewardEntry[];
}

async function fetchRewards(address: string): Promise<RewardsResponse> {
  const rest = chainConfig.restEndpoint.startsWith("http")
    ? chainConfig.restEndpoint
    : `${window.location.origin}${chainConfig.restEndpoint}`;
  try {
    const resp = await fetch(
      `${rest}/cosmos/distribution/v1beta1/delegators/${address}/rewards`
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const perValidator: RewardEntry[] = (data.rewards ?? []).map((r: any) => {
      const coins = r.reward ?? [];
      const uclaw = coins.find(
        (c: any) => c.denom === chainConfig.coinMinimalDenom
      );
      return {
        validatorAddress: r.validator_address ?? "",
        reward: uclaw ? String(Math.floor(parseFloat(uclaw.amount))) : "0",
      };
    });

    const totalCoins = data.total ?? [];
    const totalUclaw = totalCoins.find(
      (c: any) => c.denom === chainConfig.coinMinimalDenom
    );
    const total = totalUclaw
      ? String(Math.floor(parseFloat(totalUclaw.amount)))
      : "0";

    return { total, rewards: perValidator };
  } catch {
    return { total: "0", rewards: [] };
  }
}

export default function Staking() {
  useDocTitle("Staking");
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [validators, setValidators] = useState<Validator[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [rewards, setRewards] = useState<RewardsResponse>({
    total: "0",
    rewards: [],
  });

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [userAddress, setUserAddress] = useState("");
  const [addressInput, setAddressInput] = useState("");

  // Delegate modal state
  const [delegateModalOpen, setDelegateModalOpen] = useState(false);
  const [delegateValidator, setDelegateValidator] = useState<Validator | null>(
    null
  );
  const [delegateAmount, setDelegateAmount] = useState("");

  useEffect(() => {
    loadValidators();
  }, []);

  useEffect(() => {
    if (userAddress) {
      loadUserData(userAddress);
    }
  }, [userAddress]);

  async function loadValidators() {
    try {
      const v = await getValidators();
      v.sort((a, b) => Number(BigInt(b.tokens) - BigInt(a.tokens)));
      setValidators(v);
    } catch {
      setError("Failed to load validators. Is the chain running?");
    }
    setLoading(false);
  }

  async function loadUserData(address: string) {
    try {
      const [dels, rews] = await Promise.all([
        getDelegations(address),
        fetchRewards(address),
      ]);
      setDelegations(dels);
      setRewards(rews);
      setError(null);
    } catch {
      setError("Failed to load staking data for this address.");
    }
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (trimmed) {
      setUserAddress(trimmed);
    }
  }

  async function handleConnectWallet() {
    try {
      const state = await connectKeplr();
      setWallet(state);
      setUserAddress(state.address);
      setAddressInput(state.address);
    } catch (e: any) {
      setTxStatus({ msg: `Wallet connection failed: ${e.message}`, type: "error" });
    }
  }

  async function handleUndelegate(valAddr: string) {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    const amountStr = prompt("Enter amount to undelegate (in uclaw):");
    if (!amountStr) return;
    try {
      const msg = {
        type: "cosmos-sdk/MsgUndelegate",
        value: {
          delegator_address: wallet.address,
          validator_address: valAddr,
          amount: { denom: "uclaw", amount: amountStr },
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], "Undelegate CLAW");
      if (result.code === 0) {
        setTxStatus({ msg: `Undelegated successfully. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        loadUserData(wallet.address);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  async function handleClaimRewards(valAddr: string) {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    try {
      const msg = {
        type: "cosmos-sdk/MsgWithdrawDelegatorReward",
        value: {
          delegator_address: wallet.address,
          validator_address: valAddr,
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], "Claim staking rewards");
      if (result.code === 0) {
        setTxStatus({ msg: `Rewards claimed. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        loadUserData(wallet.address);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  async function handleClaimAllRewards() {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    try {
      const msgs = rewards.rewards
        .filter((r) => BigInt(r.reward) > 0n)
        .map((r) => ({
          type: "cosmos-sdk/MsgWithdrawDelegatorReward",
          value: {
            delegator_address: wallet.address,
            validator_address: r.validatorAddress,
          },
        }));
      if (msgs.length === 0) {
        setTxStatus({ msg: "No rewards to claim.", type: "error" });
        return;
      }
      const result = await signAndBroadcast(wallet.address, msgs, "Claim all staking rewards");
      if (result.code === 0) {
        setTxStatus({ msg: `All rewards claimed. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        loadUserData(wallet.address);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  async function handleDelegateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!delegateValidator) return;
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    const uclaw = String(Math.floor(parseFloat(delegateAmount) * 1_000_000));
    try {
      const msg = {
        type: "cosmos-sdk/MsgDelegate",
        value: {
          delegator_address: wallet.address,
          validator_address: delegateValidator.operatorAddress,
          amount: { denom: "uclaw", amount: uclaw },
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], "Delegate CLAW");
      if (result.code === 0) {
        setTxStatus({ msg: `Delegated successfully. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        loadUserData(wallet.address);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
    setDelegateModalOpen(false);
    setDelegateAmount("");
    setDelegateValidator(null);
  }

  function openDelegateModal(v: Validator) {
    setDelegateValidator(v);
    setDelegateAmount("");
    setDelegateModalOpen(true);
  }

  // Derived values
  const totalStaked = delegations.reduce(
    (sum, d) => sum + BigInt(d.amount || "0"),
    0n
  );
  const totalPendingRewards = BigInt(rewards.total || "0");
  const validatorCount = delegations.length;
  const totalValidatorStake = validators.reduce(
    (sum, v) => sum + BigInt(v.tokens),
    0n
  );

  // Map validator addresses to monikers for display
  const validatorMap = new Map<string, Validator>();
  for (const v of validators) {
    validatorMap.set(v.operatorAddress, v);
  }

  if (loading)
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading staking data...</p>
      </div>
    );

  return (
    <div>
      <h1 className="page-title">Staking</h1>
      <p className="page-subtitle">
        Delegate CLAW tokens to validators and earn staking rewards.
      </p>

      {/* Wallet connection */}
      <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        {wallet?.connected ? (
          <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
            Wallet: <strong>{shortAddr(wallet.address)}</strong> ({formatClaw(wallet.balance)} CLAW)
          </span>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleConnectWallet}
            disabled={!isKeplrAvailable()}
            data-testid="connect-wallet-btn"
          >
            {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
          </button>
        )}
        <Link to="/staking/calculator" className="btn btn-primary">
          Staking Calculator
        </Link>
      </div>

      {txStatus && (
        <div
          data-testid="tx-status"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: txStatus.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: txStatus.type === "success" ? "#22c55e" : "#ef4444",
          }}
        >
          {txStatus.msg}
        </div>
      )}

      {/* Address lookup */}
      <div
        className="card"
        style={{ marginBottom: "1.5rem", maxWidth: "600px" }}
      >
        <form
          onSubmit={handleLookup}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter your claw... address to view staking info"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button className="btn btn-primary" type="submit">
            Lookup
          </button>
        </form>
        {userAddress && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text2)" }}>
            Viewing: <strong>{shortAddr(userAddress)}</strong>
          </p>
        )}
      </div>

      {error && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {/* Tab buttons */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <button
          className={`btn ${tab === "overview" ? "btn-primary" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`btn ${tab === "delegations" ? "btn-primary" : ""}`}
          onClick={() => setTab("delegations")}
        >
          Delegations ({delegations.length})
        </button>
        <button
          className={`btn ${tab === "validators" ? "btn-primary" : ""}`}
          onClick={() => setTab("validators")}
        >
          Validators ({validators.length})
        </button>
        <button
          className={`btn ${tab === "rewards" ? "btn-primary" : ""}`}
          onClick={() => setTab("rewards")}
        >
          Rewards
        </button>
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view your staking overview.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Total Staked
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {formatClaw(totalStaked.toString())}
                </div>
              </div>
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Pending Rewards
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                  {formatClaw(totalPendingRewards.toString())}
                </div>
              </div>
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Validators Delegated
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {validatorCount}
                </div>
              </div>
            </div>
          )}

          {userAddress && delegations.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Delegation Summary</h3>
              {delegations.map((d) => {
                const v = validatorMap.get(d.validatorAddress);
                const pct =
                  totalStaked > 0n
                    ? Number((BigInt(d.amount) * 10000n) / totalStaked) / 100
                    : 0;
                return (
                  <div
                    key={d.validatorAddress}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.5rem 0",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {v?.moniker || "Unknown Validator"}
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: 12, color: "var(--text2)" }}
                      >
                        {shortAddr(d.validatorAddress)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>{formatClaw(d.amount)}</div>
                      <div
                        style={{ fontSize: 12, color: "var(--text2)" }}
                      >
                        {pct.toFixed(2)}% of your stake
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Delegations Tab */}
      {tab === "delegations" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view your delegations.</p>
            </div>
          ) : delegations.length === 0 ? (
            <div className="card">
              <p>
                No active delegations found for this address. Go to the
                Validators tab to delegate.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Validator</th>
                    <th>Staked Amount</th>
                    <th>Pending Rewards</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {delegations.map((d) => {
                    const v = validatorMap.get(d.validatorAddress);
                    const rewardEntry = rewards.rewards.find(
                      (r) => r.validatorAddress === d.validatorAddress
                    );
                    const rewardAmount = rewardEntry?.reward ?? "0";
                    return (
                      <tr key={d.validatorAddress}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {v?.moniker || "Unknown Validator"}
                          </div>
                          <div
                            className="mono"
                            style={{
                              fontSize: 12,
                              color: "var(--text2)",
                            }}
                          >
                            <Link
                              to={`/explorer/account/${d.validatorAddress}`}
                            >
                              {shortAddr(d.validatorAddress)}
                            </Link>
                          </div>
                        </td>
                        <td>{formatClaw(d.amount)}</td>
                        <td
                          style={{
                            color:
                              BigInt(rewardAmount) > 0n
                                ? "#22c55e"
                                : undefined,
                          }}
                        >
                          {formatClaw(rewardAmount)}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              className="btn"
                              style={{ fontSize: "0.8rem" }}
                              onClick={() =>
                                handleUndelegate(d.validatorAddress)
                              }
                            >
                              Undelegate
                            </button>
                            <button
                              className="btn"
                              style={{
                                fontSize: "0.8rem",
                                color: "#22c55e",
                              }}
                              onClick={() =>
                                handleClaimRewards(d.validatorAddress)
                              }
                            >
                              Claim Rewards
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Validators Tab */}
      {tab === "validators" && (
        <>
          <p className="page-subtitle" style={{ marginBottom: "1rem" }}>
            {validators.length} active validator
            {validators.length !== 1 ? "s" : ""}
            {totalValidatorStake > 0n && (
              <>
                {" "}
                &mdash; {formatClaw(totalValidatorStake.toString())} total stake
              </>
            )}
          </p>

          {validators.length === 0 ? (
            <div className="empty">
              No validators found. Is the chain running?
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Validator</th>
                    <th>Voting Power</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {validators.map((v, i) => {
                    const pct =
                      totalValidatorStake > 0n
                        ? (BigInt(v.tokens) * 10000n) / totalValidatorStake
                        : 0n;
                    return (
                      <tr key={v.operatorAddress}>
                        <td>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {v.moniker || "Unnamed"}
                          </div>
                          <div
                            className="mono"
                            style={{
                              fontSize: 12,
                              color: "var(--text2)",
                            }}
                          >
                            <Link
                              to={`/explorer/account/${v.operatorAddress}`}
                            >
                              {shortAddr(v.operatorAddress)}
                            </Link>
                          </div>
                        </td>
                        <td>
                          <div>{formatClaw(v.tokens)}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text2)",
                            }}
                          >
                            {(Number(pct) / 100).toFixed(2)}%
                          </div>
                        </td>
                        <td>
                          {(parseFloat(v.commission) * 100).toFixed(1)}%
                        </td>
                        <td>
                          {v.jailed ? (
                            <span className="badge error">Jailed</span>
                          ) : (
                            <span className="badge success">Active</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: "0.8rem" }}
                            onClick={() => openDelegateModal(v)}
                          >
                            Delegate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Rewards Tab */}
      {tab === "rewards" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view your staking rewards.</p>
            </div>
          ) : (
            <>
              {/* Total rewards summary card */}
              <div
                className="card"
                style={{ marginBottom: "1.5rem", maxWidth: "500px" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text2)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Total Pending Rewards
                    </div>
                    <div
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: 700,
                        color: "#22c55e",
                      }}
                    >
                      {formatClaw(totalPendingRewards.toString())}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleClaimAllRewards}
                    disabled={totalPendingRewards === 0n}
                  >
                    Claim All Rewards
                  </button>
                </div>
              </div>

              {/* Per-validator reward breakdown */}
              {rewards.rewards.length === 0 ? (
                <div className="card">
                  <p>No pending rewards found.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Validator</th>
                        <th>Pending Reward</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rewards.rewards.map((r) => {
                        const v = validatorMap.get(r.validatorAddress);
                        return (
                          <tr key={r.validatorAddress}>
                            <td>
                              <div style={{ fontWeight: 600 }}>
                                {v?.moniker || "Unknown Validator"}
                              </div>
                              <div
                                className="mono"
                                style={{
                                  fontSize: 12,
                                  color: "var(--text2)",
                                }}
                              >
                                <Link
                                  to={`/explorer/account/${r.validatorAddress}`}
                                >
                                  {shortAddr(r.validatorAddress)}
                                </Link>
                              </div>
                            </td>
                            <td
                              style={{
                                color:
                                  BigInt(r.reward) > 0n
                                    ? "#22c55e"
                                    : undefined,
                              }}
                            >
                              {formatClaw(r.reward)}
                            </td>
                            <td>
                              <button
                                className="btn"
                                style={{
                                  fontSize: "0.8rem",
                                  color: "#22c55e",
                                }}
                                onClick={() =>
                                  handleClaimRewards(r.validatorAddress)
                                }
                                disabled={BigInt(r.reward) === 0n}
                              >
                                Claim
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Delegate Modal */}
      {delegateModalOpen && delegateValidator && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setDelegateModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "450px",
              width: "90%",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: "1rem" }}>Delegate to Validator</h3>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>
                {delegateValidator.moniker ||
                  shortAddr(delegateValidator.operatorAddress)}
              </strong>
            </p>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text2)",
                marginBottom: "1rem",
              }}
            >
              Commission:{" "}
              {(parseFloat(delegateValidator.commission) * 100).toFixed(1)}%
              &mdash; Voting Power: {formatClaw(delegateValidator.tokens)}
            </p>
            <form onSubmit={handleDelegateSubmit}>
              <div style={{ marginBottom: "1rem" }}>
                <label>Amount (CLAW) *</label>
                <input
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  value={delegateAmount}
                  onChange={(e) => setDelegateAmount(e.target.value)}
                  placeholder="100"
                  required
                  style={{ width: "100%", padding: "0.5rem" }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDelegateModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">
                  Delegate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
