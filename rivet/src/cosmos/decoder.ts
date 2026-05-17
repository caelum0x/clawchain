/**
 * Decodes Cosmos SDK transaction messages into human-readable format.
 * Maps typeUrls to friendly names and extracts key fields.
 */

export type DecodedMessage = {
  typeUrl: string
  typeName: string
  category: string
  summary: string
  fields: Record<string, unknown>
}

export const CATEGORIES = [
  'bank',
  'staking',
  'governance',
  'wasm',
  'ibc',
  'agent',
  'privacy',
  'marketplace',
  'model',
  'messaging',
  'reputation',
] as const
export type Category = (typeof CATEGORIES)[number]

export const MSG_TYPE_MAP: Record<
  string,
  { name: string; category: string }
> = {
  '/cosmos.bank.v1beta1.MsgSend': { name: 'Transfer', category: 'bank' },
  '/cosmos.staking.v1beta1.MsgDelegate': {
    name: 'Delegate',
    category: 'staking',
  },
  '/cosmos.staking.v1beta1.MsgUndelegate': {
    name: 'Undelegate',
    category: 'staking',
  },
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': {
    name: 'Redelegate',
    category: 'staking',
  },
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': {
    name: 'Claim Rewards',
    category: 'staking',
  },
  '/cosmos.gov.v1beta1.MsgVote': { name: 'Vote', category: 'governance' },
  '/cosmos.gov.v1beta1.MsgSubmitProposal': {
    name: 'Submit Proposal',
    category: 'governance',
  },
  '/cosmos.gov.v1beta1.MsgDeposit': {
    name: 'Deposit',
    category: 'governance',
  },
  '/cosmwasm.wasm.v1.MsgExecuteContract': {
    name: 'Execute Contract',
    category: 'wasm',
  },
  '/cosmwasm.wasm.v1.MsgInstantiateContract': {
    name: 'Instantiate Contract',
    category: 'wasm',
  },
  '/cosmwasm.wasm.v1.MsgStoreCode': {
    name: 'Upload Code',
    category: 'wasm',
  },
  '/cosmwasm.wasm.v1.MsgMigrateContract': {
    name: 'Migrate Contract',
    category: 'wasm',
  },
  '/ibc.applications.transfer.v1.MsgTransfer': {
    name: 'IBC Transfer',
    category: 'ibc',
  },
  '/ibc.core.channel.v1.MsgRecvPacket': {
    name: 'IBC Receive',
    category: 'ibc',
  },
  '/ibc.core.channel.v1.MsgAcknowledgement': {
    name: 'IBC Ack',
    category: 'ibc',
  },
  '/clawchain.agent.v1.MsgRegisterAgent': {
    name: 'Register Agent',
    category: 'agent',
  },
  '/clawchain.agent.v1.MsgAgentAction': {
    name: 'Agent Action',
    category: 'agent',
  },
  '/clawchain.agent.v1.MsgDelegateTask': {
    name: 'Delegate Task',
    category: 'agent',
  },
  '/clawchain.agent.v1.MsgCompleteTask': {
    name: 'Complete Task',
    category: 'agent',
  },
  '/clawchain.agent.v1.MsgAgentHeartbeat': {
    name: 'Heartbeat',
    category: 'agent',
  },
  '/clawchain.agent.v1.MsgAcceptTask': {
    name: 'Accept Task',
    category: 'agent',
  },
  '/clawchain.agent.v1.MsgSubmitIntent': {
    name: 'Submit Intent',
    category: 'agent',
  },
  '/clawchain.privacy.v1.MsgShield': {
    name: 'Shield',
    category: 'privacy',
  },
  '/clawchain.privacy.v1.MsgUnshield': {
    name: 'Unshield',
    category: 'privacy',
  },
  '/clawchain.privacy.v1.MsgPrivateTransfer': {
    name: 'Private Transfer',
    category: 'privacy',
  },
  '/clawchain.marketplace.v1.MsgListSkill': {
    name: 'List Skill',
    category: 'marketplace',
  },
  '/clawchain.marketplace.v1.MsgPurchaseSkill': {
    name: 'Purchase Skill',
    category: 'marketplace',
  },
  '/clawchain.marketplace.v1.MsgCreateEscrow': {
    name: 'Create Escrow',
    category: 'marketplace',
  },
  '/clawchain.marketplace.v1.MsgReleaseEscrow': {
    name: 'Release Escrow',
    category: 'marketplace',
  },
  '/clawchain.marketplace.v1.MsgDelistSkill': {
    name: 'Delist Skill',
    category: 'marketplace',
  },
  '/clawchain.modelregistry.v1.MsgRegisterModel': {
    name: 'Register Model',
    category: 'model',
  },
  '/clawchain.messaging.v1.MsgSendMessage': {
    name: 'Send Message',
    category: 'messaging',
  },
  '/clawchain.reputation.v1.MsgRateAgent': {
    name: 'Rate Agent',
    category: 'reputation',
  },
  '/clawchain.reputation.v1.MsgEndorseAgent': {
    name: 'Endorse Agent',
    category: 'reputation',
  },
  '/clawchain.governance.v1.MsgSubmitProposal': {
    name: 'Submit Chain Proposal',
    category: 'governance',
  },
  '/clawchain.governance.v1.MsgVote': {
    name: 'Chain Vote',
    category: 'governance',
  },
}

