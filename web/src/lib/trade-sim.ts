import { chainConfig } from "./config.ts";

/**
 * Pure constant-product (x*y=k) trade-simulation helpers for the ModelVault
 * bonding curve, web-local. These mirror the SDK trade-planner shape but live in
 * the web bundle so the Trade Simulator page can do instant client-side math
 * before (optionally) confirming against the contract's exact {"quote":{}}.
 *
 * The curve couples a reserve denom (CLAW) against the model-token inventory.
 *   spot price       = reserve / inventory      (CLAW per 1 model token)
 *   k                = reserve * inventory       (invariant, fees ignored here)
 *   buy  (spend dx)  : tokensOut  = inventory - k/(reserve+dx)
 *   sell (spend dm)  : reserveOut = reserve   - k/(inventory+dm)
 *
 * IMPORTANT: these estimates IGNORE the vault fee (fee_bps). The contract's real
 * output is slightly worse — always show the on-chain {@link getVaultQuote}
 * beside the estimate. All inputs/outputs here are base-unit strings (the same
 * units the contract speaks); decimals cancel in the price ratio because both
 * denoms share {@link chainConfig.coinDecimals}.
 */

const PRICE_DECIMALS = chainConfig.coinDecimals;

/** Curve reserves as base-unit strings ({"pool":{}} response shape). */
export interface SimPool {
  reserve: string;
  inventory: string;
}

/** Trade side, matching the contract's snake_case TradeSide variants. */
export type TradeSide = "buy" | "sell";

/**
 * Result of a simulated trade. `amountIn`/`amountOut` are base-unit strings;
 * the price fields are display-unit numbers (reserve-denom per model token).
 */
export interface TradePlan {
  side: TradeSide;
  /** input amount in base units (reserve denom for buy, model token for sell). */
  amountIn: string;
  /** output amount in base units (model token for buy, reserve denom for sell). */
  amountOut: string;
  /** spot price before the trade. */
  spotBefore: number;
  /** spot price after the trade. */
  spotAfter: number;
  /**
   * fractional price impact: (spotAfter - spotBefore) / spotBefore. Positive on
   * a buy (price rises), negative on a sell (price falls).
   */
  priceImpact: number;
}

class EmptyPoolError extends Error {
  constructor() {
    super("Pool has no liquidity (reserve and inventory must be positive)");
    this.name = "EmptyPoolError";
  }
}

/** Parse a pool into positive bigint reserves, throwing on an empty/invalid pool. */
function readPool(pool: SimPool): { reserve: bigint; inventory: bigint } {
  let reserve: bigint;
  let inventory: bigint;
  try {
    reserve = BigInt(pool.reserve || "0");
    inventory = BigInt(pool.inventory || "0");
  } catch {
    throw new EmptyPoolError();
  }
  if (reserve <= 0n || inventory <= 0n) throw new EmptyPoolError();
  return { reserve, inventory };
}

/** Parse a positive base-unit amount string, throwing on non-positive input. */
function readAmount(amountBase: string): bigint {
  let amount: bigint;
  try {
    amount = BigInt(amountBase || "0");
  } catch {
    throw new Error("Amount must be a whole base-unit number");
  }
  if (amount <= 0n) throw new Error("Amount must be greater than zero");
  return amount;
}

/** Display-unit spot price reserve/inventory (decimals cancel). */
function spot(reserve: bigint, inventory: bigint): number {
  return Number(reserve) / Number(inventory);
}

/**
 * Plan a BUY: attach `reserveInBase` of the reserve denom, receive model tokens.
 * tokensOut = inventory - k/(reserve + dx). Fee ignored (estimate only).
 */
export function planBuy(pool: SimPool, reserveInBase: string): TradePlan {
  const { reserve, inventory } = readPool(pool);
  const dx = readAmount(reserveInBase);
  const k = reserve * inventory;
  const newReserve = reserve + dx;
  const newInventory = k / newReserve; // floor — conservative on tokens out
  const tokensOut = inventory - newInventory;
  const spotBefore = spot(reserve, inventory);
  const spotAfter = newInventory > 0n ? spot(newReserve, newInventory) : spotBefore;
  return {
    side: "buy",
    amountIn: dx.toString(),
    amountOut: (tokensOut > 0n ? tokensOut : 0n).toString(),
    spotBefore,
    spotAfter,
    priceImpact: spotBefore > 0 ? (spotAfter - spotBefore) / spotBefore : 0,
  };
}

/**
 * Plan a SELL: attach `modelInBase` of the model token, receive reserve denom.
 * reserveOut = reserve - k/(inventory + dm). Fee ignored (estimate only).
 */
export function planSell(pool: SimPool, modelInBase: string): TradePlan {
  const { reserve, inventory } = readPool(pool);
  const dm = readAmount(modelInBase);
  const k = reserve * inventory;
  const newInventory = inventory + dm;
  const newReserve = k / newInventory; // floor — conservative on reserve out
  const reserveOut = reserve - newReserve;
  const spotBefore = spot(reserve, inventory);
  const spotAfter = newReserve > 0n ? spot(newReserve, newInventory) : spotBefore;
  return {
    side: "sell",
    amountIn: dm.toString(),
    amountOut: (reserveOut > 0n ? reserveOut : 0n).toString(),
    spotBefore,
    spotAfter,
    priceImpact: spotBefore > 0 ? (spotAfter - spotBefore) / spotBefore : 0,
  };
}

/**
 * Plan the trade that moves the curve TO a target spot price `targetSpot`
 * (display units, reserve denom per token). With k constant, the reserve at the
 * target is `sqrt(k * p)`:
 *   targetSpot > spotBefore -> BUY  dx = sqrt(k*p) - reserve
 *   targetSpot < spotBefore -> SELL dm = inventory - k/sqrt(k*p)
 * Returns the resulting {@link TradePlan}. Fee ignored (estimate only).
 */
export function planToTargetPrice(pool: SimPool, targetSpot: number): TradePlan {
  const { reserve, inventory } = readPool(pool);
  if (!Number.isFinite(targetSpot) || targetSpot <= 0) {
    throw new Error("Target price must be greater than zero");
  }
  const spotBefore = spot(reserve, inventory);
  // newReserve = sqrt(k * p) where k = reserve*inventory, p = targetSpot.
  const kNum = Number(reserve) * Number(inventory);
  const newReserveNum = Math.sqrt(kNum * targetSpot);

  if (targetSpot > spotBefore) {
    const dx = Math.max(0, Math.floor(newReserveNum - Number(reserve)));
    return planBuy(pool, dx.toString());
  }
  if (targetSpot < spotBefore) {
    // newInventory = k / newReserve; dm = newInventory - inventory.
    const newInventoryNum = kNum / newReserveNum;
    const dm = Math.max(0, Math.floor(newInventoryNum - Number(inventory)));
    return planSell(pool, dm.toString());
  }
  // Already at target — no trade.
  return {
    side: "buy",
    amountIn: "0",
    amountOut: "0",
    spotBefore,
    spotAfter: spotBefore,
    priceImpact: 0,
  };
}

/** Format a display-unit price as `0.123456 CLAW`. */
export function formatSimPrice(price: number): string {
  if (!Number.isFinite(price)) return "N/A";
  return `${price.toFixed(PRICE_DECIMALS)} ${chainConfig.coinDenom}`;
}

/** Format a fractional price impact as a signed percent, e.g. `+12.34%`. */
export function formatPriceImpact(impact: number): string {
  if (!Number.isFinite(impact)) return "--";
  const pct = impact * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
