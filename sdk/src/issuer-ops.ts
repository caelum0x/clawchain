/**
 * IssuerOps — a vault-owner facade for @clawchain/sdk.
 *
 * This is PURE COMPOSITION over the round-1 {@link ModelVaultClient}: it wraps a
 * single vault client and exposes the owner-side workflows an issuer cares about
 * — seeding the curve (`fundReserve`/`fundInventory`/`fund`) and distributing
 * fee revenue (`distributeRevenue`) — plus a read-only {@link ownerReport} that
 * folds the existing `config`/`pool`/`pool_info` smart queries into a single
 * typed {@link VaultOwnerReport}.
 *
 * No new tx plumbing: writes delegate straight to the wrapped client, which
 * routes them through CosmWasm `MsgExecuteContract`. The report's `spotPrice` is
 * the constant-product marginal price `reserve / inventory` (both from the
 * vault's `{pool:{}}`), matching `model-market.ts` and `web/src/lib/model-index.ts`.
 * Both denoms share the chain's coin decimals, so the raw base-unit ratio is
 * already a display-unit price.
 *
 * Mirrors the factory/style conventions in `model-market.ts`.
 */
import { DEFAULT_DENOM } from "./constants.js";
import type { ModelVaultClient } from "./model-vault.js";
import type { WasmCoin, WasmExecuteResult } from "./types.js";

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

/**
 * A single typed snapshot of one ModelVault from the owner's perspective,
 * composed from the vault's existing `config`/`pool`/`pool_info` queries.
 *
 * Amounts (`reserve`, `inventory`, `totalStaked`, `rewardIndex`) are decimal
 * strings in base units, exactly as the contract returns them. `spotPrice` is a
 * display-unit number (reserve_denom per 1 model token) or `null` when the curve
 * is unfunded — callers can render "N/A".
 */
export interface VaultOwnerReport {
  /** Vault owner address (the issuer authorized for `fund`/`distribute`). */
  owner: string;
  /** The vault's model-token denom. */
  modelDenom: string;
  /** The vault's reserve-coin denom (e.g. uclaw). */
  reserveDenom: string;
  /** Swap fee in basis points routed to the dividend pool. */
  feeBps: number;
  /** Reserve-coin amount held by the curve (base units). */
  reserve: string;
  /** Model-token amount held by the curve (base units). */
  inventory: string;
  /**
   * Bonding-curve spot price (reserve/inventory), or null when the curve has no
   * inventory or reserves (unfunded).
   */
  spotPrice: number | null;
  /** Total model tokens staked across all stakers (base units). */
  totalStaked: string;
  /** Global scaled reward-per-token index, 1e18 fixed point (base units). */
  rewardIndex: string;
  /** True when both the reserve and inventory are seeded (`reserve>0 && inventory>0`). */
  isFunded: boolean;
}

// ---------------------------------------------------------------------------
// IssuerOps
// ---------------------------------------------------------------------------

/**
 * Owner-side facade for a single {@link ModelVaultClient}. Writes delegate to
 * the wrapped client (owner-only `fund`/`distribute_revenue`); the read-only
 * {@link ownerReport} composes a fresh {@link VaultOwnerReport}. Holds no
 * mutable state beyond the injected client and reserve denom.
 */
export class IssuerOps {
  private readonly vault: ModelVaultClient;
  private readonly reserveDenom: string;

  constructor(vault: ModelVaultClient, reserveDenom: string = DEFAULT_DENOM) {
    if (!vault) {
      throw new Error("IssuerOps: a ModelVaultClient is required");
    }
    this.vault = vault;
    const denom = reserveDenom?.trim();
    this.reserveDenom = denom ? denom : DEFAULT_DENOM;
  }

  /** The vault contract address this facade wraps. */
  get contract(): string {
    return this.vault.contract;
  }

  // -------------------------------------------------------------------------
  // Owner writes (delegate straight to the wrapped client)
  // -------------------------------------------------------------------------

  /**
   * Seed the curve with `amount` reserve-coin (reserve_denom). Owner-only
   * `fund{}` with a single reserve-denom coin attached.
   */
  async fundReserve(amount: string): Promise<WasmExecuteResult> {
    return this.vault.fund([{ denom: this.reserveDenom, amount: requireAmount(amount, "fundReserve.amount") }]);
  }

  /**
   * Seed the curve with `amount` model tokens (model_denom). Owner-only
   * `fund{}` with a single model-denom coin attached. Reads the vault's
   * `config` to learn the model denom.
   */
  async fundInventory(amount: string): Promise<WasmExecuteResult> {
    const normalized = requireAmount(amount, "fundInventory.amount");
    const { model_denom } = await this.vault.config();
    if (!model_denom) {
      throw new Error("IssuerOps.fundInventory: vault config has no model_denom");
    }
    return this.vault.fund([{ denom: model_denom, amount: normalized }]);
  }

  /**
   * Owner-only `fund{}` with arbitrary coins attached (e.g. both reserve and
   * inventory in one tx). Delegates straight to the wrapped client.
   */
  async fund(funds: WasmCoin[]): Promise<WasmExecuteResult> {
    return this.vault.fund(funds);
  }

  /**
   * Distribute `amount` of reserve-coin revenue across current stakers pro-rata
   * (`distribute_revenue{}` with a single reserve-denom coin attached).
   */
  async distributeRevenue(amount: string): Promise<WasmExecuteResult> {
    return this.vault.distributeRevenue(requireAmount(amount, "distributeRevenue.amount"), this.reserveDenom);
  }

  // -------------------------------------------------------------------------
  // Owner read (pure composition over existing queries)
  // -------------------------------------------------------------------------

  /**
   * Fetch + fold a fresh {@link VaultOwnerReport}. The three reads run in
   * parallel and return a new immutable object.
   */
  async ownerReport(): Promise<VaultOwnerReport> {
    const [config, pool, poolInfo] = await Promise.all([
      this.vault.config(),
      this.vault.pool(),
      this.vault.poolInfo(),
    ]);

    const reserveNum = Number(pool.reserve);
    const inventoryNum = Number(pool.inventory);
    const isFunded =
      Number.isFinite(reserveNum) &&
      Number.isFinite(inventoryNum) &&
      reserveNum > 0 &&
      inventoryNum > 0;
    const spotPrice = isFunded ? reserveNum / inventoryNum : null;

    return {
      owner: config.owner,
      modelDenom: config.model_denom,
      reserveDenom: config.reserve_denom,
      feeBps: config.fee_bps,
      reserve: pool.reserve,
      inventory: pool.inventory,
      spotPrice,
      totalStaked: poolInfo.total_staked,
      rewardIndex: poolInfo.reward_per_token_stored,
      isFunded,
    };
  }
}

// ---------------------------------------------------------------------------
// Validation helper (fail fast at the boundary)
// ---------------------------------------------------------------------------

/** Require a non-empty amount string before delegating (client re-validates as Uint). */
function requireAmount(amount: string, field: string): string {
  const trimmed = (amount ?? "").trim();
  if (trimmed === "") {
    throw new Error(`IssuerOps: ${field} is required`);
  }
  return trimmed;
}

/** Factory mirroring `createModelMarket` — returns an {@link IssuerOps}. */
export function createIssuerOps(
  vault: ModelVaultClient,
  reserveDenom: string = DEFAULT_DENOM,
): IssuerOps {
  return new IssuerOps(vault, reserveDenom);
}
