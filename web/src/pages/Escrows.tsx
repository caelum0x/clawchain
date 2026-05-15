import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatClaw, shortAddr } from "../lib/chain.ts";
import useDocTitle from "../hooks/useDocTitle.ts";
import { chainConfig } from "../lib/config.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, WalletState } from "../lib/wallet.ts";

type Tab = "overview" | "buyer" | "seller" | "disputes";

interface Milestone {
  description: string;
  amount: string;
  completed: boolean;
}

interface Escrow {
  id: string;
  buyer: string;
  seller: string;
  amount: { amount: string; denom: string };
  status: "active" | "completed" | "disputed" | "refunded";
  milestones: Milestone[];
  created_at: string;
  completed_at: string;
}

interface Dispute {
  escrow_id: string;
  reason: string;
  resolution: string;
  resolved: boolean;
}

const STATUS_BADGE: Record<Escrow["status"], string> = {
  active: "",
  completed: "success",
  disputed: "error",
  refunded: "warning",
};

function restUrl(path: string): string {
  const base = chainConfig.restEndpoint.startsWith("http")
    ? chainConfig.restEndpoint
    : `${window.location.origin}${chainConfig.restEndpoint}`;
  return `${base}${path}`;
}

async function fetchEscrowsByRole(role: "buyer" | "seller", addr: string): Promise<Escrow[]> {
  try {
    const resp = await fetch(restUrl(`/clawchain/marketplace/v1/escrows?${role}=${addr}`));
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.escrows ?? []) as Escrow[];
  } catch {
    return [];
  }
}

async function fetchEscrowById(id: string): Promise<Escrow | null> {
  try {
    const resp = await fetch(restUrl(`/clawchain/marketplace/v1/escrow/${id}`));
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.escrow ?? null) as Escrow | null;
  } catch {
    return null;
  }
}

async function fetchDispute(escrowId: string): Promise<Dispute | null> {
  try {
    const resp = await fetch(restUrl(`/clawchain/marketplace/v1/dispute/${escrowId}`));
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.dispute ?? null) as Dispute | null;
  } catch {
    return null;
  }
}

