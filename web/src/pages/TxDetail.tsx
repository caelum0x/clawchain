import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTxByHash, timeAgo, type Tx } from "../lib/chain.ts";
import { decodeTxMessage, type DecodedMessage } from "../lib/decodeTxMessage.ts";
import Breadcrumbs from "../components/Breadcrumbs.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";
import CopyButton from "../components/CopyButton.tsx";

export default function TxDetail() {
  useDocTitle("Transaction Detail");
  const { hash } = useParams<{ hash: string }>();
  const [tx, setTx] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!hash) return;
    (async () => {
      setTx(await getTxByHash(hash));
      setLoading(false);
    })();
  }, [hash]);

  if (loading) return <div className="loading"><div className="spinner" /><p>Loading transaction...</p></div>;
  if (!tx) return <div className="empty">Transaction not found.</div>;

  const decoded: DecodedMessage[] = tx.messages.map((m) => decodeTxMessage(m));
  const shortTxHash = tx.hash.length > 16 ? `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}` : tx.hash;
  const gasEfficiency = Number(tx.gasWanted) > 0
    ? ((Number(tx.gasUsed) / Number(tx.gasWanted)) * 100).toFixed(1)
    : "0";

  return (
    <>
      <Breadcrumbs items={[
        { label: "Explorer", to: "/explorer" },
        { label: "Transactions", to: "/explorer" },
        { label: shortTxHash },
      ]} />
      <h1 className="page-title">Transaction</h1>
      <p className="page-subtitle mono" style={{ wordBreak: "break-all" }}>{tx.hash} <CopyButton text={tx.hash} /></p>

      <div className="grid-4">
        <div className="card">
          <h3>Status</h3>
          <div>
            <span className={`badge ${tx.code === 0 ? "success" : "error"}`} style={{ fontSize: 14 }}>
              {tx.code === 0 ? "Success" : `Error ${tx.code}`}
            </span>
          </div>
        </div>
        <div className="card">
          <h3>Block</h3>
          <div className="value">
            <Link to={`/explorer/block/${tx.height}`}>{Number(tx.height).toLocaleString()}</Link>
          </div>
        </div>
        <div className="card">
          <h3>Gas Used / Wanted</h3>
          <div style={{ fontSize: 16 }}>{Number(tx.gasUsed).toLocaleString()} / {Number(tx.gasWanted).toLocaleString()}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {gasEfficiency}% efficiency
          </div>
        </div>
        <div className="card">
          <h3>Messages</h3>
          <div className="value">{tx.messages.length}</div>
        </div>
      </div>

      {/* Timestamp and meta info */}
      {tx.timestamp && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Timestamp</h3>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span>{timeAgo(tx.timestamp)}</span>
            <span style={{ color: "var(--text2)", fontSize: 13 }}>
              ({new Date(tx.timestamp).toLocaleString()})
            </span>
          </div>
        </div>
      )}

      {tx.memo && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Memo</h3>
          <div>{tx.memo}</div>
        </div>
      )}

      {/* Message summary table */}
      <div className="table-wrap">
        <h2>Messages</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {tx.messages.map((m, i) => (
              <tr key={i}>
                <td>{i}</td>
                <td className="mono" style={{ fontSize: 13 }}>{m.typeUrl}</td>
                <td>{decoded[i]?.label || m.typeUrl.split(".").pop()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Decoded message details */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 16 }}>Message Details</h2>
        {decoded.map((d, i) => (
          <div
            key={i}
            className="card"
            style={{ marginBottom: 16 }}
          >
            <h3 style={{ textTransform: "none", letterSpacing: 0 }}>
              <span style={{ color: "var(--text2)", fontWeight: 400 }}>#{i}</span>{" "}
              {d.label}
            </h3>
            <table style={{ marginTop: 8 }}>
              <tbody>
                {d.fields.map((f, j) => (
                  <tr key={j}>
                    <td style={{ color: "var(--text2)", width: 160, verticalAlign: "top" }}>{f.key}</td>
                    <td className="mono" style={{ wordBreak: "break-all" }}>{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Raw JSON toggle */}
      <div style={{ marginTop: 24 }}>
        <button
          className="btn-outline"
          onClick={() => setShowRaw(!showRaw)}
          style={{ fontSize: 13 }}
        >
          {showRaw ? "Hide Raw Data" : "Show Raw Data"}
        </button>
        {showRaw && (
          <div className="card" style={{ marginTop: 12 }}>
            <pre
              className="mono"
              style={{
                fontSize: 12,
                overflow: "auto",
                maxHeight: 400,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(tx, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
