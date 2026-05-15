import { useEffect, useState } from "react";
import { chainConfig } from "../lib/config.ts";
import { formatClaw } from "../lib/chain.ts";
import useDocTitle from "../hooks/useDocTitle.ts";

interface NodeInfo {
  nodeId: string;
  moniker: string;
  network: string;
  version: string;
  latestBlockHeight: string;
  latestBlockTime: string;
  catchingUp: boolean;
}

interface NetworkStats {
  totalSupply: { denom: string; amount: string }[];
  communityPool: { denom: string; amount: string }[];
  inflation: string;
  annualProvisions: string;
  bondedTokens: string;
  notBondedTokens: string;
}

export default function Settings() {
  useDocTitle("Settings");
  const [tab, setTab] = useState<"chain" | "modules" | "network">("chain");

  // Chain info
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");
  const [nodeInfoError, setNodeInfoError] = useState("");

  // Module params
  const [moduleParams, setModuleParams] = useState<Record<string, Record<string, unknown>>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [loadingModule, setLoadingModule] = useState("");

  // Network stats
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [networkError, setNetworkError] = useState("");

  const modules = [
    { key: "agent", label: "Agent", endpoint: "/clawchain/agent/v1/params" },
    { key: "privacy", label: "Privacy", endpoint: "/clawchain/privacy/v1/params" },
    { key: "marketplace", label: "Marketplace", endpoint: "/clawchain/marketplace/v1/params" },
    { key: "governance", label: "Governance", endpoint: "/clawchain/governance/v1/params" },
    { key: "messaging", label: "Messaging", endpoint: "/clawchain/messaging/v1/params" },
    { key: "reputation", label: "Reputation", endpoint: "/clawchain/reputation/v1/params" },
    { key: "modelregistry", label: "Model Registry", endpoint: "/clawchain/modelregistry/v1/params" },
    { key: "wasm", label: "CosmWasm", endpoint: "/cosmwasm/wasm/v1/codes/params" },
  ];

  async function loadNodeInfo() {
    setNodeInfoError("");
    try {
      const [rpcRes, restRes] = await Promise.all([
        fetch(`${chainConfig.rpcEndpoint}/status`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${chainConfig.restEndpoint}/cosmos/base/tendermint/v1beta1/node_info`, {
          signal: AbortSignal.timeout(5000),
        }),
      ]);

      if (rpcRes.ok) {
        const rpcData = await rpcRes.json();
        const r = rpcData.result;
        setNodeInfo({
          nodeId: r.node_info?.id ?? "",
          moniker: r.node_info?.moniker ?? "",
          network: r.node_info?.network ?? "",
          version: r.node_info?.version ?? "",
          latestBlockHeight: r.sync_info?.latest_block_height ?? "",
          latestBlockTime: r.sync_info?.latest_block_time ?? "",
          catchingUp: r.sync_info?.catching_up ?? false,
        });
      }

      if (restRes.ok) {
        const restData = await restRes.json();
        setAppVersion(
          restData.application_version?.version ??
            restData.application_version?.app_name ??
            ""
        );
      }
    } catch {
      setNodeInfoError("Failed to connect to node");
    }
  }

  async function loadModuleParams(key: string, endpoint: string) {
    setLoadingModule(key);
    try {
      const res = await fetch(`${chainConfig.restEndpoint}${endpoint}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        setModuleParams((prev) => ({ ...prev, [key]: data.params ?? {} }));
        setExpandedModules((prev) => ({ ...prev, [key]: true }));
      } else {
        setModuleParams((prev) => ({ ...prev, [key]: { error: `HTTP ${res.status}` } }));
        setExpandedModules((prev) => ({ ...prev, [key]: true }));
      }
    } catch {
      setModuleParams((prev) => ({ ...prev, [key]: { error: "Failed to load params" } }));
      setExpandedModules((prev) => ({ ...prev, [key]: true }));
    }
    setLoadingModule("");
  }

  function toggleModule(key: string) {
    setExpandedModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function loadNetworkStats() {
    setNetworkError("");
    try {
      const [supplyRes, poolRes, inflationRes, provisionsRes, stakingRes] = await Promise.all([
        fetch(`${chainConfig.restEndpoint}/cosmos/bank/v1beta1/supply`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null),
        fetch(`${chainConfig.restEndpoint}/cosmos/distribution/v1beta1/community_pool`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null),
        fetch(`${chainConfig.restEndpoint}/cosmos/mint/v1beta1/inflation`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null),
        fetch(`${chainConfig.restEndpoint}/cosmos/mint/v1beta1/annual_provisions`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null),
        fetch(`${chainConfig.restEndpoint}/cosmos/staking/v1beta1/pool`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null),
      ]);

      const supply = supplyRes?.ok ? (await supplyRes.json()).supply ?? [] : [];
      const community = poolRes?.ok ? (await poolRes.json()).pool ?? [] : [];
      const inflationData = inflationRes?.ok ? await inflationRes.json() : {};
      const provisionsData = provisionsRes?.ok ? await provisionsRes.json() : {};
      const stakingData = stakingRes?.ok ? await stakingRes.json() : {};

      setNetworkStats({
        totalSupply: supply,
        communityPool: community,
        inflation: inflationData.inflation ?? "0",
        annualProvisions: provisionsData.annual_provisions ?? "0",
        bondedTokens: stakingData.pool?.bonded_tokens ?? "0",
        notBondedTokens: stakingData.pool?.not_bonded_tokens ?? "0",
      });
    } catch {
      setNetworkError("Failed to load network stats");
    }
  }

  useEffect(() => {
    loadNodeInfo();
  }, []);

  useEffect(() => {
    if (tab === "modules") {
      // Load all module params that haven't been loaded yet
      for (const mod of modules) {
        if (!moduleParams[mod.key]) {
          loadModuleParams(mod.key, mod.endpoint);
        }
      }
    }
    if (tab === "network" && !networkStats) {
      loadNetworkStats();
    }
  }, [tab]);

  function renderParamValue(value: unknown, indent = 0): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  }

  return (
    <>
      <h2 style={{ marginBottom: 16 }}>Settings &amp; Configuration</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["chain", "modules", "network"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "primary" : "secondary"}
            style={{ textTransform: "capitalize" }}
          >
            {t === "chain" ? "Chain Configuration" : t === "modules" ? "Module Parameters" : "Network Stats"}
          </button>
        ))}
      </div>

      {/* Section 1: Chain Configuration */}
      {tab === "chain" && (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12 }}>Current Configuration</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={labelStyle}>Chain ID</td>
                  <td style={valueStyle}>{chainConfig.chainId}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Chain Name</td>
                  <td style={valueStyle}>{chainConfig.chainName}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>RPC URL</td>
                  <td style={valueStyle}>{chainConfig.rpcEndpoint}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>REST URL</td>
                  <td style={valueStyle}>{chainConfig.restEndpoint}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Denom</td>
                  <td style={valueStyle}>
                    {chainConfig.coinDenom} ({chainConfig.coinMinimalDenom})
                  </td>
                </tr>
                <tr>
                  <td style={labelStyle}>Decimals</td>
                  <td style={valueStyle}>{chainConfig.coinDecimals}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Bech32 Prefix</td>
                  <td style={valueStyle}>{chainConfig.bech32Prefix}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Gas Price</td>
                  <td style={valueStyle}>{chainConfig.gasPrice}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12 }}>Node Info</h3>
            {nodeInfoError && (
              <p style={{ color: "var(--red, #ef4444)" }}>{nodeInfoError}</p>
            )}
            {!nodeInfo && !nodeInfoError && (
              <p style={{ color: "var(--text2)" }}>Loading node info...</p>
            )}
            {nodeInfo && (
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td style={labelStyle}>Node ID</td>
                    <td style={{ ...valueStyle, fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                      {nodeInfo.nodeId || "N/A"}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Moniker</td>
                    <td style={valueStyle}>{nodeInfo.moniker || "N/A"}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Network</td>
                    <td style={valueStyle}>{nodeInfo.network || "N/A"}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Latest Block</td>
                    <td style={valueStyle}>
                      #{Number(nodeInfo.latestBlockHeight).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Block Time</td>
                    <td style={valueStyle}>
                      {nodeInfo.latestBlockTime
                        ? new Date(nodeInfo.latestBlockTime).toLocaleString()
                        : "N/A"}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Catching Up</td>
                    <td style={valueStyle}>
                      <span
                        style={{
                          color: nodeInfo.catchingUp
                            ? "var(--yellow, #eab308)"
                            : "var(--green, #22c55e)",
                        }}
                      >
                        {nodeInfo.catchingUp ? "Yes (syncing)" : "No (synced)"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>CometBFT Version</td>
                    <td style={valueStyle}>{nodeInfo.version || "N/A"}</td>
                  </tr>
                  {appVersion && (
                    <tr>
                      <td style={labelStyle}>App Version</td>
                      <td style={valueStyle}>{appVersion}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Section 2: Module Parameters */}
      {tab === "modules" && (
        <>
          <p style={{ color: "var(--text2)", marginBottom: 16 }}>
            On-chain parameters for each ClawChain module. Click a section header to expand or collapse.
          </p>
          {modules.map((mod) => {
            const params = moduleParams[mod.key];
            const isExpanded = expandedModules[mod.key] ?? false;
            const isLoading = loadingModule === mod.key;

            return (
              <div key={mod.key} className="card" style={{ marginBottom: 12 }}>
                <div
                  onClick={() => {
                    if (!params && !isLoading) {
                      loadModuleParams(mod.key, mod.endpoint);
                    } else {
                      toggleModule(mod.key);
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h4 style={{ margin: 0, textTransform: "capitalize" }}>
                    {mod.label} Module
                  </h4>
                  <span style={{ color: "var(--text2)", fontSize: 13 }}>
                    {isLoading ? "Loading..." : isExpanded ? "[-]" : "[+]"}
                  </span>
                </div>
                {isExpanded && params && (
                  <div style={{ marginTop: 12 }}>
                    {"error" in params && typeof params.error === "string" ? (
                      <p style={{ color: "var(--red, #ef4444)", margin: 0 }}>
                        {params.error}
                      </p>
                    ) : (
                      <table style={{ width: "100%" }}>
                        <tbody>
                          {Object.entries(params).map(([key, val]) => (
                            <tr key={key}>
                              <td
                                style={{
                                  color: "var(--text2)",
                                  padding: "4px 8px",
                                  fontFamily: "var(--mono, monospace)",
                                  fontSize: 13,
                                  verticalAlign: "top",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {key}
                              </td>
                              <td
                                style={{
                                  padding: "4px 8px",
                                  fontFamily: "var(--mono, monospace)",
                                  fontSize: 13,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-all",
                                }}
                              >
                                {renderParamValue(val)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Section 3: Network Stats */}
      {tab === "network" && (
        <>
          {networkError && (
            <p style={{ color: "var(--red, #ef4444)" }}>{networkError}</p>
          )}
          {!networkStats && !networkError && (
            <p style={{ color: "var(--text2)" }}>Loading network stats...</p>
          )}
          {networkStats && (
            <>
              <div className="grid-4" style={{ marginBottom: 24 }}>
                <div className="card">
                  <h3>Inflation</h3>
                  <div className="value accent">
                    {(parseFloat(networkStats.inflation) * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="card">
                  <h3>Annual Provisions</h3>
                  <div className="value">
                    {formatClaw(
                      Math.floor(parseFloat(networkStats.annualProvisions)).toString()
                    )}
                  </div>
                </div>
                <div className="card">
                  <h3>Bonded Tokens</h3>
                  <div className="value accent">
                    {formatClaw(networkStats.bondedTokens)}
                  </div>
                </div>
                <div className="card">
                  <h3>Not Bonded</h3>
                  <div className="value">
                    {formatClaw(networkStats.notBondedTokens)}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 12 }}>Total Supply</h3>
                {networkStats.totalSupply.length === 0 ? (
                  <p style={{ color: "var(--text2)" }}>No supply data</p>
                ) : (
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Denom</th>
                        <th style={thStyle}>Amount</th>
                        <th style={thStyle}>Formatted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {networkStats.totalSupply.map((s, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{s.denom}</td>
                          <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                            {BigInt(s.amount || "0").toLocaleString()}
                          </td>
                          <td style={tdStyle}>
                            {s.denom === "uclaw" ? formatClaw(s.amount) : s.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 12 }}>Community Pool</h3>
                {networkStats.communityPool.length === 0 ? (
                  <p style={{ color: "var(--text2)" }}>No community pool data</p>
                ) : (
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Denom</th>
                        <th style={thStyle}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {networkStats.communityPool.map((c, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{c.denom}</td>
                          <td style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}>
                            {parseFloat(c.amount).toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 12 }}>Staking Pool</h3>
                <table style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td style={labelStyle}>Bonded Tokens</td>
                      <td style={valueStyle}>{formatClaw(networkStats.bondedTokens)}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Not Bonded Tokens</td>
                      <td style={valueStyle}>{formatClaw(networkStats.notBondedTokens)}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Bonded Ratio</td>
                      <td style={valueStyle}>
                        {(() => {
                          const bonded = BigInt(networkStats.bondedTokens || "0");
                          const notBonded = BigInt(networkStats.notBondedTokens || "0");
                          const total = bonded + notBonded;
                          if (total === 0n) return "0%";
                          return `${((Number(bonded) / Number(total)) * 100).toFixed(2)}%`;
                        })()}
                      </td>
                    </tr>
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

const labelStyle: React.CSSProperties = {
  color: "var(--text2)",
  padding: "6px 8px",
  whiteSpace: "nowrap",
  verticalAlign: "top",
  width: "180px",
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
