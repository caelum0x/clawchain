import { useState, useEffect, useCallback } from 'react'

import { clawchainApi } from '../chains/clawchain.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BalanceResult = {
  balance: string | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

type SendResult = {
  send: (
    to: string,
    amount: string,
    denom?: string,
    memo?: string,
  ) => Promise<{ txHash: string }>
  isLoading: boolean
  error: Error | null
}

type StakingResult = {
  delegations: DelegationEntry[]
  rewards: string
  isLoading: boolean
}

type DelegationEntry = {
  validatorAddress: string
  shares: string
  balance: { denom: string; amount: string }
}

type CosmWasmQueryResult<T> = {
  data: T | null
  isLoading: boolean
  error: Error | null
}

type CosmWasmExecuteResult = {
  execute: (
    contract: string,
    msg: Record<string, unknown>,
    funds?: { denom: string; amount: string }[],
  ) => Promise<{ txHash: string }>
  isLoading: boolean
  error: Error | null
}

type AgentEntry = {
  address: string
  moniker: string
  model: string
  status: string
}

type AgentsResult = {
  agents: AgentEntry[]
  isLoading: boolean
  error: Error | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_DENOM = 'uclaw'

function apiBase(testnet = false): string {
  return testnet ? clawchainApi.testnet : clawchainApi.mainnet
}

async function cosmosGet<T>(path: string, testnet = false): Promise<T> {
  const res = await fetch(`${apiBase(testnet)}${path}`)
  if (!res.ok) {
    throw new Error(`ClawChain API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// useCosmosBalance
// ---------------------------------------------------------------------------

/**
 * Fetches the balance of a Cosmos account for a given denom.
 *
 * Queries `GET /cosmos/bank/v1beta1/balances/{address}/by_denom?denom={denom}`.
 */
export function useCosmosBalance(
  address: string,
  denom: string = DEFAULT_DENOM,
): BalanceResult {
  const [balance, setBalance] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!address) {
      setBalance(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    cosmosGet<{ balance: { denom: string; amount: string } }>(
      `/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`,
    )
      .then((res) => {
        if (!cancelled) {
          setBalance(res.balance.amount)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [address, denom, tick])

  return { balance, isLoading, error, refetch }
}

// ---------------------------------------------------------------------------
// useCosmosSend
// ---------------------------------------------------------------------------

/**
 * Sends tokens from the connected Keplr wallet to a recipient.
 *
 * Constructs a `MsgSend` and signs it via `window.keplr.getOfflineSigner`.
 * The signed transaction is broadcast through the ClawChain REST API
 * (`POST /cosmos/tx/v1beta1/txs`).
 */
export function useCosmosSend(): SendResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const send = useCallback(
    async (
      to: string,
      amount: string,
      denom: string = DEFAULT_DENOM,
      memo = '',
    ): Promise<{ txHash: string }> => {
      setIsLoading(true)
      setError(null)

      try {
        const keplr = (window as unknown as { keplr?: Record<string, any> })
          .keplr
        if (!keplr) throw new Error('Keplr wallet not available')

        const chainId = 'clawchain-1'
        await (keplr.enable as (id: string) => Promise<void>)(chainId)
        const signer = (
          keplr.getOfflineSigner as (
            id: string,
          ) => { getAccounts: () => Promise<{ address: string }[]> }
        )(chainId)
        const accounts = await signer.getAccounts()
        const sender = accounts[0]!.address

        const msg = {
          '@type': '/cosmos.bank.v1beta1.MsgSend',
          from_address: sender,
          to_address: to,
          amount: [{ denom, amount }],
        }

        const res = await fetch(`${apiBase()}/cosmos/tx/v1beta1/txs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tx_bytes: btoa(JSON.stringify({ body: { messages: [msg], memo } })),
            mode: 'BROADCAST_MODE_SYNC',
          }),
        })

        if (!res.ok) throw new Error(`Broadcast failed: ${res.statusText}`)

        const data = (await res.json()) as {
          tx_response: { txhash: string }
        }
        return { txHash: data.tx_response.txhash }
      } catch (err: unknown) {
        const wrapped = err instanceof Error ? err : new Error(String(err))
        setError(wrapped)
        throw wrapped
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return { send, isLoading, error }
}

// ---------------------------------------------------------------------------
// useCosmosStaking
// ---------------------------------------------------------------------------

/**
 * Queries delegations and outstanding staking rewards for an address.
 */
