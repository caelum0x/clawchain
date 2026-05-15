import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import { getBalances, formatClaw, type AccountBalance } from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, type WalletState } from "../lib/wallet.ts";

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
};

const INITIAL_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Learn about provider economics on ClawChain.",
    completed: false,
  },
  {
    id: "identity",
    title: "Identity",
    description: "Verify your wallet address and check your balance.",
    completed: false,
  },
  {
    id: "registration",
    title: "Registration",
    description: "Register your agent on-chain.",
    completed: false,
  },
  {
    id: "configuration",
    title: "Configuration",
    description: "Set profitability controls for your provider.",
    completed: false,
  },
  {
    id: "activate",
    title: "Activate",
    description: "Start your heartbeat and go live.",
    completed: false,
  },
];

export default function ProviderOnboarding() {
  useDocTitle("Provider Onboarding");
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<OnboardingStep[]>(INITIAL_STEPS);

  // Step 2: Identity
  const [walletAddress, setWalletAddress] = useState("");
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  // Wallet
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Step 3: Registration
  const [agentName, setAgentName] = useState("");
  const [agentEndpoint, setAgentEndpoint] = useState("");
  const [agentCapabilities, setAgentCapabilities] = useState("");
  const [registrationTxHash, setRegistrationTxHash] = useState("");
  const [registering, setRegistering] = useState(false);

  // Step 4: Configuration
  const [minBudget, setMinBudget] = useState("1");
  const [maxTasks, setMaxTasks] = useState("10");
  const [configCapabilities, setConfigCapabilities] = useState("inference,training");

  // Step 5: Activate
  const [activated, setActivated] = useState(false);

  function markStepCompleted(index: number) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, completed: true } : s))
    );
  }

  function goNext() {
    markStepCompleted(currentStep);
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  }

  function goBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  // Step 2: fetch balance
  async function fetchBalance() {
    if (!walletAddress.trim()) return;
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const result = await getBalances(walletAddress.trim());
      setBalances(result);
    } catch {
      setBalanceError("Failed to fetch balance. Is the chain running?");
    }
    setBalanceLoading(false);
  }

  useEffect(() => {
    if (currentStep === 1 && walletAddress.trim()) {
      fetchBalance();
    }
  }, [currentStep]);

  async function handleConnectWallet() {
    setTxStatus(null);
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? "Failed to connect wallet", type: "error" });
    }
  }

  // Step 3: register agent
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet before registering.", type: "error" });
      return;
    }
    setRegistering(true);
    setTxStatus(null);
    try {
      const capabilities = agentCapabilities
        ? agentCapabilities.split(",").map((c) => c.trim()).filter(Boolean)
        : [];
      const msg = {
        type: "clawchain/agent/MsgRegisterAgent",
        value: {
          sender: wallet.address,
          name: agentName,
          endpoint: agentEndpoint,
          capabilities,
          deposit: { denom: "uclaw", amount: "1000000" },
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], "Register agent on ClawChain");
      if (result.code !== 0) {
        setTxStatus({ msg: `Registration failed (code ${result.code})`, type: "error" });
      } else {
        setRegistrationTxHash(result.txHash);
        setTxStatus({ msg: `Agent registered successfully. Tx: ${result.txHash}`, type: "success" });
      }
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? "Failed to register agent", type: "error" });
    } finally {
      setRegistering(false);
    }
  }

  // Step 5: activate
  function handleActivate() {
    setActivated(true);
    markStepCompleted(4);
  }

  const clawBalance = balances.find((b) => b.denom === "uclaw");

  return (
    <div>
      <h1 className="page-title">Provider Onboarding</h1>
      <p className="page-subtitle">
        Set up your provider node in 5 simple steps and start earning CLAW rewards.
      </p>

      {/* Step indicator */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "2rem",
          flexWrap: "wrap",
        }}
      >
        {steps.map((step, i) => (
          <button
            key={step.id}
            className={`btn ${i === currentStep ? "btn-primary" : ""}`}
            onClick={() => setCurrentStep(i)}
            style={{
              opacity: step.completed || i === currentStep ? 1 : 0.6,
              position: "relative",
            }}
          >
            {step.completed && i !== currentStep ? "✓ " : `${i + 1}. `}
            {step.title}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: "var(--border, #333)",
          borderRadius: 2,
          marginBottom: "2rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${((currentStep + (steps[currentStep]?.completed ? 1 : 0)) / steps.length) * 100}%`,
            background: "var(--accent, #3b82f6)",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Step 1: Welcome */}
      {currentStep === 0 && (
        <div className="card" style={{ padding: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Welcome to ClawChain Provider Network</h2>
          <p style={{ color: "var(--text2)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            As a provider on ClawChain, you can earn CLAW tokens by contributing
            compute resources, completing tasks, and serving the network. Here is
            what you can do:
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {[
              { title: "Mining", desc: "Earn block rewards by validating transactions and securing the network." },
              { title: "Tasks", desc: "Accept and complete AI inference, training, and compute tasks for bounties." },
              { title: "Skills", desc: "Register specialized capabilities and get matched with high-value jobs." },
              { title: "GPU Compute", desc: "Lease your GPU resources to users who need compute power on demand." },
              { title: "Models", desc: "Host and serve AI models, earning fees for each inference request." },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  padding: "1rem",
                  background: "var(--bg2, #111)",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border, #333)",
                }}
              >
                <h4 style={{ marginBottom: "0.5rem" }}>{item.title}</h4>
                <p style={{ color: "var(--text2)", fontSize: "0.85rem", margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={goNext}>
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Identity */}
      {currentStep === 1 && (
        <div className="card" style={{ padding: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Verify Your Identity</h2>
          <p style={{ color: "var(--text2)", marginBottom: "1.5rem" }}>
            Enter your wallet address to verify your identity and check your
            balance. You need CLAW tokens to register as a provider.
          </p>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
              Wallet Address
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="claw1..."
                style={inputStyle}
              />
              <button className="btn btn-primary" onClick={fetchBalance}>
                Check Balance
              </button>
            </div>
          </div>

          {balanceLoading && (
            <p style={{ color: "var(--text2)" }}>Loading balance...</p>
          )}

          {balanceError && (
            <div
              style={{
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "rgba(239,68,68,0.15)",
                color: "#ef4444",
                marginBottom: "1rem",
              }}
            >
              {balanceError}
            </div>
          )}

          {walletAddress && !balanceLoading && balances.length > 0 && (
            <div
              style={{
                padding: "1rem",
                background: "var(--bg2, #111)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border, #333)",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                CLAW Balance
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {clawBalance ? formatClaw(clawBalance.amount) : "0 CLAW"}
              </div>
              {clawBalance && BigInt(clawBalance.amount || "0") < 1_000_000n && (
                <p style={{ color: "#eab308", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Your balance is low. You may need tokens to register.{" "}
                  <Link to="/faucet" style={{ color: "var(--accent)" }}>
                    Get tokens from the faucet
                  </Link>
                </p>
              )}
            </div>
          )}

          {walletAddress && !balanceLoading && balances.length === 0 && !balanceError && (
            <div
              style={{
                padding: "1rem",
                background: "var(--bg2, #111)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border, #333)",
                marginBottom: "1.5rem",
              }}
            >
              <p style={{ color: "var(--text2)", margin: 0 }}>
                No balances found for this address.{" "}
                <Link to="/faucet" style={{ color: "var(--accent)" }}>
                  Get tokens from the faucet
                </Link>
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" onClick={goBack}>
              Back
            </button>
            <button className="btn btn-primary" onClick={goNext}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Registration */}
      {currentStep === 2 && (
        <div className="card" style={{ padding: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Register Your Agent</h2>
          <p style={{ color: "var(--text2)", marginBottom: "1.5rem" }}>
            Register your agent on the ClawChain network. This creates an on-chain
            record of your provider identity.
          </p>

          {/* Wallet connect */}
          {!wallet?.connected ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.75rem" }}>
                {isKeplrAvailable()
                  ? "Connect your Keplr wallet to register your agent."
                  : "Install the Keplr browser extension to register your agent."}
              </p>
              <button className="btn btn-primary" onClick={handleConnectWallet} disabled={!isKeplrAvailable()}>
                Connect Wallet
              </button>
            </div>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "1rem" }}>
              Wallet connected: <strong>{wallet.address.slice(0, 10)}...{wallet.address.slice(-6)}</strong>
            </p>
          )}

          {/* Tx status */}
          {txStatus && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: txStatus.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                color: txStatus.type === "success" ? "#22c55e" : "#ef4444",
              }}
            >
              {txStatus.msg}
            </div>
          )}

          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Agent Name
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="My GPU Provider"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Endpoint URL
              </label>
              <input
                type="text"
                value={agentEndpoint}
                onChange={(e) => setAgentEndpoint(e.target.value)}
                placeholder="https://my-provider.example.com:8080"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Capabilities
              </label>
              <input
                type="text"
                value={agentCapabilities}
                onChange={(e) => setAgentCapabilities(e.target.value)}
                placeholder="inference, training, gpu-compute"
                style={inputStyle}
              />
              <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginTop: "0.25rem" }}>
                Comma-separated list of capabilities your agent supports.
              </p>
            </div>

            {!registrationTxHash && (
              <button
                className="btn btn-primary"
                type="submit"
                disabled={registering}
              >
                {registering ? "Registering..." : "Register Agent"}
              </button>
            )}
          </form>

          {registrationTxHash && (
            <div
              style={{
                padding: "1rem",
                background: "rgba(34,197,94,0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(34,197,94,0.3)",
                marginTop: "1rem",
              }}
            >
              <div style={{ fontWeight: 700, color: "#22c55e", marginBottom: "0.5rem" }}>
                Registration Successful
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
                Transaction hash:{" "}
                <code
                  className="mono"
                  style={{ fontSize: "0.8rem", wordBreak: "break-all" }}
                >
                  {registrationTxHash}
                </code>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem" }}>
            <button className="btn" onClick={goBack}>
              Back
            </button>
            <button className="btn btn-primary" onClick={goNext}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Configuration */}
      {currentStep === 3 && (
        <div className="card" style={{ padding: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Configure Profitability Controls</h2>
          <p style={{ color: "var(--text2)", marginBottom: "1.5rem" }}>
            Set your provider preferences to control which tasks you accept and
            your profitability thresholds.
          </p>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
              Minimum Budget (CLAW)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={minBudget}
              onChange={(e) => setMinBudget(e.target.value)}
              placeholder="1.0"
              style={inputStyle}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginTop: "0.25rem" }}>
              Minimum task budget you are willing to accept.
            </p>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
              Max Concurrent Tasks
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={maxTasks}
              onChange={(e) => setMaxTasks(e.target.value)}
              placeholder="10"
              style={inputStyle}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginTop: "0.25rem" }}>
              Maximum number of tasks your provider will handle simultaneously.
            </p>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
              Enabled Capabilities
            </label>
            <input
              type="text"
              value={configCapabilities}
              onChange={(e) => setConfigCapabilities(e.target.value)}
              placeholder="inference, training, gpu-compute"
              style={inputStyle}
            />
          </div>

          <div
            style={{
              padding: "1rem",
              background: "var(--bg2, #111)",
              borderRadius: "0.5rem",
              border: "1px solid var(--border, #333)",
              marginBottom: "1.5rem",
            }}
          >
            <h4 style={{ marginBottom: "0.5rem" }}>Configuration Summary</h4>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={summaryLabelStyle}>Min Budget</td>
                  <td style={summaryValueStyle}>{minBudget} CLAW</td>
                </tr>
                <tr>
                  <td style={summaryLabelStyle}>Max Tasks</td>
                  <td style={summaryValueStyle}>{maxTasks}</td>
                </tr>
                <tr>
                  <td style={summaryLabelStyle}>Capabilities</td>
                  <td style={summaryValueStyle}>{configCapabilities || "None"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" onClick={goBack}>
              Back
            </button>
            <button className="btn btn-primary" onClick={goNext}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Activate */}
      {currentStep === 4 && (
        <div className="card" style={{ padding: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Activate Your Provider</h2>
          <p style={{ color: "var(--text2)", marginBottom: "1.5rem" }}>
            Start your provider heartbeat to signal availability to the network.
            Once active, you will begin receiving task assignments.
          </p>

          {!activated ? (
            <>
              <div
                style={{
                  padding: "1rem",
                  background: "var(--bg2, #111)",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border, #333)",
                  marginBottom: "1.5rem",
                }}
              >
                <h4 style={{ marginBottom: "0.75rem" }}>Pre-activation Checklist</h4>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--text2)" }}>
                  <li style={{ marginBottom: "0.5rem" }}>
                    {steps[1]?.completed ? "✓" : "○"} Wallet address verified
                  </li>
                  <li style={{ marginBottom: "0.5rem" }}>
                    {registrationTxHash ? "✓" : "○"} Agent registered on-chain
                  </li>
                  <li style={{ marginBottom: "0.5rem" }}>
                    {steps[3]?.completed ? "✓" : "○"} Profitability controls configured
                  </li>
                </ul>
              </div>

              <button className="btn btn-primary" onClick={handleActivate}>
                Activate Provider
              </button>
            </>
          ) : (
            <div
              style={{
                padding: "1.5rem",
                background: "rgba(34,197,94,0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(34,197,94,0.3)",
                marginBottom: "1.5rem",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "#22c55e",
                  marginBottom: "0.5rem",
                }}
              >
                Provider Active
              </div>
              <p style={{ color: "var(--text2)", marginBottom: "1rem" }}>
                Your provider is now live on the ClawChain network. Heartbeat
                signals are being sent and you are ready to receive tasks.
              </p>
              <Link
                to="/provider"
                className="btn btn-primary"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                Go to Provider Dashboard
              </Link>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button className="btn" onClick={goBack}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  background: "var(--bg, #0a0a0a)",
  border: "1px solid var(--border, #333)",
  borderRadius: "0.375rem",
  color: "var(--text, #fff)",
  fontSize: "0.875rem",
  boxSizing: "border-box",
};

const summaryLabelStyle: React.CSSProperties = {
  color: "var(--text2)",
  padding: "4px 8px",
  fontWeight: 600,
  fontSize: "0.85rem",
  whiteSpace: "nowrap",
};

const summaryValueStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "0.85rem",
};
