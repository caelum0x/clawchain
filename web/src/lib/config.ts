function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function fromEnv(key: string, fallback: string): string {
  const value = (import.meta.env[key] as string | undefined)?.trim();
  return value ? trimTrailingSlash(value) : fallback;
}

const isProd = import.meta.env.PROD;

export const chainConfig = {
  chainId: fromEnv("VITE_CLAWCHAIN_CHAIN_ID", isProd ? "clawchain-1" : "clawchain"),
  chainName: fromEnv("VITE_CLAWCHAIN_CHAIN_NAME", "ClawChain"),
  bech32Prefix: fromEnv("VITE_CLAWCHAIN_BECH32_PREFIX", "claw"),
  coinDenom: fromEnv("VITE_CLAWCHAIN_COIN_DENOM", "CLAW"),
  coinMinimalDenom: fromEnv("VITE_CLAWCHAIN_COIN_MINIMAL_DENOM", "uclaw"),
  coinDecimals: Number(fromEnv("VITE_CLAWCHAIN_COIN_DECIMALS", "6")),
  gasPrice: fromEnv("VITE_CLAWCHAIN_GAS_PRICE", "0.025uclaw"),
  restEndpoint: fromEnv("VITE_CLAWCHAIN_REST_URL", isProd ? "https://api.clawchain.io" : "/api"),
  rpcEndpoint: fromEnv("VITE_CLAWCHAIN_RPC_URL", isProd ? "https://rpc.clawchain.io" : "/rpc"),
  faucetEndpoint: fromEnv("VITE_CLAWCHAIN_FAUCET_URL", isProd ? "https://faucet.clawchain.io" : "/faucet"),
  walletUrl: fromEnv("VITE_CLAWCHAIN_WALLET_URL", isProd ? "https://wallet.clawchain.io" : "http://localhost:3001"),
};
