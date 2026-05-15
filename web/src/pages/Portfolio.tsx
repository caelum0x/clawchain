import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getBalances,
  getDelegations,
  getTxPageByAddress,
  getComputeResources,
  getComputeJobs,
  formatClaw,
  shortAddr,
  shortHash,
  timeAgo,
  type AccountBalance,
  type Delegation,
  type Tx,
  type TxMessage,
  type ComputeResource,
  type ComputeJob,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import CopyButton from "../components/CopyButton.tsx";

type Tab = "holdings" | "staking" | "escrows" | "tasks" | "history";

interface RewardEntry {
  validatorAddress: string;
  reward: string;
}

interface RewardsResponse {
  total: string;
  rewards: RewardEntry[];
}

interface Escrow {
  id: string;
  buyer: string;
  seller: string;
  amount: { amount: string; denom: string };
  status: "active" | "completed" | "disputed" | "refunded";
  milestones: { description: string; amount: string; completed: boolean }[];
  created_at: string;
  completed_at: string;
}

interface TaskSummary {
  id: string;
  delegator: string;
  assignee: string;
  description: string;
  budget: { amount: string; denom: string };
  status: string;
  deadline: number;
}

function restUrl(path: string): string {
  const base = chainConfig.restEndpoint.startsWith("http")
    ? chainConfig.restEndpoint
    : `${window.location.origin}${chainConfig.restEndpoint}`;
  return `${base}${path}`;
}

