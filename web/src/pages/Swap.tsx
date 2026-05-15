import { useEffect, useState } from "react";
import useDocTitle from "../hooks/useDocTitle.ts";
import { chainConfig } from "../lib/config.ts";

const REST = chainConfig.restEndpoint;

interface PoolInfo {
  contractAddr: string;
  assets: string[];
  poolType: string;
  totalShare: string;
  reserves: string[];
}

async function fetchPools(): Promise<PoolInfo[]> {
  try {
    // Try querying factory for pairs
    const factoryQuery = btoa(JSON.stringify({ pairs: { limit: 30 } }));
    // Look for factory contracts by checking known code IDs
    const codesResp = await fetch(`${REST}/cosmwasm/wasm/v1/code?pagination.limit=100`);
    const codesData = await codesResp.json();
    const codeInfos: Array<{ code_id: string }> = codesData.code_infos ?? [];

    const pools: PoolInfo[] = [];

    // Try each code to find factory contracts
    for (const code of codeInfos.slice(0, 10)) {
      try {
        const contractsResp = await fetch(`${REST}/cosmwasm/wasm/v1/code/${code.code_id}/contracts?pagination.limit=5`);
        const contractsData = await contractsResp.json();
        const addrs: string[] = contractsData.contracts ?? [];

        for (const addr of addrs.slice(0, 3)) {
          // Try querying as a pair/pool contract
          try {
            const poolQuery = btoa(JSON.stringify({ pool: {} }));
            const poolResp = await fetch(`${REST}/cosmwasm/wasm/v1/contract/${addr}/smart/${poolQuery}`);
            if (!poolResp.ok) continue;
            const poolData = await poolResp.json();
            const pool = poolData.data;
            if (pool?.assets && Array.isArray(pool.assets)) {
              pools.push({
                contractAddr: addr,
                assets: pool.assets.map((a: any) =>
                  a.info?.native_token?.denom ?? a.info?.token?.contract_addr ?? "unknown"
                ),
                poolType: "XYK",
                totalShare: pool.total_share ?? "0",
                reserves: pool.assets.map((a: any) => a.amount ?? "0"),
              });
            }
          } catch {
            // Not a pool contract
          }
        }
      } catch {
        continue;
      }
    }
    return pools;
  } catch {
    return [];
  }
}

export default function Swap() {
  useDocTitle("ClawDEX");

  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchPools().then((p) => {
      if (!cancel) {
        setPools(p);
        setLoading(false);
      }
    });
    return () => { cancel = true; };
  }, []);

  const short = (s: string) => (s.length > 16 ? s.slice(0, 10) + "…" + s.slice(-6) : s);
  const formatAmount = (s: string) => {
    const n = BigInt(s || "0");
    if (n > 1_000_000n) return (Number(n) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toString();
  };

  return (
    <div>
      <h1 className="page-title">ClawDEX</h1>
      <p className="page-subtitle">
        Decentralized exchange for the ClawChain ecosystem — swap tokens, provide liquidity, and earn fees.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginTop: "2rem" }}>
        <a
          href={chainConfig.walletUrl || "https://dex.clawchain.io"}
          target="_blank"
          rel="noopener noreferrer"
          className="card"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <h3 style={{ marginBottom: "0.5rem" }}>Swap Tokens</h3>
          <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>
            Trade tokens instantly with low fees using ClawDEX's automated market maker.
          </p>
          <span style={{ color: "var(--accent)", fontSize: "0.85rem", marginTop: "0.75rem", display: "inline-block" }}>
            Open ClawDEX App →
          </span>
        </a>

        <a
          href={`${chainConfig.walletUrl || "https://dex.clawchain.io"}/pools`}
          target="_blank"
          rel="noopener noreferrer"
          className="card"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <h3 style={{ marginBottom: "0.5rem" }}>Manage Liquidity</h3>
          <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>
            Provide liquidity to earn swap fees. Browse pools, view reserves, and manage LP positions.
          </p>
          <span style={{ color: "var(--accent)", fontSize: "0.85rem", marginTop: "0.75rem", display: "inline-block" }}>
            Browse Pools →
          </span>
        </a>

        <div className="card">
          <h3 style={{ marginBottom: "0.5rem" }}>Pool Stats</h3>
          {loading ? (
            <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>Checking for deployed pools…</p>
          ) : pools.length === 0 ? (
            <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>
              No liquidity pools found on-chain. Deploy DEX contracts with <code>scripts/deploy-dex.sh</code> to create pools.
            </p>
          ) : (
            <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>
              <strong>{pools.length}</strong> active pool{pools.length !== 1 ? "s" : ""} deployed
            </p>
          )}
        </div>
      </div>

      {pools.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>On-Chain Pools</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Pair</th>
                  <th>Type</th>
                  <th>Reserve A</th>
                  <th>Reserve B</th>
                  <th>Total Share</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => (
                  <tr key={p.contractAddr}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{short(p.contractAddr)}</td>
                    <td>{p.assets.map((a) => a.replace("uclaw", "CLAW").replace("uatom", "ATOM")).join(" / ")}</td>
                    <td>{p.poolType}</td>
                    <td>{formatAmount(p.reserves[0] ?? "0")}</td>
                    <td>{formatAmount(p.reserves[1] ?? "0")}</td>
                    <td>{formatAmount(p.totalShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>About ClawDEX</h3>
        <p style={{ color: "var(--text2)", fontSize: "0.9rem", lineHeight: 1.6 }}>
          ClawDEX is ClawChain's native decentralized exchange, forked from Astroport — a battle-tested
          AMM protocol. It supports XYK, stableswap, and concentrated liquidity pools, plus
          multi-hop routing, fee collection, and liquidity incentives.
        </p>
        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ padding: "0.5rem 1rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text2)" }}>Pool Types:</span>{" "}
            <strong>XYK, Stable, Concentrated</strong>
          </div>
          <div style={{ padding: "0.5rem 1rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text2)" }}>Default Fee:</span>{" "}
            <strong>0.3%</strong>
          </div>
          <div style={{ padding: "0.5rem 1rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text2)" }}>Max Hops:</span>{" "}
            <strong>7 (multi-hop)</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
