/**
 * ClawChain Analytics – Portfolio and chain analytics helpers.
 *
 * Pure utility functions for computing portfolio values, staking returns,
 * DEX pool APY, transaction history aggregation, and profit/loss tracking.
 * These functions are stateless and do not make any network calls.
 *
 * Usage:
 *
 * ```ts
 * import {
 *   calculatePortfolioValue,
 *   calculateStakingAPR,
 *   formatTokenAmount,
 * } from "@clawchain/sdk";
 *
 * const value = calculatePortfolioValue(
 *   [{ denom: "uclaw", amount: "1000000" }],
 *   { uclaw: 0.05 },
 * );
 * console.log(value.totalUsd); // 50
 *
 * const apr = calculateStakingAPR(0.07, 0.65, 0.02);
 * console.log(apr); // ~0.1054
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A token balance entry (denom + amount in base units). */
export interface TokenBalance {
  /** Denomination (e.g. "uclaw", "ibc/ABC..."). */
  denom: string;
  /** Amount in base (smallest) units as a string integer. */
  amount: string;
}

/** Price map: denom -> USD price per one base unit. */
export type PriceMap = Record<string, number>;

/** Aggregated portfolio value breakdown. */
export interface PortfolioValuation {
  /** Total portfolio value in USD. */
  totalUsd: number;
  /** Per-asset breakdown. */
  assets: Array<{
    denom: string;
    amount: string;
    priceUsd: number;
    valueUsd: number;
  }>;
  /** Number of distinct assets held. */
  assetCount: number;
  /** Largest position by USD value. */
  largestPosition: { denom: string; valueUsd: number } | null;
}

/** Staking metrics computed from chain parameters. */
export interface StakingMetrics {
  /** Nominal APR before community tax. */
  nominalApr: number;
  /** Real APR after community tax. */
  realApr: number;
  /** Effective yield for a given bonded ratio. */
  effectiveYield: number;
  /** Annual inflation rate used in the calculation. */
  inflation: number;
  /** Bonded ratio used in the calculation. */
  bondedRatio: number;
  /** Community tax rate used in the calculation. */
  communityTax: number;
}

/** DEX pool performance metrics. */
export interface PoolMetrics {
  /** Estimated annual percentage yield from fees. */
  estimatedApy: number;
  /** Total volume over the provided history window. */
  totalVolume: number;
  /** Average daily volume. */
  avgDailyVolume: number;
  /** Total fees collected. */
  totalFees: number;
  /** Pool TVL used in the calculation (in USD). */
  tvlUsd: number;
  /** Number of days in the history window. */
  windowDays: number;
}

/** A single volume data point for pool APY calculation. */
export interface VolumeDataPoint {
  /** ISO-8601 date string (e.g. "2026-03-01"). */
  date: string;
  /** Volume in USD for that day. */
  volumeUsd: number;
  /** Fees collected in USD for that day. */
  feesUsd: number;
}

/** Pool information needed for APY calculation. */
export interface PoolSnapshot {
  /** Total value locked in the pool (USD). */
  tvlUsd: number;
  /** Fee rate as a decimal (e.g. 0.003 for 0.3%). */
  feeRate: number;
}

/** Aggregation period for transaction history. */
export type AggregationPeriod = "day" | "week" | "month";

/** A single aggregate bucket in the transaction history. */
export interface TxAggregate {
  /** Start of the period (ISO-8601 date string). */
  periodStart: string;
  /** End of the period (ISO-8601 date string). */
  periodEnd: string;
  /** Number of transactions in this period. */
  txCount: number;
  /** Total amount sent in base units. */
  totalSent: string;
  /** Total amount received in base units. */
  totalReceived: string;
  /** Net flow (received - sent) in base units. */
  netFlow: string;
  /** Total gas fees paid in base units. */
  totalFees: string;
}

/** A transaction record for PnL and history aggregation. */
export interface TransactionRecord {
  /** Transaction hash. */
  hash: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Transaction type (e.g. "send", "receive", "swap", "shield", "delegate"). */
  type: string;
  /** Denomination. */
  denom: string;
  /** Amount in base units (positive = inflow, negative = outflow). */
  amount: string;
  /** Fee paid in base units. */
  fee: string;
  /** Price per base unit in USD at the time of the transaction (if known). */
  priceAtTime?: number;
}

