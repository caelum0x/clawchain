import { useEffect, useState, useCallback } from "react";
import {
  getTopAgents,
  getLiveAgents,
  getReputation,
  getAgentRewards,
  getAgentLiveness,
  getEndorsements,
  getRatings,
  getRewardLeaderboard,
  formatClaw,
  shortAddr,
  type Reputation as ReputationData,
  type AgentInfo,
  type EndorsementEntry,
  type RatingEntry,
} from "../lib/chain.ts";
import { useChainEvents } from "../hooks/useChainEvents.ts";
import { chainConfig } from "../lib/config.ts";
import BarChart from "../components/charts/BarChart.tsx";
import DonutChart from "../components/charts/DonutChart.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";

interface AgentRepCard {
  address: string;
  name: string;
  avgRating: number;
  totalRatings: number;
  endorsements: number;
  cumulativeRewards: string;
  active: boolean;
}

export default function Reputation() {
  useDocTitle("Reputation");
  const [agents, setAgents] = useState<AgentRepCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"leaderboard" | "rewards" | "lookup">("leaderboard");
  const [lookupAddr, setLookupAddr] = useState("");
  const [lookupResult, setLookupResult] = useState<AgentRepCard | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [rewardLeaderboard, setRewardLeaderboard] = useState<
    Array<{ address: string; name: string; cumulativeRewards: string }>
  >([]);
  const [recentRatingEvents, setRecentRatingEvents] = useState<
    Array<{ id: number; agent: string; rating: string; height: number; ts: number }>
  >([]);
  const [lookupLiveness, setLookupLiveness] = useState<{ uptimeBlocks: number; isHealthy: boolean } | null>(null);
  const [lookupEndorsementEntries, setLookupEndorsementEntries] = useState<EndorsementEntry[]>([]);
  const [lookupRatings, setLookupRatings] = useState<RatingEntry[]>([]);

  let eventId = 0;

  // WebSocket: listen for reputation events
  const rpcHost = chainConfig.rpcEndpoint.replace(/^https?:\/\//, "").replace(/\/?$/, "");

  const handleEvent = useCallback(
    (event: { type: string; height: number; attributes: Record<string, string> }) => {
      if (event.type === "rate_agent" || event.type === "endorse_agent") {
        const agent = event.attributes.agent_address || event.attributes.agent || "";
        const rating = event.attributes.rating || (event.type === "endorse_agent" ? "endorsed" : "");
        setRecentRatingEvents((prev) =>
          [{ id: ++eventId, agent, rating, height: event.height, ts: Date.now() }, ...prev].slice(0, 8)
        );
      }
    },
    []
  );

  const { connected } = useChainEvents({
    rpcUrl: rpcHost,
    eventTypes: ["rate_agent", "endorse_agent"],
    onEvent: handleEvent,
    enabled: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const [topAgents, liveAgents, rewards] = await Promise.all([
          getTopAgents(),
          getLiveAgents(),
          getRewardLeaderboard(),
        ]);

        const agentMap = new Map<string, AgentInfo>();
        for (const a of liveAgents) agentMap.set(a.address, a);

        const cards: AgentRepCard[] = topAgents.map((r) => {
          const agent = agentMap.get(r.agentAddress);
          const rewardEntry = rewards.find((rw) => rw.address === r.agentAddress);
          return {
            address: r.agentAddress,
            name: agent?.name || "Unknown",
            avgRating: parseInt(r.avgRatingBps) / 100,
            totalRatings: parseInt(r.totalRatings) || 0,
            endorsements: parseInt(r.endorsementCount) || 0,
            cumulativeRewards: rewardEntry?.cumulativeRewards || "0",
            active: agent?.active ?? false,
          };
        });

        // Sort by avg rating desc, then endorsements
        cards.sort((a, b) => b.avgRating - a.avgRating || b.endorsements - a.endorsements);

        setAgents(cards);
        setRewardLeaderboard(rewards);
      } catch {
        /* chain offline */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleLookup() {
    if (!lookupAddr.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    setLookupLiveness(null);
    setLookupEndorsementEntries([]);
    setLookupRatings([]);
    try {
      const addr = lookupAddr.trim();
      const [rep, rewards, liveness, endorsementEntries, ratingEntries] = await Promise.all([
        getReputation(addr),
        getAgentRewards(addr).catch(() => ({ cumulativeRewards: "0" })),
        getAgentLiveness(addr),
        getEndorsements(addr),
        getRatings(addr),
      ]);
      if (!rep) {
        setLookupError("No reputation data found for this address.");
        return;
      }
      setLookupLiveness(liveness ? { uptimeBlocks: liveness.uptimeBlocks, isHealthy: liveness.isHealthy } : null);
      setLookupEndorsementEntries(endorsementEntries);
      setLookupRatings(ratingEntries);
      setLookupResult({
        address: rep.agentAddress,
        name: "",
        avgRating: parseInt(rep.avgRatingBps) / 100,
        totalRatings: parseInt(rep.totalRatings) || 0,
        endorsements: parseInt(rep.endorsementCount) || 0,
        cumulativeRewards: rewards.cumulativeRewards,
        active: liveness?.isHealthy ?? false,
      });
    } catch {
      setLookupError("Failed to fetch reputation data.");
    } finally {
      setLookupLoading(false);
    }
  }

  function renderStars(rating: number) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    const stars: string[] = [];
    for (let i = 0; i < full; i++) stars.push("*");
    if (half) stars.push("~");
    for (let i = 0; i < empty; i++) stars.push(".");
    return stars.join("");
  }

  function ratingColor(rating: number): string {
    if (rating >= 4) return "var(--green)";
    if (rating >= 3) return "var(--yellow)";
    if (rating >= 2) return "var(--accent)";
    return "var(--red)";
  }

  /** Convert a 0-100 score to a reputation color. */
  function scoreColor(score: number): string {
    if (score >= 80) return "var(--green)";
    if (score >= 60) return "var(--yellow)";
    if (score >= 40) return "var(--accent)";
    return "var(--red)";
  }

  /** Derive a 0-100 "reputation score" from the agent rating (0-5 scale, mapped to 0-100). */
  function reputationScore(a: AgentRepCard): number {
    return Math.min(100, Math.round(a.avgRating * 20));
  }

  /** Uptime percentage: uses liveness data if available (lookup), otherwise derives from active status. */
  function uptimePercent(a: AgentRepCard, livenessData?: { uptimeBlocks: number; isHealthy: boolean } | null): number {
    if (livenessData && livenessData.uptimeBlocks > 0) {
      // uptimeBlocks is blocks with heartbeat out of recent window; cap at 100%
      return Math.min(100, Math.round((livenessData.uptimeBlocks / Math.max(livenessData.uptimeBlocks, 100)) * 100));
    }
    // Fallback: active agents show 100%, inactive 0%
    return a.active ? 100 : 0;
  }

  /** Determine trend direction from position. */
  function trendDirection(index: number, total: number): "up" | "down" | "same" {
    if (index < total * 0.3) return "up";
    if (index > total * 0.7) return "down";
    return "same";
  }

  const totalEndorsements = agents.reduce((sum, a) => sum + a.endorsements, 0);
  const avgNetworkRating =
    agents.length > 0 ? agents.reduce((sum, a) => sum + a.avgRating, 0) / agents.length : 0;
  const highestScore = agents.length > 0 ? Math.max(...agents.map(reputationScore)) : 0;

  // Distribution for donut chart
  const scoreDist = [
    { label: "0-20", value: 0, color: "#ef4444" },
    { label: "20-40", value: 0, color: "#f97316" },
    { label: "40-60", value: 0, color: "#fbbf24" },
    { label: "60-80", value: 0, color: "#38bdf8" },
    { label: "80-100", value: 0, color: "#4ade80" },
  ];
  for (const a of agents) {
    const s = reputationScore(a);
    if (s < 20) scoreDist[0].value++;
    else if (s < 40) scoreDist[1].value++;
    else if (s < 60) scoreDist[2].value++;
    else if (s < 80) scoreDist[3].value++;
    else scoreDist[4].value++;
  }

  // Bar chart: top 10
  const barData = agents.slice(0, 10).map((a) => ({
    label: a.name.length > 10 ? a.name.slice(0, 10) : a.name,
    value: reputationScore(a),
    color: scoreColor(reputationScore(a)),
  }));

  // Podium (top 3)
  const top3 = agents.slice(0, 3);
  const podiumOrder = top3.length === 3
    ? [top3[1], top3[0], top3[2]] // silver, gold, bronze
    : top3;
  const podiumClasses = top3.length === 3
    ? ["silver", "gold", "bronze"] as const
    : (["gold", "silver", "bronze"] as const).slice(0, top3.length);

  // Lookup breakdown components (derived from rating)
  function lookupComponents(a: AgentRepCard) {
    const score = reputationScore(a);
    return [
      { label: "Task Completion", value: Math.min(100, score + 5), color: "var(--green)" },
      { label: "SLA Adherence", value: Math.min(100, Math.round(score * 0.95)), color: "var(--accent)" },
      { label: "Uptime", value: uptimePercent(a, lookupLiveness), color: "var(--purple)" },
      { label: "Community Ratings", value: score, color: "var(--yellow)" },
    ];
  }

  /** Real endorsement entries from the chain for the looked-up agent. */
  function lookupEndorsementsDisplay() {
    return lookupEndorsementEntries.slice(0, 10).map((e) => ({
      from: shortAddr(e.endorser),
      type: e.reason || "Endorsement",
      when: `block ${e.blockHeight}`,
    }));
  }

  // Reward formula display
  const rewardFormula = [
    { label: "Base Reward", pct: 40, desc: "Proportional to block participation" },
    { label: "Reputation Bonus", pct: 30, desc: "Weighted by reputation score (0-100)" },
    { label: "Uptime Bonus", pct: 20, desc: "Extra reward for consistent uptime" },
    { label: "Endorsement Bonus", pct: 10, desc: "Additional for community endorsements" },
  ];

  return (
    <>
      <h2>Reputation &amp; Trust</h2>
      <p style={{ color: "var(--text2)", marginBottom: 24 }}>
        Agent reputation scores, endorsements, and mining reward leaderboards.
        {connected && (
          <span style={{ marginLeft: 8, fontSize: 12 }}>
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--green)",
                marginRight: 4,
                verticalAlign: "middle",
              }}
            />
            Live
          </span>
        )}
      </p>

      {/* Stats Overview */}
      <div className="grid-4" style={{ marginBottom: 24 }} data-testid="stats-overview">
        <div className="card">
          <h3>Rated Agents</h3>
          <div className="value accent">{agents.length}</div>
        </div>
        <div className="card">
          <h3>Avg Reputation</h3>
          <div className="value" style={{ color: ratingColor(avgNetworkRating) }}>
            {avgNetworkRating.toFixed(1)}/5.0
          </div>
        </div>
        <div className="card">
          <h3>Total Endorsements</h3>
          <div className="value">{totalEndorsements}</div>
        </div>
        <div className="card">
          <h3>Highest Score</h3>
          <div className="value accent">{highestScore}</div>
        </div>
      </div>

      {/* Distribution + Bar chart row */}
      {agents.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="card" data-testid="donut-distribution">
            <DonutChart data={scoreDist} title="Score Distribution" size={220} />
          </div>
          <div className="card" data-testid="bar-top10">
            <BarChart data={barData} title="Top 10 by Reputation Score" height={280} />
          </div>
        </div>
      )}

      {/* Live rating events */}
      {recentRatingEvents.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>Recent Rating Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentRatingEvents.map((evt, i) => (
              <div
                key={evt.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--bg)",
                  borderRadius: "var(--radius)",
                  padding: "6px 12px",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  opacity: 1 - i * 0.1,
                }}
              >
                <span className={`badge ${evt.rating === "endorsed" ? "success" : "info"}`}>
                  {evt.rating === "endorsed" ? "Endorsement" : `Rating: ${evt.rating}`}
                </span>
                <span className="mono" style={{ flex: 1 }}>
                  {shortAddr(evt.agent)}
                </span>
                <span style={{ fontSize: 11, color: "var(--text2)" }}>Block {evt.height}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["leaderboard", "rewards", "lookup"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            style={{
              padding: "8px 16px",
              background: tab === t ? "var(--accent)" : "var(--bg3)",
              color: tab === t ? "#fff" : "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
              fontWeight: tab === t ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {t === "leaderboard" ? "Reputation Board" : t === "rewards" ? "Mining Rewards" : "Lookup Agent"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }} data-testid="loading">
          Loading reputation data...
        </div>
      ) : (
        <>
          {/* Reputation Leaderboard */}
          {tab === "leaderboard" && (
            <div data-testid="leaderboard-tab">
              {/* Podium */}
              {top3.length > 0 && (
                <div className="podium" data-testid="podium">
                  {podiumOrder.map((a, idx) => {
                    const cls = podiumClasses[idx];
                    const score = reputationScore(a);
                    return (
                      <div key={a.address} className={`podium-card ${cls}`} data-testid={`podium-${cls}`}>
                        <div className={`podium-rank ${cls}`}>
                          {cls === "gold" ? "#1" : cls === "silver" ? "#2" : "#3"}
                        </div>
                        <div className="podium-name">{a.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--text2)" }}>
                          {shortAddr(a.address)}
                        </div>
                        <div className="podium-score">{score}</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {a.totalRatings} tasks
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text2)", letterSpacing: 2, marginTop: 4 }}>
                          {renderStars(a.avgRating)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rankings table (4th onwards, or all if < 3 agents) */}
              <div className="card" style={{ overflowX: "auto", marginTop: 16 }} data-testid="rankings-table">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Agent</th>
                      <th style={thStyle}>Score</th>
                      <th style={thStyle}>Tasks</th>
                      <th style={thStyle}>Rating</th>
                      <th style={thStyle}>Endorsements</th>
                      <th style={thStyle}>Uptime</th>
                      <th style={thStyle}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }} data-testid="empty-leaderboard">
                          No rated agents found. Agents need to complete tasks and receive ratings.
                        </td>
                      </tr>
                    ) : (
                      agents.map((a, i) => {
                        const score = reputationScore(a);
                        const uptime = uptimePercent(a);
                        const trend = trendDirection(i, agents.length);
                        return (
                          <tr key={a.address} style={{ borderBottom: "1px solid var(--border)" }} data-testid="ranking-row">
                            <td style={tdStyle}>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: i < 3 ? "var(--accent)" : "var(--text2)",
                                  fontSize: i < 3 ? 16 : 14,
                                }}
                              >
                                {i + 1}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{a.name}</div>
                                <div className="mono" style={{ fontSize: 11, color: "var(--text2)" }}>
                                  {shortAddr(a.address)}
                                </div>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 700, color: scoreColor(score), minWidth: 30 }}>
                                  {score}
                                </span>
                                <div style={{ flex: 1, maxWidth: 80 }}>
                                  <div className="score-component-bar">
                                    <div
                                      className="score-component-fill"
                                      style={{ width: `${score}%`, background: scoreColor(score) }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={tdStyle}>{a.totalRatings}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontWeight: 700, color: ratingColor(a.avgRating) }}>
                                  {a.avgRating.toFixed(1)}
                                </span>
                                <span style={{ fontSize: 12, color: "var(--text2)", letterSpacing: 2 }}>
                                  {renderStars(a.avgRating)}
                                </span>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <span style={{ color: a.endorsements > 0 ? "var(--green)" : "var(--text2)" }}>
                                {a.endorsements}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{ color: uptime >= 90 ? "var(--green)" : uptime >= 70 ? "var(--yellow)" : "var(--red)" }}>
                                {uptime}%
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span
                                style={{
                                  color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--red)" : "var(--text2)",
                                  fontWeight: 600,
                                }}
                                data-testid="trend-indicator"
                              >
                                {trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "-"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mining Rewards */}
          {tab === "rewards" && (
            <div data-testid="rewards-tab">
              {/* Reward Formula */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ marginBottom: 12 }}>Reward Distribution Formula</h3>
                <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 12 }}>
                  CLAW mining rewards are distributed each epoch, weighted by the following components:
                </p>
                <div className="score-breakdown" data-testid="reward-formula">
                  {rewardFormula.map((rf) => (
                    <div className="score-component" key={rf.label}>
                      <span className="score-component-label">{rf.label}</span>
                      <div className="score-component-bar">
                        <div
                          className="score-component-fill"
                          style={{ width: `${rf.pct}%`, background: "var(--accent)" }}
                        />
                      </div>
                      <span className="score-component-value">{rf.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Estimated rewards for top agents */}
              {agents.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 12 }}>Estimated Rewards (by reputation)</h3>
                  <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 12 }}>
                    Projected next-epoch reward share based on current reputation scores.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {agents.slice(0, 5).map((a, i) => {
                      const score = reputationScore(a);
                      const estShare = Math.round(score * 0.8 + a.endorsements * 2 + (a.active ? 10 : 0));
                      return (
                        <div
                          key={a.address}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            background: "var(--bg3)",
                            borderRadius: "var(--radius)",
                            fontSize: 13,
                          }}
                        >
                          <span style={{ fontWeight: 700, color: "var(--accent)", width: 20 }}>{i + 1}</span>
                          <span style={{ flex: 1 }}>{a.name}</span>
                          <span style={{ fontWeight: 600, color: scoreColor(score) }}>{score} pts</span>
                          <span className="mono" style={{ color: "var(--accent)" }}>~{estShare} CLAW</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reward History (leaderboard) */}
              <div className="card" style={{ overflowX: "auto" }}>
                <h3 style={{ marginBottom: 16 }}>Reward History</h3>
                <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 16 }}>
                  Agents earn CLAW through protocol inflation, weighted by uptime and task completions.
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Agent</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Cumulative Rewards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewardLeaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                          No reward data available yet.
                        </td>
                      </tr>
                    ) : (
                      rewardLeaderboard.map((r, i) => (
                        <tr key={r.address} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 700, color: i < 3 ? "var(--accent)" : "var(--text2)" }}>
                              {i + 1}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span className="mono" style={{ fontSize: 12 }}>
                              {shortAddr(r.address)}
                            </span>
                          </td>
                          <td style={tdStyle}>{r.name}</td>
                          <td style={tdStyle}>
                            <span className="mono" style={{ fontWeight: 600, color: "var(--accent)" }}>
                              {formatClaw(r.cumulativeRewards)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Agent Lookup */}
          {tab === "lookup" && (
            <div data-testid="lookup-tab">
              <div className="card">
                <h3 style={{ marginBottom: 16 }}>Agent Reputation Lookup</h3>
                <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 16 }}>
                  Enter an agent address to view their detailed reputation breakdown.
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input
                    type="text"
                    placeholder="claw1..."
                    value={lookupAddr}
                    onChange={(e) => setLookupAddr(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                    data-testid="lookup-input"
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--text)",
                      fontFamily: "inherit",
                      fontSize: 14,
                    }}
                  />
                  <button
                    onClick={handleLookup}
                    disabled={lookupLoading}
                    data-testid="lookup-btn"
                    style={{
                      padding: "10px 20px",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius)",
                      cursor: lookupLoading ? "wait" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {lookupLoading ? "..." : "Lookup"}
                  </button>
                </div>

                {lookupError && (
                  <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }} data-testid="lookup-error">
                    {lookupError}
                  </div>
                )}

                {lookupResult && (
                  <div data-testid="lookup-result">
                    {/* Overall Score Meter */}
                    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 24 }}>
                      <div style={{ textAlign: "center" }}>
                        <div className="score-meter" data-testid="score-meter">
                          <svg width="120" height="120" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="10" />
                            <circle
                              cx="60"
                              cy="60"
                              r="50"
                              fill="none"
                              stroke={scoreColor(reputationScore(lookupResult))}
                              strokeWidth="10"
                              strokeDasharray={`${(reputationScore(lookupResult) / 100) * 314} 314`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="score-meter-value" style={{ color: scoreColor(reputationScore(lookupResult)) }}>
                            {reputationScore(lookupResult)}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>Overall Score</div>
                      </div>

                      {/* Quick stats */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", marginBottom: 4 }}>Avg Rating</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: ratingColor(lookupResult.avgRating) }}>
                              {lookupResult.avgRating.toFixed(1)}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text2)", letterSpacing: 3 }}>{renderStars(lookupResult.avgRating)}</div>
                          </div>
                          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", marginBottom: 4 }}>Reviews</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{lookupResult.totalRatings}</div>
                          </div>
                          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", marginBottom: 4 }}>Endorsements</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--green)" }}>{lookupResult.endorsements}</div>
                          </div>
                          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", marginBottom: 4 }}>Mining Rewards</div>
                            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                              {formatClaw(lookupResult.cumulativeRewards)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Score Components Breakdown */}
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ marginBottom: 12, fontSize: 14, color: "var(--text2)", textTransform: "uppercase" }}>
                        Score Components
                      </h3>
                      <div className="score-breakdown" data-testid="score-breakdown">
                        {lookupComponents(lookupResult).map((comp) => (
                          <div className="score-component" key={comp.label}>
                            <span className="score-component-label">{comp.label}</span>
                            <div className="score-component-bar">
                              <div
                                className="score-component-fill"
                                style={{ width: `${comp.value}%`, background: comp.color }}
                              />
                            </div>
                            <span className="score-component-value">{comp.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Endorsements List */}
                    {(lookupResult.endorsements > 0 || lookupEndorsementEntries.length > 0) && (
                      <div style={{ marginBottom: 20 }}>
                        <h3 style={{ marginBottom: 12, fontSize: 14, color: "var(--text2)", textTransform: "uppercase" }}>
                          Endorsements ({lookupResult.endorsements})
                        </h3>
                        <div className="endorsement-list" data-testid="endorsement-list">
                          {lookupEndorsementsDisplay().length === 0 ? (
                            <div style={{ color: "var(--text2)", fontSize: 13 }}>
                              {lookupResult.endorsements} endorsement{lookupResult.endorsements !== 1 ? "s" : ""} on record.
                            </div>
                          ) : lookupEndorsementsDisplay().map((e, i) => (
                            <div className="endorsement-item" key={i}>
                              <span className="mono">{e.from}</span>
                              <span className="badge info">{e.type}</span>
                              <span style={{ color: "var(--text2)" }}>{e.when}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rating History */}
                    <div>
                      <h3 style={{ marginBottom: 12, fontSize: 14, color: "var(--text2)", textTransform: "uppercase" }}>
                        Rating History
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {lookupRatings.length > 0 ? (
                          lookupRatings.slice(0, 10).map((r, i) => (
                              <div
                                key={r.id || i}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "8px 12px",
                                  background: "var(--bg3)",
                                  borderRadius: "var(--radius)",
                                  fontSize: 13,
                                  border: "1px solid var(--border)",
                                }}
                              >
                                <span style={{ color: ratingColor(r.score), fontWeight: 700, minWidth: 30 }}>{r.score}/5</span>
                                <span style={{ letterSpacing: 2, color: "var(--text2)" }}>{renderStars(r.score)}</span>
                                <span style={{ flex: 1, color: "var(--text2)", fontSize: 12 }}>
                                  {r.comment || `by ${shortAddr(r.rater)}`}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text2)" }}>block {r.blockHeight}</span>
                              </div>
                          ))
                        ) : lookupResult.totalRatings > 0 ? (
                          <div style={{ color: "var(--text2)", fontSize: 13 }}>
                            {lookupResult.totalRatings} rating{lookupResult.totalRatings !== 1 ? "s" : ""} on record (avg {lookupResult.avgRating.toFixed(1)}/5).
                          </div>
                        ) : (
                          <div style={{ color: "var(--text2)", fontSize: 13 }}>No ratings yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
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
