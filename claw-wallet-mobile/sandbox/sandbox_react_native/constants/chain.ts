export const CHAIN_CONFIG = {
  chainId: "clawchain-1",
  chainName: "ClawChain",
  rpc: "https://rpc.clawchain.io",
  rest: "https://api.clawchain.io",
  bech32Prefix: "claw",
  bip44CoinType: 118,
  denom: "uclaw",
  displayDenom: "CLAW",
  decimals: 6,
  coinGeckoId: "clawchain",
  gasPriceStep: {
    low: 0.01,
    average: 0.025,
    high: 0.04,
  },
  gasPrice: "0.025uclaw",
  explorerUrl: "https://explorer.clawchain.io",
} as const;

export const TESTNET_CONFIG = {
  chainId: "clawchain-testnet-1",
  chainName: "ClawChain Testnet",
  rpc: "https://rpc-testnet.clawchain.io",
  rest: "https://api-testnet.clawchain.io",
  bech32Prefix: "claw",
  bip44CoinType: 118,
  denom: "uclaw",
  displayDenom: "CLAW",
  decimals: 6,
  coinGeckoId: "clawchain",
  gasPriceStep: {
    low: 0.01,
    average: 0.025,
    high: 0.04,
  },
  gasPrice: "0.025uclaw",
  explorerUrl: "https://explorer-testnet.clawchain.io",
} as const;

export const LOCAL_CONFIG = {
  chainId: "clawchain-testnet-1",
  chainName: "ClawChain Local",
  rpc: "http://localhost:26657",
  rest: "http://localhost:1317",
  bech32Prefix: "claw",
  bip44CoinType: 118,
  denom: "uclaw",
  displayDenom: "CLAW",
  decimals: 6,
  coinGeckoId: "clawchain",
  gasPriceStep: {
    low: 0.01,
    average: 0.025,
    high: 0.04,
  },
  gasPrice: "0.025uclaw",
  explorerUrl: "http://localhost:8080",
} as const;

export interface ChainConfig {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bech32Prefix: string;
  bip44CoinType: number;
  denom: string;
  displayDenom: string;
  decimals: number;
  coinGeckoId: string;
  gasPriceStep: {
    low: number;
    average: number;
    high: number;
  };
  gasPrice: string;
  explorerUrl: string;
}

export function formatAmount(amountUclaw: string | number, decimals = 6): string {
  const raw = typeof amountUclaw === "string" ? parseInt(amountUclaw, 10) : amountUclaw;
  if (isNaN(raw)) return "0.00";
  const value = raw / Math.pow(10, decimals);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(decimals > 2 ? 2 : decimals);
}

export function parseAmount(displayAmount: string, decimals = 6): string {
  const value = parseFloat(displayAmount);
  if (isNaN(value)) return "0";
  return Math.floor(value * Math.pow(10, decimals)).toString();
}

export function truncateAddress(address: string, start = 10, end = 6): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
