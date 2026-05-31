/**
 * wagmi-style ClawChain adapter (V2 of the vendored-integration plan).
 *
 * Like the viem adapter (`./viem.ts`), this does NOT emulate Ethereum. It provides
 * the framework-agnostic core a wagmi integration needs — a chain definition, a
 * Cosmos wallet connector (Keplr/Leap), and wagmi-style action helpers — all routed
 * to Tendermint RPC + Cosmos bank + CosmWasm via the viem client.
 *
 * A React app wires `createClawWagmiConfig(...)` into its own wagmi hooks; the action
 * helpers here are what those hooks call. No `react`/`wagmi`/`eth_*` dependency.
 */
import {
  createClawViemClient,
  type ClawViemAdapterOptions,
  type ClawViemClient,
  type ClawViemTx,
  type ClawViemWriteContractRequest,
} from "./viem.js";
import { ClawChainClient } from "./client.js";
import { DEFAULT_DENOM, DEFAULT_GAS_PRICE, DEFAULT_PREFIX, DEFAULT_RPC_URL } from "./constants.js";
import type { WasmCoin } from "./types.js";

/** A wagmi-style chain descriptor for a ClawChain network. */
export interface ClawChainDefinition {
  /** Chain id, e.g. "clawchain-testnet-1". */
  id: string;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: string[] } };
  /** Bech32 account prefix (Cosmos-specific; wagmi/EVM has no analogue). */
  bech32Prefix: string;
}

/** Define a ClawChain network for wagmi-style config. */
export function defineClawChain(opts: {
  id: string;
  name?: string;
  rpcUrl?: string;
  bech32Prefix?: string;
}): ClawChainDefinition {
  return {
    id: opts.id,
    name: opts.name ?? "ClawChain",
    nativeCurrency: { name: "Claw", symbol: "CLAW", decimals: 6 },
    rpcUrls: { default: { http: [opts.rpcUrl ?? DEFAULT_RPC_URL] } },
    bech32Prefix: opts.bech32Prefix ?? DEFAULT_PREFIX,
  };
}

/**
 * Minimal shape of an injected Cosmos wallet (Keplr/Leap expose this on `window`).
 * Declared structurally so the SDK needs no browser/wallet type dependency.
 */
export interface InjectedCosmosWallet {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{ bech32Address: string }>;
  getOfflineSigner(chainId: string): unknown;
}

/** A wagmi-style connector backed by a Cosmos wallet. */
export interface ClawConnector {
  id: string;
  name: string;
  /** Enable the wallet for the chain and return the connected account. */
  connect(chainId: string): Promise<{ address: string }>;
  disconnect(): Promise<void>;
  getAddress(): string | undefined;
  /** The wallet's offline signer for the connected chain (for signing txs). */
  getOfflineSigner(chainId: string): unknown;
}

function injectedConnector(
  id: string,
  name: string,
  getWallet: () => InjectedCosmosWallet | undefined,
): ClawConnector {
  let address: string | undefined;
  let wallet: InjectedCosmosWallet | undefined;
  return {
    id,
    name,
    async connect(chainId: string) {
      wallet = getWallet();
      if (!wallet) throw new Error(`${name} wallet not found (is the extension installed?)`);
      await wallet.enable(chainId);
      const key = await wallet.getKey(chainId);
      address = key.bech32Address;
      return { address };
    },
    async disconnect() {
      address = undefined;
      wallet = undefined;
    },
    getAddress() {
      return address;
    },
    getOfflineSigner(chainId: string) {
      if (!wallet) throw new Error(`${name} connector not connected`);
      return wallet.getOfflineSigner(chainId);
    },
  };
}

/** Keplr connector (reads `window.keplr` unless a wallet is injected for testing). */
export function createKeplrConnector(getWallet?: () => InjectedCosmosWallet | undefined): ClawConnector {
  return injectedConnector(
    "keplr",
    "Keplr",
    getWallet ?? (() => (globalThis as { keplr?: InjectedCosmosWallet }).keplr),
  );
}

/** Leap connector (reads `window.leap` unless a wallet is injected for testing). */
export function createLeapConnector(getWallet?: () => InjectedCosmosWallet | undefined): ClawConnector {
  return injectedConnector(
    "leap",
    "Leap",
    getWallet ?? (() => (globalThis as { leap?: InjectedCosmosWallet }).leap),
  );
}

