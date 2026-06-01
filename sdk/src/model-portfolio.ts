/**
 * Cross-vault "model portfolio" aggregate for @clawchain/sdk.
 *
 * This is PURE COMPOSITION over the round-1 {@link ModelVaultClient}: given one
 * holder address and an explicit LIST of ModelVault contract addresses, it issues
 * each vault's existing `stake_info{address}` + `config{}` smart queries in
 * parallel and folds the raw responses into a single typed
 * {@link ModelPortfolioSnapshot} — per-vault staked/claimable positions plus
 * portfolio totals.
 *
 * There is no on-chain model->vault registry yet, so the vault list is supplied
 * by the caller (CLI flag / config / web localStorage). A bad or unreachable
 * vault degrades that ONE position to null and is collected in `errors`; it never
 * fails the whole snapshot. An empty/invalid list yields an empty snapshot.
 *
 * Claimable totals are bucketed by reserve denom (each vault may use a different
 * reserve_denom), so `totalClaimableByDenom` is a denom -> summed-base-units map.
 * Amounts are summed with BigInt to stay exact on Uint128 values.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md.
 */
import { ModelVaultClient } from "./model-vault.js";
import type {
  ModelVaultBackend,
  ModelVaultClientOptions,
} from "./model-vault.js";

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

/**
 * One holder's position in a single ModelVault, composed from that vault's
 * `config{}` + `stake_info{address}`. `staked`/`claimable` are decimal
 * base-unit strings (Uint128) exactly as the contract returns them.
 */
export interface ModelPortfolioPosition {
  /** Vault contract address this position belongs to. */
  contract: string;
  /** The vault's model token denom (the token that gets staked). */
  modelDenom: string;
  /** The vault's reserve denom (what claimable dividends are paid in). */
  reserveDenom: string;
  /** Model tokens this address currently has staked in the vault. */
  staked: string;
  /** Reserve-denom rewards claimable right now (settled + live accrual). */
  claimable: string;
}

/** A per-vault read failure, paired with the vault it came from. */
export interface ModelPortfolioError {
  /** Vault contract address whose read failed. */
  contract: string;
  /** Human-readable error message (never leaks internals). */
  message: string;
}

/**
 * A single typed snapshot of one address' positions across many ModelVaults.
 * Built from the per-vault `config{}`/`stake_info{}` queries; each entry in
 * `positions` corresponds to a successfully-read vault, while unreachable vaults
 * surface in `errors`. Totals are derived only from successful positions.
 */
export interface ModelPortfolioSnapshot {
  /** The holder address every position was queried for. */
  address: string;
  /** Successfully-read positions (one per healthy vault). */
  positions: ModelPortfolioPosition[];
  /**
   * Total claimable rewards summed per reserve denom (base-unit decimal
   * strings). Vaults sharing a reserve_denom are bucketed together.
   */
  totalClaimableByDenom: Record<string, string>;
  /** Number of vaults that were successfully read into `positions`. */
  vaultCount: number;
  /** Of those, how many have a non-zero staked balance for this address. */
  stakedVaultCount: number;
  /** Per-vault read failures — never aborts the whole snapshot. */
  errors: ModelPortfolioError[];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Construction options for {@link ModelPortfolio}. The vault list is explicit
 * (no on-chain registry yet); shared client options/backend are forwarded to
 * each per-vault {@link ModelVaultClient}.
 */
export interface ModelPortfolioOptions
  extends Omit<ModelVaultClientOptions, "contract"> {
  /** Explicit list of ModelVault contract addresses to aggregate. */
  vaults: string[];
  /**
   * Shared backend injected into every per-vault client (test seam). When set,
   * all vault clients read through this single backend; otherwise each builds
   * its own from the forwarded client options.
   */
  backend?: ModelVaultBackend;
}

// ---------------------------------------------------------------------------
// ModelPortfolio
// ---------------------------------------------------------------------------

/**
 * Composes many {@link ModelVaultClient}s into a single cross-vault snapshot.
 * Holds no mutable state beyond its config; `snapshot(address)` always issues
 * fresh reads and returns a new immutable object.
 */
export class ModelPortfolio {
  private readonly clients: ModelVaultClient[];

