import {
  getVaultConfig,
  getVaultStakeInfo,
  type VaultConfig,
  type VaultStakeInfo,
} from "./model-vault.ts";

/**
 * Cross-vault portfolio view for a model-token holder.
 *
 * There is no on-chain model->vault registry yet, so a portfolio is built from
 * an EXPLICIT list of ModelVault contract addresses supplied by the caller
 * (persisted client-side). For each vault we join the holder's
 * `stake_info{address}` (staked + claimable) with `config{}` (model_denom,
 * reserve_denom) into a flat position. Lookups are best-effort per vault: a
 * single failing vault yields an `error` position instead of breaking the list.
 *
 * REUSES the snake_case smart-query helpers in {@link ./model-vault.ts}.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A single holder position in one ModelVault dividend pool. */
export interface PortfolioPosition {
  /** ModelVault contract address. */
  contract: string;
  /** staked/earned model token denom (from config). */
  modelDenom: string;
  /** reserve denom claimable dividends are paid in (from config). */
  reserveDenom: string;
  /** holder's staked amount, base units. */
  staked: string;
  /** holder's claimable dividends, reserve-denom base units. */
  claimable: string;
  /** per-vault load error, when the lookup failed (best-effort). */
  error?: string;
}

/** A flat portfolio: per-vault positions plus reserve-denom totals. */
export interface ModelPortfolio {
  /** the holder address the portfolio was built for. */
  address: string;
  /** one entry per requested vault (including failed lookups). */
  positions: PortfolioPosition[];
  /** count of positions with a non-zero stake. */
  activeCount: number;
  /** count of positions that failed to load. */
  errorCount: number;
  /**
   * total claimable dividends, keyed by reserve denom -> summed base units.
   * Claimables in different reserve denoms are kept separate (no implicit
   * cross-denom summation).
   */
  totalClaimableByDenom: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Pure shaping helpers (immutable)
// ---------------------------------------------------------------------------

/** Normalize, trim and de-duplicate a raw list of vault addresses. */
export function normalizeVaultList(addresses: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const trimmed = (raw ?? "").trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Parse a newline/comma/whitespace separated textarea into a clean list. */
export function parseVaultList(text: string): string[] {
  return normalizeVaultList((text ?? "").split(/[\s,]+/));
}

/** Shape a successful per-vault lookup into a position (pure). */
function toPosition(
  contract: string,
  config: VaultConfig,
  stake: VaultStakeInfo,
): PortfolioPosition {
  return {
    contract,
    modelDenom: config.model_denom,
    reserveDenom: config.reserve_denom,
    staked: stake.staked,
    claimable: stake.claimable,
  };
}

/** Shape a failed per-vault lookup into an error position (pure). */
function toErrorPosition(contract: string, message: string): PortfolioPosition {
  return {
    contract,
    modelDenom: "",
    reserveDenom: "",
    staked: "0",
    claimable: "0",
    error: message,
  };
}

/** Sum claimable amounts per reserve denom across positions (immutable). */
export function sumClaimableByDenom(
  positions: readonly PortfolioPosition[],
): Record<string, string> {
  return positions.reduce<Record<string, string>>((acc, p) => {
    if (p.error || !p.reserveDenom) return acc;
    const prev = BigInt(acc[p.reserveDenom] ?? "0");
    const next = prev + BigInt(p.claimable || "0");
    return { ...acc, [p.reserveDenom]: next.toString() };
  }, {});
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Build a holder's portfolio across an explicit list of ModelVault contracts.
 *
 * Best-effort per vault: a failing config/stake query produces an error
 * position rather than rejecting the whole portfolio. An empty/whitespace
 * address or empty vault list returns an empty portfolio (no throw).
 */
export async function getModelPortfolio(
  address: string,
  vaultAddresses: readonly string[],
): Promise<ModelPortfolio> {
  const holder = (address ?? "").trim();
  const vaults = normalizeVaultList(vaultAddresses);

  if (holder === "" || vaults.length === 0) {
    return {
      address: holder,
      positions: [],
      activeCount: 0,
      errorCount: 0,
      totalClaimableByDenom: {},
    };
  }

  const positions = await Promise.all(
    vaults.map(async (contract): Promise<PortfolioPosition> => {
      try {
        const [config, stake] = await Promise.all([
          getVaultConfig(contract),
          getVaultStakeInfo(contract, holder),
        ]);
        return toPosition(contract, config, stake);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load vault";
        return toErrorPosition(contract, message);
      }
    }),
  );

  const activeCount = positions.filter(
    (p) => !p.error && BigInt(p.staked || "0") > 0n,
  ).length;
  const errorCount = positions.filter((p) => p.error).length;

  return {
    address: holder,
    positions,
    activeCount,
    errorCount,
    totalClaimableByDenom: sumClaimableByDenom(positions),
  };
}
