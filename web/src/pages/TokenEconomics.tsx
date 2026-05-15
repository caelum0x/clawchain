import { useEffect, useState, useRef } from "react";
import { formatClaw, shortAddr } from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import DonutChart from "../components/charts/DonutChart.tsx";
import BarChart from "../components/charts/BarChart.tsx";
import StatCard from "../components/charts/StatCard.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";

interface SupplyInfo {
  totalSupply: string;
  communityPool: string;
  inflation: string;
  annualProvisions: string;
  bondedTokens: string;
  notBondedTokens: string;
}

interface ValidatorHolder {
  rank: number;
  moniker: string;
  operatorAddress: string;
  tokens: string;
  pctOfTotal: string;
}

export default function TokenEconomics() {
  useDocTitle("Token Economics");
  const [supply, setSupply] = useState<SupplyInfo | null>(null);
  const [validators, setValidators] = useState<ValidatorHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadData() {
    setError("");
    try {
      const REST = chainConfig.restEndpoint;

      const [supplyRes, poolRes, inflationRes, provisionsRes, stakingRes, valsRes] =
        await Promise.all([
          fetch(`${REST}/cosmos/bank/v1beta1/supply`, {
            signal: AbortSignal.timeout(5000),
          }).catch(() => null),
          fetch(`${REST}/cosmos/distribution/v1beta1/community_pool`, {
            signal: AbortSignal.timeout(5000),
          }).catch(() => null),
          fetch(`${REST}/cosmos/mint/v1beta1/inflation`, {
            signal: AbortSignal.timeout(5000),
          }).catch(() => null),
          fetch(`${REST}/cosmos/mint/v1beta1/annual_provisions`, {
            signal: AbortSignal.timeout(5000),
          }).catch(() => null),
          fetch(`${REST}/cosmos/staking/v1beta1/pool`, {
            signal: AbortSignal.timeout(5000),
          }).catch(() => null),
          fetch(
            `${REST}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`,
            { signal: AbortSignal.timeout(5000) }
          ).catch(() => null),
        ]);

      const supplyData = supplyRes?.ok ? await supplyRes.json() : {};
      const poolData = poolRes?.ok ? await poolRes.json() : {};
      const inflationData = inflationRes?.ok ? await inflationRes.json() : {};
      const provisionsData = provisionsRes?.ok ? await provisionsRes.json() : {};
      const stakingData = stakingRes?.ok ? await stakingRes.json() : {};
      const valsData = valsRes?.ok ? await valsRes.json() : {};

      const allSupply: { denom: string; amount: string }[] = supplyData.supply ?? [];
      const uclawSupply = allSupply.find((s) => s.denom === "uclaw")?.amount ?? "0";

      const pool: { denom: string; amount: string }[] = poolData.pool ?? [];
      const uclawPool = pool.find((p) => p.denom === "uclaw")?.amount ?? "0";
      // Community pool amounts may be decimal strings
      const communityPoolRaw = Math.floor(parseFloat(uclawPool)).toString();

      const bonded = stakingData.pool?.bonded_tokens ?? "0";
      const notBonded = stakingData.pool?.not_bonded_tokens ?? "0";

      setSupply({
        totalSupply: uclawSupply,
        communityPool: communityPoolRaw,
        inflation: inflationData.inflation ?? "0",
        annualProvisions: provisionsData.annual_provisions ?? "0",
        bondedTokens: bonded,
        notBondedTokens: notBonded,
      });

      // Build validator holders table
      const rawVals: any[] = valsData.validators ?? [];
      const sorted = [...rawVals].sort(
        (a, b) => Number(BigInt(b.tokens ?? "0") - BigInt(a.tokens ?? "0"))
      );
      const totalTokens = sorted.reduce(
        (s, v) => s + BigInt(v.tokens ?? "0"),
        0n
      );
      const top10 = sorted.slice(0, 10).map((v, i) => {
        const tokens = BigInt(v.tokens ?? "0");
        const pct =
          totalTokens > 0n
            ? ((Number(tokens) / Number(totalTokens)) * 100).toFixed(1)
            : "0.0";
        return {
          rank: i + 1,
          moniker: v.description?.moniker ?? "unknown",
          operatorAddress: v.operator_address ?? "",
          tokens: v.tokens ?? "0",
          pctOfTotal: pct,
        };
      });
      setValidators(top10);
    } catch {
      setError("Failed to load token economics data");
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

  if (loading) {
    return <p style={{ color: "var(--text2)" }}>Loading token economics...</p>;
  }

  if (error && !supply) {
    return <p style={{ color: "var(--red, #ef4444)" }}>{error}</p>;
  }

  // Derived values
  const totalSupplyN = BigInt(supply?.totalSupply ?? "0");
  const communityPoolN = BigInt(supply?.communityPool ?? "0");
  const bondedN = BigInt(supply?.bondedTokens ?? "0");
  const notBondedN = BigInt(supply?.notBondedTokens ?? "0");
  const circulatingN = totalSupplyN - communityPoolN - bondedN;
  const inflationPct = (parseFloat(supply?.inflation ?? "0") * 100).toFixed(2);
  const annualProv = parseFloat(supply?.annualProvisions ?? "0");

  // Blocks per year estimate (assuming ~5s block time)
  const blocksPerYear = (365.25 * 24 * 3600) / 5;
  const mintRatePerBlock = annualProv > 0 ? annualProv / blocksPerYear : 0;

  // Donut chart percentages
  const totalForDonut = bondedN + notBondedN + communityPoolN;
  const bondedPct =
    totalForDonut > 0n ? (Number(bondedN) / Number(totalForDonut)) * 100 : 0;
  const notBondedPct =
    totalForDonut > 0n ? (Number(notBondedN) / Number(totalForDonut)) * 100 : 0;
  const poolPct =
    totalForDonut > 0n ? (Number(communityPoolN) / Number(totalForDonut)) * 100 : 0;

  // Staking pool ratio
  const stakingTotal = bondedN + notBondedN;
  const bondedRatio =
    stakingTotal > 0n ? (Number(bondedN) / Number(stakingTotal)) * 100 : 0;
  const notBondedRatio =
    stakingTotal > 0n ? (Number(notBondedN) / Number(stakingTotal)) * 100 : 0;

  return (
    <>
      <h2 style={{ marginBottom: 16 }}>Token Economics</h2>

      {/* Staking Overview StatCards */}
      <h3>Staking Overview</h3>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          title="Total Supply"
          value={formatClaw(supply?.totalSupply ?? "0")}
          subtitle="All CLAW tokens"
        />
        <StatCard
          title="Staking Ratio"
          value={`${bondedRatio.toFixed(1)}%`}
          subtitle={`${formatClaw(supply?.bondedTokens ?? "0")} bonded`}
          trend={bondedRatio > 50 ? "up" : "down"}
          trendValue={bondedRatio > 50 ? "Healthy" : "Low participation"}
        />
        <StatCard
          title="Inflation Rate"
          value={`${inflationPct}%`}
          subtitle="Current annual rate"
        />
        <StatCard
          title="Community Pool"
          value={formatClaw(supply?.communityPool ?? "0")}
          subtitle="Governance-managed funds"
        />
      </div>

      {/* Supply Distribution - SVG Donut Chart */}
      <h3>Supply Distribution</h3>
      <div className="card" style={{ marginBottom: 24, padding: 24 }}>
        <DonutChart
          title="Bonded vs Unbonded vs Community Pool"
          data={[
            { label: "Bonded", value: Number(bondedN), color: "#4ade80" },
            { label: "Unbonded", value: Number(notBondedN), color: "#fbbf24" },
            { label: "Community Pool", value: Number(communityPoolN), color: "#38bdf8" },
          ]}
          size={220}
        />
      </div>

      {/* Inflation Info */}
      <h3>Inflation Info</h3>
      <div className="card" style={{ marginBottom: 24 }}>
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td style={labelStyle}>Current Inflation Rate</td>
              <td style={valueStyle}>{inflationPct}%</td>
            </tr>
            <tr>
              <td style={labelStyle}>Annual Provisions</td>
              <td style={valueStyle}>{formatClaw(Math.floor(annualProv).toString())}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Mint Rate per Block</td>
              <td style={valueStyle}>{formatClaw(Math.floor(mintRatePerBlock).toString())}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Distribution</td>
              <td style={{ ...valueStyle, color: "var(--text2)" }}>
                Inflation goes to stakers and community pool
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Staking Pool */}
      <h3>Staking Pool</h3>
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ color: "var(--text2)", fontSize: 13, marginBottom: 4 }}>
              Bonded
            </div>
            <div style={{ fontWeight: 600 }}>{formatClaw(supply?.bondedTokens ?? "0")}</div>
            <div style={{ color: "var(--green, #22c55e)", fontSize: 13 }}>
              {bondedRatio.toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ color: "var(--text2)", fontSize: 13, marginBottom: 4 }}>
              Not Bonded
            </div>
            <div style={{ fontWeight: 600 }}>{formatClaw(supply?.notBondedTokens ?? "0")}</div>
            <div style={{ color: "var(--yellow, #eab308)", fontSize: 13 }}>
              {notBondedRatio.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Visual Ratio Bar */}
        <div
          style={{
            width: "100%",
            height: 24,
            borderRadius: 6,
            overflow: "hidden",
            display: "flex",
            background: "var(--border, #333)",
          }}
        >
          <div
            style={{
              width: `${bondedRatio}%`,
              height: "100%",
              background: "var(--green, #22c55e)",
              transition: "width 0.3s ease",
            }}
            title={`Bonded: ${bondedRatio.toFixed(1)}%`}
          />
          <div
            style={{
              width: `${notBondedRatio}%`,
              height: "100%",
              background: "var(--yellow, #eab308)",
              transition: "width 0.3s ease",
            }}
            title={`Not Bonded: ${notBondedRatio.toFixed(1)}%`}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 12,
            color: "var(--text2)",
          }}
        >
          <span>Bonded {bondedRatio.toFixed(1)}%</span>
          <span>Not Bonded {notBondedRatio.toFixed(1)}%</span>
        </div>
      </div>

      {/* Top Validators Bar Chart */}
      <h3>Top Validators by Tokens</h3>
      {validators.length === 0 ? (
        <p style={{ color: "var(--text2)" }}>No validator data available.</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <BarChart
              title="Top 10 Validators by Tokens"
              data={validators.map((v, i) => {
                const colors = [
                  "#38bdf8", "#4ade80", "#fbbf24", "#a78bfa", "#f87171",
                  "#2dd4bf", "#fb923c", "#e879f9", "#34d399", "#60a5fa",
                ];
                return {
                  label: v.moniker.length > 6 ? v.moniker.slice(0, 6) + ".." : v.moniker,
                  value: Number(BigInt(v.tokens || "0")) / 1_000_000,
                  color: colors[i % colors.length],
                };
              })}
            />
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Moniker</th>
                    <th style={thStyle}>Self-Stake</th>
                    <th style={thStyle}>% of Total</th>
                    <th style={thStyle}>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {validators.map((v) => (
                    <tr key={v.rank}>
                      <td style={tdStyle}>{v.rank}</td>
                      <td style={tdStyle}>{v.moniker}</td>
                      <td style={tdStyle}>{formatClaw(v.tokens)}</td>
                      <td style={tdStyle}>{v.pctOfTotal}%</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const labelStyle: React.CSSProperties = {
  color: "var(--text2)",
  padding: "6px 8px",
  whiteSpace: "nowrap",
  verticalAlign: "top",
  width: "200px",
};

const valueStyle: React.CSSProperties = {
  padding: "6px 8px",
};

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
