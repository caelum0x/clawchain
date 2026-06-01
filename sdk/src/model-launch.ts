/**
 * End-to-end "launch a model token + its vault" orchestrator for @clawchain/sdk.
 *
 * This is PURE ORCHESTRATION over the round-1 building blocks — it adds no new
 * tx plumbing. A single {@link ModelLaunch.launch} call stitches together the
 * two paths that already exist:
 *
 *   1. ISSUANCE — tokenfactory `MsgCreateDenom` (mint `factory/<issuer>/<subdenom>`)
 *      followed by `MsgMint` for the initial supply. These two msgs are NOT on
 *      {@link ClawChainClient} today, so the issuance side is taken through a
 *      structural {@link ModelLaunchTokenBackend} seam (same convention as the
 *      backend interfaces in `model-vault.ts` / `model-vault-deploy.ts`). A real
 *      caller wires this to a signer that broadcasts the tokenfactory msgs; tests
 *      inject a fake.
 *   2. VAULT — delegated verbatim to {@link ModelVaultDeployer}: optionally
 *      `storeCode` the wasm (or reuse a provided `codeId`), `instantiate` a vault
 *      bound to the freshly-minted `model_denom`, then optionally `fund` the curve.
 *
 * The result is a typed {@link ModelLaunchResult} carrying the derived denom, the
 * vault code id + address, and every tx hash so a CLI/web layer can surface them.
 *
 * All inputs are validated at the boundary (fail fast); the denom is derived as
 * `factory/<issuer>/<subdenom>` to match the clawd `model-token issue` path.
 */
import { DEFAULT_DENOM } from "./constants.js";
import { ModelVaultDeployer } from "./model-vault-deploy.js";
import type {
  ModelVaultDeployerBackend,
  ModelVaultDeployerOptions,
} from "./model-vault-deploy.js";
import type { WasmCoin } from "./types.js";

// ---------------------------------------------------------------------------
// Token issuance backend seam (structural — a signer satisfies it)
// ---------------------------------------------------------------------------

/**
 * The minimal tokenfactory surface the launcher needs: report the signer, create
 * a fresh subdenom, and mint an initial supply. {@link ClawChainClient} does not
 * expose tokenfactory today, so callers supply this (a thin wrapper over a signer
 * broadcasting `MsgCreateDenom` + `MsgMint`); tests inject a fake.
 */
export interface ModelLaunchTokenBackend {
  /** Connect the underlying signer (required before any write). */
  connect(): Promise<void>;
  /** The connected signer's bech32 address (the token issuer). */
  getAddress(): string;
  /** Broadcast tokenfactory `MsgCreateDenom` for `factory/<issuer>/<subdenom>`. */
  createDenom(subdenom: string): Promise<{ transactionHash: string }>;
  /** Broadcast tokenfactory `MsgMint` of `amount` of `denom` to the issuer. */
  mint(denom: string, amount: string): Promise<{ transactionHash: string }>;
}

// ---------------------------------------------------------------------------
// Options + result shapes
// ---------------------------------------------------------------------------

/** Options for {@link ModelLaunch.launch}. */
export interface ModelLaunchOptions {
  /**
   * REQUIRED — tokenfactory subdenom for the model token. The full model_denom is
   * derived as `factory/<issuer>/<subdenom>`. Lower-case, no leading `factory/`.
   */
  subdenom: string;
  /** REQUIRED — initial supply to mint, in base units (non-negative integer string). */
  initialSupply: string;

  /**
   * Optimized vault wasm bytes to store before instantiation. Provide this OR
   * {@link codeId}. If both are given, {@link codeId} wins and no store happens.
   */
  wasmBytes?: Uint8Array;
  /** Reuse an already-uploaded vault code id instead of storing fresh bytes. */
  codeId?: number;

  /** Reserve/counter denom for the curve. Defaults to `uclaw`. */
  reserveDenom?: string;
  /** Vault owner (fund/admin authority). Defaults to the contract's instantiator. */
  owner?: string;
  /** Swap fee in basis points routed to the dividend pool. Defaults to the contract default. */
  feeBps?: number;
  /** On-chain instance label. Defaults to `model-vault:<modelDenom>`. */
  label?: string;
  /** Wasm contract admin (migration authority). Defaults to none. */
  admin?: string;

