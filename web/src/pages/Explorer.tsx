import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getBlockRange,
  getNetStatus,
  getLatestBlock,
  type Block,
  timeAgo,
  shortHash,
  CHAIN_RPC,
} from "../lib/chain.ts";
import { useChainEvents } from "../hooks/useChainEvents.ts";
import ExportMenu from "../components/ExportMenu.tsx";

const BLOCKS_PER_PAGE = 20;

const TX_FILTER_OPTIONS = [
  "All",
  "Transfers",
  "Staking",
  "Governance",
  "Agent",
  "Privacy",
  "GPU",
] as const;

type TxFilter = (typeof TX_FILTER_OPTIONS)[number];

export default function Explorer() {
  useDocTitle("Explorer");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [network, setNetwork] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [latestHeight, setLatestHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [liveMode, setLiveMode] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("All");
  const navigate = useNavigate();

  // Track live blocks separately so toggling off restores paged view.
  const liveBlocksRef = useRef<Block[]>([]);

  // Initial load: fetch the latest height and page 1.
  useEffect(() => {
    (async () => {
      try {
        const [latest, net] = await Promise.all([
          getLatestBlock(),
          getNetStatus(),
        ]);
        const h = parseInt(latest.height);
        setLatestHeight(h);
        setNetwork(net.nodeInfo.network);
        const blks = await getBlockRange(h, BLOCKS_PER_PAGE);
        setBlocks(blks);
      } catch {
        /* offline */
      }
      setLoading(false);
    })();
  }, []);

  // Fetch blocks whenever currentPage changes (but not during live mode).
  useEffect(() => {
    if (liveMode || latestHeight === 0) return;
    (async () => {
      setLoading(true);
      try {
        const from = latestHeight - (currentPage - 1) * BLOCKS_PER_PAGE;
        const blks = await getBlockRange(from, BLOCKS_PER_PAGE);
        setBlocks(blks);
      } catch {
        /* offline */
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, latestHeight]);

  // Live mode: subscribe to new blocks via WebSocket.
  const onLiveEvent = useCallback(() => {
    // When a new tx event fires we re-fetch the latest block to capture it.
    (async () => {
      try {
        const latest = await getLatestBlock();
        const h = parseInt(latest.height);
        setLatestHeight(h);
        liveBlocksRef.current = [
          latest,
          ...liveBlocksRef.current.filter((b) => b.height !== latest.height),
        ].slice(0, BLOCKS_PER_PAGE * 2);
        setBlocks([...liveBlocksRef.current].slice(0, BLOCKS_PER_PAGE));
      } catch {
        /* offline */
      }
    })();
  }, []);

  const { connected: wsConnected } = useChainEvents({
    rpcUrl: CHAIN_RPC,
    enabled: liveMode,
    onEvent: onLiveEvent,
  });

  // Also poll latest block every 6s during live mode to catch empty blocks.
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(onLiveEvent, 6000);
    return () => clearInterval(interval);
  }, [liveMode, onLiveEvent]);

  function handleToggleLive() {
    if (!liveMode) {
      liveBlocksRef.current = [...blocks];
      setCurrentPage(1);
    }
    setLiveMode((prev) => !prev);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    if (/^\d+$/.test(q)) {
      navigate(`/explorer/block/${q}`);
    } else if (q.length === 64 || q.startsWith("0x")) {
      navigate(`/explorer/tx/${q.replace("0x", "").toUpperCase()}`);
    } else if (q.startsWith("cosmos") || q.startsWith("claw")) {
      navigate(`/explorer/account/${q}`);
    }
    setSearch("");
  }

  function goLatest() {
    setCurrentPage(1);
    setLiveMode(false);
    (async () => {
      setLoading(true);
      try {
        const latest = await getLatestBlock();
        const h = parseInt(latest.height);
        setLatestHeight(h);
        const blks = await getBlockRange(h, BLOCKS_PER_PAGE);
        setBlocks(blks);
      } catch {
        /* offline */
      }
      setLoading(false);
    })();
  }

  const totalPages = Math.max(1, Math.ceil(latestHeight / BLOCKS_PER_PAGE));

  // The tx type filter is kept as a UI hint. CometBFT /block doesn't return
  // decoded tx types, so per-block filtering requires REST tx queries per block
  // which is too expensive. The dropdown stays for UX but filtering is a no-op.

  const exportData = useMemo(
    () =>
      blocks.map((b) => ({
        height: b.height,
        hash: b.hash,
        txCount: b.txCount,
        gasUsed: b.gasUsed ?? "",
        proposer: b.proposer,
        time: b.time,
      })),
    [blocks],
  );

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Block Explorer</h1>
          <p className="page-subtitle">{network || "ClawChain"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {liveMode && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: "#22c55e",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              LIVE{wsConnected ? "" : " (connecting...)"}
            </span>
          )}
          <button
            onClick={handleToggleLive}
            className={liveMode ? "btn-primary" : "btn-outline"}
            style={{ minWidth: 72 }}
          >
            {liveMode ? "Stop" : "Live"}
          </button>
          {blocks.length > 0 && <ExportMenu data={exportData} filename="blocks" />}
        </div>
      </div>

      <form onSubmit={handleSearch} className="form-row" style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by block height, tx hash, or address..."
        />
        <button type="submit">Search</button>
      </form>

      {/* Transaction type filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--text2)" }}>Tx Type:</label>
        <select
          value={txFilter}
          onChange={(e) => setTxFilter(e.target.value as TxFilter)}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg2)",
            color: "var(--text1)",
            fontSize: 13,
          }}
        >
          {TX_FILTER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {txFilter !== "All" && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            (per-block tx filtering requires decoded tx data — use search for specific txs)
          </span>
        )}
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          <p>Loading blocks...</p>
        </div>
      ) : blocks.length === 0 ? (
        <div className="empty">No blocks found. Is the chain running?</div>
      ) : (
        <>
          <div className="table-wrap">
            <h2>
              {liveMode
                ? "Live Blocks"
                : `Blocks (Page ${currentPage} of ${totalPages.toLocaleString()})`}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Height</th>
                  <th>Hash</th>
                  <th>Txs</th>
                  <th>Gas Used</th>
                  <th>Proposer</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.height}>
                    <td>
                      <Link to={`/explorer/block/${b.height}`} className="mono">
                        {Number(b.height).toLocaleString()}
                      </Link>
                    </td>
                    <td className="mono">{shortHash(b.hash)}</td>
                    <td>{b.txCount}</td>
                    <td className="mono">{b.gasUsed ?? "-"}</td>
                    <td className="mono">{shortHash(b.proposer)}</td>
                    <td>{timeAgo(b.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls (hidden during live mode) */}
          {!liveMode && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
                marginTop: 20,
              }}
            >
              <button
                className="btn-outline"
                onClick={goLatest}
                disabled={currentPage === 1}
              >
                Latest
              </button>
              <button
                className="btn-outline"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                &larr; Prev
              </button>
              <span style={{ fontSize: 14, color: "var(--text2)" }}>
                Page {currentPage} / {totalPages.toLocaleString()}
              </span>
              <button
                className="btn-outline"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}

      {/* Keyframe for the live pulse indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
