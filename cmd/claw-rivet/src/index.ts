#!/usr/bin/env node

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecodedMessage = {
  typeUrl: string;
  typeName: string;
  fields: Record<string, unknown>;
};

export type InspectResult = {
  type: string;
  id: string;
  data: Record<string, unknown>;
  decoded?: DecodedMessage[];
};

export type QueryResult = {
  module: string;
  path: string;
  data: unknown;
};

export type SimulateResult = {
  gasUsed: string;
  gasWanted: string;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
  error?: string;
};

export type WatchEvent = {
  type: "block" | "tx";
  height?: number;
  hash?: string;
  messages?: DecodedMessage[];
  events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MSG_TYPE_MAP: Record<string, string> = {
  "/cosmos.bank.v1beta1.MsgSend": "Transfer",
  "/cosmos.bank.v1beta1.MsgMultiSend": "Multi Transfer",
  "/cosmos.staking.v1beta1.MsgDelegate": "Delegate",
  "/cosmos.staking.v1beta1.MsgUndelegate": "Undelegate",
  "/cosmos.staking.v1beta1.MsgBeginRedelegate": "Redelegate",
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward": "Claim Rewards",
  "/cosmos.gov.v1beta1.MsgVote": "Governance Vote",
  "/cosmos.gov.v1beta1.MsgSubmitProposal": "Submit Proposal",
  "/cosmos.gov.v1beta1.MsgDeposit": "Governance Deposit",
  "/cosmwasm.wasm.v1.MsgExecuteContract": "Contract Execute",
  "/cosmwasm.wasm.v1.MsgInstantiateContract": "Contract Instantiate",
  "/cosmwasm.wasm.v1.MsgStoreCode": "Upload Contract",
  "/cosmwasm.wasm.v1.MsgMigrateContract": "Migrate Contract",
  "/clawchain.agent.v1.MsgRegisterAgent": "Register Agent",
  "/clawchain.agent.v1.MsgAgentAction": "Agent Action",
  "/clawchain.agent.v1.MsgDelegateTask": "Delegate Task",
  "/clawchain.agent.v1.MsgCompleteTask": "Complete Task",
  "/clawchain.agent.v1.MsgAgentHeartbeat": "Agent Heartbeat",
  "/clawchain.agent.v1.MsgAcceptTask": "Accept Task",
  "/clawchain.agent.v1.MsgDeregisterAgent": "Deregister Agent",
  "/clawchain.agent.v1.MsgSubmitIntent": "Submit Intent",
  "/clawchain.privacy.v1.MsgShield": "Shield CLAW",
  "/clawchain.privacy.v1.MsgUnshield": "Unshield CLAW",
  "/clawchain.privacy.v1.MsgPrivateTransfer": "Private Transfer",
  "/clawchain.marketplace.v1.MsgListSkill": "List Skill",
  "/clawchain.marketplace.v1.MsgPurchaseSkill": "Purchase Skill",
  "/clawchain.marketplace.v1.MsgCreateEscrow": "Create Escrow",
  "/clawchain.marketplace.v1.MsgCompleteEscrow": "Complete Escrow",
  "/clawchain.marketplace.v1.MsgDisputeEscrow": "Dispute Escrow",
  "/clawchain.reputation.v1.MsgRateAgent": "Rate Agent",
  "/clawchain.messaging.v1.MsgSendMessage": "Send Message",
  "/clawchain.governance.v1.MsgSubmitProposal": "Clawchain Proposal",
  "/ibc.core.channel.v1.MsgRecvPacket": "IBC Receive",
  "/ibc.core.channel.v1.MsgAcknowledgement": "IBC Acknowledgement",
  "/ibc.core.channel.v1.MsgTimeout": "IBC Timeout",
  "/ibc.applications.transfer.v1.MsgTransfer": "IBC Transfer",
};

export const MODULE_PATHS: Record<string, Record<string, string>> = {
  bank: {
    balances: "/cosmos/bank/v1beta1/balances/{0}",
    supply: "/cosmos/bank/v1beta1/supply",
    denom: "/cosmos/bank/v1beta1/denoms_metadata/{0}",
  },
  staking: {
    validators: "/cosmos/staking/v1beta1/validators",
    delegations: "/cosmos/staking/v1beta1/delegations/{0}",
    rewards: "/cosmos/distribution/v1beta1/delegators/{0}/rewards",
    validator: "/cosmos/staking/v1beta1/validators/{0}",
  },
  agent: {
    agents: "/clawchain/agent/v1/agents",
    agent: "/clawchain/agent/v1/agent/{0}",
    tasks: "/clawchain/agent/v1/tasks",
    task: "/clawchain/agent/v1/task/{0}",
    liveness: "/clawchain/agent/v1/agent/{0}/liveness",
  },
  privacy: {
    params: "/clawchain/privacy/v1/params",
    nullifier: "/clawchain/privacy/v1/nullifier/{0}",
    treeStats: "/clawchain/privacy/v1/tree_stats",
    rootHistory: "/clawchain/privacy/v1/root_history",
  },
  marketplace: {
    skills: "/clawchain/marketplace/v1/skills",
    skill: "/clawchain/marketplace/v1/skill/{0}",
    escrows: "/clawchain/marketplace/v1/escrows",
    escrow: "/clawchain/marketplace/v1/escrow/{0}",
  },
  governance: {
    proposals: "/clawchain/governance/v1/proposals",
    proposal: "/clawchain/governance/v1/proposal/{0}",
    votes: "/clawchain/governance/v1/proposal/{0}/votes",
  },
  wasm: {
    codes: "/cosmwasm/wasm/v1/code",
    code: "/cosmwasm/wasm/v1/code/{0}",
    contract: "/cosmwasm/wasm/v1/contract/{0}",
    contracts: "/cosmwasm/wasm/v1/code/{0}/contracts",
    contractState: "/cosmwasm/wasm/v1/contract/{0}/state",
  },
};

const DEFAULT_RPC = "http://localhost:26657";
const DEFAULT_REST = "http://localhost:1317";

const VALID_INSPECT_TYPES = ["block", "tx", "account", "contract", "agent", "proposal", "pool"];

export const WATCH_FILTERS = ["all", "transfer", "agent", "privacy", "dex", "governance"] as const;
export type WatchFilter = (typeof WATCH_FILTERS)[number];

// ---------------------------------------------------------------------------
// Decoder functions
// ---------------------------------------------------------------------------

export function decodeMsgType(typeUrl: string): string {
  return MSG_TYPE_MAP[typeUrl] ?? typeUrl;
}

export function decodeTxMessages(tx: any): DecodedMessage[] {
  const messages: DecodedMessage[] = [];
  const body = tx?.body ?? tx?.tx?.body ?? tx;
  const msgs = body?.messages ?? [];

  for (const msg of msgs) {
    const typeUrl: string = msg["@type"] ?? msg.typeUrl ?? "unknown";
    const typeName = decodeMsgType(typeUrl);
    const fields: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(msg)) {
      if (key !== "@type" && key !== "typeUrl") {
        fields[key] = value;
      }
    }

    messages.push({ typeUrl, typeName, fields });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Bech32 decode helper
// ---------------------------------------------------------------------------

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Decode(bech: string): { hrp: string; data: number[] } | null {
  const lower = bech.toLowerCase();
  const pos = lower.lastIndexOf("1");
  if (pos < 1 || pos + 7 > lower.length) return null;

  const hrp = lower.slice(0, pos);
  const dataChars = lower.slice(pos + 1);

  const data: number[] = [];
  for (const ch of dataChars) {
    const idx = BECH32_CHARSET.indexOf(ch);
    if (idx === -1) return null;
    data.push(idx);
  }

  // Strip the 6-character checksum
  const values = data.slice(0, data.length - 6);

  // Convert 5-bit groups to 8-bit bytes
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const v of values) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }

  return { hrp, data: bytes };
}