  /** Reserve-denom amount to seed the curve via `fund{}` after instantiation, base units. */
  seedReserve?: string;
  /** Model-denom inventory to seed the curve via `fund{}` after instantiation, base units. */
  seedInventory?: string;
}

/** Every tx hash produced by a {@link ModelLaunch.launch} run. */
export interface ModelLaunchTxHashes {
  createDenom: string;
  mint: string;
  /** Present only when {@link ModelLaunchOptions.wasmBytes} was stored fresh. */
  store?: string;
  instantiate: string;
  /** Present only when the curve was seeded via `fund{}`. */
  fund?: string;
}

/** Typed result of a {@link ModelLaunch.launch} run. */
export interface ModelLaunchResult {
  /** The derived `factory/<issuer>/<subdenom>` model token denom. */
  modelDenom: string;
  /** The vault code id used (stored fresh or reused). */
  codeId: number;
  /** Address of the freshly-instantiated vault. */
  vaultAddress: string;
  /** Tx hashes for each on-chain step. */
  txHashes: ModelLaunchTxHashes;
}

/** Constructor options for {@link ModelLaunch}. */
export interface ModelLaunchOrchestratorOptions extends ModelVaultDeployerOptions {
  /** REQUIRED — the tokenfactory issuance backend (create-denom + mint). */
  tokenBackend: ModelLaunchTokenBackend;
  /**
   * Inject a pre-built deployer (test seam). Defaults to a {@link ModelVaultDeployer}
   * built from the same options (and the optional `backend` when supplied).
   */
  deployer?: ModelVaultDeployer;
  /**
   * Optional vault deploy backend forwarded to the default {@link ModelVaultDeployer}
   * (ignored when an explicit `deployer` is supplied).
   */
  backend?: ModelVaultDeployerBackend;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Composes issuance ({@link ModelLaunchTokenBackend}) with vault deployment
 * ({@link ModelVaultDeployer}) into one {@link launch} call. Holds no tx logic of
 * its own — it sequences the two existing paths and assembles the typed result.
 */
export class ModelLaunch {
  private readonly tokenBackend: ModelLaunchTokenBackend;
  private readonly deployer: ModelVaultDeployer;

  constructor(options: ModelLaunchOrchestratorOptions) {
    if (!options || !options.tokenBackend) {
      throw new Error("ModelLaunch: a tokenBackend (create-denom + mint) is required");
    }
    this.tokenBackend = options.tokenBackend;
    this.deployer =
      options.deployer ?? new ModelVaultDeployer({ ...options, backend: options.backend });
  }

  /** Connect both backends (issuance signer + vault deployer). */
  async connect(): Promise<void> {
    await this.tokenBackend.connect();
    await this.deployer.connect();
  }