/** Profit and loss report. */
export interface PnLReport {
  /** Total cost basis in USD. */
  totalCostBasis: number;
  /** Current market value in USD. */
  currentValue: number;
  /** Unrealised gain/loss in USD. */
  unrealisedPnL: number;
  /** Realised gain/loss from sells/swaps in USD. */
  realisedPnL: number;
  /** Combined PnL. */
  totalPnL: number;
  /** Return percentage. */
  returnPct: number;
  /** Per-asset breakdown. */
  perAsset: Array<{
    denom: string;
    costBasis: number;
    currentValue: number;
    pnl: number;
    returnPct: number;
  }>;
}

/** Default gas estimates per message type (in gas units). */
export interface GasEstimate {
  /** Message type URL or short name. */
  msgType: string;
  /** Estimated gas units. */
  gasUnits: number;
  /** Estimated cost in uclaw at the given gas price. */
  estimatedCostUclaw: number;
  /** Estimated cost in USD (if price is known). */
  estimatedCostUsd: number | null;
}

// ---------------------------------------------------------------------------
// Default gas estimates per message type
// ---------------------------------------------------------------------------

const DEFAULT_GAS_ESTIMATES: Record<string, number> = {
  // Bank
  "send": 80_000,
  "multi_send": 120_000,
  // Privacy
  "shield": 200_000,
  "unshield": 250_000,
  "private_transfer": 350_000,
  "batch_private_transfer": 500_000,
  // Agent
  "register_agent": 150_000,
  "deregister_agent": 100_000,
  "agent_action": 120_000,
  "agent_heartbeat": 80_000,
  "delegate_task": 130_000,
  "accept_task": 90_000,
  "complete_task": 110_000,
  // Governance
  "submit_proposal": 250_000,
  "vote": 80_000,
  "deposit": 90_000,
  // Marketplace
  "list_skill": 150_000,
  "delist_skill": 90_000,
  "purchase_skill": 120_000,
  // Staking
  "delegate": 200_000,
  "undelegate": 200_000,
  "redelegate": 250_000,
  "withdraw_rewards": 150_000,
  // IBC
  "ibc_transfer": 150_000,
  // DEX
  "swap": 250_000,
  "provide_liquidity": 300_000,
  "withdraw_liquidity": 250_000,
  // CosmWasm
  "store_code": 2_000_000,
  "instantiate_contract": 300_000,
  "execute_contract": 250_000,
  "migrate_contract": 300_000,
  // Escrow
  "create_escrow": 150_000,
  "complete_escrow": 120_000,
  "dispute_escrow": 130_000,
  // Reputation
  "rate_agent": 100_000,
  "endorse_agent": 100_000,
};

// ---------------------------------------------------------------------------
// Portfolio value
// ---------------------------------------------------------------------------

/**
 * Calculate the aggregate portfolio value in USD from a set of balances and
 * a price map.
 *
 * @param balances - Array of token balances (denom + amount in base units).
 * @param prices  - Map of denom to USD price per base unit.
 * @returns A PortfolioValuation with total value and per-asset breakdown.
 */
export function calculatePortfolioValue(
  balances: TokenBalance[],
  prices: PriceMap,
): PortfolioValuation {
  let totalUsd = 0;
  let largest: { denom: string; valueUsd: number } | null = null;

  const assets = balances.map((b) => {
    const price = prices[b.denom] ?? 0;
    const amount = b.amount;
    const valueUsd = parseFloat(amount) * price;
    totalUsd += valueUsd;

    if (!largest || valueUsd > largest.valueUsd) {
      largest = { denom: b.denom, valueUsd };
    }

    return {
      denom: b.denom,
      amount,
      priceUsd: price,
      valueUsd,
    };
  });

  return {
    totalUsd,
    assets,
    assetCount: assets.length,
    largestPosition: largest,
  };
}

// ---------------------------------------------------------------------------
// Staking APR
// ---------------------------------------------------------------------------

/**
 * Calculate the real staking APR given chain inflation parameters.
 *
 * The formula follows the standard Cosmos SDK staking reward calculation:
 *   nominal APR = inflation / bonded_ratio
 *   real APR    = nominal APR * (1 - community_tax)
 *
 * @param inflation    - Annual inflation rate as a decimal (e.g. 0.07 for 7%).
 * @param bondedRatio  - Fraction of total supply that is staked (e.g. 0.65).
 * @param communityTax - Community tax rate as a decimal (e.g. 0.02 for 2%).
 * @returns A StakingMetrics object with nominal and real APR.
 */