// ---------------------------------------------------------------------------
// Decode command helpers
// ---------------------------------------------------------------------------

function isHex(s: string): boolean {
  return /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;
}

function isBase64(s: string): boolean {
  if (s.length === 0) return false;
  try {
    const decoded = Buffer.from(s, "base64").toString("base64");
    // Loose check: re-encoding should produce the same (ignoring padding)
    return decoded.replace(/=+$/, "") === s.replace(/=+$/, "");
  } catch {
    return false;
  }
}

export function decodeRawData(
  input: string,
  typeHint?: string,
): { format: string; decoded: unknown } {
  const trimmed = input.trim();

  // Explicit type override
  if (typeHint === "address" || (!typeHint && trimmed.startsWith("claw1"))) {
    const result = bech32Decode(trimmed);
    if (result) {
      const hexBytes = result.data.map((b) => b.toString(16).padStart(2, "0")).join("");
      return {
        format: "bech32_address",
        decoded: {
          hrp: result.hrp,
          hex: hexBytes,
          bytes: result.data,
        },
      };
    }
  }

  if (typeHint === "tx" || typeHint === "msg") {
    try {
      const parsed = JSON.parse(trimmed);
      const messages = decodeTxMessages(parsed);
      return { format: "tx_json", decoded: { raw: parsed, messages } };
    } catch {
      // Fall through
    }
  }

  if (typeHint === "query") {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return { format: "cosmwasm_query", decoded: parsed };
    } catch {
      return { format: "raw_query", decoded: trimmed };
    }
  }

  // Auto-detect: base64
  if (!typeHint && isBase64(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return { format: "base64_json", decoded: parsed };
    } catch {
      const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      return { format: "base64_utf8", decoded };
    }
  }

  // Auto-detect: hex
  if (!typeHint && isHex(trimmed)) {
    const bytes: number[] = [];
    for (let i = 0; i < trimmed.length; i += 2) {
      bytes.push(parseInt(trimmed.slice(i, i + 2), 16));
    }
    let utf8: string | null = null;
    try {
      utf8 = Buffer.from(bytes).toString("utf-8");
    } catch {
      // ignore
    }
    return {
      format: "hex",
      decoded: { bytes, hex: trimmed, utf8 },
    };
  }

  // Auto-detect: JSON (maybe a tx or message)
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.body?.messages || parsed?.tx?.body?.messages || parsed?.messages) {
      const messages = decodeTxMessages(parsed);
      return { format: "tx_json", decoded: { raw: parsed, messages } };
    }
    return { format: "json", decoded: parsed };
  } catch {
    // Nothing matched
  }

  return { format: "unknown", decoded: trimmed };
}

