/**
 * Higher-level "model market" aggregate for @clawchain/sdk.
 *
 * This is PURE COMPOSITION over the round-1 {@link ModelVaultClient}: it issues
 * the existing `config`/`pool`/`pool_info`/`quote` smart queries and folds the
 * raw responses into a single typed {@link ModelMarketSnapshot}. When a DEX pair
 * address is supplied, it additionally reads the Astroport-style `{pool:{}}`
 * state through the SAME backend `queryContract` surface (no new plumbing) and
 * derives a DEX mid price plus a curve-vs-DEX premium/discount in basis points.
 *
 * The bonding-curve spot price is the constant-product marginal price
 * `reserve / inventory` (both from the vault's `{pool:{}}`), matching
 * `web/src/lib/model-index.ts`. Both denoms share the chain's coin decimals, so
 * the raw base-unit ratio is already a display-unit price and decimals cancel.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */
import { DEFAULT_DENOM } from "./constants.js";
import type {
  ModelVaultBackend,
  ModelVaultClient,
  Quote,
  TradeSide,
  VaultConfig,
  VaultPool,
  VaultPoolInfo,
} from "./model-vault.js";

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

/** A buy/sell quote for a fixed sample size, paired with its input size. */
export interface ModelMarketQuote {
  /** Trade direction the quote was computed for. */
  side: TradeSide;
  /** Input amount (base units) the quote was computed for. */
  amountIn: string;
  /** Raw curve quote (amount_out / denom_in / denom_out). */
  quote: Quote;
}

/**
 * A single typed snapshot of one ModelVault market, composed from the vault's
 * existing queries plus (optionally) its DEX pair. All prices are display-unit
 * reserve-denom (CLAW) per 1 model token; `null` means "not available"
 * (e.g. an unfunded curve or a missing/empty DEX pair).
 */
export interface ModelMarketSnapshot {
  /** Vault contract address this snapshot describes. */
  contract: string;
  /** Vault config (model/reserve denoms, owner, fee bps). */
  config: VaultConfig;
  /** Curve reserves/inventory from `{pool:{}}`. */
  pool: VaultPool;
  /** Dividend-pool aggregate state from `{pool_info:{}}`. */
  poolInfo: VaultPoolInfo;
  /**
   * Bonding-curve spot price (reserve/inventory), or null when the curve has no
   * inventory or reserves (unfunded) — callers can render "N/A".
   */
  curveSpotPrice: number | null;
  /** A buy quote for `sampleSize` reserve-denom in. */
  sampleBuy: ModelMarketQuote;
  /** A sell quote for `sampleSize` model-token in. */
  sampleSell: ModelMarketQuote;
  /** DEX pair address used (when provided), else null. */
  dexPair: string | null;
  /**
   * DEX mid price (reserve-denom per model token) from the pair reserves, or
   * null when no pair was supplied / the pair has no liquidity.
   */
  dexMidPrice: number | null;
  /**
   * Curve price relative to the DEX mid, in basis points: positive means the
   * curve trades at a PREMIUM to the DEX, negative a DISCOUNT. Null when either
   * price is unavailable.
   */
  curveVsDexBps: number | null;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Reads a DEX pair's `{pool:{}}` state — defaults to the vault backend. */
export type DexPoolReader = (pairAddress: string) => Promise<unknown>;

export interface ModelMarketOptions {
  /** Optional Astroport-style DEX pair (TOKEN/CLAW) for an external mid price. */
  dexPair?: string;
  /**
   * Sample trade size (base units) used for the buy/sell quotes. Buy attaches
   * this much reserve_denom; sell attaches this much model_denom. Default 1e6
   * (one display unit at 6 decimals).
   */
  sampleSize?: string;
  /**
   * Backend used to read the DEX pair. When omitted, a `dexPair` MUST be paired
   * with a `dexPoolReader`, otherwise the DEX fields resolve to null.
   */
  backend?: ModelVaultBackend;
  /** Inject a DEX pool reader (test seam); overrides `backend` when set. */
  dexPoolReader?: DexPoolReader;
}

const DEFAULT_SAMPLE_SIZE = "1000000"; // 1e6 — one display unit at 6 decimals
const BPS = 10_000;

// ---------------------------------------------------------------------------
// ModelMarket
// ---------------------------------------------------------------------------

/**
 * Composes a {@link ModelVaultClient} (and optional DEX pair) into a single
 * market snapshot. Holds no mutable state beyond its config; `snapshot()`
 * always issues fresh reads and returns a new immutable object.
 */
export class ModelMarket {
  private readonly vault: ModelVaultClient;
  private readonly dexPair: string | null;
  private readonly sampleSize: string;
  private readonly dexPoolReader: DexPoolReader | null;