export function decodeMsgType(typeUrl: string): {
  name: string
  category: string
} {
  return (
    MSG_TYPE_MAP[typeUrl] ?? {
      name: typeUrl.split('.').pop() ?? typeUrl,
      category: 'unknown',
    }
  )
}

export function decodeMessages(txData: any): DecodedMessage[] {
  if (!txData) return []
  const body = txData.body ?? {}
  const rawMessages = body.messages ?? []

  return rawMessages.map((raw: any) => {
    const typeUrl: string = raw['@type'] ?? raw.type_url ?? ''
    const { name, category } = decodeMsgType(typeUrl)
    const fields: Record<string, unknown> = { ...raw }
    delete fields['@type']
    delete fields.type_url

    const summary = summarizeMessage({
      typeUrl,
      typeName: name,
      category,
      summary: '',
      fields,
    })

    return { typeUrl, typeName: name, category, summary, fields }
  })
}

export function summarizeMessage(msg: DecodedMessage): string {
  const { typeUrl, fields } = msg

  if (typeUrl === '/cosmos.bank.v1beta1.MsgSend') {
    const amounts = (fields.amount as any[]) ?? []
    const first = amounts[0]
    const amountStr = first
      ? formatCoinShort(first.amount, first.denom)
      : '0'
    const to = truncateAddr(fields.to_address as string)
    return `Transfer ${amountStr} to ${to}`
  }

  if (typeUrl === '/cosmos.staking.v1beta1.MsgDelegate') {
    const coin = fields.amount as any
    const amountStr = coin
      ? formatCoinShort(coin.amount, coin.denom)
      : '0'
    const validator = truncateAddr(
      fields.validator_address as string,
    )
    return `Delegate ${amountStr} to ${validator}`
  }

  if (typeUrl === '/cosmos.staking.v1beta1.MsgUndelegate') {
    const coin = fields.amount as any
    const amountStr = coin
      ? formatCoinShort(coin.amount, coin.denom)
      : '0'
    const validator = truncateAddr(
      fields.validator_address as string,
    )
    return `Undelegate ${amountStr} from ${validator}`
  }

  if (typeUrl === '/cosmwasm.wasm.v1.MsgExecuteContract') {
    const contract = truncateAddr(fields.contract as string)
    return `Execute contract ${contract}`
  }

  if (typeUrl === '/ibc.applications.transfer.v1.MsgTransfer') {
    const token = fields.token as any
    const amountStr = token
      ? formatCoinShort(token.amount, token.denom)
      : '0'
    const channel = fields.source_channel as string
    return `IBC Transfer ${amountStr} via ${channel ?? 'unknown'}`
  }

  if (typeUrl === '/clawchain.agent.v1.MsgRegisterAgent') {
    const name = (fields.name as string) ?? 'agent'
    return `Register agent "${name}"`
  }

  if (typeUrl === '/clawchain.agent.v1.MsgDelegateTask') {
    const taskId = (fields.task_id as string) ?? ''
    return `Delegate task ${taskId}`
  }

  if (typeUrl === '/clawchain.privacy.v1.MsgShield') {
    const coin = fields.amount as any
    const amountStr = coin
      ? formatCoinShort(coin.amount, coin.denom)
      : '0'
    return `Shield ${amountStr}`
  }

  if (typeUrl === '/clawchain.privacy.v1.MsgUnshield') {
    const coin = fields.amount as any
    const amountStr = coin
      ? formatCoinShort(coin.amount, coin.denom)
      : '0'
    return `Unshield ${amountStr}`
  }

  return msg.typeName
}

function truncateAddr(addr: string | undefined): string {
  if (!addr) return 'unknown'
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`
}

function formatCoinShort(amount: string, denom: string): string {
  if (denom === 'uclaw') {
    const claw = Number(amount) / 1_000_000
    return `${claw} CLAW`
  }
  return `${amount} ${denom}`
}
