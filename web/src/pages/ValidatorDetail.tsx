import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatClaw, shortAddr, getValidators, type Validator } from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import Breadcrumbs from "../components/Breadcrumbs.tsx";
import useDocTitle from "../hooks/useDocTitle.ts";
import CopyButton from "../components/CopyButton.tsx";

const REST = chainConfig.restEndpoint;

/* ---- local types ---- */

interface ValidatorFull {
  operatorAddress: string;
  moniker: string;
  identity: string;
  website: string;
  securityContact: string;
  details: string;
  tokens: string;
  status: string;
  jailed: boolean;
  commissionRate: string;
  maxRate: string;
  maxChangeRate: string;
  minSelfDelegation: string;
  unbondingHeight: string;
  unbondingTime: string;
}

interface DelegationEntry {
  delegatorAddress: string;
  shares: string;
  amount: string;
  denom: string;
}

interface SigningInfo {
  address: string;
  startHeight: string;
  missedBlocksCounter: string;
  jailedUntil: string;
  tombstoned: boolean;
}

/* ---- data fetchers ---- */

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getValidatorDetail(operatorAddress: string): Promise<ValidatorFull> {
  const data = await fetchJSON<any>(
    `${REST}/cosmos/staking/v1beta1/validators/${operatorAddress}`
  );
  const v = data.validator ?? data;
  const desc = v.description ?? {};
  const rates = v.commission?.commission_rates ?? {};
  return {
    operatorAddress: v.operator_address ?? operatorAddress,
    moniker: desc.moniker ?? "",
    identity: desc.identity ?? "",
    website: desc.website ?? "",
    securityContact: desc.security_contact ?? "",
    details: desc.details ?? "",
    tokens: v.tokens ?? "0",
    status: v.status ?? "BOND_STATUS_UNSPECIFIED",
    jailed: v.jailed ?? false,
    commissionRate: rates.rate ?? "0",
    maxRate: rates.max_rate ?? "0",
    maxChangeRate: rates.max_change_rate ?? "0",
    minSelfDelegation: v.min_self_delegation ?? "0",
    unbondingHeight: v.unbonding_height ?? "0",
    unbondingTime: v.unbonding_time ?? "",
  };
}

async function getValidatorDelegations(
  operatorAddress: string,
  paginationKey?: string
): Promise<{ delegations: DelegationEntry[]; nextKey: string | null; total: string }> {
  let url = `${REST}/cosmos/staking/v1beta1/validators/${operatorAddress}/delegations?pagination.limit=20`;
  if (paginationKey) url += `&pagination.key=${encodeURIComponent(paginationKey)}`;
  const data = await fetchJSON<any>(url);
  const delegations = (data.delegation_responses ?? []).map((d: any) => ({
    delegatorAddress: d.delegation?.delegator_address ?? "",
    shares: d.delegation?.shares ?? "0",
    amount: d.balance?.amount ?? "0",
    denom: d.balance?.denom ?? "uclaw",
  }));
  return {
    delegations,
    nextKey: data.pagination?.next_key ?? null,
    total: data.pagination?.total ?? "0",
  };
}

async function getCommission(operatorAddress: string): Promise<string> {
  try {
    const data = await fetchJSON<any>(
      `${REST}/cosmos/distribution/v1beta1/validators/${operatorAddress}/commission`
    );
    const coins = data.commission?.commission ?? [];
    const uclaw = coins.find((c: any) => c.denom === "uclaw");
    return uclaw?.amount?.split(".")[0] ?? "0";
  } catch {
    return "0";
  }
}

async function getOutstandingRewards(operatorAddress: string): Promise<string> {
  try {
    const data = await fetchJSON<any>(
      `${REST}/cosmos/distribution/v1beta1/validators/${operatorAddress}/outstanding_rewards`
    );
    const coins = data.rewards?.rewards ?? [];
    const uclaw = coins.find((c: any) => c.denom === "uclaw");
    return uclaw?.amount?.split(".")[0] ?? "0";
  } catch {
    return "0";
  }
}

async function getSigningInfos(): Promise<SigningInfo[]> {
  try {
    const data = await fetchJSON<any>(
      `${REST}/cosmos/slashing/v1beta1/signing_infos?pagination.limit=500`
    );
    return (data.info ?? []).map((s: any) => ({
      address: s.address ?? "",
      startHeight: s.start_height ?? "0",
      missedBlocksCounter: s.missed_blocks_counter ?? "0",
      jailedUntil: s.jailed_until ?? "",
      tombstoned: s.tombstoned ?? false,
    }));
  } catch {
    return [];
  }
}

/* ---- helpers ---- */

