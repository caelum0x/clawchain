import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getValidators, formatClaw, type Validator } from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import StatCard from "../components/charts/StatCard.tsx";
import LineChart, { type LineChartDatum } from "../components/charts/LineChart.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";

type StakingPeriod = 1 | 3 | 6 | 12;

interface NetworkParams {
  inflationRate: number;
  annualProvisions: number;
  bondedTokens: number;
  notBondedTokens: number;
}

async function fetchNetworkParams(): Promise<NetworkParams> {
  const REST = chainConfig.restEndpoint;

  const [inflationRes, provisionsRes, poolRes] = await Promise.all([
    fetch(`${REST}/cosmos/mint/v1beta1/inflation`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null),
    fetch(`${REST}/cosmos/mint/v1beta1/annual_provisions`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null),
    fetch(`${REST}/cosmos/staking/v1beta1/pool`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null),
  ]);

  const inflationData = inflationRes?.ok ? await inflationRes.json() : {};
  const provisionsData = provisionsRes?.ok ? await provisionsRes.json() : {};
  const poolData = poolRes?.ok ? await poolRes.json() : {};

  return {
    inflationRate: parseFloat(inflationData.inflation ?? "0"),
    annualProvisions: parseFloat(provisionsData.annual_provisions ?? "0"),
    bondedTokens: parseFloat(poolData.pool?.bonded_tokens ?? "0"),
    notBondedTokens: parseFloat(poolData.pool?.not_bonded_tokens ?? "0"),
  };
}

