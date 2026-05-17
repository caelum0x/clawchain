/**
 * Output formatting utilities for the Cosmos/ClawChain inspector.
 * Converts raw chain data into human-readable display strings.
 */

import type { ClawAgent, CosmosAccount, CosmosBlock, CosmosTx } from './client'

const numberIntl = new Intl.NumberFormat('en-US')

export function formatAddress(address: string, chars = 8): string {
  if (!address) return ''
  if (address.length <= chars * 2) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function formatAmount(amount: string, denom: string): string {
  if (denom === 'uclaw') {
    const claw = Number(amount) / 1_000_000
    return `${numberIntl.format(claw)} CLAW`
  }
  if (denom.startsWith('u')) {
    const base = denom.slice(1).toUpperCase()
    const value = Number(amount) / 1_000_000
    return `${numberIntl.format(value)} ${base}`
  }
  return `${numberIntl.format(Number(amount))} ${denom}`
}

export function formatTimestamp(isoTime: string): string {
  if (!isoTime) return ''
  const date = new Date(isoTime)
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`,
  ].join(' ')
}

export function formatGas(used: number, wanted: number): string {
  if (wanted === 0) return `${numberIntl.format(used)} / 0 (0%)`
  const pct = ((used / wanted) * 100).toFixed(1)
  return `${numberIntl.format(used)} / ${numberIntl.format(wanted)} (${pct}%)`
}

export function formatBlock(block: CosmosBlock): string {
  const lines = [
    `Block #${numberIntl.format(block.height)}`,
    `Chain:       ${block.chainId}`,
    `Time:        ${formatTimestamp(block.time)}`,
    `Hash:        ${block.hash}`,
    `Proposer:    ${formatAddress(block.proposer)}`,
    `Transactions: ${block.numTxs}`,
  ]
  return lines.join('\n')
}

export function formatTx(tx: CosmosTx): string {
  const status = tx.success ? 'Success' : 'Failed'
  const lines = [
    `Tx ${tx.hash}`,
    `Height:   ${numberIntl.format(tx.height)}`,
    `Status:   ${status}`,
    `Gas:      ${formatGas(tx.gasUsed, tx.gasWanted)}`,
    `Fee:      ${formatAmount(tx.fee.amount, tx.fee.denom)}`,
    tx.memo ? `Memo:     ${tx.memo}` : null,
    `Messages: ${tx.messages.length}`,
    ...tx.messages.map(
      (m, i) => `  [${i + 1}] ${m.typeName} - ${m.summary}`,
    ),
  ]
  return lines.filter(Boolean).join('\n')
}

export function formatAccount(account: CosmosAccount): string {
  const lines = [
    `Account ${account.address}`,
    `Account #: ${account.accountNumber}`,
    `Sequence:  ${account.sequence}`,
    'Balances:',
    ...account.balances.map(
      (b) => `  ${formatAmount(b.amount, b.denom)}`,
    ),
  ]
  if (account.delegations.length > 0) {
    lines.push('Delegations:')
    for (const d of account.delegations) {
      lines.push(
        `  ${formatAddress(d.validator)} - ${formatAmount(d.amount, 'uclaw')}`,
      )
    }
  }
  return lines.join('\n')
}

export function formatAgent(agent: ClawAgent): string {
  const lines = [
    `Agent: ${agent.name || formatAddress(agent.address)}`,
    `Address:    ${agent.address}`,
    `Status:     ${agent.status}`,
    `Reputation: ${agent.reputationScore}`,
    `Tasks Done: ${agent.tasksCompleted}`,
  ]
  if (agent.capabilities.length > 0) {
    lines.push(`Capabilities: ${agent.capabilities.join(', ')}`)
  }
  return lines.join('\n')
}
