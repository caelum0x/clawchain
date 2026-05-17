/**
 * CometBFT + Cosmos SDK REST client for Rivet inspector.
 * Provides all the chain queries needed for block/tx/account/contract inspection.
 */

import { type DecodedMessage, decodeMessages } from './decoder'

export type CosmosClientConfig = {
  rpcUrl: string
  restUrl: string
  chainId?: string
  timeout?: number
}

export type CosmosBlock = {
  height: number
  time: string
  hash: string
  proposer: string
  numTxs: number
  chainId: string
}

export type CosmosTx = {
  hash: string
  height: number
  messages: DecodedMessage[]
  gasUsed: number
  gasWanted: number
  fee: { amount: string; denom: string }
  success: boolean
  rawLog: string
  memo: string
}

export type CosmosAccount = {
  address: string
  balances: { denom: string; amount: string }[]
  accountNumber: number
  sequence: number
  delegations: { validator: string; amount: string }[]
}

export type CosmosContract = {
  address: string
  codeId: number
  creator: string
  admin: string
  label: string
  ibcPortId: string
}

export type ClawAgent = {
  address: string
  name: string
  status: string
  capabilities: string[]
  reputationScore: number
  tasksCompleted: number
}

export class CosmosClient {
  private config: CosmosClientConfig

  constructor(config: CosmosClientConfig) {
    this.config = { timeout: 10_000, ...config }
  }

  async getBlock(height?: number): Promise<CosmosBlock> {
    const path = height != null ? `block?height=${height}` : 'block'
    const data = await this.rpcRequest<any>(path)
    const block = data.result?.block ?? data.block
    const header = block?.header ?? {}
    return {
      height: Number(header.height ?? 0),
      time: header.time ?? '',
      hash: data.result?.block_id?.hash ?? '',
      proposer: header.proposer_address ?? '',
      numTxs: block?.data?.txs?.length ?? 0,
      chainId: header.chain_id ?? '',
    }
  }

  async getLatestBlock(): Promise<CosmosBlock> {
    return this.getBlock()
  }

  async getTx(hash: string): Promise<CosmosTx> {
    const normalizedHash = hash.startsWith('0x') ? hash.slice(2) : hash
    const data = await this.restGet<any>(
      `/cosmos/tx/v1beta1/txs/${normalizedHash}`,
    )
    const txResponse = data.tx_response ?? {}
    const tx = data.tx ?? {}
    const body = tx.body ?? {}
    const authInfo = tx.auth_info ?? {}
    const feeAmounts = authInfo.fee?.amount ?? []
    const firstFee = feeAmounts[0] ?? { amount: '0', denom: 'uclaw' }

    return {
      hash: txResponse.txhash ?? hash,
      height: Number(txResponse.height ?? 0),
      messages: decodeMessages(tx),
      gasUsed: Number(txResponse.gas_used ?? 0),
      gasWanted: Number(txResponse.gas_wanted ?? 0),
      fee: { amount: firstFee.amount, denom: firstFee.denom },
      success: txResponse.code === 0 || txResponse.code === undefined,
      rawLog: txResponse.raw_log ?? '',
      memo: body.memo ?? '',
    }
  }

  async getAccount(address: string): Promise<CosmosAccount> {
    const [balData, authData, delegData] = await Promise.all([
      this.restGet<any>(`/cosmos/bank/v1beta1/balances/${address}`),
      this.restGet<any>(`/cosmos/auth/v1beta1/accounts/${address}`),
      this.restGet<any>(
        `/cosmos/staking/v1beta1/delegations/${address}`,
      ).catch(() => ({ delegation_responses: [] })),
    ])

    const account = authData.account ?? {}
    const balances = (balData.balances ?? []).map((b: any) => ({
      denom: b.denom,
      amount: b.amount,
    }))
    const delegations = (delegData.delegation_responses ?? []).map(
      (d: any) => ({
        validator: d.delegation?.validator_address ?? '',
        amount: d.balance?.amount ?? '0',
      }),
    )

    return {
      address,
      balances,
      accountNumber: Number(account.account_number ?? 0),
      sequence: Number(account.sequence ?? 0),
      delegations,
    }
  }

  async getContract(address: string): Promise<CosmosContract> {
    const data = await this.restGet<any>(
      `/cosmwasm/wasm/v1/contract/${address}`,
    )
    const info = data.contract_info ?? {}
    return {
      address,
      codeId: Number(info.code_id ?? 0),
      creator: info.creator ?? '',
      admin: info.admin ?? '',
      label: info.label ?? '',
      ibcPortId: info.ibc_port_id ?? '',
    }
  }

  async queryContract<T = unknown>(
    address: string,
    query: Record<string, unknown>,
  ): Promise<T> {
    const encoded = btoa(JSON.stringify(query))
    const data = await this.restGet<any>(
      `/cosmwasm/wasm/v1/contract/${address}/smart/${encoded}`,
    )
    return data.data as T
  }

  async getAgent(address: string): Promise<ClawAgent | null> {
    try {
      const data = await this.restGet<any>(
        `/clawchain/agent/v1/agent/${address}`,
      )
      const agent = data.agent ?? {}
      return {
        address: agent.address ?? address,
        name: agent.name ?? '',
        status: agent.status ?? 'unknown',
        capabilities: agent.capabilities ?? [],
        reputationScore: Number(agent.reputation_score ?? 0),
        tasksCompleted: Number(agent.tasks_completed ?? 0),
      }
    } catch {
      return null
    }
  }

  async getAgents(): Promise<ClawAgent[]> {
    const data = await this.restGet<any>('/clawchain/agent/v1/agents')
    return (data.agents ?? []).map((agent: any) => ({
      address: agent.address ?? '',
      name: agent.name ?? '',
      status: agent.status ?? 'unknown',
      capabilities: agent.capabilities ?? [],
      reputationScore: Number(agent.reputation_score ?? 0),
      tasksCompleted: Number(agent.tasks_completed ?? 0),
    }))
  }

  async getValidators(): Promise<
    { address: string; moniker: string; tokens: string; status: string }[]
  > {
    const data = await this.restGet<any>(
      '/cosmos/staking/v1beta1/validators',
    )
    return (data.validators ?? []).map((v: any) => ({
      address: v.operator_address ?? '',
      moniker: v.description?.moniker ?? '',
      tokens: v.tokens ?? '0',
      status: v.status ?? 'unknown',
    }))
  }

  async getProposal(id: string): Promise<{
    id: string
    title: string
    status: string
    description: string
    tally: Record<string, string>
  }> {
    const data = await this.restGet<any>(
      `/cosmos/gov/v1beta1/proposals/${id}`,
    )
    const proposal = data.proposal ?? {}
    const content = proposal.content ?? {}
    const tally = proposal.final_tally_result ?? {}
    return {
      id: proposal.proposal_id ?? id,
      title: content.title ?? '',
      status: proposal.status ?? 'unknown',
      description: content.description ?? '',
      tally: {
        yes: tally.yes ?? '0',
        abstain: tally.abstain ?? '0',
        no: tally.no ?? '0',
        noWithVeto: tally.no_with_veto ?? '0',
      },
    }
  }

  private async rpcRequest<T>(path: string): Promise<T> {
    const url = `${this.config.rpcUrl}/${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout,
    )
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status}`)
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async restGet<T>(path: string): Promise<T> {
    const url = `${this.config.restUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout,
    )
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`REST request failed: ${response.status}`)
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
