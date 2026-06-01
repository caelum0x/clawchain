/**
 * Pure constant-product trade-planning helpers for @clawchain/sdk.
 *
 * The ModelVault is a CONSTANT-PRODUCT bonding curve: the pool holds a
 * reserve-coin (reserve_denom / CLAW) amount and a model-token inventory, and
 * the invariant `k = reserve * inventory` is held constant across a trade
 * (`pool` mirrors {@link VaultPool} — both fields are base-unit decimal
 * strings). The display-unit spot price is `reserve / inventory` (reserve-denom
 * per 1 model token), matching `model-analytics.ts` and
 * `web/src/lib/model-index.ts`.
 *
 * These functions are PURE — no I/O, no client calls, no mutation. They mirror
 * the dry-quote math the contract's `{"quote":{...}}` query performs, so callers
 * can size a trade BEFORE broadcasting. Use {@link ModelVaultClient.quote} for
 * the authoritative on-chain quote.
 *
 * FEE-FREE ESTIMATE CAVEAT: all math here IGNORES the vault's `fee_bps` swap fee
 * (routed to the dividend pool). Real fills are therefore slightly WORSE — a buy
 * returns marginally fewer model tokens, a sell marginally less reserve, and a
 * target-price trade slightly undershoots — than these estimates. Treat the
 * outputs as planning approximations and validate against the contract quote.
 *
 * Amounts are passed as base-unit non-negative integer strings (Uint128-style,
 * as the contract uses). Intermediate curve math runs in floating point via
 * Number(); outputs round down to whole base units (truncated, never minted out
 * of thin air). Pools too large to represent exactly in a double would lose
 * precision — these helpers target typical UI/planner ranges, not adversarial
 * extremes.
 */

// ---------------------------------------------------------------------------
// Pool shape (structural — VaultPool from model-vault.ts satisfies it)
// ---------------------------------------------------------------------------

/**
 * The minimal pool shape the planner needs: base-unit decimal strings for the
 * curve's reserve-coin and model-token amounts. {@link VaultPool} satisfies
 * this structurally.
 */
export interface PlannerPool {
  /** Reserve-coin (reserve_denom) amount held by the curve (base units). */
  reserve: string;
  /** Model-token (model_denom) amount held by the curve (base units). */
  inventory: string;
}

/** Which direction a {@link planToTargetPrice} trade resolves to. */
export type PlannerSide = "buy" | "sell";

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** Result of {@link planBuy}: model tokens received for attaching reserve. */
export interface BuyPlan {
  /** Model tokens the curve would return (base units, truncated), or null. */
  tokensOut: string | null;
  /** Resulting spot price (reserve/inventory) after the fill, or null. */
  newSpot: number | null;
  /** Price impact in basis points `(newSpot-spot)/spot*1e4`, or null. */
  priceImpactBps: number | null;
}

/** Result of {@link planSell}: reserve received for attaching model tokens. */
export interface SellPlan {
  /** Reserve coins the curve would return (base units, truncated), or null. */
  reserveOut: string | null;
  /** Resulting spot price (reserve/inventory) after the fill, or null. */
  newSpot: number | null;
  /** Price impact in basis points `(newSpot-spot)/spot*1e4`, or null. */
  priceImpactBps: number | null;
}

/**
 * Result of {@link planToTargetPrice}: the single trade that moves the curve to
 * a target spot price. `side` is `"buy"` when the target is above the current
 * spot (push price up), `"sell"` when below.
 */
export interface TargetPricePlan {
  /** Trade direction needed to reach the target, or null for an empty pool. */
  side: PlannerSide | null;
  /** Input amount to attach (base units, truncated): reserve for a buy, model tokens for a sell. */
  amountIn: string | null;
  /** Denom hint for the input: `"reserve"` for a buy, `"model"` for a sell. */
  denomHint: "reserve" | "model" | null;
  /** Estimated model tokens out (buy only; null otherwise). */
  estTokens: string | null;
  /** Estimated reserve out (sell only; null otherwise). */
  estReserveOut: string | null;
  /** Spot price after the planned trade (≈ target, modulo truncation), or null. */
  newSpot: number | null;
}

// ---------------------------------------------------------------------------
// planBuy
// ---------------------------------------------------------------------------

/**
 * Plan a BUY: attach `reserveIn` base units of the reserve denom; the curve
 * returns model tokens per `tokens_out = inventory - k/(reserve+reserveIn)`.
 * FEE-FREE estimate — real fills return slightly fewer tokens. Returns all-null
 * for an empty/unfunded pool or non-positive input. Pure.
 */
export function planBuy(pool: PlannerPool, reserveIn: string): BuyPlan {
  const reserve = parseBaseUnit(pool?.reserve);
  const inventory = parseBaseUnit(pool?.inventory);
  const dx = parseBaseUnit(reserveIn);

  if (reserve === null || inventory === null || dx === null) {
    return emptyBuyPlan();
  }
  if (reserve <= 0 || inventory <= 0 || dx <= 0) {
    return emptyBuyPlan();
  }

  const k = reserve * inventory;
  const newReserve = reserve + dx;
  const newInventory = k / newReserve;
  const tokensOut = inventory - newInventory;
  if (!(tokensOut > 0) || !Number.isFinite(tokensOut)) {
    return emptyBuyPlan();
  }

  const spot = reserve / inventory;
  const newSpot = newReserve / newInventory;

  return {
    tokensOut: truncToBaseUnit(tokensOut),
    newSpot,
    priceImpactBps: impactBps(spot, newSpot),
  };
}

