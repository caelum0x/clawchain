// ---------------------------------------------------------------------------
// DepositProgress -- shows current deposit vs required deposit with bar
// ---------------------------------------------------------------------------

export interface DepositProgressProps {
  /** Current deposit amount in minimal denom (e.g. uclaw). */
  currentAmount: number;
  /** Required / minimum deposit amount in minimal denom. */
  requiredAmount: number;
  /** Human-readable formatting function (e.g. formatClaw). */
  formatAmount?: (amount: string) => string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DepositProgress({
  currentAmount,
  requiredAmount,
  formatAmount = defaultFormat,
}: DepositProgressProps) {
  const pct =
    requiredAmount > 0
      ? Math.min((currentAmount / requiredAmount) * 100, 100)
      : 0;
  const isMet = pct >= 100;

  return (
    <div data-testid="deposit-progress">
      {/* Amount labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          fontSize: "0.85rem",
        }}
      >
        <span data-testid="deposit-current">
          Current: {formatAmount(String(currentAmount))}
        </span>
        <span data-testid="deposit-required">
          Required: {formatAmount(String(requiredAmount))}
        </span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Deposit progress"
        style={{
          height: 12,
          borderRadius: 6,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          data-testid="deposit-bar-fill"
          style={{
            width: `${pct}%`,
            height: "100%",
            background: isMet ? "#22c55e" : "#eab308",
            transition: "width 0.3s",
            borderRadius: 6,
          }}
        />
      </div>

      {/* Status text */}
      <p
        data-testid="deposit-status"
        style={{
          fontSize: "0.8rem",
          color: "var(--text2)",
          marginTop: "0.35rem",
        }}
      >
        {isMet
          ? "Minimum deposit met"
          : `${pct.toFixed(1)}% of minimum deposit`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default formatter
// ---------------------------------------------------------------------------

function defaultFormat(amount: string): string {
  const n = BigInt(amount || "0");
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  if (frac === 0n) return `${whole} CLAW`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} CLAW`;
}
