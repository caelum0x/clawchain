// wallet.ts — Keplr wallet integration with CosmJS transaction signing.
//
// Uses Keplr's getOfflineSigner() with @cosmjs/stargate SigningStargateClient
// for proper Protobuf DIRECT signing compatible with Cosmos SDK v0.53+.

import { chainConfig } from './config';

export interface WalletState {
  connected: boolean;
  address: string;
  balance: string;
  name: string;
}

const CHAIN_INFO = {
  chainId: chainConfig.chainId,
  chainName: chainConfig.chainName,
  rpc: chainConfig.rpcEndpoint.startsWith('http') ? chainConfig.rpcEndpoint : `${window.location.origin}${chainConfig.rpcEndpoint}`,
  rest: chainConfig.restEndpoint.startsWith('http') ? chainConfig.restEndpoint : `${window.location.origin}${chainConfig.restEndpoint}`,
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: chainConfig.bech32Prefix,
    bech32PrefixAccPub: `${chainConfig.bech32Prefix}pub`,
    bech32PrefixValAddr: `${chainConfig.bech32Prefix}valoper`,
    bech32PrefixValPub: `${chainConfig.bech32Prefix}valoperpub`,
    bech32PrefixConsAddr: `${chainConfig.bech32Prefix}valcons`,
    bech32PrefixConsPub: `${chainConfig.bech32Prefix}valconspub`,
  },
  currencies: [
    { coinDenom: chainConfig.coinDenom, coinMinimalDenom: chainConfig.coinMinimalDenom, coinDecimals: chainConfig.coinDecimals },
  ],
  feeCurrencies: [
    {
      coinDenom: chainConfig.coinDenom,
      coinMinimalDenom: chainConfig.coinMinimalDenom,
      coinDecimals: chainConfig.coinDecimals,
      gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    },
  ],
  stakeCurrency: {
    coinDenom: chainConfig.coinDenom,
    coinMinimalDenom: chainConfig.coinMinimalDenom,
    coinDecimals: chainConfig.coinDecimals,
  },
};

// Keplr type declarations (minimal).
interface KeplrWindow {
  keplr?: {
    enable(chainId: string): Promise<void>;
    experimentalSuggestChain(chainInfo: any): Promise<void>;
    getKey(chainId: string): Promise<{ bech32Address: string; name: string }>;
    getOfflineSigner(chainId: string): any;
    signAmino(chainId: string, signer: string, signDoc: any): Promise<any>;
  };
}

function getKeplr() {
  return (window as unknown as KeplrWindow).keplr;
}

export function isKeplrAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as KeplrWindow).keplr;
}

// Connect to Keplr and return wallet state.
export async function connectKeplr(): Promise<WalletState> {
  const keplr = getKeplr();
  if (!keplr) {
    throw new Error('Keplr extension not found. Please install Keplr.');
  }

  // Suggest chain if not already added.
  try {
    await keplr.experimentalSuggestChain(CHAIN_INFO);
  } catch {
    // Chain may already be added.
  }

  await keplr.enable(chainConfig.chainId);
  const key = await keplr.getKey(chainConfig.chainId);

  // Fetch balance.
  const balance = await fetchBalance(key.bech32Address);

  return {
    connected: true,
    address: key.bech32Address,
    balance,
    name: key.name,
  };
}

// Fetch CLAW balance for an address.
async function fetchBalance(address: string): Promise<string> {
  try {
    const rest = chainConfig.restEndpoint.startsWith('http')
      ? chainConfig.restEndpoint
      : `${window.location.origin}${chainConfig.restEndpoint}`;
    const resp = await fetch(`${rest}/cosmos/bank/v1beta1/balances/${address}`);
    const data = await resp.json();
    const coin = data.balances?.find((b: any) => b.denom === chainConfig.coinMinimalDenom);
    return coin?.amount || '0';
  } catch {
    return '0';
  }
}

// Sign and broadcast a transaction via Keplr using Protobuf DIRECT signing.
// Uses Keplr's getOfflineSigner with SigningStargateClient for SDK v0.53 compat.
export async function signAndBroadcast(
  senderAddress: string,
  messages: any[],
  memo = '',
  fee = { amount: [{ denom: chainConfig.coinMinimalDenom, amount: '5000' }], gas: '200000' }
): Promise<{ txHash: string; code: number }> {
  const keplr = getKeplr();
  if (!keplr) throw new Error('Keplr not available');

  // Keplr's getOfflineSigner supports DIRECT (Protobuf) signing.
  const offlineSigner = keplr.getOfflineSigner(chainConfig.chainId);

  const rpc = chainConfig.rpcEndpoint.startsWith('http')
    ? chainConfig.rpcEndpoint
    : `${window.location.origin}${chainConfig.rpcEndpoint}`;

  // Dynamically import @cosmjs/stargate for tree-shaking in non-tx pages.
  const { SigningStargateClient } = await import('@cosmjs/stargate');

  const client = await SigningStargateClient.connectWithSigner(rpc, offlineSigner, {
    gasPrice: { amount: '0.025', denom: chainConfig.coinMinimalDenom } as any,
  });

  const result = await client.signAndBroadcast(senderAddress, messages, fee, memo);

  client.disconnect();

  return {
    txHash: result.transactionHash,
    code: result.code,
  };
}

// Disconnect wallet (clear local state, Keplr stays connected).
export function disconnectWallet(): WalletState {
  return { connected: false, address: '', balance: '0', name: '' };
}

// Generate a random 32-byte hex blinding factor for privacy transactions.
export function generateBlinding(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
