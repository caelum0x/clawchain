import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clawchain, clawchainTestnet } from '../../chains/definitions/clawchain.js'
import { cometbft, cosmosRest } from '../transport.js'
import {
  getAgents,
  getCosmosBalance,
  getCosmosBlock,
  getCosmosValidators,
  queryContract,
} from '../actions.js'

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: create a mock Response
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response
}

// ---------------------------------------------------------------------------
// Chain definitions
// ---------------------------------------------------------------------------

describe('ClawChain mainnet chain definition', () => {
  it('has correct id', () => {
    expect(clawchain.id).toBe(118)
  })

  it('has correct name', () => {
    expect(clawchain.name).toBe('ClawChain')
  })

  it('has correct native currency', () => {
    expect(clawchain.nativeCurrency).toEqual({
      decimals: 6,
      name: 'CLAW',
      symbol: 'CLAW',
    })
  })

  it('has correct rpc url', () => {
    expect(clawchain.rpcUrls.default.http).toEqual([
      'https://rpc.clawchain.io',
    ])
  })

  it('has block explorer', () => {
    expect(clawchain.blockExplorers?.default.url).toBe(
      'https://explorer.clawchain.io',
    )
  })

  it('is not a testnet', () => {
    expect(clawchain.testnet).toBe(false)
  })
})

describe('ClawChain testnet chain definition', () => {
  it('has correct id', () => {
    expect(clawchainTestnet.id).toBe(119)
  })

  it('has correct name', () => {
    expect(clawchainTestnet.name).toBe('ClawChain Testnet')
  })

  it('has correct native currency', () => {
    expect(clawchainTestnet.nativeCurrency).toEqual({
      decimals: 6,
      name: 'CLAW',
      symbol: 'CLAW',
    })
  })

  it('has correct rpc url', () => {
    expect(clawchainTestnet.rpcUrls.default.http).toEqual([
      'https://rpc-testnet.clawchain.io',
    ])
  })

  it('has block explorer', () => {
    expect(clawchainTestnet.blockExplorers?.default.url).toBe(
      'https://explorer-testnet.clawchain.io',
    )
  })

  it('is a testnet', () => {
    expect(clawchainTestnet.testnet).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CometBFT transport
// ---------------------------------------------------------------------------

describe('CometBFT transport', () => {
  it('sends JSON-RPC request', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: { status: 'ok' } }),
    )

    const transport = cometbft('https://rpc.clawchain.io')

    expect(transport.type).toBe('cometbft')
    expect(transport.url).toBe('https://rpc.clawchain.io')

    const result = await transport.request('status')

    expect(result).toEqual({ status: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith('https://rpc.clawchain.io', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'status',
        params: {},
      }),
      signal: expect.any(AbortSignal),
    })
  })

  it('handles JSON-RPC errors', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { message: 'method not found', code: -32601 },
      }),
    )

    const transport = cometbft('https://rpc.clawchain.io')

    await expect(transport.request('bad_method')).rejects.toThrow(
      'method not found',
    )
  })

  it('handles HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500))

    const transport = cometbft('https://rpc.clawchain.io')

    await expect(transport.request('status')).rejects.toThrow(
      'CometBFT RPC request failed: 500',
    )
  })

  it('respects custom timeout', () => {
    const transport = cometbft('https://rpc.clawchain.io', { timeout: 5_000 })
    expect(transport.type).toBe('cometbft')
  })
})

// ---------------------------------------------------------------------------
// Cosmos REST transport
// ---------------------------------------------------------------------------

