/**
 * Typed client for the ModelVault CosmWasm contract (contracts/model-vault).
 *
 * The vault couples a constant-product bonding-curve market with a
 * Synthetix-style dividend pool: holders STAKE the model token and earn
 * pro-rata reserve-denom (uclaw) revenue. This client wraps a
 * {@link ClawChainClient} (or any backend exposing the same query/execute/address
 * surface) and routes execute msgs through CosmWasm `MsgExecuteContract`.
 *
 * All on-chain JSON keys are snake_case to match the contract's `ExecuteMsg`
 * and `QueryMsg` exactly. The TypeScript interfaces mirror the contract's
 * response structs (Uint128/Uint256 fields are returned as decimal strings).
 *
 * Mirrors the read-first conventions in `web/src/lib/model-vault.ts`.
 */
import { ClawChainClient } from "./client.js";
import { DEFAULT_DENOM } from "./constants.js";
import type {
  ClawChainClientOptions,
  WasmCoin,
  WasmExecuteResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Query response shapes (snake_case as returned by the contract)
// ---------------------------------------------------------------------------

/** `{"config":{}}` -> ConfigResponse */
export interface VaultConfig {
  model_denom: string;
  reserve_denom: string;
  owner: string;
  /** Swap fee in basis points routed to the dividend pool. */
  fee_bps: number;
}

/** `{"pool":{}}` -> PoolResponse (market reserves/inventory). */
export interface VaultPool {
  /** Reserve-coin (reserve_denom) amount held by the curve. */
  reserve: string;
  /** Model-token (model_denom) amount held by the curve. */
  inventory: string;
}

/** `{"pool_info":{}}` -> PoolInfoResponse (dividend-pool aggregate state). */
export interface VaultPoolInfo {
  /** Total model tokens staked across all stakers. */
  total_staked: string;
  /** Global scaled reward-per-token index (1e18 fixed point). */
  reward_per_token_stored: string;
}

/** `{"stake_info":{"address":"claw1..."}}` -> StakeInfoResponse. */
export interface VaultStakeInfo {
  /** Model tokens this address currently has staked. */
  staked: string;
  /** Reserve-denom rewards claimable right now (settled + live accrual). */
  claimable: string;
}

/** Which direction a hypothetical {@link ModelVaultClient.quote} trade goes. */
export type TradeSide = "buy" | "sell";

/** `{"quote":{"side":...,"amount":...}}` -> QuoteResponse (pure curve math). */
export interface Quote {
  /** Amount of the output denom the trade would yield. */
  amount_out: string;
  /** Denom of the input the caller would attach. */
  denom_in: string;
  /** Denom of the output the caller would receive. */
  denom_out: string;
}

// ---------------------------------------------------------------------------
// Execute message shapes (snake_case as accepted by the contract)
// ---------------------------------------------------------------------------

type BuyMsg = { buy: Record<string, never> };
type SellMsg = { sell: Record<string, never> };
type FundMsg = { fund: Record<string, never> };
type StakeMsg = { stake: Record<string, never> };
type UnstakeMsg = { unstake: { amount: string } };
type ClaimRewardsMsg = { claim_rewards: Record<string, never> };
type DistributeRevenueMsg = { distribute_revenue: Record<string, never> };

// ---------------------------------------------------------------------------
// Backend surface (structural — ClawChainClient satisfies it)
// ---------------------------------------------------------------------------

/**
 * The minimal backend the vault client needs: a connectable signing client that
 * can smart-query and execute CosmWasm contracts and report the signer address.
 * `ClawChainClient` satisfies this; tests may inject a fake.
 */
export interface ModelVaultBackend {
  connect(): Promise<void>;
  getAddress(): string;
  queryContract(contractAddress: string, queryMsg: Record<string, unknown>): Promise<unknown>;
  executeContract(
    senderAddress: string,
    contractAddress: string,
    execMsg: Record<string, unknown>,
    funds?: WasmCoin[],
  ): Promise<WasmExecuteResult>;
}

export interface ModelVaultClientOptions extends ClawChainClientOptions {
  /** Address of the deployed ModelVault contract. */
  contract: string;
  /** Inject a pre-built backend (test seam). Defaults to a new ClawChainClient. */
  backend?: ModelVaultBackend;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Typed, wagmi-adjacent client for a single ModelVault contract instance.
 *
 * Reads (`config`/`pool`/`poolInfo`/`quote`/`stakeInfo`) hit CosmWasm smart
 * queries; writes (`buy`/`sell`/`fund`/`stake`/`unstake`/`claimRewards`/
 * `distributeRevenue`) build and broadcast `MsgExecuteContract` via the backend.
 *
 * Construct with a mnemonic/offlineSigner (for writes) or just an RPC URL (for
 * read-only use), or inject a `backend`.
 */
export class ModelVaultClient {
  readonly contract: string;
  private readonly backend: ModelVaultBackend;

  constructor(options: ModelVaultClientOptions) {
    if (!options.contract || options.contract.trim() === "") {
      throw new Error("ModelVaultClient: contract address is required");
    }
    this.contract = options.contract;
    this.backend = options.backend ?? new ClawChainClient(options);
  }

  /** Connect the underlying backend (required before any execute). */
  async connect(): Promise<void> {
    await this.backend.connect();
  }

  /** The connected signer's bech32 address (throws if not connected). */
  getAddress(): string {
    return this.backend.getAddress();
  }

  // -------------------------------------------------------------------------
  // Queries (snake_case smart queries — keys MUST be exact)
  // -------------------------------------------------------------------------

  /** Query vault config (`{"config":{}}`). */
  async config(): Promise<VaultConfig> {
    const data = (await this.backend.queryContract(this.contract, {
      config: {},
    })) as Partial<VaultConfig>;
    return {
      model_denom: String(data?.model_denom ?? ""),
      reserve_denom: String(data?.reserve_denom ?? DEFAULT_DENOM),
      owner: String(data?.owner ?? ""),
      fee_bps: Number(data?.fee_bps ?? 0),
    };
  }

  /** Query curve reserves/inventory (`{"pool":{}}`). */
  async pool(): Promise<VaultPool> {
    const data = (await this.backend.queryContract(this.contract, {
      pool: {},
    })) as Partial<VaultPool>;
    return {
      reserve: String(data?.reserve ?? "0"),
      inventory: String(data?.inventory ?? "0"),
    };
  }

  /** Query dividend-pool aggregate state (`{"pool_info":{}}`). */
  async poolInfo(): Promise<VaultPoolInfo> {
    const data = (await this.backend.queryContract(this.contract, {
      pool_info: {},
    })) as Partial<VaultPoolInfo>;
    return {
      total_staked: String(data?.total_staked ?? "0"),
      reward_per_token_stored: String(data?.reward_per_token_stored ?? "0"),
    };
  }

  /**
   * Pure constant-product math for a hypothetical trade — no state change
   * (`{"quote":{"side":...,"amount":...}}`). `amount` is in base units.
   */
  async quote(side: TradeSide, amount: string): Promise<Quote> {
    const normalized = normalizeUint(amount, "quote.amount");
    const data = (await this.backend.queryContract(this.contract, {
      quote: { side, amount: normalized },
    })) as Partial<Quote>;
    return {
      amount_out: String(data?.amount_out ?? "0"),
      denom_in: String(data?.denom_in ?? ""),
      denom_out: String(data?.denom_out ?? ""),
    };
  }

  /** Query a single address' stake + live claimable (`{"stake_info":{"address":...}}`). */
  async stakeInfo(address: string): Promise<VaultStakeInfo> {
    if (!address || address.trim() === "") {
      throw new Error("ModelVaultClient.stakeInfo: address is required");
    }
    const data = (await this.backend.queryContract(this.contract, {
      stake_info: { address },
    })) as Partial<VaultStakeInfo>;
    return {
      staked: String(data?.staked ?? "0"),
      claimable: String(data?.claimable ?? "0"),
    };
  }

  // -------------------------------------------------------------------------
  // Executes (MsgExecuteContract via the backend)
  // -------------------------------------------------------------------------

  /**
   * `buy{}` — attach `reserve` of the reserve_denom; the curve sends back
   * model tokens. `reserveDenom` must match the vault's reserve denom.
   */
  async buy(reserve: string, reserveDenom = DEFAULT_DENOM): Promise<WasmExecuteResult> {
    const amount = normalizeUint(reserve, "buy.reserve");
    return this.execute<BuyMsg>({ buy: {} }, [{ denom: reserveDenom, amount }]);
  }

  /**
   * `sell{}` — attach `amount` of the model_denom; the curve sends back
   * reserve coins. `modelDenom` must match the vault's model denom.
   */
  async sell(amount: string, modelDenom: string): Promise<WasmExecuteResult> {
    requireDenom(modelDenom, "sell.modelDenom");
    const normalized = normalizeUint(amount, "sell.amount");
    return this.execute<SellMsg>({ sell: {} }, [{ denom: modelDenom, amount: normalized }]);
  }

  /**
   * `fund{}` — owner-only. Attach model_denom and/or reserve_denom funds to seed
   * the curve. Pass the coins to attach.
   */
  async fund(funds: WasmCoin[]): Promise<WasmExecuteResult> {
    if (!funds || funds.length === 0) {
      throw new Error("ModelVaultClient.fund: at least one coin is required");
    }
    return this.execute<FundMsg>({ fund: {} }, funds);
  }

  /**
   * `stake{}` — stake `amount` model tokens into the dividend pool. Attaches
   * exactly one model_denom coin. `modelDenom` must match the vault's model denom.
   */
  async stake(amount: string, modelDenom: string): Promise<WasmExecuteResult> {
    requireDenom(modelDenom, "stake.modelDenom");
    const normalized = normalizeUint(amount, "stake.amount");
    return this.execute<StakeMsg>({ stake: {} }, [{ denom: modelDenom, amount: normalized }]);
  }

  /** `unstake{amount}` — withdraw `amount` of previously staked model tokens (no funds). */
  async unstake(amount: string): Promise<WasmExecuteResult> {
    const normalized = normalizeUint(amount, "unstake.amount");
    return this.execute<UnstakeMsg>({ unstake: { amount: normalized } });
  }

  /** `claim_rewards{}` — claim accrued reserve-denom dividends (no funds). */
  async claimRewards(): Promise<WasmExecuteResult> {
    return this.execute<ClaimRewardsMsg>({ claim_rewards: {} });
  }

  /**
   * `distribute_revenue{}` — distribute attached reserve-denom revenue across
   * current stakers pro-rata. Attaches exactly one reserve_denom coin.
   */
  async distributeRevenue(
    revenue: string,
    reserveDenom = DEFAULT_DENOM,
  ): Promise<WasmExecuteResult> {
    const amount = normalizeUint(revenue, "distributeRevenue.revenue");
    return this.execute<DistributeRevenueMsg>({ distribute_revenue: {} }, [
      { denom: reserveDenom, amount },
    ]);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async execute<T extends Record<string, unknown>>(
    msg: T,
    funds: WasmCoin[] = [],
  ): Promise<WasmExecuteResult> {
    const sender = this.backend.getAddress();
    return this.backend.executeContract(sender, this.contract, msg, funds);
  }
}

/** Factory mirroring `createClawViemClient` — returns a {@link ModelVaultClient}. */
export function createModelVaultClient(options: ModelVaultClientOptions): ModelVaultClient {
  return new ModelVaultClient(options);
}

// ---------------------------------------------------------------------------
// Validation helpers (fail fast at the boundary)
// ---------------------------------------------------------------------------

/** Coerce a Uint128/Uint256 amount to a canonical non-negative integer string. */
function normalizeUint(value: string, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`ModelVaultClient: ${field} is required`);
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`ModelVaultClient: ${field} must be a non-negative integer string (base units)`);
  }
  // Strip insignificant leading zeros while preserving a single "0".
  return BigInt(trimmed).toString();
}

function requireDenom(denom: string, field: string): void {
  if (!denom || denom.trim() === "") {
    throw new Error(`ModelVaultClient: ${field} is required`);
  }
}
