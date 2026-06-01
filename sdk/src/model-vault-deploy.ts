/**
 * Deployment on-ramp for the ModelVault CosmWasm contract
 * (contracts/model-vault). Where {@link ModelVaultClient} drives an
 * already-deployed vault, {@link ModelVaultDeployer} handles the steps that
 * bring one into existence: (optionally) store the wasm code, instantiate a
 * fresh vault, and seed its curve via `fund{}`.
 *
 * The optimized, chain-loadable artifact lives at
 * `contracts/model-vault/artifacts/model_vault.wasm` (built with
 * cosmwasm/optimizer). A raw `cargo build` wasm is NOT loadable — `storeCode`
 * expects the optimized bytes. `store` yields a numeric `codeId`;
 * `instantiate` yields the contract address.
 *
 * All on-chain JSON keys are snake_case to match the contract's
 * `InstantiateMsg` exactly. Mirrors the read-first / fail-fast conventions in
 * `sdk/src/model-vault.ts`.
 */
import { ClawChainClient } from "./client.js";
import { ModelVaultClient } from "./model-vault.js";
import { DEFAULT_DENOM } from "./constants.js";
import type {
  ClawChainClientOptions,
  WasmCoin,
  WasmExecuteResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Backend surface (structural — ClawChainClient satisfies it)
// ---------------------------------------------------------------------------

/**
 * The minimal signing backend the deployer needs: connect, report the signer
 * address, upload wasm, instantiate, and execute. `ClawChainClient` satisfies
 * this; tests may inject a fake.
 */
export interface ModelVaultDeployerBackend {
  connect(): Promise<void>;
  getAddress(): string;
  queryContract(contractAddress: string, queryMsg: Record<string, unknown>): Promise<unknown>;
  uploadContract(
    senderAddress: string,
    wasmBytecode: Uint8Array,
  ): Promise<{ codeId: number; transactionHash: string }>;
  instantiateContract(
    senderAddress: string,
    codeId: number,
    initMsg: Record<string, unknown>,
    label: string,
    options?: { admin?: string; funds?: WasmCoin[] },
  ): Promise<{ contractAddress: string; transactionHash: string }>;
  executeContract(
    senderAddress: string,
    contractAddress: string,
    execMsg: Record<string, unknown>,
    funds?: WasmCoin[],
  ): Promise<WasmExecuteResult>;
}

export interface ModelVaultDeployerOptions extends ClawChainClientOptions {
  /** Inject a pre-built backend (test seam). Defaults to a new ClawChainClient. */
  backend?: ModelVaultDeployerBackend;
}

/**
 * Options for {@link ModelVaultDeployer.instantiate}. Field names are camelCase
 * here and translated to the contract's snake_case `InstantiateMsg` internally.
 */
export interface ModelVaultInstantiateOptions {
  /** REQUIRED — the model token denom this vault makes a market in. */
  modelDenom: string;
  /** Reserve/counter denom for the curve. Defaults to `uclaw`. */
  reserveDenom?: string;
  /** Vault owner (fund/admin authority). Defaults to the contract's instantiator. */
  owner?: string;
  /** Initial reserve_denom amount to seed the curve, base units. */
  initialReserve?: string;
  /** Initial model_denom inventory to seed the curve, base units. */
  initialInventory?: string;
  /** Swap fee in basis points routed to the dividend pool. Defaults to 30. */
  feeBps?: number;
  /** On-chain instance label. Defaults to `model-vault:<modelDenom>`. */
  label?: string;
  /** Wasm contract admin (migration authority). Defaults to none. */
  admin?: string;
  /**
   * Coins to attach to the instantiate tx — typically the reserve_denom and/or
   * model_denom funds that back `initialReserve` / `initialInventory`.
   */
  funds?: WasmCoin[];
}

/** Result of {@link ModelVaultDeployer.instantiate}. */
export interface ModelVaultInstantiateResult {
  contractAddress: string;
  transactionHash: string;
}

/** Result of {@link ModelVaultDeployer.storeCode}. */
export interface ModelVaultStoreResult {
  codeId: number;
  transactionHash: string;
}

// ---------------------------------------------------------------------------
// Deployer
// ---------------------------------------------------------------------------

/**
 * Drives the store → instantiate → fund on-ramp for a ModelVault contract.
 *
 * Construct with a mnemonic/offlineSigner (writes require a signer), or inject
 * a `backend`. `codeId` is an input to {@link instantiate} so callers can reuse
 * an already-uploaded code; {@link storeCode} is available when fresh bytes
 * need uploading first.
 */
export class ModelVaultDeployer {
  private readonly backend: ModelVaultDeployerBackend;

  constructor(options: ModelVaultDeployerOptions = {}) {
    this.backend = options.backend ?? new ClawChainClient(options);
  }

  /** Connect the underlying backend (required before any write). */
  async connect(): Promise<void> {
    await this.backend.connect();
  }

  /** The connected signer's bech32 address (throws if not connected). */
  getAddress(): string {
    return this.backend.getAddress();
  }

  /**
   * Upload the optimized ModelVault wasm artifact and return its `codeId`.
   * Pass the optimized bytes from
   * `contracts/model-vault/artifacts/model_vault.wasm`; raw cargo output is not
   * chain-loadable.
   */
  async storeCode(wasmBytes: Uint8Array): Promise<ModelVaultStoreResult> {
    if (!(wasmBytes instanceof Uint8Array) || wasmBytes.length === 0) {
      throw new Error(
        "ModelVaultDeployer.storeCode: wasmBytes must be a non-empty Uint8Array (use the optimized model_vault.wasm artifact)",
      );
    }
    const sender = this.backend.getAddress();
    const res = await this.backend.uploadContract(sender, wasmBytes);
    if (!Number.isInteger(res.codeId) || res.codeId <= 0) {
      throw new Error(
        `ModelVaultDeployer.storeCode: store_code did not yield a valid code_id (got ${res.codeId})`,
      );
    }
    return { codeId: res.codeId, transactionHash: res.transactionHash };
  }

  /**
   * Instantiate a ModelVault from an uploaded `codeId`, building the snake_case
   * `InstantiateMsg` and attaching `funds`. Returns the new contract address.
   */
  async instantiate(
    codeId: number,
    options: ModelVaultInstantiateOptions,
  ): Promise<ModelVaultInstantiateResult> {
    requireCodeId(codeId, "instantiate.codeId");
    const modelDenom = requireDenom(options.modelDenom, "instantiate.modelDenom");

    const initMsg = buildInstantiateMsg(modelDenom, options);
    const label = options.label?.trim() || `model-vault:${modelDenom}`;
    const sender = this.backend.getAddress();

    const res = await this.backend.instantiateContract(sender, codeId, initMsg, label, {
      admin: options.admin,
      funds: options.funds,
    });
    if (!res.contractAddress || res.contractAddress.trim() === "") {
      throw new Error(
        "ModelVaultDeployer.instantiate: instantiate did not yield a contract address",
      );
    }
    return { contractAddress: res.contractAddress, transactionHash: res.transactionHash };
  }

  /**
   * `fund{}` an existing vault — attach reserve_denom and/or model_denom funds
   * to seed the curve post-instantiation. Delegates to a {@link ModelVaultClient}
   * bound to the same backend so behavior matches the round-1 client exactly.
   */
  async fund(contract: string, funds: WasmCoin[]): Promise<WasmExecuteResult> {
    const client = new ModelVaultClient({ contract, backend: this.backend });
    return client.fund(funds);
  }
}

/** Factory mirroring `createModelVaultClient` — returns a {@link ModelVaultDeployer}. */
export function createModelVaultDeployer(
  options: ModelVaultDeployerOptions = {},
): ModelVaultDeployer {
  return new ModelVaultDeployer(options);
}

// ---------------------------------------------------------------------------
// InstantiateMsg builder + validation helpers (fail fast at the boundary)
// ---------------------------------------------------------------------------

/** Build the snake_case `InstantiateMsg`, omitting optional fields left unset. */
function buildInstantiateMsg(
  modelDenom: string,
  options: ModelVaultInstantiateOptions,
): Record<string, unknown> {
  const msg: Record<string, unknown> = {
    model_denom: modelDenom,
    reserve_denom: (options.reserveDenom?.trim() || DEFAULT_DENOM),
  };
  if (options.owner !== undefined && options.owner.trim() !== "") {
    msg.owner = options.owner.trim();
  }
  if (options.initialReserve !== undefined) {
    msg.initial_reserve = normalizeUint(options.initialReserve, "instantiate.initialReserve");
  }
  if (options.initialInventory !== undefined) {
    msg.initial_inventory = normalizeUint(
      options.initialInventory,
      "instantiate.initialInventory",
    );
  }
  if (options.feeBps !== undefined) {
    msg.fee_bps = normalizeFeeBps(options.feeBps, "instantiate.feeBps");
  }
  return msg;
}

/** Coerce a Uint128 amount to a canonical non-negative integer string. */
function normalizeUint(value: string, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`ModelVaultDeployer: ${field} is required`);
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(
      `ModelVaultDeployer: ${field} must be a non-negative integer string (base units)`,
    );
  }
  return BigInt(trimmed).toString();
}

function normalizeFeeBps(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`ModelVaultDeployer: ${field} must be an integer in [0, 10000]`);
  }
  return value;
}

function requireDenom(denom: string | undefined, field: string): string {
  const trimmed = (denom ?? "").trim();
  if (trimmed === "") {
    throw new Error(`ModelVaultDeployer: ${field} is required`);
  }
  return trimmed;
}

function requireCodeId(codeId: number, field: string): void {
  if (typeof codeId !== "number" || !Number.isInteger(codeId) || codeId <= 0) {
    throw new Error(`ModelVaultDeployer: ${field} must be a positive integer code id`);
  }
}
