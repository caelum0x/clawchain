import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getBalances,
  getAccount,
  getDelegations,
  getTxsBySender,
  getAgentInfo,
  getReputation,
  formatClaw,
  shortHash,
  shortAddr,
  type AccountBalance,
  type Delegation,
  type Tx,
  type AgentInfo,
  type Reputation,
} from "../lib/chain.ts";
import { txTypeCategory } from "../lib/decodeTxMessage.ts";
import Breadcrumbs from "../components/Breadcrumbs.tsx";
import CopyButton from "../components/CopyButton.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";

export default function AccountDetail() {
  useDocTitle("Account Detail");
  const { address } = useParams<{ address: string }>();
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [account, setAccount] = useState<{ accountNumber: string; sequence: string } | null>(null);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    (async () => {
      try {
        const [bal, acc, dels, txList, ag, rep] = await Promise.all([
          getBalances(address),
          getAccount(address),
          getDelegations(address),
          getTxsBySender(address),
          getAgentInfo(address),
          getReputation(address),
        ]);
        setBalances(bal);
        setAccount(acc);
        setDelegations(dels);
        setTxs(txList);
        setAgent(ag);
        setReputation(rep);
      } catch { /* offline */ }
      setLoading(false);
    })();
  }, [address]);

  if (loading) return <div className="loading"><div className="spinner" /><p>Loading account...</p></div>;
  if (!address) return <div className="empty">No address specified.</div>;

  const clawBal = balances.find((b) => b.denom === "uclaw");

  // Compute tx type breakdown
  const typeCounts: Record<string, number> = {};
  for (const tx of txs) {
    for (const m of tx.messages) {
      const cat = txTypeCategory(m.typeUrl);
      typeCounts[cat] = (typeCounts[cat] ?? 0) + 1;
    }
  }
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const shortAddress = address.length > 16 ? `${address.slice(0, 10)}...${address.slice(-6)}` : address;

  return (
    <>
      <Breadcrumbs items={[
        { label: "Explorer", to: "/explorer" },
        { label: "Accounts", to: "/explorer" },
        { label: shortAddress },
      ]} />
      <h1 className="page-title">Account</h1>
      <p className="page-subtitle mono" style={{ wordBreak: "break-all", display: "inline-flex", alignItems: "center", gap: 8 }}>{address} <CopyButton text={address} /></p>

      <div className="grid-4">
        <div className="card">
          <h3>Balance</h3>
          <div className="value accent">{clawBal ? formatClaw(clawBal.amount) : "0 CLAW"}</div>
        </div>
        <div className="card">
          <h3>Account #</h3>
          <div className="value">{account?.accountNumber ?? "--"}</div>
        </div>
        <div className="card">
          <h3>Sequence</h3>
          <div className="value">{account?.sequence ?? "0"}</div>
        </div>
        <div className="card">
          <h3>Agent</h3>
          <div className="value">{agent ? "Registered" : "None"}</div>
        </div>
      </div>

      {balances.length > 1 && (
        <div className="table-wrap">
          <h2>All Balances</h2>
          <table>
            <thead>
              <tr>
                <th>Denom</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.denom}>
                  <td className="mono">{b.denom}</td>
                  <td>{b.denom === "uclaw" ? formatClaw(b.amount) : Number(b.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delegations with clickable validator addresses */}
      {delegations.length > 0 && (
        <div className="table-wrap">
          <h2>Delegations ({delegations.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Validator</th>
                <th>Amount</th>
                <th>Shares</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map((d) => (
                <tr key={d.validatorAddress}>
                  <td>
                    <Link
                      to={`/explorer/account/${d.validatorAddress}`}
                      className="mono"
                      title={d.validatorAddress}
                    >
                      {shortAddr(d.validatorAddress)}
                    </Link>
                  </td>
                  <td>{d.denom === "uclaw" ? formatClaw(d.amount) : `${d.amount} ${d.denom}`}</td>
                  <td className="mono">{Number(d.shares).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {agent && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Agent Profile</h3>
          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><td style={{ color: "var(--text2)", width: 140 }}>Name</td><td>{agent.name}</td></tr>
              <tr><td style={{ color: "var(--text2)" }}>Endpoint</td><td className="mono">{agent.endpoint || "--"}</td></tr>
              <tr><td style={{ color: "var(--text2)" }}>Status</td><td><span className={`badge ${agent.active ? "success" : "warning"}`}>{agent.active ? "Active" : "Inactive"}</span></td></tr>
              <tr><td style={{ color: "var(--text2)" }}>Tools</td><td className="mono">{agent.supportedTools.length > 0 ? agent.supportedTools.join(", ") : "--"}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {reputation && parseInt(reputation.totalRatings) > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Reputation</h3>
          <div className="grid-4" style={{ marginTop: 12, marginBottom: 0 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>Rating</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{(parseInt(reputation.avgRatingBps) / 100).toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>Total Ratings</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{reputation.totalRatings}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>Endorsements</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{reputation.endorsementCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tx type breakdown */}
      {sortedTypes.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Transaction Type Breakdown</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
            {sortedTypes.map(([cat, count]) => (
              <div
                key={cat}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "var(--bg2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{cat}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {txs.length > 0 && (
        <div className="table-wrap">
          <h2>Recent Transactions ({txs.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Hash</th>
                <th>Block</th>
                <th>Status</th>
                <th>Messages</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.hash}>
                  <td>
                    <Link to={`/explorer/tx/${tx.hash}`} className="mono">
                      {shortHash(tx.hash)}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/explorer/block/${tx.height}`}>
                      {Number(tx.height).toLocaleString()}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${tx.code === 0 ? "success" : "error"}`}>
                      {tx.code === 0 ? "Success" : `Error ${tx.code}`}
                    </span>
                  </td>
                  <td className="mono">
                    {tx.messages.map((m) => m.typeUrl.split(".").pop()).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
