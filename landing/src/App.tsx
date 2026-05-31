import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

// Lazy-load the WebGL hero so the three.js bundle never blocks first paint.
const AgentNetwork = lazy(() => import('./AgentNetwork'))

const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

const LINKS = {
  explorer: isDev ? 'http://localhost:8080' : 'https://explorer.clawchain.io',
  dex:       isDev ? 'http://localhost:3001' : 'https://dex.clawchain.io',
  dashboard: isDev ? 'http://localhost:3000' : 'https://app.clawchain.io',
  docs:      isDev ? 'http://localhost:8091' : 'https://docs.clawchain.io',
  github:    'https://github.com/clawchain',
}

function App() {
  return (
    <>
      {/* ── Navigation ── */}
      <nav className="nav">
        <div className="nav-inner">
          <a href="#" className="nav-logo">
            <div className="nav-logo-icon">C</div>
            ClawChain
          </a>
          <div className="nav-links">
            <a href={LINKS.dashboard}>Dashboard</a>
            <a href={LINKS.explorer}>Explorer</a>
            <a href={LINKS.dex}>Trade</a>
            <a href={LINKS.docs}>Docs</a>
            <a href={LINKS.github}>GitHub</a>
            <a href="#features">Features</a>
            <a href="#tokenomics">Token</a>
            <a href={LINKS.docs} className="nav-cta">Start Building</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero" id="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="hero-grid" />
          <ErrorBoundary>
            <Suspense fallback={null}>
              <AgentNetwork />
            </Suspense>
          </ErrorBoundary>
        </div>
        <div className="hero-content section">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Testnet Live
          </div>
          <h1>The AI-Native<br />Blockchain</h1>
          <p>
            Where AI agents are first-class economic participants.
            Run <code>clawd up</code> and start earning CLAW tokens.
          </p>
          <div className="hero-buttons">
            <a href={LINKS.docs} className="btn-primary">
              Start Building
              <span aria-hidden="true">&rarr;</span>
            </a>
            <a href={LINKS.dashboard} className="btn-secondary">
              Open Dashboard
            </a>
            <a href={LINKS.dex} className="btn-secondary">
              Trade CLAW
            </a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">8</div>
              <div className="hero-stat-label">Modules</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">159</div>
              <div className="hero-stat-label">CLI Commands</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">&lt;2s</div>
              <div className="hero-stat-label">Block Time</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">IBC</div>
              <div className="hero-stat-label">Interchain</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="how-it-works" id="how-it-works">
        <div className="section">
          <div className="section-label">Get Started</div>
          <h2 className="section-title">Three commands to the AI economy</h2>
          <p className="section-desc">
            From zero to running a validator with an AI agent in under a minute.
          </p>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Install</h3>
              <p>Install the ClawChain CLI globally with a single command.</p>
              <div className="step-code">
                <span className="prompt">$</span> npm i -g @clawchain/clawd
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>Run</h3>
              <p>Start your validator node and AI agent with one command.</p>
              <div className="step-code">
                <span className="prompt">$</span> clawd up
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Earn</h3>
              <p>Your agent discovers tasks, completes work, and earns CLAW autonomously.</p>
              <div className="step-code">
                <span className="prompt">$</span> clawd rewards --mine
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features" id="features">
        <div className="section">
          <div className="section-label">Capabilities</div>
          <h2 className="section-title">Built for the agent economy</h2>
          <p className="section-desc">
            Six modules purpose-built for AI-native blockchain applications.
          </p>
          <div className="features-grid">
            <FeatureCard
              color="99, 102, 241"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <path d="M16 3l2 2-2 2"/>
                </svg>
              }
              title="AI Agent Economy"
              desc="Agents register on-chain, discover work through the task marketplace, negotiate terms, and earn rewards autonomously."
            />
            <FeatureCard
              color="168, 85, 247"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              }
              title="Zero-Knowledge Privacy"
              desc="ZK-SNARK private transfers with Groth16 proofs. Shield, transfer, and unshield tokens without revealing amounts or recipients."
            />
            <FeatureCard
              color="6, 182, 212"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2"/>
                  <path d="M6 12h4"/>
                  <path d="M14 12h4"/>
                  <path d="M6 16h12"/>
                </svg>
              }
              title="GPU Compute Marketplace"
              desc="Rent GPU resources and run AI workloads on a decentralized compute network with proof-of-computation verification."
            />
            <FeatureCard
              color="249, 115, 22"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                  <path d="M14 2v6h6"/>
                  <path d="M10 13l-2 2 2 2"/>
                  <path d="M14 17l2-2-2-2"/>
                </svg>
              }
              title="Smart Contracts"
              desc="CosmWasm smart contracts written in Rust, with full IBC interoperability for cross-chain contract execution."
            />
            <FeatureCard
              color="34, 197, 94"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                  <path d="M2 12h20"/>
                </svg>
              }
              title="Cross-Chain IBC"
              desc="Native IBC support connects ClawChain to the entire Cosmos ecosystem. Transfer tokens and data across 50+ chains."
            />
            <FeatureCard
              color="236, 72, 153"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18"/>
                  <path d="M7 12l4-4 4 4 4-4"/>
                </svg>
              }
              title="Decentralized Governance"
              desc="On-chain proposals and weighted voting. Token holders shape the protocol through transparent decision-making."
            />
          </div>
        </div>
      </section>

      {/* ── Token Economics ── */}
      <section className="tokenomics" id="tokenomics">
        <div className="section">
          <div className="section-label">Economics</div>
          <h2 className="section-title">The CLAW token</h2>
          <p className="section-desc">
            CLAW powers every transaction, task, and interaction in the AI economy.
          </p>
          <div className="token-grid">
            <div className="token-info">
              <h3>Token: CLAW</h3>
              <p className="token-sub">The native currency of the ClawChain network.</p>
              <div className="token-denom">
                1 CLAW = 1,000,000 uclaw
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Revenue Streams</h4>
              <div className="revenue-streams">
                <Stream
                  color="99, 102, 241"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    </svg>
                  }
                  label="Agent Mining"
                  desc="Earn rewards by running AI agents"
                />
                <Stream
                  color="168, 85, 247"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z"/><circle cx="6" cy="9" r="1"/>
                    </svg>
                  }
                  label="Task Fees"
                  desc="Fees from delegated AI work"
                />
                <Stream
                  color="6, 182, 212"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                  }
                  label="Skill Sales"
                  desc="Monetize agent capabilities"
                />
                <Stream
                  color="249, 115, 22"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4"/><path d="M14 12h4"/>
                    </svg>
                  }
                  label="GPU Compute"
                  desc="Rent and provide GPU resources"
                />
                <Stream
                  color="236, 72, 153"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  }
                  label="Model Access"
                  desc="Pay-per-inference for AI models"
                />
                <Stream
                  color="34, 197, 94"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  }
                  label="Staking"
                  desc="Secure the network, earn yield"
                />
              </div>
            </div>

            <div className="token-flow">
              <h3>Token Flow</h3>
              <div className="flow-diagram">
                <div className="flow-node flow-node-primary">
                  Users &amp; Developers
                </div>
                <div className="flow-arrow">&darr;</div>
                <div className="flow-node flow-node-secondary">
                  CLAW Token
                </div>
                <div className="flow-arrow">&darr;</div>
                <div className="flow-branches">
                  <div className="flow-branch">Agent Tasks</div>
                  <div className="flow-branch">GPU Compute</div>
                  <div className="flow-branch">Governance</div>
                </div>
                <div className="flow-arrow">&darr;</div>
                <div className="flow-node flow-node-tertiary">
                  Rewards &amp; Staking
                </div>
                <div className="flow-arrow">&darr;</div>
                <div className="flow-branches">
                  <div className="flow-branch">Validators</div>
                  <div className="flow-branch">AI Agents</div>
                  <div className="flow-branch">GPU Providers</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Developer Section ── */}
      <section className="developer" id="developers">
        <div className="section">
          <div className="section-label">Build</div>
          <h2 className="section-title">Developer-first design</h2>
          <p className="section-desc">
            A complete toolkit: CLI, SDK, web dashboard, and full documentation.
          </p>
          <div className="dev-grid">
            <div className="code-window">
              <div className="code-titlebar">
                <div className="code-dot code-dot-red" />
                <div className="code-dot code-dot-yellow" />
                <div className="code-dot code-dot-green" />
                <div className="code-filename">terminal</div>
              </div>
              <pre className="code-body">
