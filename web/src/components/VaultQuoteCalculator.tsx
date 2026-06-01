import { useCallback, useState } from "react";
import { chainConfig } from "../lib/config.ts";
import { toBaseUnits, formatBaseUnits } from "../lib/model-vault.ts";
import { getVaultQuote, type VaultQuote } from "../lib/model-index.ts";

const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

export interface VaultQuoteCalculatorProps {
  /** ModelVault contract address to quote against. */
  vaultAddress: string;
  /** the vault's model token denom (sold on a "sell", received on a "buy"). */
  modelDenom: string;
  /** the vault's reserve denom (spent on a "buy", received on a "sell"). */
  reserveDenom: string;
}

interface QuotePair {
  buy: VaultQuote;
  sell: VaultQuote;
}

/**
 * Read-only buy/sell quote calculator for a single ModelVault. Enter an amount
 * and query the contract's {"quote":{side,amount}} for both sides at once.
 *
 * For `buy`, `amount` is reserve_denom spent and `amount_out` is model tokens
 * received. For `sell`, `amount` is model tokens spent and `amount_out` is
 * reserve_denom received. Reuses {@link getVaultQuote} and the base-unit
 * conversion helpers — no broadcast.
 */
export default function VaultQuoteCalculator({
  vaultAddress,
  modelDenom,
  reserveDenom,
}: VaultQuoteCalculatorProps) {
  const [amount, setAmount] = useState("");
  const [quotes, setQuotes] = useState<QuotePair | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onQuote = useCallback(async () => {
    setError(null);
    let base: string;
    try {
      base = toBaseUnits(amount);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid amount");
      return;
    }
    setLoading(true);
    try {
      const [buy, sell] = await Promise.all([
        getVaultQuote(vaultAddress, "buy", base),
        getVaultQuote(vaultAddress, "sell", base),
      ]);
      setQuotes({ buy, sell });
    } catch (e: unknown) {
      setQuotes(null);
      setError(e instanceof Error ? e.message : "Failed to fetch quote");
    }
    setLoading(false);
  }, [amount, vaultAddress]);

  return (
    <div className="card" data-testid="vault-quote-calculator" style={{ marginTop: 24 }}>
      <h2>Quote Calculator</h2>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
        Enter an amount to preview the bonding-curve trade output for both sides.
        A <strong>buy</strong> spends {RESERVE_LABEL}; a <strong>sell</strong> spends the
        model token. Read-only &mdash; no transaction is broadcast.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onQuote();
          }}
          placeholder="Amount (input side)"
          aria-label="Quote amount"
          data-testid="vault-quote-amount"
          inputMode="decimal"
          style={{ padding: "6px 10px", minWidth: 200 }}
        />
        <button
          className="btn"
          data-testid="vault-quote-btn"
          onClick={onQuote}
          disabled={loading}
        >
          {loading ? "Quoting..." : "Quote"}
        </button>
      </div>

      {error && (
        <p data-testid="vault-quote-error" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}

      {quotes && (
        <div className="grid-4">
          <div className="card" data-testid="vault-quote-buy">
            <h3>Buy &mdash; out</h3>
            <div className="value accent">{formatBaseUnits(quotes.buy.amount_out)}</div>
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}
            >
              {quotes.buy.denom_out || modelDenom}
            </div>
          </div>
          <div className="card" data-testid="vault-quote-sell">
            <h3>Sell &mdash; out</h3>
            <div className="value accent">{formatBaseUnits(quotes.sell.amount_out)}</div>
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}
            >
              {quotes.sell.denom_out || reserveDenom}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
