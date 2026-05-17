/**
 * Cosmos SDK and ClawChain-specific read actions.
 *
 * Each action takes a {@link CosmosRestTransport} (from `./transport.ts`)
 * and returns strongly-typed data from the appropriate LCD endpoint.
 */

import type { CosmosRestTransport } from './transport.js'

// ---------------------------------------------------------------------------
// Cosmos SDK types
// ---------------------------------------------------------------------------

export type CosmosBlock = {
  height: number
  time: string
  hash: string
  proposer: string
  numTxs: number
}

export type CosmosValidator = {
  address: string
  moniker: string
  tokens: string
  commission: string
  status: string
}

export type CosmosDelegation = {
  validator: string
  shares: string
  balance: { denom: string; amount: string }
}

export type CosmosProposal = {
  id: string
  title: string
  status: string
  votingEnd: string
}

// ---------------------------------------------------------------------------
// ClawChain-specific types
// ---------------------------------------------------------------------------

export type ClawAgent = {
  address: string
  name: string
  status: string
  capabilities: string[]
  reputation: number
}

export type ClawSkill = {
  id: string
  name: string
  owner: string
  price: string
  category: string
}

export type ClawComputeJob = {
  id: string
  provider: string
  status: string
  cost: string
}

// ---------------------------------------------------------------------------
// Cosmos SDK read actions
// ---------------------------------------------------------------------------

/**
 * Fetches the balance of a single denom for the given address.
 * Defaults to `uclaw` when no denom is specified.
 */
export async function getCosmosBalance(
  transport: CosmosRestTransport,
  address: string,
  denom = 'uclaw',
): Promise<{ amount: string; denom: string }> {
  const data = await transport.get<{
    balance: { denom: string; amount: string }
  }>(`/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`)

  return data.balance
}

/**
 * Fetches block info at a given height, or the latest block when height is
 * omitted.
 */
export async function getCosmosBlock(
  transport: CosmosRestTransport,
  height?: number,
): Promise<CosmosBlock> {
  const path =
    height !== undefined
      ? `/cosmos/base/tendermint/v1beta1/blocks/${height}`
      : '/cosmos/base/tendermint/v1beta1/blocks/latest'

  const data = await transport.get<{
    block_id: { hash: string }
    block: {
      header: {
        height: string
        time: string
        proposer_address: string
      }
      data: { txs: string[] }
    }
  }>(path)

  return {
    height: Number(data.block.header.height),
    time: data.block.header.time,
    hash: data.block_id.hash,
    proposer: data.block.header.proposer_address,
    numTxs: data.block.data.txs?.length ?? 0,
  }
}

/**
 * Returns the current active validator set.
 */
export async function getCosmosValidators(
  transport: CosmosRestTransport,
): Promise<CosmosValidator[]> {
  const data = await transport.get<{
    validators: Array<{
      operator_address: string
      description: { moniker: string }
      tokens: string
      commission: { commission_rates: { rate: string } }
      status: string
    }>
  }>('/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED')

  return data.validators.map((v) => ({
    address: v.operator_address,
    moniker: v.description.moniker,
    tokens: v.tokens,
    commission: v.commission.commission_rates.rate,
    status: v.status,
  }))
}

/**
 * Returns delegations for a given delegator address.
 */
export async function getCosmosStakingDelegations(
  transport: CosmosRestTransport,
  delegator: string,
): Promise<CosmosDelegation[]> {
  const data = await transport.get<{
    delegation_responses: Array<{
      delegation: { validator_address: string; shares: string }
      balance: { denom: string; amount: string }
    }>
  }>(`/cosmos/staking/v1beta1/delegations/${delegator}`)

  return data.delegation_responses.map((d) => ({
    validator: d.delegation.validator_address,
    shares: d.delegation.shares,
    balance: d.balance,
  }))
}

/**
 * Returns governance proposals.
 */
export async function getCosmosProposals(
  transport: CosmosRestTransport,
): Promise<CosmosProposal[]> {
  const data = await transport.get<{
    proposals: Array<{
      id: string
      title: string
      status: string
      voting_end_time: string
    }>
  }>('/cosmos/gov/v1/proposals')

  return data.proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    votingEnd: p.voting_end_time,
  }))
}

// ---------------------------------------------------------------------------
// ClawChain-specific read actions
// ---------------------------------------------------------------------------

/**
 * Returns all registered agents on ClawChain.
 */
export async function getAgents(
  transport: CosmosRestTransport,
): Promise<ClawAgent[]> {
  const data = await transport.get<{
    agents: Array<{
      address: string
      name: string
      status: string
      capabilities: string[]
      reputation: number
    }>
  }>('/clawchain/agent/v1/agents')

  return data.agents
}

/**
 * Returns a single agent by address, or `null` if not found.
 */
export async function getAgent(
  transport: CosmosRestTransport,
  address: string,
): Promise<ClawAgent | null> {
  try {
    const data = await transport.get<{
      agent: {
        address: string
        name: string
        status: string
        capabilities: string[]
        reputation: number
      }
    }>(`/clawchain/agent/v1/agent/${address}`)

    return data.agent
  } catch {
    return null
  }
}

/**
 * Returns all registered skills on ClawChain.
 */
export async function getSkills(
  transport: CosmosRestTransport,
): Promise<ClawSkill[]> {
  const data = await transport.get<{
    skills: Array<{
      id: string
      name: string
      owner: string
      price: string
      category: string
    }>
  }>('/clawchain/agent/v1/skills')

  return data.skills
}

/**
 * Returns compute jobs for the given address.
 */
export async function getComputeJobs(
  transport: CosmosRestTransport,
  address: string,
): Promise<ClawComputeJob[]> {
  const data = await transport.get<{
    jobs: Array<{
      id: string
      provider: string
      status: string
      cost: string
    }>
  }>(`/clawchain/marketplace/v1/compute_jobs/${address}`)

  return data.jobs
}

// ---------------------------------------------------------------------------
// CosmWasm actions
// ---------------------------------------------------------------------------

/**
 * Queries a CosmWasm smart contract. The `query` object is base64-encoded
 * before being sent to the LCD endpoint.
 */
export async function queryContract<T = unknown>(
  transport: CosmosRestTransport,
  contract: string,
  query: Record<string, unknown>,
): Promise<T> {
  const encoded = btoa(JSON.stringify(query))

  const data = await transport.get<{ data: T }>(
    `/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`,
  )

  return data.data
}
