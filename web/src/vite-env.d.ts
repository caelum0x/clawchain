/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLAWCHAIN_CHAIN_ID?: string;
  readonly VITE_CLAWCHAIN_CHAIN_NAME?: string;
  readonly VITE_CLAWCHAIN_BECH32_PREFIX?: string;
  readonly VITE_CLAWCHAIN_COIN_DENOM?: string;
  readonly VITE_CLAWCHAIN_COIN_MINIMAL_DENOM?: string;
  readonly VITE_CLAWCHAIN_COIN_DECIMALS?: string;
  readonly VITE_CLAWCHAIN_GAS_PRICE?: string;
  readonly VITE_CLAWCHAIN_REST_URL?: string;
  readonly VITE_CLAWCHAIN_RPC_URL?: string;
  readonly VITE_CLAWCHAIN_FAUCET_URL?: string;
  readonly VITE_CLAWCHAIN_WALLET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
