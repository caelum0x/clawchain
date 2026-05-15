import { useEffect, useState, useRef } from "react";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getNetStatus,
  getLatestBlock,
  getRecentBlocks,
  getValidators,
  getTotalSupply,
  getLiveAgents,
  getTreeStats,
  getModuleParams,
  formatClaw,
  shortAddr,
  timeAgo,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";

interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error" | "loading";
  detail: string;
}

interface BlockTiming {
  height: number;
  time: string;
  delta: number;
}

export default function NetworkHealth() {
  useDocTitle("Network Health");
  const [tab, setTab] = useState<"overview" | "validators" | "modules" | "blocks">("overview");

  // Overview
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [chainInfo, setChainInfo] = useState<{
    network: string;
    height: string;
    latestBlockTime: string;
    nodeMoniker: string;
    version: string;
    peers: number;
    supply: string;
    liveAgents: number;
    privacyLeaves: string;
    privacyRoot: string;
  } | null>(null);

  // Validators
  const [validators, setValidators] = useState<any[]>([]);

  // Module params
  const [moduleParams, setModuleParams] = useState<Record<string, Record<string, string>>>({});
  const [loadingModule, setLoadingModule] = useState("");

  // Block timings
  const [blockTimings, setBlockTimings] = useState<BlockTiming[]>([]);

  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  async function runHealthChecks() {
    const results: HealthCheck[] = [];

    // RPC connectivity
    try {
      const net = await getNetStatus();
      results.push({
        name: "RPC Connection",
        status: "ok",
        detail: `Connected to ${net.nodeInfo.moniker} (${net.nodeInfo.network})`,
      });
    } catch {
      results.push({ name: "RPC Connection", status: "error", detail: "Cannot reach RPC endpoint" });
    }

    // REST API
    try {
      const res = await fetch(`${chainConfig.restEndpoint}/cosmos/base/tendermint/v1beta1/node_info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        results.push({ name: "REST API", status: "ok", detail: `${chainConfig.restEndpoint} reachable` });
      } else {
        results.push({ name: "REST API", status: "warn", detail: `HTTP ${res.status}` });
      }
    } catch {
      results.push({ name: "REST API", status: "error", detail: "Cannot reach REST endpoint" });
    }

    // Block production
    try {
      const block = await getLatestBlock();
      const blockAge = (Date.now() - new Date(block.time).getTime()) / 1000;
      if (blockAge < 30) {
        results.push({ name: "Block Production", status: "ok", detail: `Latest block ${timeAgo(block.time)}` });
      } else if (blockAge < 120) {
        results.push({ name: "Block Production", status: "warn", detail: `Last block ${Math.round(blockAge)}s ago` });
      } else {
        results.push({ name: "Block Production", status: "error", detail: `Chain stalled — ${Math.round(blockAge)}s since last block` });
      }
    } catch {
      results.push({ name: "Block Production", status: "error", detail: "Cannot query blocks" });
    }

    // Validators
    try {
      const vals = await getValidators();
      const active = vals.filter((v: any) => v.status === "BOND_STATUS_BONDED").length;
      if (active >= 3) {
        results.push({ name: "Validators", status: "ok", detail: `${active} bonded validators` });
      } else if (active >= 1) {
        results.push({ name: "Validators", status: "warn", detail: `Only ${active} bonded validator(s)` });
      } else {
        results.push({ name: "Validators", status: "error", detail: "No bonded validators" });
      }
    } catch {
      results.push({ name: "Validators", status: "warn", detail: "Cannot query validators" });
    }

    // Agent system
    try {
      const agents = await getLiveAgents();
      results.push({
        name: "Agent System",
        status: agents.length > 0 ? "ok" : "warn",
        detail: `${agents.length} live agent(s)`,
      });
    } catch {
      results.push({ name: "Agent System", status: "warn", detail: "Cannot query agents" });
    }

    // Privacy module
    try {
      const stats = await getTreeStats();
      results.push({
        name: "Privacy Module",
        status: "ok",
        detail: `Merkle tree: ${stats.leafCount} leaves, depth ${stats.depth}`,
      });
    } catch {
      results.push({ name: "Privacy Module", status: "warn", detail: "Cannot query privacy state" });
    }

    setChecks(results);
  }

  async function loadChainInfo() {
    try {
      const [net, block, supply, agents, treeStats] = await Promise.all([
        getNetStatus(),
        getLatestBlock(),
        getTotalSupply(),
        getLiveAgents(),
        getTreeStats().catch(() => ({ leafCount: "0", depth: "0", root: "" })),
      ]);
      const uclaw = supply.find((s) => s.denom === "uclaw")?.amount ?? "0";
      setChainInfo({
        network: net.nodeInfo.network,
        height: block.height,
        latestBlockTime: block.time,
        nodeMoniker: net.nodeInfo.moniker,
        version: net.nodeInfo.version ?? "unknown",
        peers: net.syncInfo?.catching_up ? -1 : 0,
        supply: formatClaw(uclaw),
        liveAgents: agents.length,
        privacyLeaves: treeStats.leafCount,
        privacyRoot: treeStats.root ?? "",
      });
    } catch {
      /* offline */
    }
  }

  async function loadValidators() {
    try {
      setValidators(await getValidators());
    } catch {
      /* offline */
    }
  }

  async function loadModuleParams(mod: string) {
    setLoadingModule(mod);
    try {
      const params = await getModuleParams(mod);
      setModuleParams((prev) => ({ ...prev, [mod]: params }));
    } catch {
      setModuleParams((prev) => ({ ...prev, [mod]: { error: "Failed to load params" } }));
    }
    setLoadingModule("");
  }

  async function loadBlockTimings() {
    try {
      const blocks = await getRecentBlocks(20);
      const timings: BlockTiming[] = [];
      for (let i = 0; i < blocks.length - 1; i++) {
        const curr = new Date(blocks[i].time).getTime();
        const prev = new Date(blocks[i + 1].time).getTime();
        timings.push({
          height: Number(blocks[i].height),
          time: blocks[i].time,
          delta: (curr - prev) / 1000,
        });
      }
      setBlockTimings(timings);
    } catch {
      /* offline */
    }
  }

  useEffect(() => {
    runHealthChecks();
    loadChainInfo();
    refreshInterval.current = setInterval(() => {
      runHealthChecks();
      loadChainInfo();
    }, 15000);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  useEffect(() => {
    if (tab === "validators") loadValidators();
    if (tab === "blocks") loadBlockTimings();
  }, [tab]);

  const modules = ["agent", "privacy", "marketplace", "modelregistry", "reputation", "messaging", "governance"];

  const statusIcon = (s: string) => {
    if (s === "ok") return "[OK]";
    if (s === "warn") return "[WARN]";
    if (s === "error") return "[FAIL]";
    return "[...]";
  };

  const statusColor = (s: string) => {
    if (s === "ok") return "var(--green, #22c55e)";
    if (s === "warn") return "var(--yellow, #eab308)";
    if (s === "error") return "var(--red, #ef4444)";
    return "var(--text2)";
  };

  const overallStatus = checks.length === 0
    ? "loading"
    : checks.some((c) => c.status === "error")
      ? "error"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "ok";

  const overallLabel = overallStatus === "ok" ? "All Systems Operational" : overallStatus === "warn" ? "Degraded" : overallStatus === "error" ? "Issues Detected" : "Checking...";

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["overview", "validators", "modules", "blocks"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "primary" : "secondary"}
            style={{ textTransform: "capitalize" }}
          >
            {t === "modules" ? "Module Params" : t === "blocks" ? "Block Times" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="card" style={{ marginBottom: 24, textAlign: "center" }}>
            <h2 style={{ color: statusColor(overallStatus), fontSize: 22, margin: "0 0 8px" }}>
              {statusIcon(overallStatus)} {overallLabel}
            </h2>
            {chainInfo && (
              <p style={{ color: "var(--text2)", margin: 0 }}>
                {chainInfo.network} | Block #{Number(chainInfo.height).toLocaleString()} | {timeAgo(chainInfo.latestBlockTime)}
              </p>
            )}
          </div>

          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card">
              <h3>Block Height</h3>
              <div className="value accent">{chainInfo ? Number(chainInfo.height).toLocaleString() : "..."}</div>
            </div>
            <div className="card">
              <h3>Total Supply</h3>
              <div className="value">{chainInfo?.supply ?? "..."}</div>
            </div>
            <div className="card">
              <h3>Live Agents</h3>
              <div className="value accent">{chainInfo?.liveAgents ?? "..."}</div>
            </div>
            <div className="card">
              <h3>Privacy Leaves</h3>
              <div className="value">{chainInfo?.privacyLeaves ?? "..."}</div>
            </div>
          </div>

          <h3>Health Checks</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checks.map((c, i) => (
              <div
                key={i}
                className="card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                }}
              >
                <span>
                  <strong>{c.name}</strong>
                  <span style={{ marginLeft: 12, color: "var(--text2)" }}>{c.detail}</span>
                </span>
                <span
                  style={{
                    color: statusColor(c.status),
                    fontFamily: "var(--mono, monospace)",
                    fontWeight: 600,
                  }}
                >
                  {statusIcon(c.status)}
                </span>
              </div>
            ))}
          </div>

          {chainInfo && (
            <div className="card" style={{ marginTop: 24 }}>
              <h3>Node Info</h3>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td style={{ color: "var(--text2)" }}>Moniker</td><td>{chainInfo.nodeMoniker}</td></tr>
                  <tr><td style={{ color: "var(--text2)" }}>Network</td><td>{chainInfo.network}</td></tr>
                  <tr><td style={{ color: "var(--text2)" }}>RPC</td><td>{chainConfig.rpcEndpoint}</td></tr>
                  <tr><td style={{ color: "var(--text2)" }}>REST</td><td>{chainConfig.restEndpoint}</td></tr>
                  <tr>
                    <td style={{ color: "var(--text2)" }}>Privacy Root</td>
                    <td style={{ fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                      {chainInfo.privacyRoot ? `${chainInfo.privacyRoot.slice(0, 16)}...` : "N/A"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "validators" && (
        <>
          <h3>Validators ({validators.length})</h3>
          {validators.length === 0 ? (
            <p style={{ color: "var(--text2)" }}>Loading validators...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Moniker</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Tokens</th>
                    <th style={thStyle}>Commission</th>
                    <th style={thStyle}>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {validators
                    .sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
                    .map((v, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{v.description?.moniker ?? "unknown"}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              color: v.status === "BOND_STATUS_BONDED" ? "var(--green, #22c55e)" : "var(--yellow, #eab308)",
                            }}
                          >
                            {v.status === "BOND_STATUS_BONDED" ? "Bonded" : v.status === "BOND_STATUS_UNBONDING" ? "Unbonding" : "Unbonded"}
                          </span>
                        </td>
                        <td style={tdStyle}>{formatClaw(v.tokens ?? "0")}</td>
                        <td style={tdStyle}>
                          {((Number(v.commission?.commission_rates?.rate ?? 0) * 100).toFixed(1))}%
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                          {shortAddr(v.operator_address ?? "")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "modules" && (
        <>
          <h3>Module Parameters</h3>
          <p style={{ color: "var(--text2)", marginBottom: 16 }}>
            Click a module to load its current on-chain parameters.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {modules.map((mod) => (
              <button
                key={mod}
                onClick={() => loadModuleParams(mod)}
                className={moduleParams[mod] ? "primary" : "secondary"}
                style={{ textTransform: "capitalize" }}
                disabled={loadingModule === mod}
              >
                {loadingModule === mod ? "Loading..." : mod}
              </button>
            ))}
          </div>
          {Object.entries(moduleParams).map(([mod, params]) => (
            <div key={mod} className="card" style={{ marginBottom: 12 }}>
              <h4 style={{ textTransform: "capitalize", marginBottom: 8 }}>{mod}</h4>
              <table style={{ width: "100%" }}>
                <tbody>
                  {Object.entries(params).map(([key, val]) => (
                    <tr key={key}>
                      <td style={{ color: "var(--text2)", padding: "4px 8px", fontFamily: "var(--mono, monospace)", fontSize: 13 }}>
                        {key}
                      </td>
                      <td style={{ padding: "4px 8px", fontFamily: "var(--mono, monospace)", fontSize: 13 }}>
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {tab === "blocks" && (
        <>
          <h3>Recent Block Times</h3>
          {blockTimings.length === 0 ? (
            <p style={{ color: "var(--text2)" }}>Loading block timings...</p>
          ) : (
            <>
              <div className="grid-4" style={{ marginBottom: 16 }}>
                <div className="card">
                  <h3>Avg Block Time</h3>
                  <div className="value">
                    {(blockTimings.reduce((s, b) => s + b.delta, 0) / blockTimings.length).toFixed(2)}s
                  </div>
                </div>
                <div className="card">
                  <h3>Min</h3>
                  <div className="value">{Math.min(...blockTimings.map((b) => b.delta)).toFixed(2)}s</div>
                </div>
                <div className="card">
                  <h3>Max</h3>
                  <div className="value">{Math.max(...blockTimings.map((b) => b.delta)).toFixed(2)}s</div>
                </div>
                <div className="card">
                  <h3>Blocks Sampled</h3>
                  <div className="value">{blockTimings.length}</div>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Height</th>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>Block Time</th>
                      <th style={thStyle}>Visual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockTimings.map((b) => (
                      <tr key={b.height}>
                        <td style={tdStyle}>{b.height.toLocaleString()}</td>
                        <td style={tdStyle}>{timeAgo(b.time)}</td>
                        <td style={tdStyle}>{b.delta.toFixed(2)}s</td>
                        <td style={tdStyle}>
                          <div
                            style={{
                              width: `${Math.min(b.delta * 20, 200)}px`,
                              height: 12,
                              background: b.delta < 3 ? "var(--green, #22c55e)" : b.delta < 10 ? "var(--yellow, #eab308)" : "var(--red, #ef4444)",
                              borderRadius: 3,
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
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