describe('Cosmos REST transport', () => {
  it('sends GET request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ height: '100' }))

    const rest = cosmosRest('https://api.clawchain.io')

    expect(rest.type).toBe('cosmosRest')
    expect(rest.url).toBe('https://api.clawchain.io')

    const result = await rest.get('/cosmos/base/tendermint/v1beta1/blocks/latest')

    expect(result).toEqual({ height: '100' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clawchain.io/cosmos/base/tendermint/v1beta1/blocks/latest',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      },
    )
  })

  it('sends POST request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ tx_response: { code: 0 } }))

    const rest = cosmosRest('https://api.clawchain.io/')

    // trailing slash should be stripped
    expect(rest.url).toBe('https://api.clawchain.io')

    const result = await rest.post('/cosmos/tx/v1beta1/txs', {
      tx_bytes: 'abc',
      mode: 'BROADCAST_MODE_SYNC',
    })

    expect(result).toEqual({ tx_response: { code: 0 } })
  })

  it('handles HTTP errors on GET', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404))

    const rest = cosmosRest('https://api.clawchain.io')

    await expect(rest.get('/not/found')).rejects.toThrow(
      'Cosmos REST GET failed: 404',
    )
  })

  it('handles HTTP errors on POST', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 400))

    const rest = cosmosRest('https://api.clawchain.io')

    await expect(rest.post('/bad', {})).rejects.toThrow(
      'Cosmos REST POST failed: 400',
    )
  })
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('getCosmosBalance', () => {
  it('returns balance from REST', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        balance: { denom: 'uclaw', amount: '1000000' },
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    const balance = await getCosmosBalance(rest, 'claw1abc123')

    expect(balance).toEqual({ denom: 'uclaw', amount: '1000000' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clawchain.io/cosmos/bank/v1beta1/balances/claw1abc123/by_denom?denom=uclaw',
      expect.any(Object),
    )
  })

  it('supports custom denom', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        balance: { denom: 'uatom', amount: '500' },
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    const balance = await getCosmosBalance(rest, 'claw1abc123', 'uatom')

    expect(balance).toEqual({ denom: 'uatom', amount: '500' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clawchain.io/cosmos/bank/v1beta1/balances/claw1abc123/by_denom?denom=uatom',
      expect.any(Object),
    )
  })
})

describe('getCosmosBlock', () => {
  it('parses latest block response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        block_id: { hash: 'ABCDEF' },
        block: {
          header: {
            height: '42',
            time: '2026-03-09T00:00:00Z',
            proposer_address: 'claw1proposer',
          },
          data: { txs: ['tx1', 'tx2'] },
        },
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    const block = await getCosmosBlock(rest)

    expect(block).toEqual({
      height: 42,
      time: '2026-03-09T00:00:00Z',
      hash: 'ABCDEF',
      proposer: 'claw1proposer',
      numTxs: 2,
    })
  })

  it('fetches block at specific height', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        block_id: { hash: '123456' },
        block: {
          header: {
            height: '10',
            time: '2026-01-01T00:00:00Z',
            proposer_address: 'claw1prop',
          },
          data: { txs: [] },
        },
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    await getCosmosBlock(rest, 10)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clawchain.io/cosmos/base/tendermint/v1beta1/blocks/10',
      expect.any(Object),
    )
  })
})

describe('getCosmosValidators', () => {
  it('returns validator list', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        validators: [
          {
            operator_address: 'clawvaloper1abc',
            description: { moniker: 'NodeA' },
            tokens: '1000000',
            commission: { commission_rates: { rate: '0.100000' } },
            status: 'BOND_STATUS_BONDED',
          },
          {
            operator_address: 'clawvaloper1def',
            description: { moniker: 'NodeB' },
            tokens: '2000000',
            commission: { commission_rates: { rate: '0.050000' } },
            status: 'BOND_STATUS_BONDED',
          },
        ],
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    const validators = await getCosmosValidators(rest)

    expect(validators).toHaveLength(2)
    expect(validators[0]).toEqual({
      address: 'clawvaloper1abc',
      moniker: 'NodeA',
      tokens: '1000000',
      commission: '0.100000',
      status: 'BOND_STATUS_BONDED',
    })
    expect(validators[1]!.moniker).toBe('NodeB')
  })
})

describe('getAgents', () => {
  it('queries ClawChain agent endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        agents: [
          {
            address: 'claw1agent1',
            name: 'Agent Alpha',
            status: 'ACTIVE',
            capabilities: ['inference', 'training'],
            reputation: 95,
          },
        ],
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    const agents = await getAgents(rest)

    expect(agents).toHaveLength(1)
    expect(agents[0]).toEqual({
      address: 'claw1agent1',
      name: 'Agent Alpha',
      status: 'ACTIVE',
      capabilities: ['inference', 'training'],
      reputation: 95,
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clawchain.io/clawchain/agent/v1/agents',
      expect.any(Object),
    )
  })
})

describe('queryContract', () => {
  it('encodes query as base64', async () => {
    const query = { token_info: {} }
    const encoded = btoa(JSON.stringify(query))

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { name: 'ClawToken', symbol: 'CLAW', decimals: 6 },
      }),
    )

    const rest = cosmosRest('https://api.clawchain.io')
    const result = await queryContract(rest, 'claw1contract', query)

    expect(result).toEqual({
      name: 'ClawToken',
      symbol: 'CLAW',
      decimals: 6,
    })
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.clawchain.io/cosmwasm/wasm/v1/contract/claw1contract/smart/${encoded}`,
      expect.any(Object),
    )
  })
})
