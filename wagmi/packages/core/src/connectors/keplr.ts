import type { Address } from 'viem'

import { createConnector } from './createConnector.js'
import {
  clawchainKeplrConfig,
  clawchainTestnetKeplrConfig,
} from '../chains/clawchain.js'

export type KeplrParameters = {
  /**
   * Override the default Cosmos chain ID used for Keplr.
   * @default 'clawchain-1'
   */
  chainId?: string | undefined
  /**
   * Whether to use the testnet configuration.
   * @default false
   */
  testnet?: boolean | undefined
}

/** Keplr wallet provider shape exposed on `window.keplr` */
type KeplrProvider = {
  enable(chainId: string): Promise<void>
  getOfflineSigner(chainId: string): {
    getAccounts(): Promise<readonly { address: string; pubkey: Uint8Array }[]>
    signDirect(
      signerAddress: string,
      signDoc: unknown,
    ): Promise<{ signed: unknown; signature: { signature: string } }>
  }
  getKey(
    chainId: string,
  ): Promise<{ bech32Address: string; name: string; pubKey: Uint8Array }>
  experimentalSuggestChain(chainInfo: unknown): Promise<void>
  on?(event: string, handler: (...args: unknown[]) => void): void
  off?(event: string, handler: (...args: unknown[]) => void): void
}

type KeplrWindow = {
  keplr?: KeplrProvider | undefined
}

keplr.type = 'keplr' as const

/**
 * Keplr wallet connector for Cosmos-based chains.
 *
 * Connects to the Keplr browser extension, suggests the ClawChain
 * configuration if it isn't already registered, and bridges Cosmos
 * account addresses into Wagmi's connector system.
 */
export function keplr(parameters: KeplrParameters = {}) {
  const { testnet = false } = parameters
  const cosmosChainId =
    parameters.chainId ?? (testnet ? 'clawchain-testnet-1' : 'clawchain-1')
  const keplrConfig = testnet
    ? clawchainTestnetKeplrConfig
    : clawchainKeplrConfig

  type Provider = KeplrProvider | undefined
  type Properties = Record<string, never>
  type StorageItem = {
    'keplr.connected': true
  }

  return createConnector<Provider, Properties, StorageItem>((config) => ({
    id: 'keplr',
    name: 'Keplr',
    type: keplr.type,

    async setup() {
      // Nothing to do until connect is called;
      // Keplr doesn't fire EIP-1193-style events at setup time.
    },

    async connect({ chainId: _chainId, isReconnecting } = {}) {
      const provider = await this.getProvider()
      if (!provider) {
        throw new Error(
          'Keplr wallet not found. Please install the Keplr browser extension.',
        )
      }

      // Suggest the ClawChain configuration so users don't have to add it manually.
      try {
        await provider.experimentalSuggestChain(keplrConfig)
      } catch {
        // If suggesting fails the chain may already be registered. Continue.
      }

      await provider.enable(cosmosChainId)

      let accounts: readonly Address[]
      if (isReconnecting) {
        accounts = await this.getAccounts().catch(() => [])
      } else {
        const key = await provider.getKey(cosmosChainId)
        // Wagmi expects EVM-style hex addresses. We store the bech32 address
        // as a hex-prefixed string so it flows through the existing
        // infrastructure without breaking type constraints.
        accounts = [key.bech32Address as Address]
      }

      // Persist connection flag
      await config.storage?.setItem('keplr.connected', true)

      // Use the wagmi chain id that was configured (first chain in the list
      // or the one explicitly requested).
      const wagmiChainId = _chainId ?? config.chains[0]!.id

      return { accounts, chainId: wagmiChainId }
    },

    async disconnect() {
      await config.storage?.removeItem('keplr.connected')
      config.emitter.emit('disconnect')
    },

    async getAccounts() {
      const provider = await this.getProvider()
      if (!provider) return []

      try {
        const key = await provider.getKey(cosmosChainId)
        return [key.bech32Address as Address]
      } catch {
        return []
      }
    },

    async getChainId() {
      return config.chains[0]!.id
    },

    async getProvider() {
      if (typeof window === 'undefined') return undefined
      return (window as unknown as KeplrWindow).keplr
    },

    async isAuthorized() {
      try {
        const connected = await config.storage?.getItem('keplr.connected')
        if (!connected) return false

        const accounts = await this.getAccounts()
        return accounts.length > 0
      } catch {
        return false
      }
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) {
        this.onDisconnect()
      } else {
        config.emitter.emit('change', {
          accounts: accounts as readonly Address[],
        })
      }
    },

    onChainChanged(chain) {
      const chainId = Number(chain)
      config.emitter.emit('change', { chainId })
    },

    async onDisconnect() {
      config.emitter.emit('disconnect')
      await config.storage?.removeItem('keplr.connected')
    },
  }))
}
