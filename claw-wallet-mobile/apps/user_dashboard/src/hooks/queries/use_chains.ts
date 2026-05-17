/**
 * Chain data fetching with TanStack Query
 * Chain data lives here; user preferences live in Zustand (state/chains.ts)
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { KEPLR_API_ENDPOINT } from "@oko-wallet-user-dashboard/fetch";
import {
  DEFAULT_ENABLED_CHAINS,
  useChainStore,
} from "@oko-wallet-user-dashboard/state/chains";
import type {
  CosmosChainInfo,
  ModularChainInfo,
} from "@oko-wallet-user-dashboard/types/chain";
import {
  getChainIdentifier,
  transformKeplrChain,
} from "@oko-wallet-user-dashboard/utils/chain";

interface KeplrChainsResponse {
  chains: CosmosChainInfo[];
}

// ── ClawChain chain definitions (not yet in Keplr registry) ──

const CLAWCHAIN_MAINNET: CosmosChainInfo = {
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

const CLAWCHAIN_TESTNET: CosmosChainInfo = {
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
function injectClawChain(chains: CosmosChainInfo[]): CosmosChainInfo[] {
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

async function fetchChains(): Promise<ModularChainInfo[]> {
  const response = await fetch(`${KEPLR_API_ENDPOINT}/v1/chains/all`);
  if (!response.ok) {
    throw new Error(`Failed to fetch chains: ${response.statusText}`);
  }

  const data: KeplrChainsResponse = await response.json();
  return injectClawChain(data.chains).map(transformKeplrChain);
}

/**
 * Hook to fetch chain list from Keplr API + non-Cosmos chains
 */
export function useChains() {
  const query = useQuery({
    queryKey: ["chains"],
    queryFn: fetchChains,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    chains: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get enabled chains (chains + user preferences)
 */
export function useEnabledChains() {
  const { chains, isLoading } = useChains();

  // Select raw state to avoid infinite loop from getEnabledChainIds() returning new array
  const activeUserKey = useChainStore((state) => state.activeUserKey);
  const enabledChainsByUser = useChainStore(
    (state) => state.enabledChainsByUser,
  );

  const enabledChains = useMemo(() => {
    const userChainIds = activeUserKey
      ? enabledChainsByUser[activeUserKey]
      : undefined;
    // Use default if no user preferences or empty array
    const enabledChainIds = userChainIds?.length
      ? userChainIds
      : [...DEFAULT_ENABLED_CHAINS];

    const enabledSet = new Set(enabledChainIds);
    return chains.filter((chain) =>
      enabledSet.has(getChainIdentifier(chain.chainId)),
    );
  }, [chains, activeUserKey, enabledChainsByUser]);

  return { chains: enabledChains, isLoading };
}

/**
 * Hook to get visible chains (for chain list UI, excludes hidden chains)
 */
export function useVisibleChains() {
  const { chains, isLoading } = useChains();

  const visibleChains = useMemo(() => {
    return chains.filter((chain) => !chain.cosmos?.hideInUI);
  }, [chains]);

  return { chains: visibleChains, isLoading };
}

/**
 * Hook to get a single chain by chainId
 */
export function useChain(chainId: string | undefined) {
  const { chains, isLoading } = useChains();

  const chain = useMemo(() => {
    if (!chainId) {
      return undefined;
    }
    const identifier = getChainIdentifier(chainId);
    return chains.find((c) => getChainIdentifier(c.chainId) === identifier);
  }, [chains, chainId]);

  return { chain, isLoading };
}
