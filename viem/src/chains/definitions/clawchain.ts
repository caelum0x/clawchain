import { defineChain } from '../../utils/chain/defineChain.js'

export const clawchain = /*#__PURE__*/ defineChain({
  id: 118,
  name: 'ClawChain',
  nativeCurrency: {
    decimals: 6,
    name: 'CLAW',
    symbol: 'CLAW',
  },
  rpcUrls: {
    default: { http: ['https://rpc.clawchain.io'] },
  },
  blockExplorers: {
    default: {
      name: 'ClawChain Explorer',
      url: 'https://explorer.clawchain.io',
    },
  },
  testnet: false,
})

export const clawchainTestnet = /*#__PURE__*/ defineChain({
  id: 119,
  name: 'ClawChain Testnet',
  nativeCurrency: {
    decimals: 6,
    name: 'CLAW',
    symbol: 'CLAW',
  },
  rpcUrls: {
    default: { http: ['https://rpc-testnet.clawchain.io'] },
  },
  blockExplorers: {
    default: {
      name: 'ClawChain Testnet Explorer',
      url: 'https://explorer-testnet.clawchain.io',
    },
  },
  testnet: true,
})