export function calculateStakingAPR(
  inflation: number,
  bondedRatio: number,
  communityTax: number,
): StakingMetrics {
  if (bondedRatio <= 0) {
    return {
      nominalApr: 0,
      realApr: 0,
      effectiveYield: 0,
      inflation,
      bondedRatio,
      communityTax,
    };
  }

  const nominalApr = inflation / bondedRatio;
  const realApr = nominalApr * (1 - communityTax);
  const effectiveYield = realApr;

  return {
    nominalApr,
    realApr,
    effectiveYield,
    inflation,
    bondedRatio,
    communityTax,
  };
}

// ---------------------------------------------------------------------------
// DEX pool APY
// ---------------------------------------------------------------------------

/**
 * Estimate the annual percentage yield for a DEX liquidity pool based on
 * historical volume and fee data.
 *
 * APY is calculated as:
 *   daily_fee_yield = avg_daily_fees / tvl
 *   apy = (1 + daily_fee_yield)^365 - 1
 *
 * @param pool          - Pool snapshot with TVL and fee rate.
 * @param volumeHistory - Array of daily volume data points.
 * @returns A PoolMetrics object with estimated APY and volume stats.
 */
export function calculateDexPoolAPY(
  pool: PoolSnapshot,
  volumeHistory: VolumeDataPoint[],
): PoolMetrics {
  if (pool.tvlUsd <= 0 || volumeHistory.length === 0) {
    return {
      estimatedApy: 0,
      totalVolume: 0,
      avgDailyVolume: 0,
      totalFees: 0,
      tvlUsd: pool.tvlUsd,
      windowDays: 0,
    };
  }

  const windowDays = volumeHistory.length;
  let totalVolume = 0;
  let totalFees = 0;

  for (const point of volumeHistory) {
    totalVolume += point.volumeUsd;
    totalFees += point.feesUsd;
  }

  const avgDailyVolume = totalVolume / windowDays;
  const avgDailyFees = totalFees / windowDays;
  const dailyFeeYield = avgDailyFees / pool.tvlUsd;

  // Compound daily to get APY
  const estimatedApy = Math.pow(1 + dailyFeeYield, 365) - 1;

  return {
    estimatedApy,
    totalVolume,
    avgDailyVolume,
    totalFees,
    tvlUsd: pool.tvlUsd,
    windowDays,
  };
}

// ---------------------------------------------------------------------------
// Transaction history aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate a list of transactions into time-based buckets (day, week, or month).
 *
 * Transactions are grouped by their timestamp into the requested period. Each
 * bucket contains counts, total sent/received, net flow, and total fees.
 *
 * @param txs    - Array of transaction records to aggregate.
 * @param period - Aggregation period: "day", "week", or "month".
 * @returns An array of TxAggregate buckets sorted chronologically.
 */