  /**
   * Launch a model token and its vault in one orchestrated sequence:
   *   create-denom -> mint -> (store?) -> instantiate -> (fund?).
   * Returns the derived denom, code id, vault address, and every tx hash.
   */
  async launch(options: ModelLaunchOptions): Promise<ModelLaunchResult> {
    const subdenom = requireSubdenom(options.subdenom, "launch.subdenom");
    const initialSupply = requireUint(options.initialSupply, "launch.initialSupply");
    const { wasmBytes, codeId: providedCodeId } = resolveVaultCodeInputs(options);

    const issuer = this.tokenBackend.getAddress();
    const modelDenom = `factory/${issuer}/${subdenom}`;

    // 1. Issuance — create the denom, then mint the initial supply to the issuer.
    const createRes = await this.tokenBackend.createDenom(subdenom);
    requireTxHash(createRes?.transactionHash, "create-denom");

    const mintRes = await this.tokenBackend.mint(modelDenom, initialSupply);
    requireTxHash(mintRes?.transactionHash, "mint");

    // 2. Vault — (optionally) store the wasm, then instantiate for this denom.
    let codeId = providedCodeId;
    let storeHash: string | undefined;
    if (codeId === undefined) {
      const storeRes = await this.deployer.storeCode(wasmBytes as Uint8Array);
      codeId = storeRes.codeId;
      storeHash = storeRes.transactionHash;
    }

    const instantiateRes = await this.deployer.instantiate(codeId, {
      modelDenom,
      reserveDenom: options.reserveDenom,
      owner: options.owner,
      feeBps: options.feeBps,
      label: options.label,
      admin: options.admin,
    });

    // 3. Curve seed (optional) — fund{} with reserve and/or model-denom coins.
    const fundCoins = buildSeedFunds(modelDenom, options);
    let fundHash: string | undefined;
    if (fundCoins.length > 0) {
      const fundRes = await this.deployer.fund(instantiateRes.contractAddress, fundCoins);
      fundHash = fundRes.transactionHash;
    }

    const txHashes: ModelLaunchTxHashes = {
      createDenom: createRes.transactionHash,
      mint: mintRes.transactionHash,
      instantiate: instantiateRes.transactionHash,
    };
    if (storeHash !== undefined) txHashes.store = storeHash;
    if (fundHash !== undefined) txHashes.fund = fundHash;

    return {
      modelDenom,
      codeId,
      vaultAddress: instantiateRes.contractAddress,
      txHashes,
    };
  }
}

/** Factory mirroring `createModelVaultDeployer` — returns a {@link ModelLaunch}. */
export function createModelLaunch(options: ModelLaunchOrchestratorOptions): ModelLaunch {
  return new ModelLaunch(options);
}

// ---------------------------------------------------------------------------
// Validation + msg-assembly helpers (fail fast at the boundary)
// ---------------------------------------------------------------------------

/**
 * Resolve the vault code source: exactly one of `codeId` (reuse) or `wasmBytes`
 * (store fresh) must be usable. `codeId` takes precedence when both are present.
 */
function resolveVaultCodeInputs(
  options: ModelLaunchOptions,
): { wasmBytes?: Uint8Array; codeId?: number } {
  if (options.codeId !== undefined) {
    if (!Number.isInteger(options.codeId) || options.codeId <= 0) {
      throw new Error("ModelLaunch: launch.codeId must be a positive integer code id");
    }
    return { codeId: options.codeId };
  }
  if (!(options.wasmBytes instanceof Uint8Array) || options.wasmBytes.length === 0) {
    throw new Error(
      "ModelLaunch: provide launch.codeId to reuse a code, or launch.wasmBytes (non-empty optimized model_vault.wasm) to store one",
    );
  }
  return { wasmBytes: options.wasmBytes };
}

/** Build the optional `fund{}` coin list from seedReserve / seedInventory. */
function buildSeedFunds(modelDenom: string, options: ModelLaunchOptions): WasmCoin[] {
  const reserveDenom = options.reserveDenom?.trim() || DEFAULT_DENOM;
  const funds: WasmCoin[] = [];
  if (options.seedReserve !== undefined) {
    const amount = requireUint(options.seedReserve, "launch.seedReserve");
    if (amount !== "0") funds.push({ denom: reserveDenom, amount });
  }
  if (options.seedInventory !== undefined) {
    const amount = requireUint(options.seedInventory, "launch.seedInventory");
    if (amount !== "0") funds.push({ denom: modelDenom, amount });
  }
  return funds;
}

/** A tokenfactory subdenom: non-empty, no `factory/` prefix, <= 128 chars. */
function requireSubdenom(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`ModelLaunch: ${field} is required`);
  if (trimmed.startsWith("factory/")) {
    throw new Error(`ModelLaunch: ${field} must be a bare subdenom, not a full factory/ denom`);
  }
  if (trimmed.length > 128) {
    throw new Error(`ModelLaunch: ${field} must be 128 characters or fewer`);
  }
  return trimmed;
}

/** Coerce a Uint128 amount to a canonical non-negative integer string. */
function requireUint(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`ModelLaunch: ${field} is required`);
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`ModelLaunch: ${field} must be a non-negative integer string (base units)`);
  }
  return BigInt(trimmed).toString();
}

/** Guard that an issuance step returned a usable tx hash. */
function requireTxHash(hash: string | undefined, step: string): void {
  if (!hash || hash.trim() === "") {
    throw new Error(`ModelLaunch: ${step} did not return a transaction hash`);
  }
}
