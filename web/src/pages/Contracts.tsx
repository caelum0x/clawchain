import { useEffect, useState } from "react";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getWasmCodes,
  getWasmContractsByCode,
  queryWasmContract,
  type WasmCode,
  type WasmContract,
} from "../lib/chain.ts";

type Tab = "codes" | "contracts" | "query";

export default function Contracts() {
  useDocTitle("Smart Contracts");

  const [tab, setTab] = useState<Tab>("codes");
  const [codes, setCodes] = useState<WasmCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<WasmContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [queryAddr, setQueryAddr] = useState("");
  const [queryMsg, setQueryMsg] = useState('{"config":{}}');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoadingCodes(true);
    getWasmCodes().then((c) => {
      if (!cancel) {
        setCodes(c);
        setLoadingCodes(false);
      }
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!selectedCodeId) {
      setContracts([]);
      return;
    }
    let cancel = false;
    setLoadingContracts(true);
    getWasmContractsByCode(selectedCodeId).then((c) => {
      if (!cancel) {
        setContracts(c);
        setLoadingContracts(false);
      }
    });
    return () => { cancel = true; };
  }, [selectedCodeId]);

  const handleQuery = async () => {
    setQueryError(null);
    setQueryResult(null);
    if (!queryAddr.trim()) {
      setQueryError("Enter a contract address");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(queryMsg);
    } catch {
      setQueryError("Invalid JSON query message");
      return;
    }
    setQuerying(true);
    try {
      const result = await queryWasmContract(queryAddr.trim(), parsed);
      setQueryResult(JSON.stringify(result, null, 2));
    } catch (e: any) {
      setQueryError(e?.message ?? "Query failed");
    } finally {
      setQuerying(false);
    }
  };

  const short = (s: string) => (s.length > 16 ? s.slice(0, 10) + "…" + s.slice(-6) : s);

  const tabs: { id: Tab; label: string }[] = [
    { id: "codes", label: "Uploaded Codes" },
    { id: "contracts", label: "Instances" },
    { id: "query", label: "Query Contract" },
  ];

  return (
    <div>
      <h1 className="page-title">Smart Contracts</h1>
      <p className="page-subtitle">
        Browse uploaded CosmWasm codes, deployed contract instances, and query contract state.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", margin: "1.5rem 0" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? "btn btn-primary" : "btn btn-secondary"}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "codes" && (
        <div className="card">
          <h2 style={{ marginBottom: "1rem" }}>Uploaded Codes</h2>
          {loadingCodes ? (
            <p style={{ color: "var(--text2)" }}>Loading codes from chain…</p>
          ) : codes.length === 0 ? (
            <p style={{ color: "var(--text2)" }}>
              No codes uploaded yet. Use <code>clawd wasm store</code> or <code>clawchaind tx wasm store</code> to upload.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Code ID</th>
                    <th>Creator</th>
                    <th>Data Hash</th>
                    <th>Permission</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.codeId}>
                      <td><strong>{c.codeId}</strong></td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{short(c.creator)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{short(c.dataHash)}</td>
                      <td>{c.instantiatePermission}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem" }}
                          onClick={() => {
                            setSelectedCodeId(c.codeId);
                            setTab("contracts");
                          }}
                        >
                          View Instances
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "contracts" && (
        <div className="card">
          <h2 style={{ marginBottom: "1rem" }}>
            Contract Instances
            {selectedCodeId && <span style={{ color: "var(--text2)", fontWeight: "normal", fontSize: "0.9rem" }}> — Code {selectedCodeId}</span>}
          </h2>
          {!selectedCodeId ? (
            <div>
              <p style={{ color: "var(--text2)", marginBottom: "1rem" }}>
                Select a code from the Uploaded Codes tab, or enter a code ID:
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  min="1"
                  placeholder="Code ID"
                  style={{ width: "120px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) setSelectedCodeId(val);
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('input[type="number"]');
                    if (input?.value) setSelectedCodeId(input.value);
                  }}
                >
                  Load
                </button>
              </div>
            </div>
          ) : loadingContracts ? (
            <p style={{ color: "var(--text2)" }}>Loading instances…</p>
          ) : contracts.length === 0 ? (
            <p style={{ color: "var(--text2)" }}>No contracts instantiated from code {selectedCodeId}.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Label</th>
                    <th>Creator</th>
                    <th>Admin</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.address}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{short(c.address)}</td>
                      <td>{c.label || "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{short(c.creator)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{c.admin ? short(c.admin) : "—"}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem" }}
                          onClick={() => {
                            setQueryAddr(c.address);
                            setTab("query");
                          }}
                        >
                          Query
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedCodeId && (
            <button
              className="btn btn-secondary"
              style={{ marginTop: "1rem" }}
              onClick={() => setSelectedCodeId(null)}
            >
              Clear Filter
            </button>
          )}
        </div>
      )}

      {tab === "query" && (
        <div className="card">
          <h2 style={{ marginBottom: "1rem" }}>Query Contract</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text2)", fontSize: "0.85rem" }}>Contract Address</label>
              <input
                type="text"
                value={queryAddr}
                onChange={(e) => setQueryAddr(e.target.value)}
                placeholder="claw1..."
                style={{ width: "100%", fontFamily: "monospace" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text2)", fontSize: "0.85rem" }}>Query Message (JSON)</label>
              <textarea
                value={queryMsg}
                onChange={(e) => setQueryMsg(e.target.value)}
                rows={4}
                style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }}
              />
            </div>
            <button className="btn btn-primary" onClick={handleQuery} disabled={querying}>
              {querying ? "Querying…" : "Execute Query"}
            </button>
            {queryError && (
              <div style={{ padding: "0.75rem", background: "var(--danger-bg, #fef2f2)", borderRadius: "0.5rem", color: "var(--danger, #dc2626)", fontSize: "0.9rem" }}>
                {queryError}
              </div>
            )}
            {queryResult && (
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text2)", fontSize: "0.85rem" }}>Result</label>
                <pre style={{
                  padding: "1rem", background: "var(--bg2)", borderRadius: "0.5rem",
                  fontSize: "0.8rem", overflow: "auto", maxHeight: "400px",
                }}>
                  {queryResult}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>CosmWasm on ClawChain</h3>
        <p style={{ color: "var(--text2)", fontSize: "0.9rem", lineHeight: 1.6 }}>
          ClawChain supports CosmWasm smart contracts (Rust → WASM). Write contracts
          in Rust, compile to WebAssembly, upload to chain, and interact via transactions or queries.
        </p>
        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ padding: "0.5rem 1rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text2)" }}>Runtime:</span>{" "}
            <strong>CosmWasm 2.2 / wasmvm 3.0</strong>
          </div>
          <div style={{ padding: "0.5rem 1rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text2)" }}>Language:</span>{" "}
            <strong>Rust → WASM</strong>
          </div>
          <div style={{ padding: "0.5rem 1rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text2)" }}>IBC:</span>{" "}
            <strong>Enabled</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