export function aggregateTransactionHistory(
  txs: TransactionRecord[],
  period: AggregationPeriod = "day",
): TxAggregate[] {
  if (txs.length === 0) return [];

  // Sort by timestamp ascending
  const sorted = [...txs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const buckets = new Map<string, {
    periodStart: Date;
    periodEnd: Date;
    txCount: number;
    totalSent: bigint;
    totalReceived: bigint;
    totalFees: bigint;
  }>();

  for (const tx of sorted) {
    const date = new Date(tx.timestamp);
    const key = getBucketKey(date, period);
    const { start, end } = getBucketBounds(date, period);

    if (!buckets.has(key)) {
      buckets.set(key, {
        periodStart: start,
        periodEnd: end,
        txCount: 0,
        totalSent: 0n,
        totalReceived: 0n,
        totalFees: 0n,
      });
    }

    const bucket = buckets.get(key)!;
    bucket.txCount++;

    const amount = parseBigIntSafe(tx.amount);
    if (amount < 0n) {
      bucket.totalSent += -amount;
    } else {
      bucket.totalReceived += amount;
    }

    bucket.totalFees += parseBigIntSafe(tx.fee);
  }

  const result: TxAggregate[] = [];
  for (const bucket of buckets.values()) {
    const netFlow = bucket.totalReceived - bucket.totalSent;
    result.push({
      periodStart: bucket.periodStart.toISOString().split("T")[0]!,
      periodEnd: bucket.periodEnd.toISOString().split("T")[0]!,
      txCount: bucket.txCount,
      totalSent: bucket.totalSent.toString(),
      totalReceived: bucket.totalReceived.toString(),
      netFlow: netFlow.toString(),
      totalFees: bucket.totalFees.toString(),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Profit / Loss
// ---------------------------------------------------------------------------

/**
 * Calculate profit and loss from a transaction history and current prices.
 *
 * Uses a simple average cost basis method: all inflows contribute to the
 * cost basis, all outflows realise gains/losses proportionally.
 *
 * @param transactions  - Array of transaction records with optional priceAtTime.
 * @param currentPrices - Current price map (denom -> USD per base unit).
 * @returns A PnLReport with realised/unrealised PnL and per-asset breakdown.
 */
export function calculatePnL(
  transactions: TransactionRecord[],
  currentPrices: PriceMap,
): PnLReport {
  // Track per-asset: total cost basis and current holdings
  const holdings = new Map<string, {
    quantity: number;   // net holdings in base units
    costBasis: number;  // total USD spent to acquire current holdings
    realisedPnL: number;
  }>();

  // Sort chronologically
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const tx of sorted) {
    const amount = parseFloat(tx.amount);
    const price = tx.priceAtTime ?? currentPrices[tx.denom] ?? 0;

    if (!holdings.has(tx.denom)) {
      holdings.set(tx.denom, { quantity: 0, costBasis: 0, realisedPnL: 0 });
    }
    const h = holdings.get(tx.denom)!;

    if (amount >= 0) {
      // Inflow: add to holdings and cost basis
      h.costBasis += amount * price;
      h.quantity += amount;
    } else {
      // Outflow: realise proportional PnL
      const absAmount = Math.abs(amount);
      if (h.quantity > 0) {
        const avgCost = h.costBasis / h.quantity;
        const realisedGain = absAmount * (price - avgCost);
        h.realisedPnL += realisedGain;
        h.costBasis -= absAmount * avgCost;
        h.quantity -= absAmount;

        // Guard against floating-point drift
        if (h.quantity < 0) {
          h.quantity = 0;
          h.costBasis = 0;
        }
      }
    }
  }

  // Compute current values and unrealised PnL
  let totalCostBasis = 0;
  let currentValue = 0;
  let totalRealisedPnL = 0;
  const perAsset: PnLReport["perAsset"] = [];

  for (const [denom, h] of holdings.entries()) {
    const price = currentPrices[denom] ?? 0;
    const assetCurrentValue = h.quantity * price;
    const unrealised = assetCurrentValue - h.costBasis;
    const assetPnL = h.realisedPnL + unrealised;
    const assetReturn = h.costBasis > 0 ? assetPnL / h.costBasis : 0;

    totalCostBasis += h.costBasis;
    currentValue += assetCurrentValue;
    totalRealisedPnL += h.realisedPnL;

    perAsset.push({
      denom,
      costBasis: h.costBasis,
      currentValue: assetCurrentValue,
      pnl: assetPnL,
      returnPct: assetReturn,
    });
  }

  const unrealisedPnL = currentValue - totalCostBasis;
  const totalPnL = totalRealisedPnL + unrealisedPnL;
  const returnPct = totalCostBasis > 0 ? totalPnL / totalCostBasis : 0;

  return {
    totalCostBasis,
    currentValue,
    unrealisedPnL,
    realisedPnL: totalRealisedPnL,
    totalPnL,
    returnPct,
    perAsset,
  };
}

// ---------------------------------------------------------------------------
// Token formatting
// ---------------------------------------------------------------------------

/** Well-known denom -> display symbol mappings. */
const DENOM_SYMBOLS: Record<string, { symbol: string; decimals: number }> = {
  uclaw: { symbol: "CLAW", decimals: 6 },
  uatom: { symbol: "ATOM", decimals: 6 },
  uosmo: { symbol: "OSMO", decimals: 6 },
  uusdc: { symbol: "USDC", decimals: 6 },
};

/**
 * Format a token amount from base units to a human-readable string with
 * the appropriate symbol.
 *
 * @param amount   - Amount in base (smallest) units as a string integer.
 * @param denom    - Denomination (e.g. "uclaw").
 * @param decimals - Number of decimal places (default: auto-detect from denom, or 6).
 * @returns A formatted string like "1,234.567890 CLAW".
 */
export function formatTokenAmount(
  amount: string,
  denom: string,
  decimals?: number,
): string {
  const info = DENOM_SYMBOLS[denom];
  const dec = decimals ?? info?.decimals ?? 6;
  const symbol = info?.symbol ?? denom.replace(/^u/, "").toUpperCase();

  const raw = parseBigIntSafe(amount);
  const isNegative = raw < 0n;
  const abs = isNegative ? -raw : raw;

  const divisor = 10n ** BigInt(dec);
  const wholePart = abs / divisor;
  const fracPart = abs % divisor;

  // Format whole part with thousands separators
  const wholeStr = formatWithCommas(wholePart.toString());

  // Format fractional part with leading zeros
  const fracStr = fracPart.toString().padStart(dec, "0");

  // Trim trailing zeros from fractional part but keep at least 2 places
  let trimmedFrac = fracStr.replace(/0+$/, "");
  if (trimmedFrac.length < 2) trimmedFrac = fracStr.slice(0, 2);

  const sign = isNegative ? "-" : "";
  return `${sign}${wholeStr}.${trimmedFrac} ${symbol}`;
}

// ---------------------------------------------------------------------------
// Gas estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the gas cost for a given message type.
 *
 * @param msgType  - Message type name (e.g. "send", "shield", "swap") or full type URL.
 * @param gasPrice - Gas price in uclaw per gas unit (default: 0.025).
 * @param clawPriceUsd - Optional USD price per uclaw for cost estimation.
 * @returns A GasEstimate with gas units and estimated costs.
 */
export function estimateGasCost(
  msgType: string,
  gasPrice: number = 0.025,
  clawPriceUsd?: number,
): GasEstimate {
  // Normalise: extract the short name from a full type URL
  const shortName = msgType
    .replace(/^\/clawchain\.\w+\.v1\.Msg/, "")
    .replace(/^\/cosmos\.\w+\.v1beta1\.Msg/, "")
    .replace(/([A-Z])/g, (_, c: string, i: number) => (i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`))
    .replace(/^_/, "");

  const gasUnits = DEFAULT_GAS_ESTIMATES[shortName] ??
    DEFAULT_GAS_ESTIMATES[msgType] ??
    150_000; // Default fallback

  const estimatedCostUclaw = Math.ceil(gasUnits * gasPrice);
  const estimatedCostUsd = clawPriceUsd != null ? estimatedCostUclaw * clawPriceUsd : null;

  return {
    msgType,
    gasUnits,
    estimatedCostUclaw,
    estimatedCostUsd,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Safely parse a string as a BigInt, returning 0n on failure. */
function parseBigIntSafe(value: string): bigint {
  try {
    // Handle negative values and strip any non-numeric prefix/suffix
    const cleaned = value.replace(/[^0-9-]/g, "");
    return cleaned ? BigInt(cleaned) : 0n;
  } catch {
    return 0n;
  }
}

/** Get a bucket key string for a date and period. */
function getBucketKey(date: Date, period: AggregationPeriod): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  switch (period) {
    case "day":
      return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    case "week": {
      // ISO week: Monday-based, use the Monday of the week
      const monday = new Date(Date.UTC(y, m, d));
      const dayOfWeek = monday.getUTCDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setUTCDate(monday.getUTCDate() + diff);
      return `W-${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
    }
    case "month":
      return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
}

/** Get the start and end dates for a bucket. */
function getBucketBounds(
  date: Date,
  period: AggregationPeriod,
): { start: Date; end: Date } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  switch (period) {
    case "day": {
      const start = new Date(Date.UTC(y, m, d));
      const end = new Date(Date.UTC(y, m, d + 1));
      return { start, end };
    }
    case "week": {
      const monday = new Date(Date.UTC(y, m, d));
      const dayOfWeek = monday.getUTCDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setUTCDate(monday.getUTCDate() + diff);
      const sunday = new Date(monday);
      sunday.setUTCDate(sunday.getUTCDate() + 7);
      return { start: monday, end: sunday };
    }
    case "month": {
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 1));
      return { start, end };
    }
  }
}

/** Format a number string with thousands separators. */
function formatWithCommas(value: string): string {
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > 3) {
    parts.unshift(remaining.slice(-3));
    remaining = remaining.slice(0, -3);
  }
  parts.unshift(remaining);
  return parts.join(",");
}