// ---------------------------------------------------------------------------
// Query path builder
// ---------------------------------------------------------------------------

export function buildQueryPath(
  module: string,
  queryPath: string,
  args: string[],
): string | null {
  const modulePaths = MODULE_PATHS[module];
  if (!modulePaths) return null;

  const template = modulePaths[queryPath];
  if (!template) return null;

  let result = template;
  for (let i = 0; i < args.length; i++) {
    result = result.replace(`{${i}}`, args[i]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJSON(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
  }
  return response.json();
}

async function postJSON(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${response.statusText} — ${text}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Inspect implementations
// ---------------------------------------------------------------------------

async function inspectBlock(
  height: string,
  rpc: string,
  decode: boolean,
): Promise<InspectResult> {
  const blockResp = await fetchJSON(`${rpc}/block?height=${height}`);
  const block = blockResp.result?.block ?? blockResp.block ?? blockResp;
  const header = block.header ?? {};
  const txs = block.data?.txs ?? [];

  const data: Record<string, unknown> = {
    height: header.height,
    time: header.time,
    proposer: header.proposer_address,
    chainId: header.chain_id,
    txCount: txs.length,
    lastBlockHash: header.last_block_id?.hash ?? null,
    appHash: header.app_hash,
    consensusHash: header.consensus_hash,
    dataHash: header.data_hash,
  };

  const result: InspectResult = { type: "block", id: height, data };

  if (decode && txs.length > 0) {
    const decoded: DecodedMessage[] = [];
    for (const rawTx of txs) {
      try {
        const txBytes = Buffer.from(rawTx, "base64").toString("utf-8");
        const txParsed = JSON.parse(txBytes);
        decoded.push(...decodeTxMessages(txParsed));
      } catch {
        // Binary proto tx — cannot decode without protobuf
        decoded.push({
          typeUrl: "raw",
          typeName: "Raw Transaction (protobuf)",
          fields: { base64: rawTx.slice(0, 64) + "..." },
        });
      }
    }
    result.decoded = decoded;
  }

  return result;
}

async function inspectTx(
  hash: string,
  rpc: string,
  rest: string,
  decode: boolean,
): Promise<InspectResult> {
  // Try REST endpoint first for richer data
  let txResp: any;
  try {
    txResp = await fetchJSON(`${rest}/cosmos/tx/v1beta1/txs/${hash}`);
  } catch {
    // Fall back to RPC
    const rpcResp = await fetchJSON(`${rpc}/tx?hash=0x${hash.replace(/^0x/, "")}`);
    txResp = rpcResp.result ?? rpcResp;
  }

  const tx = txResp.tx ?? txResp;
  const txResponse = txResp.tx_response ?? {};
  const body = tx.body ?? {};
  const authInfo = tx.auth_info ?? {};

  const data: Record<string, unknown> = {
    hash: txResponse.txhash ?? hash,
    height: txResponse.height,
    code: txResponse.code ?? 0,
    gasUsed: txResponse.gas_used,
    gasWanted: txResponse.gas_wanted,
    fee: authInfo.fee,
    memo: body.memo ?? "",
    timestamp: txResponse.timestamp,
    rawLog: txResponse.raw_log,
    eventCount: (txResponse.events ?? []).length,
    events: (txResponse.events ?? []).map((e: any) => ({
      type: e.type,
      attributeCount: (e.attributes ?? []).length,
    })),
  };

  const result: InspectResult = { type: "tx", id: hash, data };

  if (decode) {
    result.decoded = decodeTxMessages(body);
  }

  return result;
}

async function inspectAccount(
  address: string,
  rest: string,
): Promise<InspectResult> {
  const [balancesResp, authResp] = await Promise.all([
    fetchJSON(`${rest}/cosmos/bank/v1beta1/balances/${address}`).catch(() => null),
    fetchJSON(`${rest}/cosmos/auth/v1beta1/accounts/${address}`).catch(() => null),
  ]);

  // Optionally fetch delegations and agent registration
  const [delegationsResp, agentResp] = await Promise.all([
    fetchJSON(`${rest}/cosmos/staking/v1beta1/delegations/${address}`).catch(() => null),
    fetchJSON(`${rest}/clawchain/agent/v1/agent/${address}`).catch(() => null),
  ]);

  const account = authResp?.account ?? {};
  const balances = balancesResp?.balances ?? [];
  const delegations = delegationsResp?.delegation_responses ?? [];

  const data: Record<string, unknown> = {
    address,
    balances,
    accountNumber: account.account_number ?? null,
    sequence: account.sequence ?? null,
    accountType: account["@type"] ?? null,
    delegationCount: delegations.length,
    delegations: delegations.map((d: any) => ({
      validator: d.delegation?.validator_address,
      shares: d.delegation?.shares,
      balance: d.balance,
    })),
    isAgent: agentResp?.agent != null,
    agent: agentResp?.agent ?? null,
  };

  return { type: "account", id: address, data };
}

async function inspectContract(
  address: string,
  rest: string,
): Promise<InspectResult> {
  const contractResp = await fetchJSON(
    `${rest}/cosmwasm/wasm/v1/contract/${address}`,
  );
  const info = contractResp.contract_info ?? contractResp;

  // Try to fetch contract state (may be large)
  let state: unknown = null;
  try {
    const stateResp = await fetchJSON(
      `${rest}/cosmwasm/wasm/v1/contract/${address}/state`,
    );
    state = stateResp.models ?? stateResp;
  } catch {
    // State query not available or too large
  }

  const data: Record<string, unknown> = {
    address,
    codeId: info.code_id,
    creator: info.creator,
    admin: info.admin ?? null,
    label: info.label,
    ibcPortId: info.ibc_port_id ?? null,
    created: info.created ?? null,
    stateEntryCount: Array.isArray(state) ? state.length : null,
    state,
  };

  return { type: "contract", id: address, data };
}

async function inspectAgent(
  address: string,
  rest: string,
): Promise<InspectResult> {
  const [agentResp, tasksResp, livenessResp, rewardsResp] = await Promise.all([
    fetchJSON(`${rest}/clawchain/agent/v1/agent/${address}`).catch(() => null),
    fetchJSON(`${rest}/clawchain/agent/v1/tasks?assignee=${address}`).catch(() => null),
    fetchJSON(`${rest}/clawchain/agent/v1/agent/${address}/liveness`).catch(() => null),
    fetchJSON(`${rest}/clawchain/agent/v1/agent/${address}/rewards`).catch(() => null),
  ]);

  const agent = agentResp?.agent ?? {};
  const tasks = tasksResp?.tasks ?? [];
  const liveness = livenessResp?.liveness ?? {};

  const data: Record<string, unknown> = {
    address,
    name: agent.name ?? null,
    status: agent.status ?? "unknown",
    capabilities: agent.capabilities ?? [],
    reputation: agent.reputation ?? null,
    registeredAt: agent.registered_at ?? null,
    taskCount: tasks.length,
    activeTasks: tasks.filter((t: any) => t.status === "active" || t.status === "accepted").length,
    completedTasks: tasks.filter((t: any) => t.status === "completed").length,
    liveness: {
      lastHeartbeat: liveness.last_heartbeat ?? null,
      isLive: liveness.is_live ?? false,
      missedBlocks: liveness.missed_blocks ?? null,
    },
    rewards: rewardsResp?.rewards ?? null,
  };

  return { type: "agent", id: address, data };
}

async function inspectProposal(
  id: string,
  rest: string,
): Promise<InspectResult> {
  const proposalResp = await fetchJSON(
    `${rest}/clawchain/governance/v1/proposal/${id}`,
  );
  const proposal = proposalResp.proposal ?? proposalResp;

  // Fetch votes
  let votes: any[] = [];
  try {
    const votesResp = await fetchJSON(
      `${rest}/clawchain/governance/v1/proposal/${id}/votes`,
    );
    votes = votesResp.votes ?? [];
  } catch {
    // Votes endpoint may not exist
  }

  const data: Record<string, unknown> = {
    proposalId: id,
    title: proposal.title ?? proposal.content?.title ?? null,
    description: proposal.description ?? proposal.content?.description ?? null,
    status: proposal.status ?? "unknown",
    proposer: proposal.proposer ?? null,
    submitTime: proposal.submit_time ?? null,
    depositEndTime: proposal.deposit_end_time ?? null,
    votingStartTime: proposal.voting_start_time ?? null,
    votingEndTime: proposal.voting_end_time ?? null,
    totalDeposit: proposal.total_deposit ?? [],
    tally: proposal.final_tally_result ?? null,
    voteCount: votes.length,
    votes: votes.slice(0, 20).map((v: any) => ({
      voter: v.voter,
      option: v.option ?? v.options,
    })),
  };

  return { type: "proposal", id, data };
}

async function inspectPool(
  address: string,
  rest: string,
): Promise<InspectResult> {
  // Query pool via CosmWasm smart query
  const poolQuery = Buffer.from(JSON.stringify({ pool: {} })).toString("base64");
  const poolResp = await fetchJSON(
    `${rest}/cosmwasm/wasm/v1/contract/${address}/smart/${poolQuery}`,
  );
  const poolData = poolResp.data ?? poolResp;

  // Also fetch contract info
  let contractInfo: any = null;
  try {
    const contractResp = await fetchJSON(
      `${rest}/cosmwasm/wasm/v1/contract/${address}`,
    );
    contractInfo = contractResp.contract_info ?? null;
  } catch {
    // Not critical
  }

  const data: Record<string, unknown> = {
    address,
    label: contractInfo?.label ?? null,
    codeId: contractInfo?.code_id ?? null,
    assets: poolData.assets ?? [],
    totalShare: poolData.total_share ?? null,
    feeRate: poolData.fee_rate ?? poolData.pool_params?.fee_rate ?? null,
    poolType: poolData.pair_type ?? poolData.pool_type ?? null,
    reserves: poolData.assets?.map((a: any) => ({
      denom: a.info?.native_token?.denom ?? a.info?.token?.contract_addr ?? "unknown",
      amount: a.amount,
    })) ?? [],
  };

  return { type: "pool", id: address, data };
}

// ---------------------------------------------------------------------------
// Watch implementation
// ---------------------------------------------------------------------------

export function matchesWatchFilter(events: any[], filter: WatchFilter): boolean {
  if (filter === "all") return true;

  const eventTypes = events.map((e: any) => e.type ?? "");
  const allAttrs = events.flatMap((e: any) =>
    (e.attributes ?? []).map((a: any) => `${a.key}=${a.value}`),
  );
  const combined = [...eventTypes, ...allAttrs].join(" ").toLowerCase();

  switch (filter) {
    case "transfer":
      return combined.includes("transfer") || combined.includes("bank");
    case "agent":
      return combined.includes("agent") || combined.includes("task") || combined.includes("heartbeat");
    case "privacy":
      return combined.includes("shield") || combined.includes("privacy") || combined.includes("nullifier");
    case "dex":
      return combined.includes("swap") || combined.includes("liquidity") || combined.includes("pool");
    case "governance":
      return combined.includes("proposal") || combined.includes("vote") || combined.includes("governance");
    default:
      return true;
  }
}

export async function watchChain(
  rpc: string,
  filter: WatchFilter,
  decode: boolean,
  onEvent: (event: WatchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const wsUrl = rpc.replace(/^http/, "ws") + "/websocket";

  // Dynamic import for WebSocket (node environment)
  const WebSocket = globalThis.WebSocket ?? (await import("ws" as string)).default;

  const ws = new WebSocket(wsUrl);

  const cleanup = () => {
    try {
      ws.close();
    } catch {
      // ignore
    }
  };

  if (signal) {
    signal.addEventListener("abort", cleanup);
  }

  ws.onopen = () => {
    // Subscribe to new blocks
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "subscribe",
        id: "block-sub",
        params: { query: "tm.event='NewBlock'" },
      }),
    );

    // Subscribe to transactions
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "subscribe",
        id: "tx-sub",
        params: { query: "tm.event='Tx'" },
      }),
    );
  };

  ws.onmessage = (event: any) => {
    try {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
      const resultData = msg.result?.data ?? msg.result;
      if (!resultData?.value) return;

      const value = resultData.value;
      const events = value.result_begin_block?.events ??
        value.result_end_block?.events ??
        value.TxResult?.result?.events ??
        [];

      if (!matchesWatchFilter(events, filter)) return;

      if (value.block) {
        // NewBlock event
        const header = value.block.header ?? {};
        const watchEvent: WatchEvent = {
          type: "block",
          height: parseInt(header.height ?? "0", 10),
          timestamp: new Date().toISOString(),
          events: events.map((e: any) => ({
            type: e.type,
            attributes: e.attributes ?? [],
          })),
        };
        onEvent(watchEvent);
      } else if (value.TxResult) {
        // Tx event
        const txResult = value.TxResult;
        const watchEvent: WatchEvent = {
          type: "tx",
          hash: txResult.hash,
          height: parseInt(txResult.height ?? "0", 10),
          timestamp: new Date().toISOString(),
          events: events.map((e: any) => ({
            type: e.type,
            attributes: e.attributes ?? [],
          })),
        };

        if (decode && txResult.tx) {
          try {
            const txBytes = Buffer.from(txResult.tx, "base64").toString("utf-8");
            const txParsed = JSON.parse(txBytes);
            watchEvent.messages = decodeTxMessages(txParsed);
          } catch {
            // Binary protobuf, can't decode without schema
          }
        }

        onEvent(watchEvent);
      }
    } catch {
      // Ignore malformed messages
    }
  };

  // Return a promise that resolves when connection closes
  return new Promise((resolve, reject) => {
    ws.onclose = () => resolve();
    ws.onerror = (err: any) => reject(new Error(`WebSocket error: ${err.message ?? err}`));
  });
}

