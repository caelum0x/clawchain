// ---------------------------------------------------------------------------
// VoteTallyBar -- horizontal stacked bar for governance vote visualization
// ---------------------------------------------------------------------------

export interface VoteTally {
  yes: number;
  no: number;
  abstain: number;
  noWithVeto: number;
}

export interface VoteTallyBarProps {
  tally: VoteTally;
  /** Total bonded/staked tokens for quorum calculation. When provided the
   *  quorum indicator line is shown. */
  totalBonded?: number;
  /** Quorum threshold as a fraction (default 0.334 = 33.4%). */
  quorumThreshold?: number;
  /** Whether to show the percentage legend below the bar (default true). */
  showLegend?: boolean;
  /** Whether to show quorum + pass status text (default true). */
  showStatus?: boolean;
  /** Compact mode uses a thinner bar without legend (for table rows). */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Colour constants
// ---------------------------------------------------------------------------

const COLORS = {
  yes: "#22c55e",
  no: "#ef4444",
  abstain: "#a3a3a3",
  noWithVeto: "#f97316",
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VoteTallyBar({
  tally,
  totalBonded,
  quorumThreshold = 0.334,
  showLegend = true,
  showStatus = true,
  compact = false,
}: VoteTallyBarProps) {
  const { yes, no, abstain, noWithVeto } = tally;
  const totalVotes = yes + no + abstain + noWithVeto;

  if (totalVotes === 0) {
    return <span style={{ opacity: 0.5 }}>No votes yet</span>;
  }

  const yesPct = (yes / totalVotes) * 100;
  const noPct = (no / totalVotes) * 100;
  const abstainPct = (abstain / totalVotes) * 100;
  const vetoPct = (noWithVeto / totalVotes) * 100;

  // Quorum: if totalBonded is provided, quorum = totalVotes / totalBonded >= threshold
  const quorumPct =
    totalBonded && totalBonded > 0
      ? (totalVotes / totalBonded) * 100
      : undefined;
  const quorumReached =
    quorumPct !== undefined
      ? quorumPct >= quorumThreshold * 100
      : totalVotes > 0; // fallback: any votes = quorum reached

  // Pass ratio: yes > 50% of non-abstain votes
  const nonAbstain = yes + no + noWithVeto;
  const passRatio = nonAbstain > 0 ? yes / nonAbstain : 0;

  const barHeight = compact ? 8 : 28;

  return (
    <div data-testid="vote-tally-bar">
      {/* Stacked bar */}
      <div style={{ position: "relative", marginBottom: compact ? 0 : "0.5rem" }}>
        <div
          role="img"
          aria-label={`Vote tally: ${yesPct.toFixed(1)}% Yes, ${noPct.toFixed(1)}% No, ${abstainPct.toFixed(1)}% Abstain, ${vetoPct.toFixed(1)}% No With Veto`}
          style={{
            display: "flex",
            height: barHeight,
            borderRadius: compact ? 4 : 6,
            overflow: "hidden",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          {yesPct > 0 && (
            <div
              data-testid="tally-yes"
              style={{
                width: `${yesPct}%`,
                background: COLORS.yes,
                transition: "width 0.3s",
              }}
              title={`Yes: ${yesPct.toFixed(1)}%`}
            />
          )}
          {noPct > 0 && (
            <div
              data-testid="tally-no"
              style={{
                width: `${noPct}%`,
                background: COLORS.no,
                transition: "width 0.3s",
              }}
              title={`No: ${noPct.toFixed(1)}%`}
            />
          )}
          {abstainPct > 0 && (
            <div
              data-testid="tally-abstain"
              style={{
                width: `${abstainPct}%`,
                background: COLORS.abstain,
                transition: "width 0.3s",
              }}
              title={`Abstain: ${abstainPct.toFixed(1)}%`}
            />
          )}
          {vetoPct > 0 && (
            <div
              data-testid="tally-veto"
              style={{
                width: `${vetoPct}%`,
                background: COLORS.noWithVeto,
                transition: "width 0.3s",
              }}
              title={`No With Veto: ${vetoPct.toFixed(1)}%`}
            />
          )}
        </div>

        {/* Quorum indicator line */}
        {!compact && quorumPct !== undefined && (
          <div
            data-testid="quorum-line"
            style={{
              position: "absolute",
              left: `${Math.min(quorumThreshold * 100, 100)}%`,
              top: -4,
              bottom: -4,
              width: 2,
              background: "#fff",
              opacity: 0.6,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -18,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "0.7rem",
                color: "var(--text2)",
                whiteSpace: "nowrap",
              }}
            >
              {(quorumThreshold * 100).toFixed(1)}% quorum
            </span>
          </div>
        )}
      </div>

      {/* Percentage labels / legend */}
      {!compact && showLegend && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.5rem",
            marginTop: "0.75rem",
          }}
        >
          <LegendItem label="Yes" color={COLORS.yes} pct={yesPct} count={yes} />
          <LegendItem label="No" color={COLORS.no} pct={noPct} count={no} />
          <LegendItem label="Abstain" color={COLORS.abstain} pct={abstainPct} count={abstain} />
          <LegendItem
            label="No With Veto"
            color={COLORS.noWithVeto}
            pct={vetoPct}
            count={noWithVeto}
          />
        </div>
      )}

      {/* Compact mode: single-line percentage */}
      {compact && (
        <span style={{ fontSize: "0.75rem", opacity: 0.7, marginLeft: "0.25rem" }}>
          {yesPct.toFixed(0)}% Yes
        </span>
      )}

      {/* Quorum + pass indicators */}
      {!compact && showStatus && (
        <div
          style={{
            display: "flex",
            gap: "2rem",
            marginTop: "0.75rem",
            fontSize: "0.85rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: quorumReached ? "#22c55e" : "#ef4444" }}>
            {quorumReached
              ? "Quorum reached"
              : `Quorum not reached (need ${(quorumThreshold * 100).toFixed(1)}%)`}
          </span>
          <span style={{ color: passRatio > 0.5 ? "#22c55e" : "#ef4444" }}>
            Pass ratio: {(passRatio * 100).toFixed(1)}%{" "}
            {passRatio > 0.5 ? "(passing)" : "(not passing)"}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: legend item
// ---------------------------------------------------------------------------

function LegendItem({
  label,
  color,
  pct,
  count,
}: {
  label: string;
  color: string;
  pct: number;
  count: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: color,
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>
          {pct.toFixed(1)}% &mdash; {count.toLocaleString()} votes
        </div>
      </div>
    </div>
  );
}