  constructor(vault: ModelVaultClient, options: ModelMarketOptions = {}) {
    if (!vault) {
      throw new Error("ModelMarket: a ModelVaultClient is required");
    }
    this.vault = vault;
    const pair = options.dexPair?.trim();
    this.dexPair = pair ? pair : null;
    this.sampleSize = options.sampleSize?.trim() || DEFAULT_SAMPLE_SIZE;

    if (options.dexPoolReader) {
      this.dexPoolReader = options.dexPoolReader;
    } else if (options.backend) {
      const backend = options.backend;
      this.dexPoolReader = (pairAddress: string) =>
        backend.queryContract(pairAddress, { pool: {} });
    } else {
      this.dexPoolReader = null;
    }
  }

  /** The vault contract address this market wraps. */
  get contract(): string {
    return this.vault.contract;
  }

  /**
   * Fetch + fold a fresh {@link ModelMarketSnapshot}. Vault reads run in
   * parallel; the DEX read is best-effort and degrades to null fields when no
   * pair/reader is configured or the pair is empty.
   */
  async snapshot(): Promise<ModelMarketSnapshot> {
    const [config, pool, poolInfo, buyQuote, sellQuote] = await Promise.all([
      this.vault.config(),
      this.vault.pool(),
      this.vault.poolInfo(),
      this.vault.quote("buy", this.sampleSize),
      this.vault.quote("sell", this.sampleSize),
    ]);

    const curveSpotPrice = spotPriceFromPool(pool);
    const dexMidPrice = await this.readDexMidPrice(config);
    const curveVsDexBps = premiumBps(curveSpotPrice, dexMidPrice);

    return {
      contract: this.vault.contract,
      config,
      pool,
      poolInfo,
      curveSpotPrice,
      sampleBuy: { side: "buy", amountIn: this.sampleSize, quote: buyQuote },
      sampleSell: { side: "sell", amountIn: this.sampleSize, quote: sellQuote },
      dexPair: this.dexPair,
      dexMidPrice,
      curveVsDexBps,
    };
  }

  /**
   * Read the DEX mid price (reserve_denom per model_denom) from the pair's
   * `{pool:{}}` reserves. Returns null when no pair/reader is set, the pair is
   * missing the vault's denoms, or either reserve is empty.
   */
  private async readDexMidPrice(config: VaultConfig): Promise<number | null> {
    if (!this.dexPair || !this.dexPoolReader) return null;
    try {
      const reserveDenom = config.reserve_denom || DEFAULT_DENOM;
      const modelDenom = config.model_denom;
      if (!modelDenom) return null;

      const data = (await this.dexPoolReader(this.dexPair)) as
        | { assets?: Array<{ info?: unknown; amount?: unknown }> }
        | undefined;
      const assets = data?.assets;
      if (!Array.isArray(assets) || assets.length < 2) return null;

      const reserveAmount = nativeAmountForDenom(assets, reserveDenom);
      const modelAmount = nativeAmountForDenom(assets, modelDenom);
      if (reserveAmount == null || modelAmount == null) return null;
      if (modelAmount <= 0 || reserveAmount <= 0) return null;

      // Both denoms share coin decimals -> raw ratio is the display price.
      return reserveAmount / modelAmount;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Constant-product marginal price reserve/inventory, or null when unfunded. */
function spotPriceFromPool(pool: VaultPool): number | null {
  const reserve = Number(pool.reserve);
  const inventory = Number(pool.inventory);
  if (!Number.isFinite(reserve) || !Number.isFinite(inventory)) return null;
  if (inventory <= 0 || reserve <= 0) return null;
  return reserve / inventory;
}

/**
 * Curve-vs-DEX premium in basis points: `(curve - dex) / dex * 1e4`. Positive
 * means the curve is richer (premium); negative means cheaper (discount). Null
 * when either input is missing or the DEX mid is non-positive.
 */
function premiumBps(
  curveSpotPrice: number | null,
  dexMidPrice: number | null,
): number | null {
  if (
    curveSpotPrice == null ||
    dexMidPrice == null ||
    !Number.isFinite(curveSpotPrice) ||
    !Number.isFinite(dexMidPrice) ||
    dexMidPrice <= 0
  ) {
    return null;
  }
  return Math.round(((curveSpotPrice - dexMidPrice) / dexMidPrice) * BPS);
}

/**
 * Find a native-token asset's reserve amount by denom in an Astroport pool's
 * `assets` array. Returns null when the denom is absent or the amount is
 * non-numeric.
 */
function nativeAmountForDenom(
  assets: Array<{ info?: unknown; amount?: unknown }>,
  denom: string,
): number | null {
  for (const asset of assets) {
    const info = asset?.info as { native_token?: { denom?: string } } | undefined;
    if (info?.native_token?.denom === denom) {
      const amount = Number(asset?.amount);
      return Number.isFinite(amount) ? amount : null;
    }
  }
  return null;
}

/** Factory mirroring `createModelVaultClient` — returns a {@link ModelMarket}. */
export function createModelMarket(
  vault: ModelVaultClient,
  options: ModelMarketOptions = {},
): ModelMarket {
  return new ModelMarket(vault, options);
}
