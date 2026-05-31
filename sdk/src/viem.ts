import { ClawChainClient } from "./client.js";
import {
  DEFAULT_DENOM,
  DEFAULT_GAS_PRICE,
  DEFAULT_PREFIX,
  DEFAULT_RPC_URL,
} from "./constants.js";
import type {
  ChainEvent,
  ClawChainClientOptions,
  TxResult,
  Unsubscribe,
  WasmCoin,
  WasmExecuteResult,
  WsTxEvent,
} from "./types.js";

export interface ClawViemAdapterOptions extends ClawChainClientOptions {
  client?: ClawViemClientBackend;
  fetch?: typeof fetch;
}

export interface ClawViemClientBackend {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(): string;
  getBalance(address: string, denom?: string): Promise<string>;
  sendTokens(recipient: string, amount: string, denom?: string): Promise<TxResult>;
  queryContract(contractAddress: string, queryMsg: Record<string, unknown>): Promise<unknown>;
  executeContract(
    senderAddress: string,
    contractAddress: string,
    execMsg: Record<string, unknown>,
    funds?: WasmCoin[],
  ): Promise<WasmExecuteResult>;
  subscribeTx(address: string, callback: (tx: WsTxEvent) => void): Unsubscribe;
  subscribeEvent(eventType: string, callback: (event: ChainEvent) => void): Unsubscribe;
}

export interface ClawViemTransferRequest {
  to: string;
  value: bigint | number | string;
  denom?: string;
}

export interface ClawViemReadContractRequest {
  address: string;
  functionName: string;
  args?: unknown;
}

export interface ClawViemWriteContractRequest extends ClawViemReadContractRequest {
  funds?: WasmCoin[];
  senderAddress?: string;
}

export interface ClawViemWatchTransactionsRequest {
  address?: string;
  onTx: (tx: WsTxEvent) => void;
}

export interface ClawViemWatchEventRequest {
  eventType: string;
  onEvent: (event: ChainEvent) => void;
}

export interface ClawViemTx {
  hash: string;
  height: bigint;
  code: number;
  rawLog: string;
  gasUsed: bigint;
  gasWanted: bigint;
}

export interface ClawViemClient {
  connect(): Promise<ClawViemClient>;
  disconnect(): Promise<void>;
  getChainId(): Promise<string>;
  getBlockNumber(): Promise<bigint>;
  getAccount(): { address: string };
  getBalance(args: { address: string; denom?: string }): Promise<bigint>;
  sendTransaction(args: ClawViemTransferRequest): Promise<ClawViemTx>;
  readContract(args: ClawViemReadContractRequest): Promise<unknown>;
  writeContract(args: ClawViemWriteContractRequest): Promise<ClawViemTx>;
  watchTransactions(args: ClawViemWatchTransactionsRequest): Unsubscribe;
  watchEvent(args: ClawViemWatchEventRequest): Unsubscribe;
}

interface TendermintStatusResponse {
  result?: {
    node_info?: {
      network?: string;
    };
    sync_info?: {
      latest_block_height?: string;
    };
  };
}

function normalizeAmount(value: bigint | number | string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("ClawViemAdapter: value must be a non-negative safe integer");
    }
    return String(value);
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("ClawViemAdapter: value must be an integer string");
  }
  return value;
}

function toViemTx(tx: TxResult | WasmExecuteResult): ClawViemTx {
  return {
    hash: tx.transactionHash,
    height: BigInt(tx.height),
    code: "code" in tx ? tx.code : 0,
    rawLog: "rawLog" in tx ? tx.rawLog : "",
    gasUsed: BigInt(tx.gasUsed),
    gasWanted: "gasWanted" in tx ? BigInt(tx.gasWanted) : 0n,
  };
}

function functionCallToCosmWasmMsg(functionName: string, args: unknown): Record<string, unknown> {
  if (args === undefined) return { [functionName]: {} };
  if (Array.isArray(args)) return { [functionName]: args.length === 1 ? args[0] : args };
  if (typeof args === "object" && args !== null) return { [functionName]: args };
  return { [functionName]: { value: args } };
}

/**
 * ClawChain-native adapter with a viem-style surface.
 *
 * This does not emulate Ethereum JSON-RPC or EVM execution. It keeps familiar
 * method names (`getBlockNumber`, `sendTransaction`, `readContract`,
 * `writeContract`) while routing them to Tendermint RPC, Cosmos bank sends, and
 * CosmWasm smart queries/executes.
 */
export function createClawViemClient(options: ClawViemAdapterOptions = {}): ClawViemClient {
  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URL;
  const denom = DEFAULT_DENOM;
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const backend: ClawViemClientBackend =
    options.client ??
    new ClawChainClient({
      rpcUrl,
      grpcUrl: options.grpcUrl,
      mnemonic: options.mnemonic,
      prefix: options.prefix ?? DEFAULT_PREFIX,
      gasPrice: options.gasPrice ?? DEFAULT_GAS_PRICE,
    });

  async function status(): Promise<TendermintStatusResponse> {
    const res = await fetchFn(`${rpcUrl}/status`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawViemAdapter.status: HTTP ${res.status} ${body}`);
    }
    return (await res.json()) as TendermintStatusResponse;
  }

  return {
    async connect() {
      await backend.connect();
      return this;
    },

    async disconnect() {
      await backend.disconnect();
    },

    async getChainId() {
      const data = await status();
      const chainId = data.result?.node_info?.network;
      if (!chainId) throw new Error("ClawViemAdapter.getChainId: missing network in status response");
      return chainId;
    },

    async getBlockNumber() {
      const data = await status();
      const height = data.result?.sync_info?.latest_block_height;
      if (!height) throw new Error("ClawViemAdapter.getBlockNumber: missing height in status response");
      return BigInt(height);
    },

    getAccount() {
      return { address: backend.getAddress() };
    },

    async getBalance(args) {
      return BigInt(await backend.getBalance(args.address, args.denom ?? denom));
    },

    async sendTransaction(args) {
      const tx = await backend.sendTokens(args.to, normalizeAmount(args.value), args.denom ?? denom);
      return toViemTx(tx);
    },

    async readContract(args) {
      return backend.queryContract(args.address, functionCallToCosmWasmMsg(args.functionName, args.args));
    },

    async writeContract(args) {
      const sender = args.senderAddress ?? backend.getAddress();
      const tx = await backend.executeContract(
        sender,
        args.address,
        functionCallToCosmWasmMsg(args.functionName, args.args),
        args.funds,
      );
      return toViemTx(tx);
    },

    watchTransactions(args) {
      return backend.subscribeTx(args.address ?? "", args.onTx);
    },

    watchEvent(args) {
      return backend.subscribeEvent(args.eventType, args.onEvent);
    },
  };
}