// ---------------------------------------------------------------------------
// Simulate implementation
// ---------------------------------------------------------------------------

export async function simulateTx(
  msgJson: string,
  rest: string,
  fromAddress?: string,
): Promise<SimulateResult> {
  let msg: any;
  try {
    msg = JSON.parse(msgJson);
  } catch {
    throw new Error("Invalid JSON message for simulation");
  }

  const messages = Array.isArray(msg) ? msg : [msg];

  const simulateBody = {
    tx: {
      body: {
        messages,
        memo: "",
        timeout_height: "0",
        extension_options: [],
        non_critical_extension_options: [],
      },
      auth_info: {
        signer_infos: fromAddress
          ? [
              {
                public_key: null,
                mode_info: { single: { mode: "SIGN_MODE_DIRECT" } },
                sequence: "0",
              },
            ]
          : [],
        fee: {
          amount: [],
          gas_limit: "0",
          payer: fromAddress ?? "",
          granter: "",
        },
      },
      signatures: fromAddress ? [""] : [],
    },
    tx_bytes: "",
  };

  const resp = await postJSON(`${rest}/cosmos/tx/v1beta1/simulate`, simulateBody);

  const gasInfo = resp.gas_info ?? {};
  const result = resp.result ?? {};

  return {
    gasUsed: gasInfo.gas_used ?? "0",
    gasWanted: gasInfo.gas_wanted ?? "0",
    events: (result.events ?? []).map((e: any) => ({
      type: e.type,
      attributes: (e.attributes ?? []).map((a: any) => ({
        key: a.key,
        value: a.value,
      })),
    })),
    error: resp.error ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatOutput(data: unknown, json: boolean): string {
  if (json) {
    return JSON.stringify(data, null, 2);
  }

  if (typeof data !== "object" || data === null) {
    return String(data);
  }

  const lines: string[] = [];
  const obj = data as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
      lines.push(`  ${key}:`);
      for (const item of value) {
        lines.push(`    - ${JSON.stringify(item)}`);
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`  ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI program
// ---------------------------------------------------------------------------

export function createProgram(): Command {
  const program = new Command();

  program
    .name("claw-rivet")
    .description("ClawChain developer tools — inspect, debug, and monitor the chain")
    .version("1.0.0");

  // ---- inspect ----
  program
    .command("inspect")
    .description("Inspect chain objects (block, tx, account, contract, agent, proposal, pool)")
    .argument("<type>", `Object type: ${VALID_INSPECT_TYPES.join(", ")}`)
    .argument("<id>", "Object identifier (height, hash, address, etc.)")
    .option("--rpc <url>", "CometBFT RPC endpoint", DEFAULT_RPC)
    .option("--rest <url>", "Cosmos REST/LCD endpoint", DEFAULT_REST)
    .option("--json", "Output raw JSON", false)
    .option("--decode", "Decode transaction messages", false)
    .action(async (type: string, id: string, opts) => {
      if (!VALID_INSPECT_TYPES.includes(type)) {
        console.error(`Unknown inspect type: ${type}. Valid types: ${VALID_INSPECT_TYPES.join(", ")}`);
        process.exit(1);
      }

      try {
        let result: InspectResult;

        switch (type) {
          case "block":
            result = await inspectBlock(id, opts.rpc, opts.decode);
            break;
          case "tx":
            result = await inspectTx(id, opts.rpc, opts.rest, opts.decode);
            break;
          case "account":
            result = await inspectAccount(id, opts.rest);
            break;
          case "contract":
            result = await inspectContract(id, opts.rest);
            break;
          case "agent":
            result = await inspectAgent(id, opts.rest);
            break;
          case "proposal":
            result = await inspectProposal(id, opts.rest);
            break;
          case "pool":
            result = await inspectPool(id, opts.rest);
            break;
          default:
            console.error(`Unsupported type: ${type}`);
            process.exit(1);
            return; // unreachable, but satisfies TS control flow
        }

        console.log(`\n[${result.type.toUpperCase()}] ${result.id}`);
        console.log("─".repeat(60));
        console.log(formatOutput(result.data, opts.json));

        if (result.decoded && result.decoded.length > 0) {
          console.log("\nDecoded Messages:");
          console.log("─".repeat(40));
          for (const msg of result.decoded) {
            console.log(`  ${msg.typeName} (${msg.typeUrl})`);
            for (const [k, v] of Object.entries(msg.fields)) {
              console.log(`    ${k}: ${JSON.stringify(v)}`);
            }
          }
        }
      } catch (err: any) {
        console.error(`Error inspecting ${type} ${id}: ${err.message}`);
        process.exit(1);
      }
    });

  // ---- watch ----
  program
    .command("watch")
    .description("Watch live chain events in real-time")
    .argument("[filter]", "Event filter: all, transfer, agent, privacy, dex, governance", "all")
    .option("--rpc <url>", "CometBFT RPC endpoint", DEFAULT_RPC)
    .option("--decode", "Decode transaction messages", false)
    .action(async (filter: string, opts) => {
      if (!WATCH_FILTERS.includes(filter as WatchFilter)) {
        console.error(`Invalid filter: ${filter}. Valid filters: ${WATCH_FILTERS.join(", ")}`);
        process.exit(1);
      }

      console.log(`Watching chain events (filter: ${filter})...`);
      console.log(`Connecting to ${opts.rpc}...`);
      console.log("Press Ctrl+C to stop.\n");

      try {
        await watchChain(
          opts.rpc,
          filter as WatchFilter,
          opts.decode,
          (event) => {
            const prefix = event.type === "block" ? "BLK" : " TX";
            const height = event.height ? `#${event.height}` : "";
            const hash = event.hash ? ` ${event.hash.slice(0, 16)}...` : "";
            const eventCount = event.events?.length ?? 0;

            console.log(
              `[${prefix}] ${height}${hash} | ${eventCount} events | ${event.timestamp}`,
            );

            if (event.messages && event.messages.length > 0) {
              for (const msg of event.messages) {
                console.log(`       -> ${msg.typeName}`);
              }
            }
          },
        );
      } catch (err: any) {
        console.error(`Watch error: ${err.message}`);
        process.exit(1);
      }
    });

  // ---- decode ----
  program
    .command("decode")
    .description("Decode raw chain data (base64, hex, bech32, JSON)")
    .argument("<data>", "Data to decode (base64, hex, bech32 address, or JSON)")
    .option("--type <type>", "Force type: tx, msg, event, address, query")
    .option("--json", "Output raw JSON", false)
    .action((data: string, opts) => {
      const result = decodeRawData(data, opts.type);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nFormat: ${result.format}`);
        console.log("─".repeat(40));
        if (typeof result.decoded === "object" && result.decoded !== null) {
          console.log(JSON.stringify(result.decoded, null, 2));
        } else {
          console.log(String(result.decoded));
        }
      }
    });

  // ---- query ----
  program
    .command("query")
    .description("Query module state (bank, staking, agent, privacy, marketplace, governance, wasm)")
    .argument("<module>", "Module name")
    .argument("[path]", "Query path (e.g., balances, validators, agents)")
    .argument("[args...]", "Path arguments (addresses, IDs, etc.)")
    .option("--rest <url>", "Cosmos REST/LCD endpoint", DEFAULT_REST)
    .option("--json", "Output raw JSON", false)
    .action(async (module: string, path: string | undefined, args: string[], opts) => {
      const modulePaths = MODULE_PATHS[module];
      if (!modulePaths) {
        console.error(
          `Unknown module: ${module}. Available: ${Object.keys(MODULE_PATHS).join(", ")}`,
        );
        process.exit(1);
      }

      if (!path) {
        // List available paths for the module
        console.log(`\nAvailable queries for ${module}:`);
        for (const [name, template] of Object.entries(modulePaths)) {
          console.log(`  ${name} → ${template}`);
        }
        return;
      }

      const queryUrl = buildQueryPath(module, path, args);
      if (!queryUrl) {
        console.error(
          `Unknown path: ${path}. Available for ${module}: ${Object.keys(modulePaths).join(", ")}`,
        );
        process.exit(1);
        return; // unreachable, but satisfies TS control flow
      }

      try {
        const fullUrl = `${opts.rest}${queryUrl}`;
        const data = await fetchJSON(fullUrl);

        const result: QueryResult = { module, path: queryUrl, data };

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n[QUERY] ${module}/${path}`);
          console.log(`  URL: ${fullUrl}`);
          console.log("─".repeat(60));
          console.log(JSON.stringify(data, null, 2));
        }
      } catch (err: any) {
        console.error(`Query error: ${err.message}`);
        process.exit(1);
      }
    });

  // ---- simulate ----
  program
    .command("simulate")
    .description("Simulate a transaction without broadcasting")
    .argument("<msg-json>", "JSON message or path to JSON file")
    .option("--rest <url>", "Cosmos REST/LCD endpoint", DEFAULT_REST)
    .option("--from <address>", "Sender address for simulation")
    .option("--json", "Output raw JSON", false)
    .action(async (msgJson: string, opts) => {
      // If it looks like a file path, try to read it
      let jsonStr = msgJson;
      if (msgJson.endsWith(".json")) {
        try {
          const fs = await import("fs");
          jsonStr = fs.readFileSync(msgJson, "utf-8");
        } catch {
          // Not a file, treat as raw JSON
        }
      }

      try {
        const result = await simulateTx(jsonStr, opts.rest, opts.from);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("\n[SIMULATE]");
          console.log("─".repeat(40));
          console.log(`  Gas Used:   ${result.gasUsed}`);
          console.log(`  Gas Wanted: ${result.gasWanted}`);
          if (result.error) {
            console.log(`  Error:      ${result.error}`);
          }
          if (result.events.length > 0) {
            console.log(`\n  Events (${result.events.length}):`);
            for (const event of result.events) {
              console.log(`    ${event.type}`);
              for (const attr of event.attributes) {
                console.log(`      ${attr.key} = ${attr.value}`);
              }
            }
          }
        }
      } catch (err: any) {
        console.error(`Simulation error: ${err.message}`);
        process.exit(1);
      }
    });

  return program;
}

// ---------------------------------------------------------------------------
// Main — only runs when executed directly (not when imported)
// ---------------------------------------------------------------------------

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.ts") ||
    process.argv[1].endsWith("/index.js") ||
    process.argv[1].endsWith("claw-rivet"));

if (isDirectRun) {
  const program = createProgram();
  program.parse();
}
