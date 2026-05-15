import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getBlock, getTxsByHeight, timeAgo, type Block, type Tx, shortHash } from "../lib/chain.ts";
import Breadcrumbs from "../components/Breadcrumbs.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";
import CopyButton from "../components/CopyButton.tsx";
import ExportMenu from "../components/ExportMenu.tsx";

export default function BlockDetail() {
  useDocTitle("Block Detail");
  const { height } = useParams<{ height: string }>();
  const [block, setBlock] = useState<Block | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!height) return;
    (async () => {
      try {
        const [b, t] = await Promise.all([
          getBlock(height),
          getTxsByHeight(height),
        ]);
        setBlock(b);
        setTxs(t);
      } catch { /* */ }
      setLoading(false);
    })();
  }, [height]);

  if (loading) return <div className="loading"><div className="spinner" /><p>Loading block...</p></div>;
  if (!block) return <div className="empty">Block not found.</div>;

  const h = parseInt(block.height);
  const totalGas = txs.reduce((sum, tx) => sum + Number(tx.gasUsed), 0);
  const successCount = txs.filter((tx) => tx.code === 0).length;
  const failCount = txs.length - successCount;

  const txExportData = txs.map((tx) => ({
    hash: tx.hash,
    status: tx.code === 0 ? "Success" : `Error ${tx.code}`,
    messages: tx.messages.map((m) => m.typeUrl.split(".").pop()).join(", "),
    gasUsed: tx.gasUsed,
    gasWanted: tx.gasWanted,
  }));

  return (
    <>
      <Breadcrumbs items={[
        { label: "Explorer", to: "/explorer" },
        { label: "Blocks", to: "/explorer" },
        { label: `Block #${Number(block.height).toLocaleString()}` },
      ]} />
      <div className="section-header">
        <h1 className="page-title">Block #{Number(block.height).toLocaleString()}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {h > 1 && (
            <Link to={`/explorer/block/${h - 1}`}>
              <button className="btn-outline">&larr; Prev</button>
            </Link>
          )}
          <Link to={`/explorer/block/${h + 1}`}>
            <button className="btn-outline">Next &rarr;</button>
          </Link>
        </div>
      </div>

      <div className="grid-4">
        <div className="card">
          <h3>Height</h3>
          <div className="value">{Number(block.height).toLocaleString()}</div>
        </div>
        <div className="card">
          <h3>Transactions</h3>
          <div className="value">{block.txCount}</div>
          {txs.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
              {successCount > 0 && <span style={{ color: "var(--success)" }}>{successCount} success</span>}
              {successCount > 0 && failCount > 0 && " / "}
              {failCount > 0 && <span style={{ color: "var(--error)" }}>{failCount} failed</span>}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Gas Used</h3>
          <div className="value">{totalGas > 0 ? totalGas.toLocaleString() : "0"}</div>
        </div>
        <div className="card">
          <h3>Time</h3>
          <div style={{ fontSize: 14 }}>{timeAgo(block.time)}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {new Date(block.time).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Block Details</h3>
        <table>
          <tbody>
            <tr>
              <td style={{ color: "var(--text2)", width: 140 }}>Block Hash</td>
              <td className="mono" style={{ wordBreak: "break-all" }}>{block.hash} <CopyButton text={block.hash} /></td>
            </tr>
            <tr>
              <td style={{ color: "var(--text2)" }}>Proposer</td>
              <td className="mono" style={{ wordBreak: "break-all" }}>{block.proposer} <CopyButton text={block.proposer} /></td>
            </tr>
            <tr>
              <td style={{ color: "var(--text2)" }}>Timestamp</td>
              <td>{new Date(block.time).toISOString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {txs.length > 0 && (
        <div className="table-wrap">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2>Transactions ({txs.length})</h2>
            <ExportMenu data={txExportData} filename={`block-${block.height}-txs`} />
          </div>
          <table>
            <thead>
              <tr>
                <th>Hash</th>
                <th>Status</th>
                <th>Messages</th>
                <th>Gas Used</th>
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
                    <span className={`badge ${tx.code === 0 ? "success" : "error"}`}>
                      {tx.code === 0 ? "Success" : `Error ${tx.code}`}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    {tx.messages.map((m) => m.typeUrl.split(".").pop()).join(", ")}
                  </td>
                  <td>
                    <span>{Number(tx.gasUsed).toLocaleString()}</span>
                    <span style={{ color: "var(--text2)", fontSize: 12 }}>
                      {" "}/ {Number(tx.gasWanted).toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {txs.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--text2)" }}>
          No transactions in this block.
        </div>
      )}
    </>
  );
}