async function fetchRewards(address: string): Promise<RewardsResponse> {
  try {
    const resp = await fetch(
      restUrl(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`)
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

async function fetchUnbonding(address: string): Promise<string> {
  try {
    const resp = await fetch(
      restUrl(`/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations`)
    );
    if (!resp.ok) return "0";
    const data = await resp.json();
    let total = 0n;
    for (const ubd of data.unbonding_responses ?? []) {
      for (const entry of ubd.entries ?? []) {
        total += BigInt(entry.balance ?? "0");
      }
    }
    return total.toString();
  } catch {
    return "0";
  }
}

async function fetchEscrows(address: string): Promise<Escrow[]> {
  try {
    const [buyerResp, sellerResp] = await Promise.all([
      fetch(restUrl(`/clawchain/marketplace/v1/escrows?buyer=${address}`)),
      fetch(restUrl(`/clawchain/marketplace/v1/escrows?seller=${address}`)),
    ]);
    const buyerData = buyerResp.ok ? await buyerResp.json() : { escrows: [] };
    const sellerData = sellerResp.ok ? await sellerResp.json() : { escrows: [] };
    const all = [...(buyerData.escrows ?? []), ...(sellerData.escrows ?? [])];
    const seen = new Set<string>();
    return all.filter((e: Escrow) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }) as Escrow[];
  } catch {
    return [];
  }
}

async function fetchTasks(address: string): Promise<TaskSummary[]> {
  try {
    const [delegatedResp, assignedResp] = await Promise.all([
      fetch(restUrl(`/clawchain/agent/v1/tasks_by_delegator/${address}`)),
      fetch(restUrl(`/clawchain/agent/v1/tasks_by_assignee/${address}`)),
    ]);
    const delegatedData = delegatedResp.ok ? await delegatedResp.json() : { tasks: [] };
    const assignedData = assignedResp.ok ? await assignedResp.json() : { tasks: [] };
    const all = [...(delegatedData.tasks ?? []), ...(assignedData.tasks ?? [])];
    const seen = new Set<string>();
    return all
      .filter((t: any) => {
        const id = t.id ?? t.task_id ?? "";
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((t: any) => ({
        id: t.id ?? t.task_id ?? "",
        delegator: t.delegator ?? t.delegator_address ?? "",
        assignee: t.assignee ?? t.assignee_address ?? "",
        description: t.description ?? "",
        budget: t.budget ?? { amount: "0", denom: "uclaw" },
        status: t.status ?? "unknown",
        deadline: t.deadline ?? 0,
      })) as TaskSummary[];
  } catch {
    return [];
  }
}

function decodeTxSummary(msg: TxMessage, walletAddr: string): string {
  const typeShort = msg.typeUrl.split(".").pop() ?? msg.typeUrl;
  const val = msg.value ?? {};

  if (typeShort.includes("MsgSend")) {
    const amount = (val.amount as Array<{ denom?: string; amount?: string }> | undefined)?.[0];
    const amtStr = amount ? formatClaw(amount.amount ?? "0") : "";
    const from = (val.from_address as string) ?? (val.fromAddress as string) ?? "";
    if (from === walletAddr) return `Sent ${amtStr}`;
    return `Received ${amtStr}`;
  }
  if (typeShort.includes("MsgDelegate")) return "Delegated stake";
  if (typeShort.includes("MsgUndelegate")) return "Undelegated stake";
  if (typeShort.includes("MsgShield")) return "Shielded tokens";
  if (typeShort.includes("MsgUnshield")) return "Unshielded tokens";
  if (typeShort.includes("MsgCompleteTask")) return "Task completed";
  if (typeShort.includes("MsgDelegateTask")) return "Delegated task";
  return typeShort.replace(/^Msg/, "");
}

const STATUS_BADGE: Record<string, string> = {
  active: "",
  completed: "badge-success",
  disputed: "badge-error",
  refunded: "badge-warning",
  pending: "",
  accepted: "badge-info",
  in_progress: "badge-info",
  failed: "badge-error",
};

export default function Portfolio() {
  useDocTitle("Portfolio");
  const [tab, setTab] = useState<Tab>("holdings");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addressInput, setAddressInput] = useState("");
  const [userAddress, setUserAddress] = useState("");

  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [rewards, setRewards] = useState<RewardsResponse>({ total: "0", rewards: [] });
  const [unbonding, setUnbonding] = useState("0");
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txTotal, setTxTotal] = useState(0);

  useEffect(() => {
    if (userAddress) loadAll(userAddress);
  }, [userAddress]);

  async function loadAll(address: string) {
    setLoading(true);
    setError(null);
    try {
      const [bals, dels, rews, unbond, escs, tsks, txResult] = await Promise.all([
        getBalances(address),
        getDelegations(address),
        fetchRewards(address),
        fetchUnbonding(address),
        fetchEscrows(address),
        fetchTasks(address),
        getTxPageByAddress(address, 1, 20),
      ]);
      setBalances(bals);
      setDelegations(dels);
      setRewards(rews);
      setUnbonding(unbond);
      setEscrows(escs);
      setTasks(tsks);
      setTxs(txResult.txs);
      setTxTotal(txResult.total);
    } catch {
      setError("Failed to load portfolio data. Is the chain running?");
    }
    setLoading(false);
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (trimmed) setUserAddress(trimmed);
  }

  // Derived values
  const clawBalance = BigInt(
    balances.find((b) => b.denom === chainConfig.coinMinimalDenom)?.amount || "0"
  );
  const totalDelegated = delegations.reduce(
    (sum, d) => sum + BigInt(d.amount || "0"),
    0n
  );
  const totalRewards = BigInt(rewards.total || "0");
  const totalUnbonding = BigInt(unbonding || "0");
  const activeEscrowValue = escrows
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + BigInt(e.amount?.amount || "0"), 0n);
  const activeTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "accepted" || t.status === "in_progress"
  );
  const pendingTaskEarnings = activeTasks
    .filter((t) => t.assignee === userAddress)
    .reduce((sum, t) => sum + BigInt(t.budget?.amount || "0"), 0n);

  const totalPortfolio =
    clawBalance + totalDelegated + totalRewards + totalUnbonding + activeEscrowValue + pendingTaskEarnings;

  const ibcTokens = balances.filter(
    (b) => b.denom !== chainConfig.coinMinimalDenom && b.denom.startsWith("ibc/")
  );
  const lpTokens = balances.filter(
    (b) => b.denom !== chainConfig.coinMinimalDenom && !b.denom.startsWith("ibc/")
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "holdings", label: "Holdings" },
    { key: "staking", label: `Staking (${delegations.length})` },
    { key: "escrows", label: `Escrows (${escrows.length})` },
    { key: "tasks", label: `Tasks (${tasks.length})` },
    { key: "history", label: "History" },
  ];

  return (
    <div>
      <h1 className="page-title">Portfolio</h1>
      <p className="page-subtitle">
        Consolidated view of all your holdings, staking, escrows, and task earnings.
      </p>

      {/* Address lookup */}
      <div className="card" style={{ marginBottom: "1.5rem", maxWidth: "600px" }}>
        <form
          onSubmit={handleLookup}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter your claw... address to view portfolio"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button className="btn btn-primary" type="submit">
            Lookup
          </button>
        </form>
        {userAddress && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text2)" }}>
            Viewing: <strong>{shortAddr(userAddress)}</strong>{" "}
            <CopyButton text={userAddress} />
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

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading portfolio...</p>
        </div>
      )}

      {!loading && !userAddress && (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>View Your Portfolio</h2>
          <p style={{ color: "var(--text2)" }}>
            Enter your address above to see a consolidated view of all your CLAW
            holdings, staking positions, escrows, tasks, and transaction history.
          </p>
        </div>
      )}

      {!loading && userAddress && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total Portfolio Value
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {formatClaw(totalPortfolio.toString())}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Available Balance
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {formatClaw(clawBalance.toString())}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Staked + Rewards
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                {formatClaw((totalDelegated + totalRewards).toString())}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Escrowed
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                {formatClaw(activeEscrowValue.toString())}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Unbonding
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {formatClaw(totalUnbonding.toString())}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Pending Task Earnings
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f59e0b" }}>
                {formatClaw(pendingTaskEarnings.toString())}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`btn ${tab === t.key ? "btn-primary" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Holdings Tab */}
          {tab === "holdings" && (
            <>
              {/* CLAW balance */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3>CLAW Tokens</h3>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Category</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdStyle}>Available</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {formatClaw(clawBalance.toString())}
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Staked</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {formatClaw(totalDelegated.toString())}
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Pending Rewards</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#22c55e" }}>
                        {formatClaw(totalRewards.toString())}
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Unbonding</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {formatClaw(totalUnbonding.toString())}
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>In Escrow</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--accent)" }}>
                        {formatClaw(activeEscrowValue.toString())}
                      </td>
                    </tr>
                    <tr style={{ fontWeight: 700 }}>
                      <td style={tdStyle}>Total</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {formatClaw(totalPortfolio.toString())}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* IBC tokens */}
              {ibcTokens.length > 0 && (
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                  <h3>IBC Tokens</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Denom</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ibcTokens.map((b) => (
                        <tr key={b.denom}>
                          <td style={tdStyle}>
                            <code className="mono" style={{ fontSize: "0.8rem" }}>
                              {b.denom.length > 30
                                ? `${b.denom.slice(0, 10)}...${b.denom.slice(-8)}`
                                : b.denom}
                            </code>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{b.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* LP / other tokens */}
              {lpTokens.length > 0 && (
                <div className="card">
                  <h3>Other Tokens</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Denom</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lpTokens.map((b) => (
                        <tr key={b.denom}>
                          <td style={tdStyle}>
                            <code className="mono">{b.denom}</code>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{b.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {balances.length === 0 && (
                <div className="card">
                  <p style={{ color: "var(--text2)" }}>No token balances found for this address.</p>
                </div>
              )}
            </>
          )}

          {/* Staking Tab */}
          {tab === "staking" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Total Staked
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {formatClaw(totalDelegated.toString())}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Pending Rewards
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                    {formatClaw(totalRewards.toString())}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Unbonding
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {formatClaw(totalUnbonding.toString())}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Validators
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {delegations.length}
                  </div>
                </div>
              </div>

              {delegations.length === 0 ? (
                <div className="card">
                  <p style={{ color: "var(--text2)" }}>
                    No active delegations.{" "}
                    <Link to="/staking" style={{ color: "var(--accent)" }}>
                      Stake now
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Validator</th>
                        <th>Staked</th>
                        <th>Pending Rewards</th>
                        <th>% of Stake</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delegations.map((d) => {
                        const rewardEntry = rewards.rewards.find(
                          (r) => r.validatorAddress === d.validatorAddress
                        );
                        const pct =
                          totalDelegated > 0n
                            ? Number((BigInt(d.amount) * 10000n) / totalDelegated) / 100
                            : 0;
                        return (
                          <tr key={d.validatorAddress}>
                            <td>
                              <Link
                                to={`/validators/${d.validatorAddress}`}
                                style={{ color: "var(--accent)" }}
                              >
                                <code className="mono">{shortAddr(d.validatorAddress)}</code>
                              </Link>
                            </td>
                            <td>{formatClaw(d.amount)}</td>
                            <td style={{ color: "#22c55e" }}>
                              {formatClaw(rewardEntry?.reward ?? "0")}
                            </td>
                            <td>{pct.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Escrows Tab */}
          {tab === "escrows" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Total Escrows
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{escrows.length}</div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Active Value Locked
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                    {formatClaw(activeEscrowValue.toString())}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    As Buyer
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {escrows.filter((e) => e.buyer === userAddress).length}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    As Seller
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {escrows.filter((e) => e.seller === userAddress).length}
                  </div>
                </div>
              </div>

              {escrows.length === 0 ? (
                <div className="card">
                  <p style={{ color: "var(--text2)" }}>
                    No escrows found.{" "}
                    <Link to="/escrows" style={{ color: "var(--accent)" }}>
                      View escrow marketplace
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Role</th>
                        <th>Counterparty</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Milestones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {escrows.map((e) => {
                        const isBuyer = e.buyer === userAddress;
                        const counterparty = isBuyer ? e.seller : e.buyer;
                        const done = e.milestones?.filter((m) => m.completed).length ?? 0;
                        const total = e.milestones?.length ?? 0;
                        return (
                          <tr key={e.id}>
                            <td>
                              <Link to="/escrows" className="mono" style={{ color: "var(--accent)" }}>
                                {e.id}
                              </Link>
                            </td>
                            <td>
                              <span className={`badge ${isBuyer ? "" : "badge-success"}`}>
                                {isBuyer ? "Buyer" : "Seller"}
                              </span>
                            </td>
                            <td>
                              <Link
                                to={`/explorer/account/${counterparty}`}
                                className="mono"
                                style={{ color: "var(--accent)" }}
                              >
                                {shortAddr(counterparty)}
                              </Link>
                            </td>
                            <td style={{ color: "var(--accent)", fontWeight: 600 }}>
                              {formatClaw(e.amount?.amount || "0")}
                            </td>
                            <td>
                              <span className={`badge ${STATUS_BADGE[e.status] ?? ""}`}>
                                {e.status}
                              </span>
                            </td>
                            <td>
                              {done}/{total}
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

          {/* Tasks Tab */}
          {tab === "tasks" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Total Tasks
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{tasks.length}</div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Active
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                    {activeTasks.length}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Delegated by You
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {tasks.filter((t) => t.delegator === userAddress).length}
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                    Assigned to You
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {tasks.filter((t) => t.assignee === userAddress).length}
                  </div>
                </div>
              </div>

              {tasks.length === 0 ? (
                <div className="card">
                  <p style={{ color: "var(--text2)" }}>
                    No tasks found.{" "}
                    <Link to="/tasks" style={{ color: "var(--accent)" }}>
                      View task board
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Role</th>
                        <th>Description</th>
                        <th>Budget</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => {
                        const isDelegator = t.delegator === userAddress;
                        return (
                          <tr key={t.id}>
                            <td>
                              <Link to={`/tasks/${t.id}`} className="mono" style={{ color: "var(--accent)" }}>
                                {t.id}
                              </Link>
                            </td>
                            <td>
                              <span className={`badge ${isDelegator ? "" : "badge-success"}`}>
                                {isDelegator ? "Delegator" : "Assignee"}
                              </span>
                            </td>
                            <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.description || "--"}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {formatClaw(t.budget?.amount || "0")}
                            </td>
                            <td>
                              <span className={`badge ${STATUS_BADGE[t.status] ?? ""}`}>
                                {t.status}
                              </span>
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

          {/* History Tab */}
          {tab === "history" && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Recent Transactions</h3>
              <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                Showing portfolio-affecting transactions ({txTotal} total).
              </p>

              {txs.length === 0 ? (
                <p style={{ color: "var(--text2)" }}>No transactions found.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tx Hash</th>
                      <th style={thStyle}>Summary</th>
                      <th style={thStyle}>Height</th>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.hash}>
                        <td style={tdStyle}>
                          <Link to={`/explorer/tx/${tx.hash}`} style={{ color: "var(--accent)" }}>
                            <code className="mono">{shortHash(tx.hash)}</code>
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          {decodeTxSummary(
                            tx.messages[0] ?? { typeUrl: "", value: {} },
                            userAddress
                          )}
                        </td>
                        <td style={tdStyle}>
                          <Link to={`/explorer/block/${tx.height}`} style={{ color: "var(--accent)" }}>
                            {tx.height}
                          </Link>
                        </td>
                        <td style={tdStyle}>{tx.timestamp ? timeAgo(tx.timestamp) : "--"}</td>
                        <td style={tdStyle}>
                          <span className={`badge ${tx.code === 0 ? "badge-success" : "badge-error"}`}>
                            {tx.code === 0 ? "OK" : `Err:${tx.code}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {txs.length > 0 && (
                <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text2)" }}>
                  <Link to="/wallet" style={{ color: "var(--accent)" }}>
                    View full transaction history in Wallet
                  </Link>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border, #333)",
  color: "var(--text2)",
  fontSize: "0.8rem",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border, #222)",
  fontSize: "0.875rem",
};