export default function StakingCalculator() {
  useDocTitle("Staking Calculator");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [validators, setValidators] = useState<Validator[]>([]);
  const [networkParams, setNetworkParams] = useState<NetworkParams | null>(null);

  // Input state
  const [stakeAmount, setStakeAmount] = useState<number>(1000);
  const [selectedValidator, setSelectedValidator] = useState<string>("");
  const [period, setPeriod] = useState<StakingPeriod>(12);
  const [autoCompound, setAutoCompound] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [vals, params] = await Promise.all([
        getValidators(),
        fetchNetworkParams(),
      ]);
      vals.sort((a, b) => Number(BigInt(b.tokens) - BigInt(a.tokens)));
      setValidators(vals);
      setNetworkParams(params);
      if (vals.length > 0) {
        setSelectedValidator(vals[0].operatorAddress);
      }
    } catch {
      setError("Failed to load network data. Is the chain running?");
    }
    setLoading(false);
  }

  const selectedVal = validators.find(
    (v) => v.operatorAddress === selectedValidator
  );
  const commission = selectedVal ? parseFloat(selectedVal.commission) : 0;

  const calculations = useMemo(() => {
    if (!networkParams || stakeAmount <= 0) {
      return {
        dailyReward: 0,
        monthlyReward: 0,
        annualReward: 0,
        apr: 0,
        apy: 0,
        totalValue: stakeAmount,
        chartData: [] as LineChartDatum[],
      };
    }

    const { inflationRate, bondedTokens } = networkParams;
    const totalSupplyForStaking = bondedTokens + networkParams.notBondedTokens;
    const stakingRatio =
      totalSupplyForStaking > 0 ? bondedTokens / totalSupplyForStaking : 1;

    // Annual reward = stakedAmount * inflationRate * (1 - commission) / stakingRatio
    const effectiveStakingRatio = stakingRatio > 0 ? stakingRatio : 1;
    const annualReward =
      stakeAmount * inflationRate * (1 - commission) / effectiveStakingRatio;
    const monthlyReward = annualReward / 12;
    const dailyReward = annualReward / 365;

    // APR
    const apr = stakeAmount > 0 ? (annualReward / stakeAmount) * 100 : 0;

    // Monthly rate for compounding
    const monthlyRate = apr / 100 / 12;

    // APY with compounding: (1 + monthlyRate)^12 - 1
    const apy = (Math.pow(1 + monthlyRate, 12) - 1) * 100;

    // Total value after period
    let totalValue: number;
    if (autoCompound) {
      totalValue = stakeAmount * Math.pow(1 + monthlyRate, period);
    } else {
      totalValue = stakeAmount + monthlyReward * period;
    }

    // Build chart data: monthly projection over the period
    const chartData: LineChartDatum[] = [];
    for (let m = 0; m <= period; m++) {
      let value: number;
      if (autoCompound) {
        value = stakeAmount * Math.pow(1 + monthlyRate, m);
      } else {
        value = stakeAmount + monthlyReward * m;
      }
      const label = m === 0 ? "Now" : `M${m}`;
      chartData.push({ label, value });
    }

    return {
      dailyReward,
      monthlyReward,
      annualReward,
      apr,
      apy,
      totalValue,
      chartData,
    };
  }, [stakeAmount, commission, networkParams, period, autoCompound]);

  function handleAmountInput(value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      setStakeAmount(0);
    } else {
      setStakeAmount(Math.min(num, 1_000_000));
    }
  }

  function handleSlider(value: string) {
    setStakeAmount(parseFloat(value));
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading staking calculator...</p>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "0.5rem",
        }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>
          Staking Calculator
        </h1>
        <Link to="/staking" className="btn" style={{ fontSize: "0.85rem" }}>
          Back to Staking
        </Link>
      </div>
      <p className="page-subtitle">
        Estimate your CLAW staking rewards based on current network parameters.
      </p>

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

      {/* Input Section */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {/* Amount to stake */}
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Amount to Stake</h3>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <input
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={stakeAmount}
              onChange={(e) => handleAmountInput(e.target.value)}
              aria-label="Amount to stake"
              style={{
                flex: 1,
                padding: "0.5rem",
                fontSize: "1.1rem",
                fontWeight: 600,
              }}
            />
            <span
              style={{
                fontWeight: 700,
                color: "var(--text2)",
                fontSize: "1rem",
              }}
            >
              CLAW
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1000000}
            step={100}
            value={stakeAmount}
            onChange={(e) => handleSlider(e.target.value)}
            aria-label="Stake amount slider"
            style={{ width: "100%" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "var(--text2)",
              marginTop: "0.25rem",
            }}
          >
            <span>0</span>
            <span>250K</span>
            <span>500K</span>
            <span>750K</span>
            <span>1M</span>
          </div>
        </div>

        {/* Validator Selection */}
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Validator</h3>
          <select
            value={selectedValidator}
            onChange={(e) => setSelectedValidator(e.target.value)}
            aria-label="Select validator"
            style={{
              width: "100%",
              padding: "0.5rem",
              fontSize: "1rem",
              marginBottom: "0.75rem",
            }}
          >
            {validators.length === 0 && (
              <option value="">No validators available</option>
            )}
            {validators.map((v) => (
              <option key={v.operatorAddress} value={v.operatorAddress}>
                {v.moniker || "Unnamed"} ({(parseFloat(v.commission) * 100).toFixed(1)}% commission)
              </option>
            ))}
          </select>
          {selectedVal && (
            <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
              <div>
                Commission:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {(parseFloat(selectedVal.commission) * 100).toFixed(1)}%
                </strong>
              </div>
              <div>
                Voting Power:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {formatClaw(selectedVal.tokens)}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Staking Period + Auto-compound */}
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Staking Period</h3>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            {([1, 3, 6, 12] as StakingPeriod[]).map((p) => (
              <button
                key={p}
                className={`btn ${period === p ? "btn-primary" : ""}`}
                onClick={() => setPeriod(p)}
                aria-label={`${p} month${p > 1 ? "s" : ""}`}
              >
                {p === 12 ? "1 Year" : `${p} Month${p > 1 ? "s" : ""}`}
              </button>
            ))}
          </div>

          <h3 style={{ marginBottom: "0.75rem" }}>Auto-Compound</h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className={`btn ${autoCompound ? "btn-primary" : ""}`}
              onClick={() => setAutoCompound(true)}
              aria-label="Auto-compound yes"
            >
              Yes
            </button>
            <button
              className={`btn ${!autoCompound ? "btn-primary" : ""}`}
              onClick={() => setAutoCompound(false)}
              aria-label="Auto-compound no"
            >
              No
            </button>
          </div>
        </div>
      </div>

      {/* Network Parameters */}
      {networkParams && (
        <div
          className="grid-4"
          style={{ marginBottom: "2rem" }}
        >
          <StatCard
            title="Inflation Rate"
            value={`${(networkParams.inflationRate * 100).toFixed(2)}%`}
            subtitle="Current annual rate"
          />
          <StatCard
            title="Annual Provisions"
            value={formatClaw(
              Math.floor(networkParams.annualProvisions).toString()
            )}
            subtitle="New tokens per year"
          />
          <StatCard
            title="Total Bonded"
            value={formatClaw(
              Math.floor(networkParams.bondedTokens).toString()
            )}
            subtitle="Staked across all validators"
          />
          <StatCard
            title="Staking Ratio"
            value={`${(
              (networkParams.bondedTokens /
                (networkParams.bondedTokens + networkParams.notBondedTokens || 1)) *
              100
            ).toFixed(1)}%`}
            subtitle="Bonded / total staking pool"
          />
        </div>
      )}

      {/* Output Section */}
      <h2 style={{ marginBottom: "1rem" }}>Estimated Rewards</h2>
      <div className="grid-4" style={{ marginBottom: "2rem" }}>
        <StatCard
          title="Daily Reward"
          value={`${calculations.dailyReward.toFixed(4)} CLAW`}
          subtitle="Estimated per day"
        />
        <StatCard
          title="Monthly Reward"
          value={`${calculations.monthlyReward.toFixed(4)} CLAW`}
          subtitle="Estimated per month"
        />
        <StatCard
          title="Annual Reward"
          value={`${calculations.annualReward.toFixed(4)} CLAW`}
          subtitle="Estimated per year"
        />
        <StatCard
          title="APR"
          value={`${calculations.apr.toFixed(2)}%`}
          subtitle="Annual Percentage Rate"
        />
        <StatCard
          title="APY"
          value={`${calculations.apy.toFixed(2)}%`}
          subtitle="With monthly compounding"
          trend={autoCompound ? "up" : "flat"}
          trendValue={autoCompound ? "Compounding active" : "No compounding"}
        />
        <StatCard
          title={`Total After ${period === 12 ? "1 Year" : `${period} Month${period > 1 ? "s" : ""}`}`}
          value={`${calculations.totalValue.toFixed(4)} CLAW`}
          subtitle={`Principal: ${stakeAmount.toFixed(4)} CLAW`}
          trend="up"
          trendValue={`+${(calculations.totalValue - stakeAmount).toFixed(4)} CLAW`}
        />
      </div>

      {/* Projected Growth Chart */}
      {calculations.chartData.length > 1 && (
        <div className="card" style={{ marginBottom: "2rem", padding: "1.5rem" }}>
          <LineChart
            data={calculations.chartData}
            title={`Projected Growth Over ${period === 12 ? "1 Year" : `${period} Months`}${autoCompound ? " (Compounded)" : ""}`}
            color="#4ade80"
            height={300}
            width={700}
          />
        </div>
      )}

      {/* Disclaimer */}
      <div
        className="card"
        style={{
          background: "rgba(251, 191, 36, 0.08)",
          borderLeft: "3px solid #fbbf24",
          fontSize: "0.85rem",
          color: "var(--text2)",
        }}
      >
        <strong style={{ color: "#fbbf24" }}>Disclaimer:</strong> Estimates are
        based on current network parameters and may change. Actual rewards
        depend on validator uptime, network inflation, and total staked amount.
      </div>
    </div>
  );
}