// ---------------------------------------------------------------------------
// planSell
// ---------------------------------------------------------------------------

/**
 * Plan a SELL: attach `tokensIn` base units of the model token; the curve
 * returns reserve coins per `reserve_out = reserve - k/(inventory+tokensIn)`.
 * FEE-FREE estimate — real fills return slightly less reserve. Returns all-null
 * for an empty/unfunded pool or non-positive input. Pure.
 */
export function planSell(pool: PlannerPool, tokensIn: string): SellPlan {
  const reserve = parseBaseUnit(pool?.reserve);
  const inventory = parseBaseUnit(pool?.inventory);
  const dy = parseBaseUnit(tokensIn);

  if (reserve === null || inventory === null || dy === null) {
    return emptySellPlan();
  }
  if (reserve <= 0 || inventory <= 0 || dy <= 0) {
    return emptySellPlan();
  }

  const k = reserve * inventory;
  const newInventory = inventory + dy;
  const newReserve = k / newInventory;
  const reserveOut = reserve - newReserve;
  if (!(reserveOut > 0) || !Number.isFinite(reserveOut)) {
    return emptySellPlan();
  }

  const spot = reserve / inventory;
  const newSpot = newReserve / newInventory;

  return {
    reserveOut: truncToBaseUnit(reserveOut),
    newSpot,
    priceImpactBps: impactBps(spot, newSpot),
  };
}

// ---------------------------------------------------------------------------
// planToTargetPrice
// ---------------------------------------------------------------------------

/**
 * Plan the single trade that moves the curve's spot price to `targetSpot`
 * (display-unit reserve-per-token). With `k` held constant, the reserve that
 * yields spot `p` is `new_reserve = sqrt(k * p)`; the input is the signed
 * reserve delta `dx = new_reserve - reserve`. A positive delta is a BUY (target
 * above current spot), a negative delta a SELL (target below). The model-token
 * input for a sell is derived from the inventory change.
 *
 * FEE-FREE estimate — because fees move price against the trader, a real trade
 * of this size will slightly OVERSHOOT a buy target / UNDERSHOOT a sell target;
 * size conservatively and re-quote on-chain. Returns all-null for an
 * empty/unfunded pool, a non-positive target, or a target equal to the current
 * spot (no trade needed). Pure.
 */
export function planToTargetPrice(
  pool: PlannerPool,
  targetSpot: number,
): TargetPricePlan {
  const reserve = parseBaseUnit(pool?.reserve);
  const inventory = parseBaseUnit(pool?.inventory);

  if (reserve === null || inventory === null) return emptyTargetPlan();
  if (reserve <= 0 || inventory <= 0) return emptyTargetPlan();
  if (!Number.isFinite(targetSpot) || targetSpot <= 0) return emptyTargetPlan();

  const spot = reserve / inventory;
  if (targetSpot === spot) return emptyTargetPlan();

  const k = reserve * inventory;
  const newReserve = Math.sqrt(k * targetSpot);
  const newInventory = k / newReserve;
  if (!Number.isFinite(newReserve) || !Number.isFinite(newInventory)) {
    return emptyTargetPlan();
  }
  const newSpot = newReserve / newInventory;

  if (targetSpot > spot) {
    // Buy: attach reserve, receive model tokens.
    const dx = newReserve - reserve;
    const tokensOut = inventory - newInventory;
    if (!(dx > 0)) return emptyTargetPlan();
    return {
      side: "buy",
      amountIn: truncToBaseUnit(dx),
      denomHint: "reserve",
      estTokens: tokensOut > 0 ? truncToBaseUnit(tokensOut) : "0",
      estReserveOut: null,
      newSpot,
    };
  }

  // Sell: attach model tokens, receive reserve.
  const dy = newInventory - inventory;
  const reserveOut = reserve - newReserve;
  if (!(dy > 0)) return emptyTargetPlan();
  return {
    side: "sell",
    amountIn: truncToBaseUnit(dy),
    denomHint: "model",
    estTokens: null,
    estReserveOut: reserveOut > 0 ? truncToBaseUnit(reserveOut) : "0",
    newSpot,
  };
}

// ---------------------------------------------------------------------------
// Pure internals
// ---------------------------------------------------------------------------

/**
 * Parse a base-unit non-negative integer string into a Number. Returns null for
 * empty, malformed, or non-finite values (callers treat null as "unusable").
 */
function parseBaseUnit(value: string | undefined | null): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Truncate a non-negative curve amount to a whole base-unit decimal string. */
function truncToBaseUnit(amount: number): string {
  const floored = Math.floor(amount);
  if (!Number.isFinite(floored) || floored < 0) return "0";
  return BigInt(floored).toString();
}

/** Price impact in basis points; null when the base spot is non-positive. */
function impactBps(spot: number, newSpot: number): number | null {
  if (!Number.isFinite(spot) || !Number.isFinite(newSpot) || spot <= 0) {
    return null;
  }
  return ((newSpot - spot) / spot) * 1e4;
}

function emptyBuyPlan(): BuyPlan {
  return { tokensOut: null, newSpot: null, priceImpactBps: null };
}

function emptySellPlan(): SellPlan {
  return { reserveOut: null, newSpot: null, priceImpactBps: null };
}

function emptyTargetPlan(): TargetPricePlan {
  return {
    side: null,
    amountIn: null,
    denomHint: null,
    estTokens: null,
    estReserveOut: null,
    newSpot: null,
  };
}