function statusLabel(status: string, jailed: boolean): { text: string; className: string } {
  if (jailed) return { text: "Jailed", className: "badge error" };
  if (status.includes("BONDED")) return { text: "Bonded", className: "badge success" };
  if (status.includes("UNBONDING")) return { text: "Unbonding", className: "badge warning" };
  return { text: "Unbonded", className: "badge" };
}

function pctDisplay(rate: string): string {
  return `${(parseFloat(rate) * 100).toFixed(2)}%`;
}

/* ---- component ---- */

export default function ValidatorDetail() {
  useDocTitle("Validator Detail");
  const { address } = useParams<{ address: string }>();

  const [validator, setValidator] = useState<ValidatorFull | null>(null);
  const [totalBondedTokens, setTotalBondedTokens] = useState(0n);
  const [delegations, setDelegations] = useState<DelegationEntry[]>([]);
  const [delTotal, setDelTotal] = useState("0");
  const [delNextKey, setDelNextKey] = useState<string | null>(null);
  const [commission, setCommission] = useState("0");
  const [outstanding, setOutstanding] = useState("0");
  const [signingInfo, setSigningInfo] = useState<SigningInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [delLoading, setDelLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "delegators" | "rewards" | "signing">("details");

  useEffect(() => {
    if (!address) return;
    (async () => {
      try {
        const [val, allValidators, delPage, comm, rew, infos] = await Promise.all([
          getValidatorDetail(address),
          getValidators(),
          getValidatorDelegations(address),
          getCommission(address),
          getOutstandingRewards(address),
          getSigningInfos(),
        ]);
        setValidator(val);
        setTotalBondedTokens(allValidators.reduce((s, v) => s + BigInt(v.tokens), 0n));

        // Sort delegations by balance descending
        const sorted = delPage.delegations.sort(
          (a, b) => Number(BigInt(b.amount) - BigInt(a.amount))
        );
        setDelegations(sorted);
        setDelTotal(delPage.total);
        setDelNextKey(delPage.nextKey);

        setCommission(comm);
        setOutstanding(rew);

        // Match signing info by consensus address or just take first match
        // The signing_infos endpoint returns consensus addresses which differ from operator addresses.
        // We pass all infos and try to match; if no match, show the first entry if there's only one validator.
        const matched = infos.length === 1 ? infos[0] : null;
        setSigningInfo(matched);
      } catch {
        /* offline */
      }
      setLoading(false);
    })();
  }, [address]);

  async function loadMoreDelegations() {
    if (!address || !delNextKey || delLoading) return;
    setDelLoading(true);
    try {
      const page = await getValidatorDelegations(address, delNextKey);
      const sorted = page.delegations.sort(
        (a, b) => Number(BigInt(b.amount) - BigInt(a.amount))
      );
      setDelegations((prev) => [...prev, ...sorted]);
      setDelNextKey(page.nextKey);
    } catch {
      /* offline */
    }
    setDelLoading(false);
  }

  if (loading)
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading validator...</p>
      </div>
    );
  if (!address) return <div className="empty">No address specified.</div>;
  if (!validator) return <div className="empty">Validator not found.</div>;

  const st = statusLabel(validator.status, validator.jailed);
  const votingPower = BigInt(validator.tokens);
  const votingPct =
    totalBondedTokens > 0n
      ? (Number((votingPower * 10000n) / totalBondedTokens) / 100).toFixed(2)
      : "0.00";

  const totalDelegatorsCount = parseInt(delTotal) || delegations.length;

  return (
    <>
      {/* Breadcrumbs + Header */}
      <Breadcrumbs items={[
        { label: "Validators", to: "/validators" },
        { label: validator.moniker || "Unnamed Validator" },
      ]} />

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {validator.moniker || "Unnamed Validator"}
        </h1>
        <span className={st.className}>{st.text}</span>
      </div>

      <p className="mono" style={{ wordBreak: "break-all", fontSize: 14, color: "var(--text2)", marginBottom: 8 }}>
        {validator.operatorAddress} <CopyButton text={validator.operatorAddress} />
      </p>

      {validator.website && (
        <p style={{ marginBottom: 16 }}>
          <a href={validator.website.startsWith("http") ? validator.website : `https://${validator.website}`} target="_blank" rel="noopener noreferrer">
            {validator.website}
          </a>
        </p>
      )}

      {/* Stats cards */}
      <div className="grid-4">
        <div className="card">
          <h3>Voting Power</h3>
          <div className="value accent">{formatClaw(validator.tokens)}</div>
          <div style={{ fontSize: 12, color: "var(--text2)" }}>{votingPct}% of total</div>
        </div>
        <div className="card">
          <h3>Commission Rate</h3>
          <div className="value">{pctDisplay(validator.commissionRate)}</div>
        </div>
        <div className="card">
          <h3>Min Self-Delegation</h3>
          <div className="value">{formatClaw(validator.minSelfDelegation)}</div>
        </div>
        <div className="card">
          <h3>Total Delegators</h3>
          <div className="value">{totalDelegatorsCount.toLocaleString()}</div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        {(["details", "delegators", "rewards", "signing"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: activeTab === tab ? "var(--accent)" : "var(--surface)",
              color: activeTab === tab ? "#fff" : "var(--text1)",
              cursor: "pointer",
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {activeTab === "details" && (
        <>
          {validator.details && (
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Description</h3>
              <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{validator.details}</p>
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Commission</h3>
            <table style={{ marginTop: 12 }}>
              <tbody>
                <tr>
                  <td style={{ color: "var(--text2)", width: 200 }}>Current Rate</td>
                  <td>{pctDisplay(validator.commissionRate)}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Max Rate</td>
                  <td>{pctDisplay(validator.maxRate)}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Max Change Rate</td>
                  <td>{pctDisplay(validator.maxChangeRate)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Staking Info</h3>
            <table style={{ marginTop: 12 }}>
              <tbody>
                <tr>
                  <td style={{ color: "var(--text2)", width: 200 }}>Min Self-Delegation</td>
                  <td>{formatClaw(validator.minSelfDelegation)}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Unbonding Height</td>
                  <td>{validator.unbondingHeight === "0" ? "N/A" : validator.unbondingHeight}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Unbonding Time</td>
                  <td>
                    {validator.unbondingTime && validator.unbondingTime !== "1970-01-01T00:00:00Z"
                      ? new Date(validator.unbondingTime).toLocaleString()
                      : "N/A"}
                  </td>
                </tr>
                {validator.identity && (
                  <tr>
                    <td style={{ color: "var(--text2)" }}>Identity</td>
                    <td className="mono">{validator.identity}</td>
                  </tr>
                )}
                {validator.securityContact && (
                  <tr>
                    <td style={{ color: "var(--text2)" }}>Security Contact</td>
                    <td>{validator.securityContact}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Delegators tab */}
      {activeTab === "delegators" && (
        <div className="table-wrap">
          <h2>Delegators ({totalDelegatorsCount.toLocaleString()})</h2>
          {delegations.length === 0 ? (
            <div className="empty">No delegations found.</div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Delegator Address</th>
                    <th>Shares</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {delegations.map((d, i) => (
                    <tr key={d.delegatorAddress + i}>
                      <td>{i + 1}</td>
                      <td>
                        <Link to={`/explorer/account/${d.delegatorAddress}`} className="mono">
                          {shortAddr(d.delegatorAddress)}
                        </Link>
                      </td>
                      <td className="mono">{parseFloat(d.shares).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>{formatClaw(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {delNextKey && (
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <button
                    onClick={loadMoreDelegations}
                    disabled={delLoading}
                    style={{
                      padding: "8px 24px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--surface)",
                      color: "var(--text1)",
                      cursor: delLoading ? "wait" : "pointer",
                    }}
                  >
                    {delLoading ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Rewards tab */}
      {activeTab === "rewards" && (
        <div className="grid-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="card">
            <h3>Accumulated Commission</h3>
            <div className="value accent">{formatClaw(commission)}</div>
          </div>
          <div className="card">
            <h3>Outstanding Rewards</h3>
            <div className="value accent">{formatClaw(outstanding)}</div>
          </div>
        </div>
      )}

      {/* Signing Info tab */}
      {activeTab === "signing" && (
        <div className="card">
          <h3 style={{ textTransform: "none", letterSpacing: 0 }}>Signing Info</h3>
          {signingInfo ? (
            <table style={{ marginTop: 12 }}>
              <tbody>
                <tr>
                  <td style={{ color: "var(--text2)", width: 200 }}>Missed Blocks</td>
                  <td>{parseInt(signingInfo.missedBlocksCounter).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Tombstoned</td>
                  <td>
                    <span className={`badge ${signingInfo.tombstoned ? "error" : "success"}`}>
                      {signingInfo.tombstoned ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Jailed Until</td>
                  <td>
                    {signingInfo.jailedUntil && signingInfo.jailedUntil !== "1970-01-01T00:00:00Z"
                      ? new Date(signingInfo.jailedUntil).toLocaleString()
                      : "N/A"}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text2)" }}>Start Height</td>
                  <td>{signingInfo.startHeight}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p style={{ marginTop: 12, color: "var(--text2)" }}>
              Signing info not available. The slashing signing_infos endpoint returns consensus addresses which may not directly match the operator address.
            </p>
          )}
        </div>
      )}
    </>
  );
}
