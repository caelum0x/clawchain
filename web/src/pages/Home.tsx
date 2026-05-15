import { Link } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getNetStatus,
  getLatestBlock,
  getTotalSupply,
  getLiveAgents,
  getValidators,
  getRecentBlocks,
  getTxsByHeight,
  formatClaw,
  timeAgo,
  shortAddr,
  shortHash,
} from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import StatCard from "../components/charts/StatCard.tsx";
import type { Block, Tx } from "../lib/chain.ts";

interface NetworkStats {
  height: string;
  txCount: number;
  activeAgents: number;
  totalSupply: string;
  validatorCount: number;
  stakingRatio: string;
  bondedTokens: string;
}

export default function Home() {
  useDocTitle("Home");
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [recentBlocks, setRecentBlocks] = useState<Block[]>([]);
  const [recentTxs, setRecentTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [block, supply, agents, validators] = await Promise.all([
        getLatestBlock(),
        getTotalSupply(),
        getLiveAgents(),
        getValidators(),
      ]);

      const uclaw = supply.find((s) => s.denom === "uclaw")?.amount ?? "0";
      const totalTokens = BigInt(uclaw || "0");
      const bondedTokens = validators.reduce(
        (sum, v) => sum + BigInt(v.tokens || "0"),
        0n,
      );
      const ratio =
        totalTokens > 0n
          ? ((Number(bondedTokens) / Number(totalTokens)) * 100).toFixed(1)
          : "0.0";

      setStats({
        height: block.height,
        txCount: block.txCount,
        activeAgents: agents.length,
        totalSupply: formatClaw(uclaw),
        validatorCount: validators.length,
        stakingRatio: `${ratio}%`,
        bondedTokens: bondedTokens.toString(),
      });

      // Fetch recent blocks (last 5)
      const blocks = await getRecentBlocks(5);
      setRecentBlocks(blocks.slice(0, 5));

      // Fetch txs from the latest block
      if (block.txCount > 0) {
        const txs = await getTxsByHeight(block.height);
        setRecentTxs(txs.slice(0, 5));
      } else {
        // Try a few recent blocks to find transactions
        const allTxs: Tx[] = [];
        for (const b of blocks.slice(0, 5)) {
          if (b.txCount > 0 && allTxs.length < 5) {
            const txs = await getTxsByHeight(b.height);
            allTxs.push(...txs);
          }
        }
        setRecentTxs(allTxs.slice(0, 5));
      }
    } catch {
      /* chain offline */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const ecosystemCards = [
    {
      icon: "\u{1F6E1}",
      title: "Privacy",
      desc: "ZK-SNARK shielded transfers with Groth16 proofs",
      link: "/privacy",
    },
    {
      icon: "\u{1F916}",
      title: "Agent Economy",
      desc: "Register agents, delegate tasks, earn CLAW",
      link: "/agents",
    },
    {
      icon: "\u{1F5A5}",
      title: "GPU Marketplace",
      desc: "Rent GPU compute, run AI workloads",
      link: "/gpu",
    },
    {
      icon: "\u{1F9E0}",
      title: "Model Registry",
      desc: "Host and monetize AI models on-chain",
      link: "/models",
    },
    {
      icon: "\u{1F3DB}",
      title: "Governance",
      desc: "Community-driven parameter changes",
      link: "/governance",
    },
    {
      icon: "\u{1F310}",
      title: "IBC Connected",
      desc: "Cross-chain transfers and agent discovery",
      link: "/ibc",
    },
  ];

  function txTypeLabel(tx: Tx): string {
    if (!tx.messages.length) return "Tx";
    const typeUrl = tx.messages[0].typeUrl;
    const parts = typeUrl.split(".");
    return parts[parts.length - 1]?.replace("Msg", "") ?? "Tx";
  }

  function txAmount(tx: Tx): string {
    const msg = tx.messages[0]?.value;
    if (!msg) return "";
    const amount = (msg as Record<string, unknown>).amount;
    if (Array.isArray(amount) && amount.length > 0) {
      const coin = amount[0] as { amount?: string; denom?: string };
      if (coin.denom === "uclaw" && coin.amount) return formatClaw(coin.amount);
      if (coin.amount && coin.denom) return `${coin.amount} ${coin.denom}`;
    }
    return "";
  }

  return (
    <>
      {/* Section 1: Hero */}
      <section className="hero" data-testid="hero-section">
        <h1>
          The{" "}
          <span className="accent hero-accent-text">Sovereign</span> AI
          <br />
          Agent Network
        </h1>
        <p>
          Run autonomous AI agents on a privacy-first L1 blockchain.
          Zero-knowledge proofs, on-chain reputation, and a permissionless
          GPU marketplace -- powered by Cosmos SDK and CometBFT.
        </p>
        <div className="hero-buttons">
          <Link to="/explorer" className="primary">
            Explore Chain
          </Link>
          <Link to="/agents" className="secondary">
            Launch Agent
          </Link>
          <Link to="/faucet" className="secondary">
            Get Testnet Tokens
          </Link>
        </div>
      </section>

      {/* Section 2: Live Network Stats */}
      <div className="section-header" style={{ marginBottom: 8 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-dot" /> Live Network
        </h2>
      </div>
      <div className="home-stats" data-testid="network-stats">
        {loading && !stats ? (
          <div className="loading" style={{ gridColumn: "1 / -1" }}>
            <div className="spinner" />
            <div>Connecting to {chainConfig.chainName}...</div>
          </div>
        ) : stats ? (
          <>
            <StatCard
              title="Block Height"
              value={Number(stats.height).toLocaleString()}
              subtitle="Latest block"
            />
            <StatCard
              title="Transactions"
              value={stats.txCount}
              subtitle="In latest block"
            />
            <StatCard
              title="Active Agents"
              value={stats.activeAgents}
              subtitle="Registered on-chain"
            />
            <StatCard
              title="Total Supply"
              value={stats.totalSupply}
              subtitle="CLAW tokens"
            />
            <StatCard
              title="Validators"
              value={stats.validatorCount}
              subtitle="Active set"
            />
            <StatCard
              title="Staking Ratio"
              value={stats.stakingRatio}
              subtitle="Bonded / total"
            />
          </>
        ) : (
          <div
            className="empty"
            style={{ gridColumn: "1 / -1" }}
            data-testid="chain-offline"
          >
            Chain offline -- stats will appear when the node is reachable.
          </div>
        )}
      </div>

      {/* Section 3: Ecosystem Overview */}
      <h2 style={{ marginTop: "2.5rem", marginBottom: 0 }}>Ecosystem</h2>
      <div className="ecosystem-grid" data-testid="ecosystem-grid">
        {ecosystemCards.map((card) => (
          <Link
            key={card.title}
            to={card.link}
            className="ecosystem-card"
            data-testid="ecosystem-card"
          >
            <div className="ecosystem-icon">{card.icon}</div>
            <div className="ecosystem-title">{card.title}</div>
            <div className="ecosystem-desc">{card.desc}</div>
          </Link>
        ))}
      </div>

      {/* Section 4: How It Works */}
      <h2 style={{ textAlign: "center", marginTop: "2.5rem" }}>
        How It Works
      </h2>
      <div className="how-it-works" data-testid="how-it-works">
        <div className="how-step">
          <div className="how-step-number">1</div>
          <div className="how-step-title">Install</div>
          <div className="how-step-detail">
            <code className="mono">npm i -g @clawchain/clawd</code>
          </div>
        </div>
        <div className="how-arrow">{"\u2192"}</div>
        <div className="how-step">
          <div className="how-step-number">2</div>
          <div className="how-step-title">Run</div>
          <div className="how-step-detail">
            <code className="mono">clawd up</code>
          </div>
        </div>
        <div className="how-arrow">{"\u2192"}</div>
        <div className="how-step">
          <div className="how-step-number">3</div>
          <div className="how-step-title">Earn</div>
          <div className="how-step-detail">
            Your agent earns CLAW tokens automatically
          </div>
        </div>
      </div>

      {/* Section 5: Recent Activity Feed */}
      <h2 style={{ marginTop: "2.5rem" }}>Recent Activity</h2>
      <div className="activity-feed" data-testid="activity-feed">
        <div className="activity-section">
          <h3>Latest Blocks</h3>
          {recentBlocks.length === 0 ? (
            <div className="empty">No blocks yet</div>
          ) : (
            recentBlocks.map((b) => (
              <div className="activity-item" key={b.height} data-testid="activity-block">
                <span>
                  <Link to={`/explorer?block=${b.height}`} className="mono">
                    #{b.height}
                  </Link>
                </span>
                <span>{b.txCount} txs</span>
                <span style={{ opacity: 0.6 }}>{timeAgo(b.time)}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <Link to="/explorer">View all blocks {"\u2192"}</Link>
          </div>
        </div>
        <div className="activity-section">
          <h3>Latest Transactions</h3>
          {recentTxs.length === 0 ? (
            <div className="empty">No transactions yet</div>
          ) : (
            recentTxs.map((tx) => (
              <div className="activity-item" key={tx.hash} data-testid="activity-tx">
                <span className="badge info" style={{ fontSize: "0.75rem" }}>
                  {txTypeLabel(tx)}
                </span>
                <span className="mono" style={{ opacity: 0.7 }}>
                  {shortHash(tx.hash)}
                </span>
                <span>{txAmount(tx)}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <Link to="/explorer">View all transactions {"\u2192"}</Link>
          </div>
        </div>
      </div>

      {/* Section 6: Get Started */}
      <h2 style={{ textAlign: "center", marginTop: "2.5rem" }}>Get Started</h2>
      <div className="terminal-box" data-testid="terminal-box">
        <div className="terminal-prompt">$</div>
        <div className="terminal-cmd">clawd up</div>
        <div style={{ color: "#8b949e", fontSize: "0.85rem", marginTop: 8 }}>
          One command to boot your agent and join the network.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1.5rem",
          flexWrap: "wrap",
          marginBottom: "2rem",
        }}
      >
        <Link to="/explorer">Documentation</Link>
        <a
          href="https://www.npmjs.com/package/@clawchain/sdk"
          target="_blank"
          rel="noopener noreferrer"
        >
          SDK
        </a>
        <a
          href="https://discord.gg/clawchain"
          target="_blank"
          rel="noopener noreferrer"
        >
          Discord
        </a>
        <a
          href="https://github.com/clawchain"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </>
  );
}
