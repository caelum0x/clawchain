import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CosmosClient } from '../client'
import type { CosmosBlock, CosmosTx } from '../client'
import {
  CATEGORIES,
  MSG_TYPE_MAP,
  decodeMessages,
  decodeMsgType,
  summarizeMessage,
} from '../decoder'
import type { DecodedMessage } from '../decoder'
import {
  formatAccount,
  formatAddress,
  formatAgent,
  formatAmount,
  formatBlock,
  formatGas,
  formatTimestamp,
  formatTx,
} from '../formatter'

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  }
}

function makeClient() {
  return new CosmosClient({
    rpcUrl: 'http://localhost:26657',
    restUrl: 'http://localhost:1317',
  })
}

// ---------------------------------------------------------------------------
// CosmosClient tests
// ---------------------------------------------------------------------------

describe('CosmosClient', () => {
  it('getBlock parses response correctly', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        result: {
          block_id: { hash: 'ABC123' },
          block: {
            header: {
              height: '100',
              time: '2026-03-09T14:00:00Z',
              proposer_address: 'clawvalcons1abc',
              chain_id: 'clawchain-1',
            },
            data: { txs: ['tx1', 'tx2'] },
          },
        },
      }),
    )

    const client = makeClient()
    const block = await client.getBlock(100)

    expect(block.height).toBe(100)
    expect(block.time).toBe('2026-03-09T14:00:00Z')
    expect(block.hash).toBe('ABC123')
    expect(block.proposer).toBe('clawvalcons1abc')
    expect(block.numTxs).toBe(2)
    expect(block.chainId).toBe('clawchain-1')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:26657/block?height=100',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('getLatestBlock calls without height parameter', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        result: {
          block_id: { hash: 'LATEST' },
          block: {
            header: {
              height: '999',
              time: '2026-03-09T15:00:00Z',
              proposer_address: 'val1',
              chain_id: 'clawchain-1',
            },
            data: { txs: [] },
          },
        },
      }),
    )

    const client = makeClient()
    const block = await client.getLatestBlock()

    expect(block.height).toBe(999)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:26657/block',
      expect.any(Object),
    )
  })

  it('getTx decodes messages', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        tx: {
          body: {
            messages: [
              {
                '@type': '/cosmos.bank.v1beta1.MsgSend',
                from_address: 'claw1sender',
                to_address: 'claw1receiver',
                amount: [{ denom: 'uclaw', amount: '1000000' }],
              },
            ],
            memo: 'test memo',
          },
          auth_info: {
            fee: { amount: [{ denom: 'uclaw', amount: '5000' }] },
          },
        },
        tx_response: {
          txhash: 'TXHASH123',
          height: '50',
          gas_used: '80000',
          gas_wanted: '100000',
          code: 0,
          raw_log: '[]',
        },
      }),
    )

    const client = makeClient()
    const tx = await client.getTx('TXHASH123')

    expect(tx.hash).toBe('TXHASH123')
    expect(tx.height).toBe(50)
    expect(tx.success).toBe(true)
    expect(tx.gasUsed).toBe(80000)
    expect(tx.gasWanted).toBe(100000)
    expect(tx.fee).toEqual({ amount: '5000', denom: 'uclaw' })
    expect(tx.memo).toBe('test memo')
    expect(tx.messages).toHaveLength(1)
    expect(tx.messages[0].typeName).toBe('Transfer')
    expect(tx.messages[0].category).toBe('bank')
  })

  it('getAccount returns balances and delegations', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          balances: [
            { denom: 'uclaw', amount: '5000000' },
            { denom: 'uatom', amount: '100000' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account: {
            account_number: '42',
            sequence: '7',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          delegation_responses: [
            {
              delegation: { validator_address: 'clawvaloper1abc' },
              balance: { amount: '2000000' },
            },
          ],
        }),
      )

    const client = makeClient()
    const account = await client.getAccount('claw1user')

    expect(account.address).toBe('claw1user')
    expect(account.balances).toHaveLength(2)
    expect(account.balances[0]).toEqual({ denom: 'uclaw', amount: '5000000' })
    expect(account.accountNumber).toBe(42)
    expect(account.sequence).toBe(7)
    expect(account.delegations).toHaveLength(1)
    expect(account.delegations[0].validator).toBe('clawvaloper1abc')
  })

  it('queryContract base64-encodes query', async () => {
    const query = { pool: {} }
    const expectedEncoded = btoa(JSON.stringify(query))

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { total_share: '1000' } }),
    )

    const client = makeClient()
    const result = await client.queryContract<{ total_share: string }>(
      'claw1contract',
      query,
    )

    expect(result.total_share).toBe('1000')
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:1317/cosmwasm/wasm/v1/contract/claw1contract/smart/${expectedEncoded}`,
      expect.any(Object),
    )
  })

  it('getAgent returns null when agent not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })

    const client = makeClient()
    const agent = await client.getAgent('claw1nobody')

    expect(agent).toBeNull()
  })

  it('getValidators parses response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        validators: [
          {
            operator_address: 'clawvaloper1abc',
            description: { moniker: 'My Validator' },
            tokens: '5000000000',
            status: 'BOND_STATUS_BONDED',
          },
        ],
      }),
    )

    const client = makeClient()
    const validators = await client.getValidators()

    expect(validators).toHaveLength(1)
    expect(validators[0].moniker).toBe('My Validator')
    expect(validators[0].tokens).toBe('5000000000')
  })
})

// ---------------------------------------------------------------------------
// Decoder tests
// ---------------------------------------------------------------------------

describe('decoder', () => {
  it('decodeMsgType maps all 36 known types', () => {
    const knownTypes = Object.keys(MSG_TYPE_MAP)
    expect(knownTypes).toHaveLength(36)
    for (const typeUrl of knownTypes) {
      const result = decodeMsgType(typeUrl)
      expect(result.name).toBeTruthy()
      expect(result.category).not.toBe('unknown')
    }
  })

  it('decodeMsgType returns fallback for unknown types', () => {
    const result = decodeMsgType('/some.unknown.v1.MsgDoSomething')
    expect(result.name).toBe('MsgDoSomething')
    expect(result.category).toBe('unknown')
  })

  it('CATEGORIES contains all 11 categories', () => {
    expect(CATEGORIES).toHaveLength(11)
    expect(CATEGORIES).toContain('bank')
    expect(CATEGORIES).toContain('staking')
    expect(CATEGORIES).toContain('governance')
    expect(CATEGORIES).toContain('wasm')
    expect(CATEGORIES).toContain('ibc')
    expect(CATEGORIES).toContain('agent')
    expect(CATEGORIES).toContain('privacy')
    expect(CATEGORIES).toContain('marketplace')
    expect(CATEGORIES).toContain('model')
    expect(CATEGORIES).toContain('messaging')
    expect(CATEGORIES).toContain('reputation')
  })

  it('summarizeMessage for MsgSend shows amount and recipient', () => {
    const msg: DecodedMessage = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      typeName: 'Transfer',
      category: 'bank',
      summary: '',
      fields: {
        from_address: 'claw1senderfulladdress',
        to_address: 'claw1receiverfulladdress',
        amount: [{ denom: 'uclaw', amount: '5000000' }],
      },
    }
    const summary = summarizeMessage(msg)
    expect(summary).toContain('5 CLAW')
    expect(summary).toContain('claw1recei')
  })

  it('summarizeMessage for MsgDelegate shows validator', () => {
    const msg: DecodedMessage = {
      typeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
      typeName: 'Delegate',
      category: 'staking',
      summary: '',
      fields: {
        delegator_address: 'claw1delegator',
        validator_address: 'clawvaloper1validatorfull',
        amount: { denom: 'uclaw', amount: '10000000' },
      },
    }
    const summary = summarizeMessage(msg)
    expect(summary).toContain('10 CLAW')
    expect(summary).toContain('clawvalope')
  })

  it('MSG_TYPE_MAP has correct category assignments', () => {
    // Spot-check categories
    expect(MSG_TYPE_MAP['/cosmos.bank.v1beta1.MsgSend'].category).toBe('bank')
    expect(
      MSG_TYPE_MAP['/cosmos.staking.v1beta1.MsgDelegate'].category,
    ).toBe('staking')
    expect(MSG_TYPE_MAP['/cosmos.gov.v1beta1.MsgVote'].category).toBe(
      'governance',
    )
    expect(
      MSG_TYPE_MAP['/cosmwasm.wasm.v1.MsgExecuteContract'].category,
    ).toBe('wasm')
    expect(
      MSG_TYPE_MAP['/ibc.applications.transfer.v1.MsgTransfer'].category,
    ).toBe('ibc')
    expect(
      MSG_TYPE_MAP['/clawchain.agent.v1.MsgRegisterAgent'].category,
    ).toBe('agent')
    expect(MSG_TYPE_MAP['/clawchain.privacy.v1.MsgShield'].category).toBe(
      'privacy',
    )
    expect(
      MSG_TYPE_MAP['/clawchain.marketplace.v1.MsgListSkill'].category,
    ).toBe('marketplace')
    expect(
      MSG_TYPE_MAP['/clawchain.modelregistry.v1.MsgRegisterModel'].category,
    ).toBe('model')
    expect(
      MSG_TYPE_MAP['/clawchain.messaging.v1.MsgSendMessage'].category,
    ).toBe('messaging')
    expect(
      MSG_TYPE_MAP['/clawchain.reputation.v1.MsgRateAgent'].category,
    ).toBe('reputation')
  })

  it('decodeMessages handles empty tx', () => {
    expect(decodeMessages(null)).toEqual([])
    expect(decodeMessages(undefined)).toEqual([])
    expect(decodeMessages({})).toEqual([])
    expect(decodeMessages({ body: {} })).toEqual([])
    expect(decodeMessages({ body: { messages: [] } })).toEqual([])
  })

  it('decodeMessages produces correct DecodedMessage objects', () => {
    const tx = {
      body: {
        messages: [
          {
            '@type': '/clawchain.agent.v1.MsgRegisterAgent',
            sender: 'claw1sender',
            name: 'my-agent',
          },
          {
            '@type': '/cosmos.bank.v1beta1.MsgSend',
            from_address: 'claw1a',
            to_address: 'claw1b',
            amount: [{ denom: 'uclaw', amount: '100' }],
          },
        ],
      },
    }

    const msgs = decodeMessages(tx)
    expect(msgs).toHaveLength(2)

    expect(msgs[0].typeUrl).toBe('/clawchain.agent.v1.MsgRegisterAgent')
    expect(msgs[0].typeName).toBe('Register Agent')
    expect(msgs[0].category).toBe('agent')
    expect(msgs[0].fields.name).toBe('my-agent')
    expect(msgs[0].summary).toContain('my-agent')

    expect(msgs[1].typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend')
    expect(msgs[1].typeName).toBe('Transfer')
    expect(msgs[1].category).toBe('bank')
  })
})

// ---------------------------------------------------------------------------
// Formatter tests
// ---------------------------------------------------------------------------

describe('formatter', () => {
  it('formatAddress shortens correctly', () => {
    const addr = 'claw1abcdefghijklmnopqrstuvwxyz'
    const short = formatAddress(addr)
    expect(short).toBe('claw1abc...stuvwxyz')
    expect(short.length).toBeLessThan(addr.length)
  })

  it('formatAddress returns full address when short enough', () => {
    expect(formatAddress('claw1abc')).toBe('claw1abc')
  })

  it('formatAddress handles custom chars parameter', () => {
    const addr = 'claw1abcdefghijklmnopqrstuvwxyz'
    const short = formatAddress(addr, 4)
    expect(short).toBe('claw...wxyz')
  })

  it('formatAmount converts uclaw to CLAW', () => {
    const result = formatAmount('1500000', 'uclaw')
    expect(result).toBe('1.5 CLAW')
  })

  it('formatAmount handles large amounts', () => {
    const result = formatAmount('1234567890', 'uclaw')
    expect(result).toContain('1,234')
    expect(result).toContain('CLAW')
  })

  it('formatAmount passes through non-micro denoms', () => {
    const result = formatAmount('500', 'atom')
    expect(result).toBe('500 atom')
  })

  it('formatTimestamp formats correctly', () => {
    const result = formatTimestamp('2026-03-09T14:30:15Z')
    expect(result).toBe('2026-03-09 14:30:15 UTC')
  })

  it('formatGas shows percentage', () => {
    const result = formatGas(123456, 200000)
    expect(result).toContain('123,456')
    expect(result).toContain('200,000')
    expect(result).toContain('61.7%')
  })

  it('formatGas handles zero wanted', () => {
    const result = formatGas(0, 0)
    expect(result).toContain('0%')
  })

  it('formatBlock includes all fields', () => {
    const block: CosmosBlock = {
      height: 12345,
      time: '2026-03-09T14:00:00Z',
      hash: 'ABCDEF1234567890',
      proposer: 'clawvalcons1proposer',
      numTxs: 5,
      chainId: 'clawchain-1',
    }
    const output = formatBlock(block)
    expect(output).toContain('12,345')
    expect(output).toContain('clawchain-1')
    expect(output).toContain('ABCDEF1234567890')
    expect(output).toContain('2026-03-09')
    expect(output).toContain('5')
  })

  it('formatTx includes messages and gas', () => {
    const tx: CosmosTx = {
      hash: 'TX123',
      height: 100,
      messages: [
        {
          typeUrl: '/cosmos.bank.v1beta1.MsgSend',
          typeName: 'Transfer',
          category: 'bank',
          summary: 'Transfer 1 CLAW to claw1rec...',
          fields: {},
        },
      ],
      gasUsed: 80000,
      gasWanted: 100000,
      fee: { amount: '5000', denom: 'uclaw' },
      success: true,
      rawLog: '',
      memo: 'hello',
    }
    const output = formatTx(tx)
    expect(output).toContain('TX123')
    expect(output).toContain('Success')
    expect(output).toContain('80,000')
    expect(output).toContain('Transfer')
    expect(output).toContain('hello')
  })

  it('formatAgent includes capabilities', () => {
    const output = formatAgent({
      address: 'claw1agentfulladdress',
      name: 'TestBot',
      status: 'active',
      capabilities: ['inference', 'search'],
      reputationScore: 95,
      tasksCompleted: 42,
    })
    expect(output).toContain('TestBot')
    expect(output).toContain('active')
    expect(output).toContain('95')
    expect(output).toContain('42')
    expect(output).toContain('inference, search')
  })
})
