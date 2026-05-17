import type { ChainInfo } from "@keplr-wallet/types";
import { queryOptions } from "@tanstack/react-query";

import { queryClient } from "@oko-wallet-attached/config/react_query";

const CHAIN_INFO_ENDPOINT = "https://keplr-api.keplr.app/v1/chains/all";

interface ChainInfoResponse {
  chains: ChainInfo[];
}

// ── ClawChain chain definitions (not yet in Keplr registry) ──

const CLAWCHAIN_MAINNET: ChainInfo = {
  chainId: "clawchain-1",
  chainName: "ClawChain",
  rpc: "https://rpc.clawchain.io",
  rest: "https://api.clawchain.io",
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: "claw",
    bech32PrefixAccPub: "clawpub",
    bech32PrefixValAddr: "clawvaloper",
    bech32PrefixValPub: "clawvaloperpub",
    bech32PrefixConsAddr: "clawvalcons",
    bech32PrefixConsPub: "clawvalconspub",
  },
  currencies: [
    {
      coinDenom: "CLAW",
      coinMinimalDenom: "uclaw",
      coinDecimals: 6,
      coinGeckoId: "clawchain",
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "CLAW",
      coinMinimalDenom: "uclaw",
      coinDecimals: 6,
      coinGeckoId: "clawchain",
      gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    },
  ],
  stakeCurrency: {
    coinDenom: "CLAW",
    coinMinimalDenom: "uclaw",
    coinDecimals: 6,
    coinGeckoId: "clawchain",
  },
  features: ["ibc-transfer", "ibc-go"],
};

const CLAWCHAIN_TESTNET: ChainInfo = {
  ...CLAWCHAIN_MAINNET,
  chainId: "clawchain-testnet-1",
  chainName: "ClawChain Testnet",
  rpc: "https://rpc-testnet.clawchain.io",
  rest: "https://api-testnet.clawchain.io",
  isTestnet: true,
};

/**
 * Inject ClawChain entries into the chain list if not already present.
 * Once ClawChain is added to the Keplr chain registry this helper becomes
 * a no-op because the duplicate check will skip the static entries.
 */
function injectClawChain(chains: ChainInfo[]): ChainInfo[] {
  const ids = new Set(chains.map((c) => c.chainId));
  const injected = [...chains];
  if (!ids.has(CLAWCHAIN_MAINNET.chainId)) {
    injected.unshift(CLAWCHAIN_MAINNET);
  }
  if (!ids.has(CLAWCHAIN_TESTNET.chainId)) {
    injected.push(CLAWCHAIN_TESTNET);
  }
  return injected;
}

export const allChainsQuery = queryOptions<ChainInfo[]>({
  queryKey: ["keplr", "chains", "all"],
  queryFn: async () => {
    const response = await fetch(CHAIN_INFO_ENDPOINT);
    if (!response.ok) {
      throw new Error(`Failed to fetch chain info: ${response.status}`);
    }
    const json = (await response.json()) as ChainInfoResponse | null;
    if (!json) {
      throw new Error("Empty chain info response");
    }
    return injectClawChain(json.chains ?? []);
  },
  // Cache and reuse for 1 hour
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60,
  retry: 3,
  refetchOnWindowFocus: false,
});

export async function getAllChainsCached(): Promise<ChainInfo[]> {
  return queryClient.ensureQueryData(allChainsQuery);
}

const COSMOS_CHAIN_DISCRIMINATOR = "bech32Config";

export function filterCosmosChains(chains: ChainInfo[]): ChainInfo[] {
  return chains.filter((c) => COSMOS_CHAIN_DISCRIMINATOR in c);
}

export function filterEthChains(chains: ChainInfo[]): ChainInfo[] {
  return chains.filter((c) => c.chainId.startsWith("eip155:"));
}

// Solana wallet-standard uses short aliases (e.g., "solana:devnet")
// while Keplr API uses CAIP-2 format with genesis hash
const SOLANA_CHAIN_ALIASES: Record<string, string> = {
  "solana:devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "solana:mainnet": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "solana:testnet": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

export async function getChainByChainId(
  chainId: string,
): Promise<ChainInfo | null> {
  const chains = await getAllChainsCached();
  // Normalize Solana chain aliases to CAIP-2 format
  const normalizedChainId = SOLANA_CHAIN_ALIASES[chainId] ?? chainId;
  return chains.find((c) => c.chainId === normalizedChainId) ?? null;
}
