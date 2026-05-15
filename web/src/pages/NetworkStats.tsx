import { useEffect, useState, useRef, useCallback } from "react";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getNetStatus,
  getRecentBlocks,
  shortHash,
  timeAgo,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";

const RPC = chainConfig.rpcEndpoint;
const REST = chainConfig.restEndpoint;

// ---- helpers ----

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatUptime(genesisIso: string): string {
  const diff = (Date.now() - new Date(genesisIso).getTime()) / 1000;
  if (diff < 0) return "N/A";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// ---- types ----

interface PeerInfo {
  nodeId: string;
  remoteIp: string;
  moniker: string;
  network: string;
  sendBytes: number;
  recvBytes: number;
  connectionDuration: number;
  isOutbound: boolean;
}

interface ConsensusStatus {
  height: string;
  round: string;
  step: string;
  numValidators: number;
  numVoted: number;
}

interface NodeInfo {
  nodeId: string;
  moniker: string;
  protocolP2P: string;
  protocolBlock: string;
  protocolApp: string;
  listenAddr: string;
  catchingUp: boolean;
  latestBlockHash: string;
  latestAppHash: string;
  earliestBlockHeight: string;
}

interface GenesisInfo {
  genesisTime: string;
  chainId: string;
  initialValidators: number;
  consensusParams: Record<string, string>;
}

interface ModuleVersion {
  name: string;
  version: string;
}

interface NetworkOverview {
  chainId: string;
  blockHeight: string;
  peerCount: number;
  avgBlockTime: string;
  networkVersion: string;
  uptime: string;
}

type SortDir = "asc" | "desc";

// ---- component ----

export default function NetworkStats() {
  useDocTitle("Network Stats");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [consensus, setConsensus] = useState<ConsensusStatus | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [genesisInfo, setGenesisInfo] = useState<GenesisInfo | null>(null);
  const [moduleVersions, setModuleVersions] = useState<ModuleVersion[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [peerSortDir, setPeerSortDir] = useState<SortDir>("desc");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- data fetching ----

  const fetchOverview = useCallback(async () => {
    try {
      const [net, blocks] = await Promise.all([
        getNetStatus(),
        getRecentBlocks(10).catch(() => []),
      ]);

      let avgBlockTime = "N/A";
      if (blocks.length >= 2) {
        let totalDelta = 0;
        for (let i = 0; i < blocks.length - 1; i++) {
          const curr = new Date(blocks[i].time).getTime();
          const prev = new Date(blocks[i + 1].time).getTime();
          totalDelta += (curr - prev) / 1000;
        }
        avgBlockTime = (totalDelta / (blocks.length - 1)).toFixed(2) + "s";
      }

      // Get peer count from net_info
      let peerCount = 0;
      try {
        const netInfoData = await fetchJson(`${RPC}/net_info`);
        peerCount = netInfoData.result?.n_peers ? parseInt(netInfoData.result.n_peers) : 0;
      } catch {
        /* offline */
      }

      // Get genesis time for uptime
      let uptime = "N/A";
      try {
        const nodeInfoData = await fetchJson(`${REST}/cosmos/base/tendermint/v1beta1/node_info`);
        const genesisTime = nodeInfoData.default_node_info?.other?.genesis_time;
        if (genesisTime) {
          uptime = formatUptime(genesisTime);
        }
      } catch {
        // Try from status
        try {
          const statusData = await fetchJson(`${RPC}/status`);
          const earliest = statusData.result?.sync_info?.earliest_block_time;
          if (earliest) uptime = formatUptime(earliest);
        } catch {
          /* offline */
        }
      }

      setOverview({
        chainId: net.nodeInfo.network,
        blockHeight: net.syncInfo.latestHeight,
        peerCount,
        avgBlockTime,
        networkVersion: net.nodeInfo.version || "unknown",
        uptime,
      });
    } catch {
      /* offline */
    }
  }, []);

  const fetchPeers = useCallback(async () => {
    try {
      const data = await fetchJson(`${RPC}/net_info`);
      const rawPeers = data.result?.peers ?? [];
      const mapped: PeerInfo[] = rawPeers.map((p: any) => ({
        nodeId: p.node_info?.id ?? "",
        remoteIp: p.remote_ip ?? "",
        moniker: p.node_info?.moniker ?? "",
        network: p.node_info?.network ?? "",
        sendBytes: parseInt(p.connection_status?.SendMonitor?.Bytes ?? "0"),
        recvBytes: parseInt(p.connection_status?.RecvMonitor?.Bytes ?? "0"),
        connectionDuration: parseInt(p.connection_status?.Duration ?? "0") / 1e9, // nanoseconds to seconds
        isOutbound: p.is_outbound ?? false,
      }));
      setPeers(mapped);
    } catch {
      /* offline */
    }
  }, []);

  const fetchConsensus = useCallback(async () => {
    try {
      const data = await fetchJson(`${RPC}/dump_consensus_state`);
      const rs = data.result?.round_state ?? {};
      const hrsStr = rs["height/round/step"] ?? "0/0/0";
      const [height, round, step] = hrsStr.split("/");

      const stepMap: Record<string, string> = {
        "1": "propose",
        "2": "prevote",
        "3": "precommit",
        "4": "commit",
      };

      // Count votes
      const validators = rs.validators?.validators ?? [];
      const prevotes = rs.votes ?? [];
      let numVoted = 0;
      if (Array.isArray(prevotes)) {
        for (const roundVotes of prevotes) {
          const votes = roundVotes?.prevotes ?? [];
          numVoted = votes.filter((v: string) => v && v !== "nil-Vote").length;
        }
      }

      setConsensus({
        height: height ?? "0",
        round: round ?? "0",
        step: stepMap[step] ?? `step-${step}`,
        numValidators: validators.length,
        numVoted,
      });
    } catch {
      // Fallback to consensus_state
      try {
        const data = await fetchJson(`${RPC}/consensus_state`);
        const rs = data.result?.round_state ?? {};
        const hrsStr = rs["height/round/step"] ?? "0/0/0";
        const [height, round, step] = hrsStr.split("/");
        const stepMap: Record<string, string> = {
          "1": "propose",
          "2": "prevote",
          "3": "precommit",
          "4": "commit",
        };
        setConsensus({
          height: height ?? "0",
          round: round ?? "0",
          step: stepMap[step] ?? `step-${step}`,
          numValidators: 0,
          numVoted: 0,
        });
      } catch {
        /* offline */
      }
    }
  }, []);

  const fetchNodeInfo = useCallback(async () => {
    try {
      const data = await fetchJson(`${RPC}/status`);
      const r = data.result;
      setNodeInfo({
        nodeId: r.node_info?.id ?? "",
        moniker: r.node_info?.moniker ?? "",
        protocolP2P: r.node_info?.protocol_version?.p2p ?? "0",
        protocolBlock: r.node_info?.protocol_version?.block ?? "0",
        protocolApp: r.node_info?.protocol_version?.app ?? "0",
        listenAddr: r.node_info?.listen_addr ?? "",
        catchingUp: r.sync_info?.catching_up ?? false,
        latestBlockHash: r.sync_info?.latest_block_hash ?? "",
        latestAppHash: r.sync_info?.latest_app_hash ?? "",
        earliestBlockHeight: r.sync_info?.earliest_block_height ?? "1",
      });
    } catch {
      /* offline */
    }
  }, []);

  const fetchGenesisInfo = useCallback(async () => {
    try {
      const data = await fetchJson(`${REST}/cosmos/base/tendermint/v1beta1/node_info`);
      const ni = data.default_node_info ?? data.application_version ?? {};

      // Also try getting genesis validators
      let initialValidators = 0;
      try {
        const valData = await fetchJson(`${REST}/cosmos/base/tendermint/v1beta1/validatorsets/1`);
        initialValidators = valData.validators?.length ?? 0;
      } catch {
        /* cannot fetch genesis validators */
      }

      const genesisTime = ni.other?.genesis_time ?? "";

      // Gather consensus params
      const params: Record<string, string> = {};
      try {
        const cpData = await fetchJson(`${REST}/cosmos/base/tendermint/v1beta1/node_info`);
        const appVersion = cpData.application_version ?? {};
        if (appVersion.app_name) params["App Name"] = appVersion.app_name;
        if (appVersion.version) params["App Version"] = appVersion.version;
        if (appVersion.git_commit) params["Git Commit"] = appVersion.git_commit.slice(0, 12);
        if (appVersion.cosmos_sdk_version) params["Cosmos SDK"] = appVersion.cosmos_sdk_version;
        if (appVersion.go_version) params["Go Version"] = appVersion.go_version;
      } catch {
        /* offline */
      }

      setGenesisInfo({
        genesisTime: genesisTime || "N/A",
        chainId: ni.network ?? "",
        initialValidators,
        consensusParams: params,
      });
    } catch {
      /* offline */
    }
  }, []);

  const fetchModuleVersions = useCallback(async () => {
    try {
      const data = await fetchJson(`${REST}/cosmos/upgrade/v1beta1/module_versions`);
      const versions: ModuleVersion[] = (data.module_versions ?? []).map((m: any) => ({
        name: m.name ?? "",
        version: m.version ?? "0",
      }));
      versions.sort((a, b) => a.name.localeCompare(b.name));
      setModuleVersions(versions);
    } catch {
      /* offline */
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchOverview(),
      fetchPeers(),
      fetchConsensus(),
      fetchNodeInfo(),
      fetchGenesisInfo(),
      fetchModuleVersions(),
    ]);
    setLastUpdated(new Date());
    setLoading(false);
  }, [fetchOverview, fetchPeers, fetchConsensus, fetchNodeInfo, fetchGenesisInfo, fetchModuleVersions]);

  // ---- effects ----

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchAll, 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchAll]);

  // ---- peer sorting ----

  const sortedPeers = [...peers].sort((a, b) => {
    const diff = a.connectionDuration - b.connectionDuration;
    return peerSortDir === "asc" ? diff : -diff;
  });

  const togglePeerSort = () => {
    setPeerSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  // ---- render helpers ----

  const secondsAgo = Math.round((Date.now() - lastUpdated.getTime()) / 1000);

  const stepClass = (step: string) => {
    if (step === "propose") return "propose";
    if (step === "prevote") return "prevote";
    if (step === "precommit" || step === "commit") return "precommit";
    return "";
  };

  if (loading) {
    return (
      <div className="loading" data-testid="loading">
        <div className="spinner" />
        <p>Loading network statistics...</p>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Network Statistics</h1>
          <p className="page-subtitle">
            Real-time peer information, consensus status, and chain statistics
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="refresh-indicator" data-testid="last-updated">
            Updated {secondsAgo}s ago
          </span>
          <button
            className={`refresh-btn ${autoRefresh ? "primary" : "btn-outline"}`}
            onClick={() => setAutoRefresh((v) => !v)}
            data-testid="refresh-btn"
          >
            {autoRefresh ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      {/* Section 1: Network Overview */}
      <div className="grid-4" data-testid="network-overview">
        <div className="card">
          <h3>Chain ID</h3>
          <div className="value" style={{ fontSize: 20 }}>{overview?.chainId ?? "..."}</div>
        </div>
        <div className="card">
          <h3>Block Height</h3>
          <div className="value accent">
            {overview ? Number(overview.blockHeight).toLocaleString() : "..."}
          </div>
        </div>
        <div className="card">
          <h3>Peer Count</h3>
          <div className="value accent">{overview?.peerCount ?? "..."}</div>
        </div>
        <div className="card">
          <h3>Avg Block Time</h3>
          <div className="value">{overview?.avgBlockTime ?? "..."}</div>
        </div>
        <div className="card">
          <h3>Network Version</h3>
          <div className="value" style={{ fontSize: 20 }}>{overview?.networkVersion ?? "..."}</div>
        </div>
        <div className="card">
          <h3>Uptime</h3>
          <div className="value" style={{ fontSize: 20 }}>{overview?.uptime ?? "..."}</div>
        </div>
      </div>

      {/* Section 2: Connected Peers Table */}
      <div className="table-wrap" data-testid="peer-table-section">
        <h2>Connected Peers ({peers.length})</h2>
        {peers.length === 0 ? (
          <p className="empty">No peers connected or data unavailable.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="peer-table">
              <thead>
                <tr>
                  <th>Peer ID</th>
                  <th>Remote IP</th>
                  <th>Moniker</th>
                  <th>Network</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th
                    style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={togglePeerSort}
                    title="Click to sort"
                  >
                    Duration {peerSortDir === "desc" ? "v" : "^"}
                  </th>
                  <th>Outbound</th>
                </tr>
              </thead>
              <tbody>
                {sortedPeers.map((p) => (
                  <tr key={p.nodeId}>
                    <td className="mono">{p.nodeId ? `${p.nodeId.slice(0, 8)}...` : "N/A"}</td>
                    <td>{p.remoteIp || "N/A"}</td>
                    <td>{p.moniker || "unknown"}</td>
                    <td>{p.network || "N/A"}</td>
                    <td>{formatBytes(p.sendBytes)}</td>
                    <td>{formatBytes(p.recvBytes)}</td>
                    <td>{formatDuration(p.connectionDuration)}</td>
                    <td>{p.isOutbound ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Consensus Status */}
      <div className="card" style={{ marginBottom: 24 }} data-testid="consensus-section">
        <h3 style={{ fontSize: 16, textTransform: "none", letterSpacing: 0 }}>Consensus Status</h3>
        {consensus ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <span style={{ color: "var(--text2)", fontSize: 13 }}>Height</span>
                <div style={{ fontWeight: 700, fontSize: 20 }}>
                  {Number(consensus.height).toLocaleString()}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text2)", fontSize: 13 }}>Round</span>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{consensus.round}</div>
              </div>
              <div>
                <span style={{ color: "var(--text2)", fontSize: 13 }}>Step</span>
                <div>
                  <span className={`consensus-badge ${stepClass(consensus.step)}`}>
                    {consensus.step}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <span style={{ color: "var(--text2)", fontSize: 13 }}>H/R/S</span>
                <div className="mono" style={{ fontSize: 14 }}>
                  {consensus.height}/{consensus.round}/{consensus.step}
                </div>
              </div>
              {consensus.numValidators > 0 && (
                <div>
                  <span style={{ color: "var(--text2)", fontSize: 13 }}>Validator Votes</span>
                  <div style={{ fontWeight: 600 }}>
                    {consensus.numVoted} / {consensus.numValidators}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text2)", marginTop: 12 }}>Consensus data unavailable.</p>
        )}
      </div>

      {/* Section 4: Node Info */}
      <div className="card" style={{ marginBottom: 24 }} data-testid="node-info-section">
        <h3 style={{ fontSize: 16, textTransform: "none", letterSpacing: 0 }}>Node Info</h3>
        {nodeInfo ? (
          <table style={{ width: "100%", marginTop: 12 }}>
            <tbody>
              <tr>
                <td style={{ color: "var(--text2)", width: "30%" }}>Node ID</td>
                <td className="mono">{nodeInfo.nodeId}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Moniker</td>
                <td>{nodeInfo.moniker}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Protocol (P2P / Block / App)</td>
                <td className="mono">
                  {nodeInfo.protocolP2P} / {nodeInfo.protocolBlock} / {nodeInfo.protocolApp}
                </td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Listening Address</td>
                <td className="mono">{nodeInfo.listenAddr}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Catching Up</td>
                <td>
                  <span
                    style={{
                      color: nodeInfo.catchingUp ? "var(--yellow)" : "var(--green)",
                      fontWeight: 600,
                    }}
                  >
                    {nodeInfo.catchingUp ? "Yes" : "No"}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Latest Block Hash</td>
                <td className="mono">{shortHash(nodeInfo.latestBlockHash)}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Latest App Hash</td>
                <td className="mono">{shortHash(nodeInfo.latestAppHash)}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--text2)" }}>Earliest Block Height</td>
                <td>{Number(nodeInfo.earliestBlockHeight).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text2)", marginTop: 12 }}>Node info unavailable.</p>
        )}
      </div>

      {/* Section 5: Genesis Info */}
      <div className="card" style={{ marginBottom: 24 }} data-testid="genesis-section">
        <h3 style={{ fontSize: 16, textTransform: "none", letterSpacing: 0 }}>Genesis Info</h3>
        {genesisInfo ? (
          <div style={{ marginTop: 12 }}>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ color: "var(--text2)", width: "30%" }}>Genesis Time</td>
                  <td>{genesisInfo.genesisTime !== "N/A" ? new Date(genesisInfo.genesisTime).toLocaleString() : "N/A"}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Chain ID</td>
                  <td>{genesisInfo.chainId || "N/A"}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Initial Validators</td>
                  <td>{genesisInfo.initialValidators || "N/A"}</td>
                </tr>
              </tbody>
            </table>
            {Object.keys(genesisInfo.consensusParams).length > 0 && (
              <>
                <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: 14, color: "var(--text2)" }}>
                  Chain Parameters
                </h4>
                <table style={{ width: "100%" }}>
                  <tbody>
                    {Object.entries(genesisInfo.consensusParams).map(([key, val]) => (
                      <tr key={key}>
                        <td style={{ color: "var(--text2)", width: "30%" }}>{key}</td>
                        <td className="mono">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ) : (
          <p style={{ color: "var(--text2)", marginTop: 12 }}>Genesis info unavailable.</p>
        )}
      </div>

      {/* Section 6: Module Versions */}
      <div className="table-wrap" data-testid="module-versions-section">
        <h2>Module Versions ({moduleVersions.length})</h2>
        {moduleVersions.length === 0 ? (
          <p className="empty">No module version data available.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {moduleVersions.map((m) => (
                <tr key={m.name}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td className="mono">{m.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
