import { useEffect, useState, useRef } from "react";
import {
  getRecentBlocks,
  getValidators,
  getLiveAgents,
  getSkills,
  getComputeJobs,
  getNegotiations,
  getModels,
  formatClaw,
  shortAddr,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import LineChart from "../components/charts/LineChart.tsx";
import BarChart from "../components/charts/BarChart.tsx";
import DonutChart from "../components/charts/DonutChart.tsx";
import StatCard from "../components/charts/StatCard.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";

interface BlockTiming {
  height: number;
  time: string;
  delta: number;
  txCount: number;
}

interface ValidatorSummary {
  moniker: string;
  tokens: string;
  status: string;
  operatorAddress: string;
}

interface ModuleActivity {
  agents: number;
  skills: number;
  computeJobs: number;
  negotiations: number;
  models: number;
}

export default function Analytics() {
  useDocTitle("Analytics");
  const [blockTimings, setBlockTimings] = useState<BlockTiming[]>([]);
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [moduleActivity, setModuleActivity] = useState<ModuleActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadData() {
    try {
      const [blocks, vals, agents, skills, jobs, negotiations, models] = await Promise.all([
        getRecentBlocks(50),
        getValidators(),
        getLiveAgents(),
        getSkills().catch(() => []),
        getComputeJobs().catch(() => []),
        getNegotiations().catch(() => []),
        getModels().catch(() => []),
      ]);

      // Build block timings
      const timings: BlockTiming[] = [];
      for (let i = 0; i < blocks.length - 1; i++) {
        const curr = new Date(blocks[i].time).getTime();
        const prev = new Date(blocks[i + 1].time).getTime();
        timings.push({
          height: Number(blocks[i].height),
          time: blocks[i].time,
          delta: (curr - prev) / 1000,
          txCount: blocks[i].txCount,
        });
      }
      setBlockTimings(timings);

      // Validators
      setValidators(
        vals.map((v: any) => ({
          moniker: v.moniker ?? v.description?.moniker ?? "",
          tokens: v.tokens ?? "0",
          status: v.status ?? "",
          operatorAddress: v.operatorAddress ?? v.operator_address ?? "",
        }))
      );

      // Module activity
      setModuleActivity({
        agents: agents.length,
        skills: skills.length,
        computeJobs: jobs.length,
        negotiations: negotiations.length,
        models: models.length,
      });
    } catch {
      /* offline */
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    refreshInterval.current = setInterval(loadData, 30000);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  // Derived metrics
  const avgBlockTime =
    blockTimings.length > 0
      ? blockTimings.reduce((s, b) => s + b.delta, 0) / blockTimings.length
      : 0;
  const minBlockTime =
    blockTimings.length > 0 ? Math.min(...blockTimings.map((b) => b.delta)) : 0;
  const maxBlockTime =
    blockTimings.length > 0 ? Math.max(...blockTimings.map((b) => b.delta)) : 0;

  const totalTxInBlocks = blockTimings.reduce((s, b) => s + b.txCount, 0);
  const avgTxPerBlock =
    blockTimings.length > 0 ? totalTxInBlocks / blockTimings.length : 0;
  const blocksWithTx = blockTimings.filter((b) => b.txCount > 0).length;
  const blocksEmpty = blockTimings.filter((b) => b.txCount === 0).length;

  // Current TPS: total txs in recent blocks / total time span
  const timeSpan =
    blockTimings.length > 0
      ? blockTimings.reduce((s, b) => s + b.delta, 0)
      : 1;
  const currentTPS = timeSpan > 0 ? totalTxInBlocks / timeSpan : 0;

  // Estimated total transactions
  const latestHeight =
    blockTimings.length > 0 ? blockTimings[0].height : 0;
  const estimatedTotalTx = Math.round(latestHeight * avgTxPerBlock);

  // Validator stats
  const activeValidators = validators.filter(
    (v) => v.status === "BOND_STATUS_BONDED"
  );
  const inactiveValidators = validators.filter(
    (v) => v.status !== "BOND_STATUS_BONDED"
  );
  const totalBonded = activeValidators.reduce(
    (s, v) => s + BigInt(v.tokens || "0"),
    0n
  );
  const top5 = [...validators]
    .sort((a, b) => Number(BigInt(b.tokens || "0") - BigInt(a.tokens || "0")))
    .slice(0, 5);

  // Block time chart max for scaling
  const chartMaxBlockTime = maxBlockTime > 0 ? maxBlockTime : 5;

  // Tx chart max for scaling
  const maxTxInBlock =
    blockTimings.length > 0 ? Math.max(...blockTimings.map((b) => b.txCount), 1) : 1;

  if (loading) {
    return <p style={{ color: "var(--text2)" }}>Loading analytics data...</p>;
  }

  return (
    <>
      <h2 style={{ marginBottom: 16 }}>Analytics</h2>

      {/* Network Overview Cards */}
      <h3>Network Overview</h3>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Est. Total Transactions</h3>
          <div className="value accent">{estimatedTotalTx.toLocaleString()}</div>
        </div>
        <div className="card">
          <h3>Current TPS</h3>
          <div className="value">{currentTPS.toFixed(3)}</div>
        </div>
        <div className="card">
          <h3>Active Validators</h3>
          <div className="value accent">{activeValidators.length}</div>
        </div>
        <div className="card">
          <h3>Avg Block Time</h3>
          <div className="value">{avgBlockTime.toFixed(2)}s</div>
        </div>
      </div>

      {/* Block Production Section */}
      <h3>Block Production</h3>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Average</h3>
          <div className="value">{avgBlockTime.toFixed(2)}s</div>
        </div>
        <div className="card">
          <h3>Min</h3>
          <div className="value">{minBlockTime.toFixed(2)}s</div>
        </div>
        <div className="card">
          <h3>Max</h3>
          <div className="value">{maxBlockTime.toFixed(2)}s</div>
        </div>
        <div className="card">
          <h3>With Txs / Empty</h3>
          <div className="value">
            {blocksWithTx} / {blocksEmpty}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <LineChart
          title={`Block Time (last ${blockTimings.length} blocks)`}
          data={blockTimings
            .slice()
            .reverse()
            .map((b) => ({
              label: `#${b.height}`,
              value: b.delta,
            }))}
          color="var(--green, #4ade80)"
          showGrid
        />
      </div>

      {/* Transaction Activity Section */}
      <h3>Transaction Activity</h3>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Txs in Sample</h3>
          <div className="value accent">{totalTxInBlocks}</div>
        </div>
        <div className="card">
          <h3>Avg Tx/Block</h3>
          <div className="value">{avgTxPerBlock.toFixed(2)}</div>
        </div>
        <div className="card">
          <h3>Blocks Sampled</h3>
          <div className="value">{blockTimings.length}</div>
        </div>
        <div className="card">
          <h3>Latest Block</h3>
          <div className="value accent">
            {latestHeight > 0 ? `#${latestHeight.toLocaleString()}` : "..."}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <BarChart
          title="Tx Count per Block"
          data={blockTimings
            .slice()
            .reverse()
            .slice(0, 20)
            .map((b) => ({
              label: `#${b.height}`,
              value: b.txCount,
              color: b.txCount > 0 ? "var(--accent, #38bdf8)" : "var(--border, #334155)",
            }))}
        />
      </div>

      {/* Validator Stats Section */}
      <h3>Validator Stats</h3>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Total Bonded</h3>
          <div className="value">{formatClaw(totalBonded.toString())}</div>
        </div>
        <div className="card">
          <h3>Active</h3>
          <div className="value accent">{activeValidators.length}</div>
        </div>
        <div className="card">
          <h3>Inactive</h3>
          <div className="value">{inactiveValidators.length}</div>
        </div>
        <div className="card">
          <h3>Total</h3>
          <div className="value">{validators.length}</div>
        </div>
      </div>

      {top5.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DonutChart
              title="Validator Distribution (Top 5)"
              data={top5.map((v, i) => {
                const colors = ["#38bdf8", "#4ade80", "#fbbf24", "#a78bfa", "#f87171"];
                return {
                  label: v.moniker || `Validator ${i + 1}`,
                  value: Number(BigInt(v.tokens || "0")),
                  color: colors[i % colors.length],
                };
              })}
              size={200}
            />
          </div>
          <div className="card">
            <h4 style={{ margin: "0 0 12px" }}>Top 5 Validators by Voting Power</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Moniker</th>
                    <th style={thStyle}>Tokens</th>
                    <th style={thStyle}>% of Bonded</th>
                    <th style={thStyle}>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((v, i) => {
                    const tokens = BigInt(v.tokens || "0");
                    const pct =
                      totalBonded > 0n
                        ? ((Number(tokens) / Number(totalBonded)) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <tr key={i}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{v.moniker || "unknown"}</td>
                        <td style={tdStyle}>{formatClaw(v.tokens)}</td>
                        <td style={tdStyle}>{pct}%</td>
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: "var(--mono, monospace)",
                            fontSize: 12,
                          }}
                        >
                          {shortAddr(v.operatorAddress)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Module Activity Section */}
      <h3>Module Activity</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: 24 }}>
        <StatCard
          title="Live Agents"
          value={moduleActivity?.agents ?? "..."}
          subtitle="Registered on-chain"
          trend={moduleActivity && moduleActivity.agents > 0 ? "up" : "flat"}
          trendValue={moduleActivity ? `${moduleActivity.agents} active` : undefined}
        />
        <StatCard
          title="Skills Listed"
          value={moduleActivity?.skills ?? "..."}
          subtitle="Available skills"
        />
        <StatCard
          title="Compute Jobs"
          value={moduleActivity?.computeJobs ?? "..."}
          subtitle="GPU marketplace"
          trend={moduleActivity && moduleActivity.computeJobs > 0 ? "up" : "flat"}
          trendValue={moduleActivity ? `${moduleActivity.computeJobs} total` : undefined}
        />
        <StatCard
          title="Negotiations"
          value={moduleActivity?.negotiations ?? "..."}
          subtitle="Agent negotiations"
        />
        <StatCard
          title="AI Models"
          value={moduleActivity?.models ?? "..."}
          subtitle="Registered models"
        />
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid var(--border, #333)",
  color: "var(--text2)",
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border, #222)",
  fontSize: 14,
};
