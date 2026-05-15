import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getLiveAgents,
  getTopAgents,
  getValidators,
  getRewardLeaderboard,
  getReputation,
  formatClaw,
  shortAddr,
  type AgentInfo,
  type Reputation,
  type Validator,
} from "../lib/chain.ts";

type Tab = "agents" | "validators" | "earners";

interface AgentLeaderEntry {
  address: string;
  name: string;
  reputationScore: number;
  totalRatings: number;
  endorsements: number;
  earnings: string;
}

function scoreColor(score: number): string {
  if (score >= 90) return "var(--green)";
  if (score >= 75) return "var(--yellow)";
  if (score >= 60) return "var(--accent)";
  return "var(--red)";
}

function uptimeColor(uptime: number): string {
  if (uptime >= 99.9) return "var(--green)";
  if (uptime >= 99.5) return "var(--yellow)";
  return "var(--red)";
}

export default function Leaderboard() {
  useDocTitle("Leaderboard");
  const [tab, setTab] = useState<Tab>("agents");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentLeaderEntry[]>([]);
  const [validators, setValidators] = useState<Validator[]>([]);
  const [earners, setEarners] = useState<{ address: string; name: string; cumulativeRewards: string }[]>([]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "agents", label: "Top Agents" },
    { key: "validators", label: "Top Validators" },
    { key: "earners", label: "Top Earners" },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [liveAgents, topReputations, vals, rewardBoard] = await Promise.all([
          getLiveAgents(),
          getTopAgents(),
          getValidators(),
          getRewardLeaderboard(),
        ]);

        if (cancelled) return;

        // Build agent leaderboard: merge live agents with reputation data
        const repByAddr = new Map<string, Reputation>();
        for (const r of topReputations) {
          repByAddr.set(r.agentAddress, r);
        }

        // For live agents without reputation data, try to fetch
        const agentEntries: AgentLeaderEntry[] = [];
        const needReputation: AgentInfo[] = [];

        for (const agent of liveAgents) {
          const rep = repByAddr.get(agent.address);
          if (rep) {
            const avgBps = parseInt(rep.avgRatingBps || "0");
            // avgRatingBps is 0-10000, convert to 0-100
            const score = avgBps / 100;
            agentEntries.push({
              address: agent.address,
              name: agent.name || shortAddr(agent.address),
              reputationScore: score,
              totalRatings: parseInt(rep.totalRatings || "0"),
              endorsements: parseInt(rep.endorsementCount || "0"),
              earnings: "0", // will be filled from rewards
            });
          } else {
            needReputation.push(agent);
          }
        }

        // Also add top reputations not in live agents
        for (const rep of topReputations) {
          if (!liveAgents.find((a) => a.address === rep.agentAddress)) {
            const avgBps = parseInt(rep.avgRatingBps || "0");
            agentEntries.push({
              address: rep.agentAddress,
              name: shortAddr(rep.agentAddress),
              reputationScore: avgBps / 100,
              totalRatings: parseInt(rep.totalRatings || "0"),
              endorsements: parseInt(rep.endorsementCount || "0"),
              earnings: "0",
            });
          }
        }

        // Fetch reputation for agents missing it (up to 10)
        const repFetches = needReputation.slice(0, 10).map(async (agent) => {
          const rep = await getReputation(agent.address);
          if (rep) {
            const avgBps = parseInt(rep.avgRatingBps || "0");
            return {
              address: agent.address,
              name: agent.name || shortAddr(agent.address),
              reputationScore: avgBps / 100,
              totalRatings: parseInt(rep.totalRatings || "0"),
              endorsements: parseInt(rep.endorsementCount || "0"),
              earnings: "0",
            };
          }
          return {
            address: agent.address,
            name: agent.name || shortAddr(agent.address),
            reputationScore: 0,
            totalRatings: 0,
            endorsements: 0,
            earnings: "0",
          };
        });

        const moreEntries = await Promise.all(repFetches);
        agentEntries.push(...moreEntries);

        // Merge earnings from reward leaderboard
        const rewardByAddr = new Map(rewardBoard.map((r) => [r.address, r.cumulativeRewards]));
        for (const entry of agentEntries) {
          entry.earnings = rewardByAddr.get(entry.address) || "0";
        }

        // Sort by reputation descending
        agentEntries.sort((a, b) => b.reputationScore - a.reputationScore);

        if (!cancelled) {
          setAgents(agentEntries);
          setValidators(vals);
          setEarners(rewardBoard);
        }
      } catch {
        if (!cancelled) setError("Failed to load leaderboard data. Is the chain running?");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) => a.address.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [agents, search]);

  const filteredValidators = useMemo(() => {
    if (!search.trim()) return validators;
    const q = search.toLowerCase();
    return validators.filter(
      (v) => v.operatorAddress.toLowerCase().includes(q) || v.moniker.toLowerCase().includes(q)
    );
  }, [validators, search]);

  const filteredEarners = useMemo(() => {
    if (!search.trim()) return earners;
    const q = search.toLowerCase();
    return earners.filter((e) => e.address.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [earners, search]);

  // Summary stats
  const totalAgents = agents.length;
  const avgReputation = totalAgents > 0
    ? agents.reduce((s, a) => s + a.reputationScore, 0) / totalAgents
    : 0;
  const totalRatings = agents.reduce((s, a) => s + a.totalRatings, 0);
  const totalEarnings = earners.reduce((s, e) => s + BigInt(e.cumulativeRewards || "0"), 0n);

  return (
    <div>
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-subtitle" style={{ color: "var(--text2)", marginBottom: "1.5rem" }}>
        Top agents, validators, and contributors across the ClawChain network.
      </p>

      {error && (
        <div style={{ marginBottom: "1.5rem", padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading leaderboard data...</p>
        </div>
      )}

      {!loading && (
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
                Ranked Agents
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{totalAgents}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Avg Reputation
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: scoreColor(avgReputation) }}>
                {avgReputation.toFixed(1)}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total Ratings
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                {totalRatings.toLocaleString()}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total Earnings
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                {formatClaw(totalEarnings.toString())}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`btn ${tab === t.key ? "btn-primary" : ""}`}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ marginBottom: "1.5rem" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by address or name..."
              data-testid="search-input"
              style={{
                minWidth: "200px",
                maxWidth: "400px",
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius, 6px)",
                color: "var(--text)",
                fontSize: "0.875rem",
              }}
            />
          </div>

          {/* Top Agents */}
          {tab === "agents" && (
            <div className="card" style={{ overflowX: "auto" }} data-testid="agents-tab">
              <h3 style={{ marginBottom: "1rem" }}>Top Agents</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Agent</th>
                    <th style={thStyle}>Reputation</th>
                    <th style={thStyle}>Ratings</th>
                    <th style={thStyle}>Endorsements</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                        {agents.length === 0
                          ? "No agents registered on chain yet."
                          : "No agents match the current filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((a, i) => (
                      <tr key={a.address} style={{ borderBottom: "1px solid var(--border)" }} data-testid="agent-row">
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700, color: i < 3 ? "var(--accent)" : "var(--text2)" }}>
                            {i + 1}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              <Link to="/agents" style={{ color: "var(--text)", textDecoration: "none" }}>
                                {a.name}
                              </Link>
                            </div>
                            <div className="mono" style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                              {shortAddr(a.address)}
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, color: scoreColor(a.reputationScore), minWidth: 30 }}>
                              {a.reputationScore.toFixed(0)}
                            </span>
                            <div style={{ flex: 1, maxWidth: 80, height: 6, background: "var(--border)", borderRadius: 3 }}>
                              <div
                                style={{
                                  width: `${Math.min(100, a.reputationScore)}%`,
                                  height: "100%",
                                  background: scoreColor(a.reputationScore),
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>{a.totalRatings}</td>
                        <td style={tdStyle}>{a.endorsements}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <span className="mono" style={{ fontWeight: 600, color: "var(--accent)" }}>
                            {formatClaw(a.earnings)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Top Validators */}
          {tab === "validators" && (
            <div className="card" style={{ overflowX: "auto" }} data-testid="validators-tab">
              <h3 style={{ marginBottom: "1rem" }}>Top Validators</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Moniker</th>
                    <th style={thStyle}>Voting Power</th>
                    <th style={thStyle}>Commission</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredValidators.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                        {validators.length === 0
                          ? "No validators bonded yet."
                          : "No validators match the current filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredValidators.map((v, i) => (
                      <tr key={v.operatorAddress} style={{ borderBottom: "1px solid var(--border)" }} data-testid="validator-row">
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700, color: i < 3 ? "var(--accent)" : "var(--text2)" }}>
                            {i + 1}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              <Link to={`/validators/${v.operatorAddress}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                                {v.moniker || shortAddr(v.operatorAddress)}
                              </Link>
                            </div>
                            <div className="mono" style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                              {shortAddr(v.operatorAddress)}
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span className="mono" style={{ fontWeight: 600 }}>
                            {formatClaw(v.tokens)}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {(parseFloat(v.commission) * 100).toFixed(1)}%
                        </td>
                        <td style={tdStyle}>
                          <span className={`badge ${v.jailed ? "badge-error" : "badge-success"}`}>
                            {v.jailed ? "Jailed" : "Active"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Top Earners */}
          {tab === "earners" && (
            <div className="card" style={{ overflowX: "auto" }} data-testid="earners-tab">
              <h3 style={{ marginBottom: "1rem" }}>Top Earners</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Agent</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Total Earned (CLAW)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEarners.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                        {earners.length === 0
                          ? "No agent rewards distributed yet."
                          : "No earners match the current filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredEarners.map((e, i) => (
                      <tr key={e.address} style={{ borderBottom: "1px solid var(--border)" }} data-testid="earner-row">
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700, color: i < 3 ? "var(--accent)" : "var(--text2)" }}>
                            {i + 1}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{e.name || shortAddr(e.address)}</div>
                            <Link
                              to={`/explorer/account/${e.address}`}
                              className="mono"
                              style={{ color: "var(--accent)", fontSize: "0.75rem" }}
                            >
                              {shortAddr(e.address)}
                            </Link>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <span className="mono" style={{ fontWeight: 700, color: "#22c55e" }}>
                            {formatClaw(e.cumulativeRewards)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  color: "var(--text2)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
};