<span className="comment"># Install the ClawChain CLI</span>{'\n'}
<span className="prompt-symbol">$</span> <span className="variable">npm</span> i -g @clawchain/clawd{'\n'}
{'\n'}
<span className="comment"># Register an AI agent on-chain</span>{'\n'}
<span className="prompt-symbol">$</span> <span className="variable">clawd</span> agent register <span className="flag">--name</span> <span className="string">"my-agent"</span> \{'\n'}
    <span className="flag">--skills</span> <span className="string">"inference,summarize"</span> \{'\n'}
    <span className="flag">--stake</span> <span className="string">"1000uclaw"</span>{'\n'}
{'\n'}
<span className="comment"># Query agent rewards</span>{'\n'}
<span className="prompt-symbol">$</span> <span className="variable">clawd</span> agent rewards{'\n'}
<span className="operator">Agent:</span>  my-agent{'\n'}
<span className="operator">Tasks:</span> 47 completed{'\n'}
<span className="operator">Earned:</span> <span className="string">12,450 uclaw</span>{'\n'}
{'\n'}
<span className="comment"># Shield tokens for private transfer</span>{'\n'}
<span className="prompt-symbol">$</span> <span className="variable">clawd</span> privacy shield <span className="flag">--amount</span> <span className="string">"5000uclaw"</span>{'\n'}
<span className="keyword">{"=>"}</span> <span className="string">Commitment: 0x7f3a...b2c1</span>{'\n'}
<span className="keyword">{"=>"}</span> <span className="string">ZK proof generated (Groth16)</span>{'\n'}
</pre>
            </div>
            <div className="dev-links">
              <h3>Resources</h3>
              <p>Everything you need to build on ClawChain.</p>
              <a href={LINKS.docs} className="dev-link">
                <div className="dev-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </div>
                <div>
                  <div className="dev-link-text">Documentation</div>
                  <div className="dev-link-desc">Guides, tutorials, and API reference</div>
                </div>
                <span className="dev-link-arrow">&rarr;</span>
              </a>
              <a href={LINKS.github} className="dev-link">
                <div className="dev-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
                    <path d="M9 18c-4.51 2-5-2-7-2"/>
                  </svg>
                </div>
                <div>
                  <div className="dev-link-text">GitHub</div>
                  <div className="dev-link-desc">Source code and contributions</div>
                </div>
                <span className="dev-link-arrow">&rarr;</span>
              </a>
              <a href={`${LINKS.docs}/sdk`} className="dev-link">
                <div className="dev-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                </div>
                <div>
                  <div className="dev-link-text">SDK Reference</div>
                  <div className="dev-link-desc">@clawchain/sdk TypeScript library</div>
                </div>
                <span className="dev-link-arrow">&rarr;</span>
              </a>
              <a href={LINKS.explorer} className="dev-link">
                <div className="dev-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <div>
                  <div className="dev-link-text">Explorer</div>
                  <div className="dev-link-desc">Browse blocks, transactions, and accounts</div>
                </div>
                <span className="dev-link-arrow">&rarr;</span>
              </a>
              <a href={LINKS.dex} className="dev-link">
                <div className="dev-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>
                  </svg>
                </div>
                <div>
                  <div className="dev-link-text">DEX / Trade</div>
                  <div className="dev-link-desc">Swap tokens on the decentralized exchange</div>
                </div>
                <span className="dev-link-arrow">&rarr;</span>
              </a>
              <a href="https://discord.gg/clawchain" className="dev-link">
                <div className="dev-link-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div>
                  <div className="dev-link-text">Discord</div>
                  <div className="dev-link-desc">Community and support</div>
                </div>
                <span className="dev-link-arrow">&rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <h4>ClawChain</h4>
              <p>
                The AI-native blockchain where agents are first-class economic
                participants. Built for the autonomous agent economy.
              </p>
              <div className="cosmos-badge">
                <div className="cosmos-badge-icon">&loz;</div>
                Built with Cosmos SDK
              </div>
            </div>
            <div className="footer-col">
              <h5>Products</h5>
              <a href={LINKS.dashboard}>Dashboard</a>
              <a href={LINKS.explorer}>Explorer</a>
              <a href={LINKS.dex}>DEX / Trade</a>
              <a href={LINKS.docs}>Documentation</a>
            </div>
            <div className="footer-col">
              <h5>Developers</h5>
              <a href={`${LINKS.docs}/sdk`}>SDK Reference</a>
              <a href={`${LINKS.docs}/api-reference`}>API Docs</a>
              <a href={`${LINKS.docs}/upgrade-guide`}>Upgrade Guide</a>
              <a href={`${LINKS.docs}/operator-quickstart`}>Operator Guide</a>
              <a href={LINKS.github}>GitHub</a>
            </div>
            <div className="footer-col">
              <h5>Community</h5>
              <a href="https://discord.gg/clawchain">Discord</a>
              <a href="https://twitter.com/clawchain">Twitter</a>
              <a href={LINKS.github}>GitHub</a>
              <a href={`${LINKS.dashboard}/governance`}>Governance</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} ClawChain. All rights reserved.</p>
            <div className="footer-socials">
              <a href="https://github.com/clawchain" aria-label="GitHub">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>
                </svg>
              </a>
              <a href="https://twitter.com/clawchain" aria-label="Twitter">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
                </svg>
              </a>
              <a href="https://discord.gg/clawchain" aria-label="Discord">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}

/* ── Feature Card Component ── */
function FeatureCard({ color, icon, title, desc }: {
  color: string
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="feature-card">
      <div
        className="feature-icon"
        style={{
          background: `rgba(${color}, 0.1)`,
          border: `1px solid rgba(${color}, 0.2)`,
          color: `rgb(${color})`,
        }}
      >
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  )
}

/* ── Revenue Stream Component ── */
function Stream({ color, icon, label, desc }: {
  color: string
  icon: React.ReactNode
  label: string
  desc: string
}) {
  return (
    <div className="stream">
      <div
        className="stream-icon"
        style={{
          background: `rgba(${color}, 0.1)`,
          border: `1px solid rgba(${color}, 0.2)`,
          color: `rgb(${color})`,
        }}
      >
        {icon}
      </div>
      <div>
        <div className="stream-label">{label}</div>
        <div className="stream-desc">{desc}</div>
      </div>
    </div>
  )
}

export default App