  constructor(options: ModelPortfolioOptions) {
    const { vaults, backend, ...clientOptions } = options;
    const list = Array.isArray(vaults) ? vaults : [];
    // Normalize, drop blanks, and de-duplicate so a sloppy list never produces
    // duplicate positions or wastes a query.
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const raw of list) {
      const contract = typeof raw === "string" ? raw.trim() : "";
      if (contract === "" || seen.has(contract)) continue;
      seen.add(contract);
      normalized.push(contract);
    }
    this.clients = normalized.map(
      (contract) =>
        new ModelVaultClient({ ...clientOptions, contract, backend }),
    );
  }

  /** The (normalized, de-duplicated) vault contract addresses being aggregated. */
  get vaults(): string[] {
    return this.clients.map((client) => client.contract);
  }

  /**
   * Fetch + fold a fresh {@link ModelPortfolioSnapshot} for `address`. Every
   * vault is read in parallel; a per-vault failure degrades that position to an
   * `errors` entry instead of rejecting. An empty vault list yields an empty
   * snapshot (no error).
   */
  async snapshot(address: string): Promise<ModelPortfolioSnapshot> {
    const holder = (address ?? "").trim();
    if (holder === "") {
      throw new Error("ModelPortfolio.snapshot: address is required");
    }

    const results = await Promise.all(
      this.clients.map((client) => this.readPosition(client, holder)),
    );

    const positions: ModelPortfolioPosition[] = [];
    const errors: ModelPortfolioError[] = [];
    for (const result of results) {
      if (result.position) positions.push(result.position);
      else if (result.error) errors.push(result.error);
    }

    return {
      address: holder,
      positions,
      totalClaimableByDenom: sumClaimableByDenom(positions),
      vaultCount: positions.length,
      stakedVaultCount: positions.filter((p) => isPositive(p.staked)).length,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Read one vault's `config{}` + `stake_info{address}` in parallel and fold
   * them into a position. Any failure resolves to an `error` (never rejects),
   * so one bad vault can't sink the whole portfolio.
   */
  private async readPosition(
    client: ModelVaultClient,
    holder: string,
  ): Promise<{
    position?: ModelPortfolioPosition;
    error?: ModelPortfolioError;
  }> {
    try {
      const [config, stake] = await Promise.all([
        client.config(),
        client.stakeInfo(holder),
      ]);
      return {
        position: {
          contract: client.contract,
          modelDenom: config.model_denom,
          reserveDenom: config.reserve_denom,
          staked: stake.staked,
          claimable: stake.claimable,
        },
      };
    } catch (error: unknown) {
      return {
        error: {
          contract: client.contract,
          message: errorMessage(error),
        },
      };
    }
  }
}

/** Factory mirroring `createModelMarket` — returns a {@link ModelPortfolio}. */
export function createModelPortfolio(
  options: ModelPortfolioOptions,
): ModelPortfolio {
  return new ModelPortfolio(options);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Sum claimable rewards across positions, bucketed by reserve denom. Uses
 * BigInt to stay exact on Uint128 values; non-integer/garbage amounts are
 * skipped rather than corrupting a bucket.
 */
function sumClaimableByDenom(
  positions: ModelPortfolioPosition[],
): Record<string, string> {
  const totals = new Map<string, bigint>();
  for (const position of positions) {
    const denom = position.reserveDenom;
    if (!denom) continue;
    const amount = parseUint(position.claimable);
    if (amount == null) continue;
    totals.set(denom, (totals.get(denom) ?? 0n) + amount);
  }
  const out: Record<string, string> = {};
  for (const [denom, total] of totals) {
    out[denom] = total.toString();
  }
  return out;
}

/** True when a base-unit decimal string parses to a strictly positive integer. */
function isPositive(value: string): boolean {
  const parsed = parseUint(value);
  return parsed != null && parsed > 0n;
}

/** Parse a non-negative integer base-unit string to BigInt, or null if invalid. */
function parseUint(value: string): bigint | null {
  const trimmed = (value ?? "").trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

/** Narrow an unknown thrown value to a safe message string. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown error reading vault";
}