function milestonesProgress(milestones: Milestone[]): string {
  if (!milestones || milestones.length === 0) return "0/0";
  const done = milestones.filter((m) => m.completed).length;
  return `${done}/${milestones.length}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function Escrows() {
  useDocTitle("Escrows");
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Address lookup
  const [addressInput, setAddressInput] = useState("");
  const [userAddress, setUserAddress] = useState("");

  // Data
  const [buyerEscrows, setBuyerEscrows] = useState<Escrow[]>([]);
  const [sellerEscrows, setSellerEscrows] = useState<Escrow[]>([]);
  const [disputes, setDisputes] = useState<(Escrow & { dispute: Dispute | null })[]>([]);

  // Create escrow form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSeller, setCreateSeller] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createMilestones, setCreateMilestones] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);

  useEffect(() => {
    if (userAddress) {
      loadEscrows(userAddress);
    }
  }, [userAddress]);

  async function loadEscrows(addr: string) {
    setLoading(true);
    setError(null);
    try {
      const [buyer, seller] = await Promise.all([
        fetchEscrowsByRole("buyer", addr),
        fetchEscrowsByRole("seller", addr),
      ]);
      setBuyerEscrows(buyer);
      setSellerEscrows(seller);

      // Load disputes for disputed escrows
      const allEscrows = [...buyer, ...seller];
      const disputed = allEscrows.filter((e) => e.status === "disputed");
      const uniqueDisputed = disputed.filter(
        (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i
      );
      const disputeResults = await Promise.all(
        uniqueDisputed.map(async (e) => {
          const dispute = await fetchDispute(e.id);
          return { ...e, dispute };
        })
      );
      setDisputes(disputeResults);
    } catch {
      setError("Failed to load escrow data. Is the chain running?");
    }
    setLoading(false);
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (trimmed) {
      setUserAddress(trimmed);
    }
  }

  async function handleConnectWallet() {
    try {
      const state = await connectKeplr();
      setWallet(state);
      setUserAddress(state.address);
      setAddressInput(state.address);
    } catch (e: any) {
      setTxStatus({ msg: `Wallet connection failed: ${e.message}`, type: "error" });
    }
  }

  async function handleComplete(escrowId: string) {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    try {
      const msg = {
        type: "clawchain/marketplace/MsgCompleteEscrow",
        value: {
          sender: wallet.address,
          escrow_id: escrowId,
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], `Complete escrow #${escrowId}`);
      if (result.code === 0) {
        setTxStatus({ msg: `Escrow #${escrowId} completed. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        if (userAddress) loadEscrows(userAddress);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  async function handleDispute(escrowId: string) {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    const reason = prompt("Enter dispute reason:");
    if (!reason) return;
    try {
      const msg = {
        type: "clawchain/marketplace/MsgDisputeEscrow",
        value: {
          sender: wallet.address,
          escrow_id: escrowId,
          reason,
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], `Dispute escrow #${escrowId}`);
      if (result.code === 0) {
        setTxStatus({ msg: `Dispute filed for escrow #${escrowId}. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        if (userAddress) loadEscrows(userAddress);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  async function handleCompleteMilestone(escrowId: string, milestoneIndex: number) {
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    try {
      const msg = {
        type: "clawchain/marketplace/MsgCompleteMilestone",
        value: {
          sender: wallet.address,
          escrow_id: escrowId,
          milestone_index: String(milestoneIndex),
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], `Complete milestone #${milestoneIndex + 1}`);
      if (result.code === 0) {
        setTxStatus({ msg: `Milestone #${milestoneIndex + 1} completed. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        if (userAddress) loadEscrows(userAddress);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  async function handleCreateEscrow(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) {
      setTxStatus({ msg: "Connect your wallet first.", type: "error" });
      return;
    }
    setTxStatus(null);
    const validMilestones = createMilestones.filter((m) => m.description && m.amount);
    const totalAmount = createAmount ? String(Math.floor(parseFloat(createAmount) * 1_000_000)) : "0";
    try {
      const msg = {
        type: "clawchain/marketplace/MsgCreateEscrow",
        value: {
          buyer: wallet.address,
          seller: createSeller.trim(),
          amount: { amount: totalAmount, denom: "uclaw" },
          milestones: validMilestones.map((m) => ({
            description: m.description,
            amount: String(Math.floor(parseFloat(m.amount) * 1_000_000)),
          })),
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], "Create escrow");
      if (result.code === 0) {
        setTxStatus({ msg: `Escrow created. Tx: ${result.txHash.slice(0, 16)}...`, type: "success" });
        setShowCreateForm(false);
        setCreateSeller("");
        setCreateAmount("");
        setCreateMilestones([{ description: "", amount: "" }]);
        if (userAddress) loadEscrows(userAddress);
      } else {
        setTxStatus({ msg: `Transaction failed (code ${result.code}).`, type: "error" });
      }
    } catch (e: any) {
      setTxStatus({ msg: `Failed: ${e.message}`, type: "error" });
    }
  }

  function addMilestone() {
    setCreateMilestones([...createMilestones, { description: "", amount: "" }]);
  }

  function removeMilestone(index: number) {
    setCreateMilestones(createMilestones.filter((_, i) => i !== index));
  }

  function updateMilestone(index: number, field: "description" | "amount", value: string) {
    const updated = [...createMilestones];
    updated[index] = { ...updated[index], [field]: value };
    setCreateMilestones(updated);
  }

  // Derived stats
  const allEscrows = [
    ...buyerEscrows,
    ...sellerEscrows.filter((se) => !buyerEscrows.some((be) => be.id === se.id)),
  ];
  const totalCount = allEscrows.length;
  const activeValue = allEscrows
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + BigInt(e.amount?.amount || "0"), 0n);
  const completedValue = allEscrows
    .filter((e) => e.status === "completed")
    .reduce((sum, e) => sum + BigInt(e.amount?.amount || "0"), 0n);
  const disputeCount = allEscrows.filter((e) => e.status === "disputed").length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "buyer", label: `As Buyer (${buyerEscrows.length})` },
    { key: "seller", label: `As Seller (${sellerEscrows.length})` },
    { key: "disputes", label: `Disputes (${disputes.length})` },
  ];

  return (
    <div>
      <h1 className="page-title">Escrows</h1>
      <p className="page-subtitle">
        Manage marketplace escrows -- create, track milestones, and resolve disputes.
      </p>

      {/* Wallet + Address lookup */}
      <div className="card" style={{ marginBottom: "1.5rem", maxWidth: "600px" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
          {wallet?.connected ? (
            <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
              Wallet: <strong>{shortAddr(wallet.address)}</strong> ({formatClaw(wallet.balance)} CLAW)
            </span>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleConnectWallet}
              disabled={!isKeplrAvailable()}
              data-testid="connect-wallet-btn"
            >
              {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
            </button>
          )}
        </div>
        <form
          onSubmit={handleLookup}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter your claw... address to view escrows"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button className="btn btn-primary" type="submit">
            Lookup
          </button>
        </form>
        {userAddress && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text2)" }}>
            Viewing: <strong>{shortAddr(userAddress)}</strong>
          </p>
        )}
      </div>

      {txStatus && (
        <div
          data-testid="tx-status"
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

      {error && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading escrows...</p>
        </div>
      )}

      {/* Tab buttons */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? "btn-primary" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view your escrow overview.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              <div className="card">
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                  Total Escrows
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{totalCount}</div>
              </div>
              <div className="card">
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                  Active Value
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                  {formatClaw(activeValue.toString())}
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                  Completed Value
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>
                  {formatClaw(completedValue.toString())}
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                  Disputes
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: disputeCount > 0 ? "#ef4444" : undefined }}>
                  {disputeCount}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* As Buyer Tab */}
      {tab === "buyer" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view escrows where you are the buyer.</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                >
                  {showCreateForm ? "Cancel" : "Create Escrow"}
                </button>
              </div>

              {/* Create Escrow Form */}
              {showCreateForm && (
                <div className="card" style={{ maxWidth: 600, marginBottom: "1.5rem" }}>
                  <h3 style={{ marginBottom: "1rem" }}>Create New Escrow</h3>
                  <form onSubmit={handleCreateEscrow}>
                    <div style={{ marginBottom: "1rem" }}>
                      <label>Seller Address *</label>
                      <input
                        type="text"
                        value={createSeller}
                        onChange={(e) => setCreateSeller(e.target.value)}
                        placeholder="claw1..."
                        required
                        style={{ width: "100%", padding: "0.5rem" }}
                      />
                    </div>
                    <div style={{ marginBottom: "1rem" }}>
                      <label>Total Amount (CLAW) *</label>
                      <input
                        type="number"
                        step="0.000001"
                        min="0.000001"
                        value={createAmount}
                        onChange={(e) => setCreateAmount(e.target.value)}
                        placeholder="100"
                        required
                        style={{ width: "100%", padding: "0.5rem" }}
                      />
                    </div>

                    <div style={{ marginBottom: "1rem" }}>
                      <label>Milestones</label>
                      {createMilestones.map((m, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            marginBottom: "0.5rem",
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="text"
                            value={m.description}
                            onChange={(e) => updateMilestone(i, "description", e.target.value)}
                            placeholder={`Milestone ${i + 1} description`}
                            style={{ flex: 2, padding: "0.5rem" }}
                          />
                          <input
                            type="number"
                            step="0.000001"
                            min="0"
                            value={m.amount}
                            onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                            placeholder="Amount (CLAW)"
                            style={{ flex: 1, padding: "0.5rem" }}
                          />
                          {createMilestones.length > 1 && (
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                              onClick={() => removeMilestone(i)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: "0.8rem" }}
                        onClick={addMilestone}
                      >
                        + Add Milestone
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn btn-primary" type="submit">
                        Create Escrow
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {buyerEscrows.length === 0 ? (
                <div className="empty">No escrows found where you are the buyer.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Seller</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Milestones</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyerEscrows.map((e) => (
                        <tr key={e.id}>
                          <td className="mono">{e.id}</td>
                          <td>
                            <Link to={`/explorer/account/${e.seller}`} className="mono">
                              {shortAddr(e.seller)}
                            </Link>
                          </td>
                          <td>
                            <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                              {formatClaw(e.amount?.amount || "0")}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[e.status]}`}>
                              {e.status}
                            </span>
                          </td>
                          <td>{milestonesProgress(e.milestones)}</td>
                          <td style={{ fontSize: 12 }}>{fmtDate(e.created_at)}</td>
                          <td>
                            {e.status === "active" && (
                              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                <button
                                  className="btn btn-primary"
                                  style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                                  onClick={() => handleComplete(e.id)}
                                >
                                  Complete
                                </button>
                                <button
                                  className="btn"
                                  style={{ fontSize: "0.8rem", padding: "4px 12px", color: "#ef4444" }}
                                  onClick={() => handleDispute(e.id)}
                                >
                                  Dispute
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* As Seller Tab */}
      {tab === "seller" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view escrows where you are the seller.</p>
            </div>
          ) : sellerEscrows.length === 0 ? (
            <div className="empty">No escrows found where you are the seller.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Buyer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Milestones</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerEscrows.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">{e.id}</td>
                      <td>
                        <Link to={`/explorer/account/${e.buyer}`} className="mono">
                          {shortAddr(e.buyer)}
                        </Link>
                      </td>
                      <td>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {formatClaw(e.amount?.amount || "0")}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[e.status]}`}>
                          {e.status}
                        </span>
                      </td>
                      <td>{milestonesProgress(e.milestones)}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(e.created_at)}</td>
                      <td>
                        {e.status === "active" && e.milestones && e.milestones.length > 0 && (
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {e.milestones.map((m, mi) =>
                              !m.completed ? (
                                <button
                                  key={mi}
                                  className="btn btn-primary"
                                  style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                                  onClick={() => handleCompleteMilestone(e.id, mi)}
                                >
                                  Complete #{mi + 1}
                                </button>
                              ) : null
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Disputes Tab */}
      {tab === "disputes" && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view disputed escrows.</p>
            </div>
          ) : disputes.length === 0 ? (
            <div className="empty">No disputed escrows found.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Escrow ID</th>
                    <th>Buyer</th>
                    <th>Seller</th>
                    <th>Amount</th>
                    <th>Dispute Reason</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">{e.id}</td>
                      <td>
                        <Link to={`/explorer/account/${e.buyer}`} className="mono">
                          {shortAddr(e.buyer)}
                        </Link>
                      </td>
                      <td>
                        <Link to={`/explorer/account/${e.seller}`} className="mono">
                          {shortAddr(e.seller)}
                        </Link>
                      </td>
                      <td>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {formatClaw(e.amount?.amount || "0")}
                        </span>
                      </td>
                      <td>{e.dispute?.reason || "--"}</td>
                      <td>
                        {e.dispute?.resolved ? (
                          <span className="badge success">
                            {e.dispute.resolution || "Resolved"}
                          </span>
                        ) : (
                          <span className="badge warning">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
