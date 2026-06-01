import { chainConfig } from "./config.ts";
import { queryWasmContract } from "./chain.ts";

/**
 * Client surface for the ModelVault CosmWasm contract (contracts/model-vault).
 *
 * The vault couples a constant-product bonding-curve market with a
 * Synthetix-style dividend pool: holders STAKE the model token and earn
 * pro-rata reserve-denom (uclaw) revenue.
 *
 * Queries use snake_case JSON smart queries via {@link queryWasmContract}.
 * Execute helpers build (but do not broadcast) the snake_case execute msgs the
 * AI Model Exchange page previews — matching the read-first convention of the
 * rest of the page (issue/trade are clawd commands).
 */

// ---------------------------------------------------------------------------
// Query response shapes (snake_case as returned by the contract)
// ---------------------------------------------------------------------------

/** {"config":{}} -> ConfigResponse */
export interface VaultConfig {
  model_denom: string;
  reserve_denom: string;
  owner: string;
  fee_bps: number;
}

/** {"pool":{}} -> PoolResponse (market reserves/inventory) */
export interface VaultPool {
  reserve: string;
  inventory: string;
}

/** {"pool_info":{}} -> dividend-pool aggregate state */
export interface VaultPoolInfo {
  total_staked: string;
  /** reward index, 1e18-scaled */
  reward_per_token_stored: string;
}

/** {"stake_info":{"address":"claw1..."}} -> per-address stake + live claimable */
export interface VaultStakeInfo {
  staked: string;
  /** claimable dividends, in reserve_denom base units */
  claimable: string;
}

// ---------------------------------------------------------------------------
// Execute message shapes (snake_case as accepted by the contract)
// ---------------------------------------------------------------------------

export type StakeMsg = { stake: Record<string, never> };
export type UnstakeMsg = { unstake: { amount: string } };
export type ClaimRewardsMsg = { claim_rewards: Record<string, never> };

export interface Coin {
  denom: string;
  amount: string;
}

/** A built (not broadcast) execute message plus any funds to attach. */
export interface VaultExecute<T> {
  /** target contract */
  contract: string;
  /** snake_case execute msg */
  msg: T;
  /** coins to attach with the message */
  funds: Coin[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Query dividend-pool aggregate state ({"pool_info":{}}). */
export async function getVaultPoolInfo(contract: string): Promise<VaultPoolInfo> {
  const data = (await queryWasmContract(contract, { pool_info: {} })) as Partial<VaultPoolInfo>;
  return {
    total_staked: String(data?.total_staked ?? "0"),
    reward_per_token_stored: String(data?.reward_per_token_stored ?? "0"),
  };
}

/** Query a single address' stake + live claimable ({"stake_info":{"address":...}}). */
export async function getVaultStakeInfo(
  contract: string,
  address: string,
): Promise<VaultStakeInfo> {
  const data = (await queryWasmContract(contract, {
    stake_info: { address },
  })) as Partial<VaultStakeInfo>;
  return {
    staked: String(data?.staked ?? "0"),
    claimable: String(data?.claimable ?? "0"),
  };
}

/** Query vault config ({"config":{}}). */
export async function getVaultConfig(contract: string): Promise<VaultConfig> {
  const data = (await queryWasmContract(contract, { config: {} })) as Partial<VaultConfig>;
  return {
    model_denom: String(data?.model_denom ?? ""),
    reserve_denom: String(data?.reserve_denom ?? chainConfig.coinMinimalDenom),
    owner: String(data?.owner ?? ""),
    fee_bps: Number(data?.fee_bps ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Execute message builders (pure — build only, no broadcast)
// ---------------------------------------------------------------------------

/**
 * Convert a human (display-denom) amount string into base units.
 * Throws on non-positive / non-finite / unparseable input so callers can
 * surface a validation error at the boundary.
 */
export function toBaseUnits(
  human: string,
  decimals = chainConfig.coinDecimals,
): string {
  const trimmed = (human ?? "").trim();
  if (trimmed === "") throw new Error("Amount is required");
  if (!/^\d*\.?\d*$/.test(trimmed)) throw new Error("Amount must be a number");
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Amount must be greater than zero");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  const base = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  if (base <= 0n) throw new Error("Amount must be greater than zero");
  return base.toString();
}

/**
 * Build a `stake{}` execute msg. Staking attaches the model_denom amount being
 * staked as funds.
 */
export function buildStakeMsg(
  contract: string,
  modelDenom: string,
  amountHuman: string,
): VaultExecute<StakeMsg> {
  const amount = toBaseUnits(amountHuman);
  return {
    contract,
    msg: { stake: {} },
    funds: [{ denom: modelDenom, amount }],
  };
}

/** Build an `unstake{amount}` execute msg (no funds). */
export function buildUnstakeMsg(
  contract: string,
  amountHuman: string,
): VaultExecute<UnstakeMsg> {
  const amount = toBaseUnits(amountHuman);
  return {
    contract,
    msg: { unstake: { amount } },
    funds: [],
  };
}

/** Build a `claim_rewards{}` execute msg (no funds). */
export function buildClaimRewardsMsg(contract: string): VaultExecute<ClaimRewardsMsg> {
  return {
    contract,
    msg: { claim_rewards: {} },
    funds: [],
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a base-unit string into a display-denom amount (default 6 decimals). */
export function formatBaseUnits(
  baseUnits: string,
  decimals = chainConfig.coinDecimals,
): string {
  const n = BigInt(baseUnits || "0");
  const div = 10n ** BigInt(decimals);
  const whole = n / div;
  const frac = n % div;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

/**
 * Human-readable reward index. `reward_per_token_stored` is 1e18-scaled
 * reserve-denom-per-staked-token; divide by 1e18 to get the real ratio.
 */
export function formatRewardIndex(rewardPerTokenStored: string): string {
  const raw = BigInt(rewardPerTokenStored || "0");
  if (raw === 0n) return "0";
  const SCALE = 10n ** 18n;
  const whole = raw / SCALE;
  const frac = raw % SCALE;
  // Show up to 9 significant fractional digits for a compact display.
  const fracStr = frac.toString().padStart(18, "0").slice(0, 9).replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
