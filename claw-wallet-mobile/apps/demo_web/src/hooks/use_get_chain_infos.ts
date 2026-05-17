import { useQuery } from "@tanstack/react-query";
import type { ChainInfo } from "@keplr-wallet/types";

const CHAIN_INFO_ENDPOINT = "https://keplr-api.keplr.app/v1/chains/all";

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

export function useGetChainInfos() {
  return useQuery({
    queryKey: ["chain_infos"],
    queryFn: async () => {
      try {
        const response = await fetch(CHAIN_INFO_ENDPOINT);
        const data = (await response.json()) as { chains: ChainInfo[] } | null;

        const chains = injectClawChain(data?.chains || []);

        return chains.sort((a, b) => {
          const aName = a.chainName.toLowerCase();
          const bName = b.chainName.toLowerCase();

          const priorityChains = ["clawchain", "ethereum", "cosmos hub", "osmosis"];

          const aPriority = priorityChains.indexOf(aName);
          const bPriority = priorityChains.indexOf(bName);

          if (aPriority >= 0 === bPriority >= 0) {
            if (aPriority >= 0 && bPriority >= 0) {
              return aPriority - bPriority;
            } else {
              return aName.localeCompare(bName);
            }
          }

          return aPriority >= 0 ? -1 : 1;
        });
      } catch (error) {
        console.error("Error fetching chains:", error);
        return [];
      }
    },
  });
}
