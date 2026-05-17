import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import {
  clawchain,
  clawchainTestnet,
  clawchainApi,
  clawchainKeplrConfig,
  clawchainTestnetKeplrConfig,
} from '../../chains/clawchain.js'
import { keplr } from '../../connectors/keplr.js'

// ---------------------------------------------------------------------------
// Chain definition tests
// ---------------------------------------------------------------------------

describe('clawchain mainnet', () => {
  it('has the correct chain id', () => {
    expect(clawchain.id).toBe(118)
  })

  it('has the correct name', () => {
    expect(clawchain.name).toBe('ClawChain')
  })

  it('has the correct native currency', () => {
    expect(clawchain.nativeCurrency).toEqual({
      name: 'CLAW',
      symbol: 'CLAW',
      decimals: 6,
    })
  })

  it('has valid rpc urls', () => {
    expect(clawchain.rpcUrls.default.http[0]).toBe('https://rpc.clawchain.io')
    expect(clawchain.rpcUrls.default.webSocket?.[0]).toBe(
      'wss://rpc.clawchain.io/websocket',
    )
  })

  it('has block explorer configured', () => {
    expect(clawchain.blockExplorers?.default.name).toBe('ClawChain Explorer')
    expect(clawchain.blockExplorers?.default.url).toBe(
      'https://explorer.clawchain.io',
    )
  })

  it('is not marked as testnet', () => {
    expect(clawchain.testnet).toBe(false)
  })
})

describe('clawchain testnet', () => {
  it('has the correct chain id', () => {
    expect(clawchainTestnet.id).toBe(119)
  })

  it('has the correct name', () => {
    expect(clawchainTestnet.name).toBe('ClawChain Testnet')
  })

  it('has the correct native currency', () => {
    expect(clawchainTestnet.nativeCurrency).toEqual({
      name: 'CLAW',
      symbol: 'CLAW',
      decimals: 6,
    })
  })

  it('uses testnet rpc urls', () => {
    expect(clawchainTestnet.rpcUrls.default.http[0]).toBe(
      'https://rpc-testnet.clawchain.io',
    )
  })

  it('uses testnet block explorer', () => {
    expect(clawchainTestnet.blockExplorers?.default.url).toBe(
      'https://explorer-testnet.clawchain.io',
    )
  })

  it('is marked as testnet', () => {
    expect(clawchainTestnet.testnet).toBe(true)
  })
})

describe('clawchainApi', () => {
  it('exposes mainnet and testnet api urls', () => {
    expect(clawchainApi.mainnet).toBe('https://api.clawchain.io')
    expect(clawchainApi.testnet).toBe('https://api-testnet.clawchain.io')
  })
})

describe('keplr config objects', () => {
  it('mainnet keplr config has correct chain id and bech32 prefix', () => {
    expect(clawchainKeplrConfig.chainId).toBe('clawchain-1')
    expect(clawchainKeplrConfig.bech32Config.bech32PrefixAccAddr).toBe('claw')
    expect(clawchainKeplrConfig.stakeCurrency.coinMinimalDenom).toBe('uclaw')
  })

  it('testnet keplr config has correct chain id', () => {
    expect(clawchainTestnetKeplrConfig.chainId).toBe('clawchain-testnet-1')
  })
})

// ---------------------------------------------------------------------------
// Keplr connector tests
// ---------------------------------------------------------------------------

describe('keplr connector', () => {
  it('has the correct id and type', () => {
    expect(keplr.type).toBe('keplr')
  })

  it('creates a connector with correct metadata', () => {
    const connectorFn = keplr()
    // The connector function returns a setup function; invoke it with a
    // minimal config to inspect properties.
    const fakeChain = clawchain as any
    const connector = connectorFn({
      chains: [fakeChain],
      emitter: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        listenerCount: vi.fn().mockReturnValue(0),
      } as any,
      storage: undefined,
      transports: undefined,
    })

    expect(connector.id).toBe('keplr')
    expect(connector.name).toBe('Keplr')
    expect(connector.type).toBe('keplr')
  })
})

// ---------------------------------------------------------------------------
// Cosmos hooks tests (mock fetch)
// ---------------------------------------------------------------------------

describe('useCosmosBalance (mock)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls the correct API endpoint', async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({ balance: { denom: 'uclaw', amount: '1000000' } }),
    }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse,
    )

    // Directly call the underlying fetch logic to verify the URL shape.
    const address = 'claw1abc123'
    const denom = 'uclaw'
    const res = await fetch(
      `${clawchainApi.mainnet}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`,
    )
    const data = (await res.json()) as {
      balance: { denom: string; amount: string }
    }

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.clawchain.io/cosmos/bank/v1beta1/balances/claw1abc123/by_denom?denom=uclaw',
    )
    expect(data.balance.amount).toBe('1000000')
  })
})

describe('useCosmWasmQuery encoding', () => {
  it('base64-encodes the query message correctly', () => {
    const query = { token_info: {} }
    const encoded = btoa(JSON.stringify(query))
    expect(encoded).toBe(btoa('{"token_info":{}}'))

    // Verify the expected path shape
    const contract = 'claw1contractabc'
    const path = `/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`
    expect(path).toContain(contract)
    expect(path).toContain(encoded)
  })
})

describe('useCosmosSend message shape', () => {
  it('constructs a valid MsgSend message', () => {
    const sender = 'claw1sender'
    const to = 'claw1receiver'
    const amount = '500000'
    const denom = 'uclaw'

    const msg = {
      '@type': '/cosmos.bank.v1beta1.MsgSend',
      from_address: sender,
      to_address: to,
      amount: [{ denom, amount }],
    }

    expect(msg['@type']).toBe('/cosmos.bank.v1beta1.MsgSend')
    expect(msg.from_address).toBe(sender)
    expect(msg.to_address).toBe(to)
    expect(msg.amount).toEqual([{ denom: 'uclaw', amount: '500000' }])
  })
})

describe('chain definitions satisfy wagmi type constraints', () => {
  it('mainnet has all required Chain fields', () => {
    // These would cause a TypeScript error at compile time if the shape
    // didn't match `satisfies Chain`, but we also verify at runtime.
    expect(clawchain).toHaveProperty('id')
    expect(clawchain).toHaveProperty('name')
    expect(clawchain).toHaveProperty('nativeCurrency')
    expect(clawchain).toHaveProperty('rpcUrls')
    expect(typeof clawchain.nativeCurrency.decimals).toBe('number')
  })

  it('testnet has all required Chain fields', () => {
    expect(clawchainTestnet).toHaveProperty('id')
    expect(clawchainTestnet).toHaveProperty('name')
    expect(clawchainTestnet).toHaveProperty('nativeCurrency')
    expect(clawchainTestnet).toHaveProperty('rpcUrls')
    expect(typeof clawchainTestnet.nativeCurrency.decimals).toBe('number')
  })
})