export interface ClawWagmiConfigOptions extends ClawViemAdapterOptions {
  chain: ClawChainDefinition;
  connectors: ClawConnector[];
  /**
   * Inject a pre-built read/data client (the front `ClawViemClient`). When omitted,
   * one is created via `createClawViemClient(opts)`. Primarily an injection seam for
   * tests; `client` (a backend) on `ClawViemAdapterOptions` remains the prod path.
   */
  viemClient?: ClawViemClient;
}

/** A wagmi-style config bundling chain, connectors, and a data/tx client. */
export interface ClawWagmiConfig {
  chain: ClawChainDefinition;
  connectors: ClawConnector[];
  /** The active connector after `connect`, else undefined. */
  activeConnector?: ClawConnector;
  /** Read/data client (Tendermint + bank + CosmWasm). */
  client: ClawViemClient;
  options: ClawWagmiConfigOptions;
}

export function createClawWagmiConfig(opts: ClawWagmiConfigOptions): ClawWagmiConfig {
  return {
    chain: opts.chain,
    connectors: opts.connectors,
    activeConnector: undefined,
    client: opts.viemClient ?? createClawViemClient(opts),
    options: opts,
  };
}

/**
 * Build a viem client whose tx backend signs with a connector's wallet signer.
 * This is the wallet-signed write path (Keplr/Leap), distinct from a mnemonic client.
 */
export function signingClientFromConnector(
  connector: ClawConnector,
  chain: ClawChainDefinition,
  opts: ClawViemAdapterOptions = {},
): ClawViemClient {
  const signer = connector.getOfflineSigner(chain.id);
  const backend = new ClawChainClient({
    rpcUrl: opts.rpcUrl ?? chain.rpcUrls.default.http[0] ?? DEFAULT_RPC_URL,
    grpcUrl: opts.grpcUrl,
    prefix: chain.bech32Prefix ?? DEFAULT_PREFIX,
    gasPrice: opts.gasPrice ?? DEFAULT_GAS_PRICE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    offlineSigner: signer as any,
  });
  return createClawViemClient({ ...opts, client: backend });
}

// ---------------------------------------------------------------------------
// wagmi-style actions (what hooks call under the hood)
// ---------------------------------------------------------------------------

/** Connect a wallet by connector id; sets it active and returns the account. */
export async function connect(
  config: ClawWagmiConfig,
  connectorId: string,
): Promise<{ address: string; connector: string }> {
  const conn = config.connectors.find((c) => c.id === connectorId);
  if (!conn) throw new Error(`unknown connector: ${connectorId}`);
  const { address } = await conn.connect(config.chain.id);
  config.activeConnector = conn;
  return { address, connector: conn.id };
}

export async function disconnect(config: ClawWagmiConfig): Promise<void> {
  await config.activeConnector?.disconnect();
  config.activeConnector = undefined;
}

export function getAccount(config: ClawWagmiConfig): {
  address?: string;
  isConnected: boolean;
  connector?: string;
} {
  const address = config.activeConnector?.getAddress();
  return { address, isConnected: Boolean(address), connector: config.activeConnector?.id };
}

export async function getBlockNumber(config: ClawWagmiConfig): Promise<bigint> {
  return config.client.getBlockNumber();
}

export async function getBalance(
  config: ClawWagmiConfig,
  args?: { address?: string; denom?: string },
): Promise<{ value: bigint; denom: string }> {
  const address = args?.address ?? config.activeConnector?.getAddress();
  if (!address) throw new Error("getBalance: no address (connect a wallet or pass address)");
  const denom = args?.denom ?? DEFAULT_DENOM;
  const value = await config.client.getBalance({ address, denom });
  return { value, denom };
}

export async function readContract(
  config: ClawWagmiConfig,
  args: { address: string; functionName: string; args?: unknown },
): Promise<unknown> {
  return config.client.readContract(args);
}

/**
 * Write to a CosmWasm contract, signed by the connected wallet. Falls back to the
 * config's data client (e.g. a mnemonic-backed one) when no connector is active.
 */
export async function writeContract(
  config: ClawWagmiConfig,
  args: { address: string; functionName: string; args?: unknown; funds?: WasmCoin[] },
): Promise<ClawViemTx> {
  const client = config.activeConnector
    ? signingClientFromConnector(config.activeConnector, config.chain, config.options)
    : config.client;
  await client.connect();
  const req: ClawViemWriteContractRequest = {
    address: args.address,
    functionName: args.functionName,
    args: args.args,
    funds: args.funds,
  };
  return client.writeContract(req);
}
