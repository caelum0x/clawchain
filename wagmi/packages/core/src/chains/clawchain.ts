import type { Chain } from 'viem'

/**
 * ClawChain Mainnet
 *
 * Cosmos SDK-based blockchain with ZK privacy, AI agent registry,
 * GPU compute marketplace, and CosmWasm smart contracts.
 */
export const clawchain = {
  id: 118,
  name: 'ClawChain',
  nativeCurrency: {
    name: 'CLAW',
    symbol: 'CLAW',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.clawchain.io'],
      webSocket: ['wss://rpc.clawchain.io/websocket'],
    },
    public: {
      http: ['https://rpc.clawchain.io'],
      webSocket: ['wss://rpc.clawchain.io/websocket'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ClawChain Explorer',
      url: 'https://explorer.clawchain.io',
    },
  },
  contracts: {},
  testnet: false,
} as const satisfies Chain

/**
 * ClawChain Testnet
 *
 * Test network for ClawChain development and integration testing.
 * Permissionless CosmWasm uploads enabled.
 */
export const clawchainTestnet = {
  id: 119,
  name: 'ClawChain Testnet',
  nativeCurrency: {
    name: 'CLAW',
    symbol: 'CLAW',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc-testnet.clawchain.io'],
      webSocket: ['wss://rpc-testnet.clawchain.io/websocket'],
    },
    public: {
      http: ['https://rpc-testnet.clawchain.io'],
      webSocket: ['wss://rpc-testnet.clawchain.io/websocket'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ClawChain Testnet Explorer',
      url: 'https://explorer-testnet.clawchain.io',
    },
  },
  contracts: {},
  testnet: true,
} as const satisfies Chain

/** ClawChain Cosmos REST API base URLs */
export const clawchainApi = {
  mainnet: 'https://api.clawchain.io',
  testnet: 'https://api-testnet.clawchain.io',
} as const

/** Keplr chain configuration for ClawChain mainnet */
export const clawchainKeplrConfig = {
  chainId: 'clawchain-1',
  chainName: 'ClawChain',
  rpc: 'https://rpc.clawchain.io',
  rest: 'https://api.clawchain.io',
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: 'claw',
    bech32PrefixAccPub: 'clawpub',
    bech32PrefixValAddr: 'clawvaloper',
    bech32PrefixValPub: 'clawvaloperpub',
    bech32PrefixConsAddr: 'clawvalcons',
    bech32PrefixConsPub: 'clawvalconspub',
  },
  currencies: [
    { coinDenom: 'CLAW', coinMinimalDenom: 'uclaw', coinDecimals: 6 },
  ],
  feeCurrencies: [
    {
      coinDenom: 'CLAW',
      coinMinimalDenom: 'uclaw',
      coinDecimals: 6,
      gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    },
  ],
  stakeCurrency: {
    coinDenom: 'CLAW',
    coinMinimalDenom: 'uclaw',
    coinDecimals: 6,
  },
} as const

/** Keplr chain configuration for ClawChain testnet */
export const clawchainTestnetKeplrConfig = {
  chainId: 'clawchain-testnet-1',
  chainName: 'ClawChain Testnet',
  rpc: 'https://rpc-testnet.clawchain.io',
  rest: 'https://api-testnet.clawchain.io',
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: 'claw',
    bech32PrefixAccPub: 'clawpub',
    bech32PrefixValAddr: 'clawvaloper',
    bech32PrefixValPub: 'clawvaloperpub',
    bech32PrefixConsAddr: 'clawvalcons',
    bech32PrefixConsPub: 'clawvalconspub',
  },
  currencies: [
    { coinDenom: 'CLAW', coinMinimalDenom: 'uclaw', coinDecimals: 6 },
  ],
  feeCurrencies: [
    {
      coinDenom: 'CLAW',
      coinMinimalDenom: 'uclaw',
      coinDecimals: 6,
      gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    },
  ],
  stakeCurrency: {
    coinDenom: 'CLAW',
    coinMinimalDenom: 'uclaw',
    coinDecimals: 6,
  },
} as const