export function useCosmosStaking(address: string): StakingResult {
  const [delegations, setDelegations] = useState<DelegationEntry[]>([])
  const [rewards, setRewards] = useState<string>('0')
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!address) {
      setDelegations([])
      setRewards('0')
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    Promise.all([
      cosmosGet<{
        delegation_responses: {
          delegation: { validator_address: string; shares: string }
          balance: { denom: string; amount: string }
        }[]
      }>(`/cosmos/staking/v1beta1/delegations/${address}`),
      cosmosGet<{ total: { denom: string; amount: string }[] }>(
        `/cosmos/distribution/v1beta1/delegators/${address}/rewards`,
      ),
    ])
      .then(([delRes, rewRes]) => {
        if (cancelled) return
        setDelegations(
          delRes.delegation_responses.map((d) => ({
            validatorAddress: d.delegation.validator_address,
            shares: d.delegation.shares,
            balance: d.balance,
          })),
        )
        const totalReward =
          rewRes.total.find((t) => t.denom === DEFAULT_DENOM)?.amount ?? '0'
        setRewards(totalReward)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setDelegations([])
          setRewards('0')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [address])

  return { delegations, rewards, isLoading }
}

// ---------------------------------------------------------------------------
// useCosmWasmQuery
// ---------------------------------------------------------------------------

/**
 * Queries a CosmWasm smart contract using the REST API.
 *
 * The query message is base64-encoded and sent to
 * `GET /cosmwasm/wasm/v1/contract/{contract}/smart/{encodedQuery}`.
 */
export function useCosmWasmQuery<T = unknown>(
  contract: string,
  query: Record<string, unknown>,
): CosmWasmQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  // Serialize the query object to a stable string for the dependency array.
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    if (!contract) {
      setData(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const encoded = btoa(queryKey)

    cosmosGet<{ data: T }>(
      `/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`,
    )
      .then((res) => {
        if (!cancelled) {
          setData(res.data)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [contract, queryKey])

  return { data, isLoading, error }
}

// ---------------------------------------------------------------------------
// useCosmWasmExecute
// ---------------------------------------------------------------------------

/**
 * Executes a CosmWasm smart contract message via the connected Keplr wallet.
 */
export function useCosmWasmExecute(): CosmWasmExecuteResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(
    async (
      contract: string,
      msg: Record<string, unknown>,
      funds: { denom: string; amount: string }[] = [],
    ): Promise<{ txHash: string }> => {
      setIsLoading(true)
      setError(null)

      try {
        const keplr = (window as unknown as { keplr?: Record<string, any> })
          .keplr
        if (!keplr) throw new Error('Keplr wallet not available')

        const chainId = 'clawchain-1'
        await (keplr.enable as (id: string) => Promise<void>)(chainId)
        const signer = (
          keplr.getOfflineSigner as (
            id: string,
          ) => { getAccounts: () => Promise<{ address: string }[]> }
        )(chainId)
        const accounts = await signer.getAccounts()
        const sender = accounts[0]!.address

        const executeMsg = {
          '@type': '/cosmwasm.wasm.v1.MsgExecuteContract',
          sender,
          contract,
          msg: btoa(JSON.stringify(msg)),
          funds,
        }

        const res = await fetch(`${apiBase()}/cosmos/tx/v1beta1/txs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tx_bytes: btoa(
              JSON.stringify({ body: { messages: [executeMsg], memo: '' } }),
            ),
            mode: 'BROADCAST_MODE_SYNC',
          }),
        })

        if (!res.ok) throw new Error(`Broadcast failed: ${res.statusText}`)

        const data = (await res.json()) as {
          tx_response: { txhash: string }
        }
        return { txHash: data.tx_response.txhash }
      } catch (err: unknown) {
        const wrapped = err instanceof Error ? err : new Error(String(err))
        setError(wrapped)
        throw wrapped
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return { execute, isLoading, error }
}

// ---------------------------------------------------------------------------
// useClawChainAgents
// ---------------------------------------------------------------------------

/**
 * Lists registered AI agents from the ClawChain agent module.
 *
 * Queries `GET /clawchain/agent/v1/agents`.
 */
export function useClawChainAgents(): AgentsResult {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    cosmosGet<{
      agents: {
        address: string
        moniker: string
        model: string
        status: string
      }[]
    }>('/clawchain/agent/v1/agents')
      .then((res) => {
        if (!cancelled) {
          setAgents(res.agents)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setAgents([])
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { agents, isLoading, error }
}
