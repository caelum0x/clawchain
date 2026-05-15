import { chainConfig } from "./config.ts";

const REST = chainConfig.restEndpoint;
const RPC = chainConfig.rpcEndpoint;

/** Chain RPC URL for WebSocket and direct RPC connections. */
export const CHAIN_RPC = chainConfig.rpcEndpoint;

export interface Block {
  height: string;
  time: string;
  hash: string;
  proposer: string;
  txCount: number;
  gasUsed?: string;
}

export interface TxMessage {
  typeUrl: string;
  value?: Record<string, unknown>;
}

export interface Tx {
  hash: string;
  height: string;
  code: number;
  timestamp?: string;
  direction?: "in" | "out" | "self";
  gasUsed: string;
  gasWanted: string;
  memo: string;
  messages: TxMessage[];
}

export interface Validator {
  moniker: string;
  operatorAddress: string;
  tokens: string;
  status: string;
  commission: string;
  jailed: boolean;
}

export interface AccountBalance {
  denom: string;
  amount: string;
}

export interface Delegation {
  delegatorAddress: string;
  validatorAddress: string;
  shares: string;
  amount: string;
  denom: string;
}

export interface AgentInfo {
  address: string;
  name: string;
  endpoint: string;
  active: boolean;
  pubkey: string;
  supportedTools: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  owner: string;
  price: string;
  denom: string;
  purchaseCount: string;
}

export interface Reputation {
  agentAddress: string;
  totalRatings: string;
  ratingSum: string;
  avgRatingBps: string;
  endorsementCount: string;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// Chain status
export async function getLatestBlock(): Promise<Block> {
  const data = await get<any>(`${RPC}/block`);
  const block = data.result.block;
  return {
    height: block.header.height,
    time: block.header.time,
    hash: data.result.block_id.hash,
    proposer: block.header.proposer_address,
    txCount: block.data.txs?.length ?? 0,
  };
}

export async function getBlock(height: string): Promise<Block> {
  const data = await get<any>(`${RPC}/block?height=${height}`);
  const block = data.result.block;
  return {
    height: block.header.height,
    time: block.header.time,
    hash: data.result.block_id.hash,
    proposer: block.header.proposer_address,
    txCount: block.data.txs?.length ?? 0,
  };
}

export async function getRecentBlocks(count = 20): Promise<Block[]> {
  const latest = await getLatestBlock();
  const h = parseInt(latest.height);
  const blocks: Block[] = [latest];
  const start = Math.max(1, h - count + 1);
  const promises: Promise<Block>[] = [];
  for (let i = h - 1; i >= start; i--) {
    promises.push(getBlock(String(i)));
  }
  const rest = await Promise.all(promises);
  blocks.push(...rest);
  return blocks;
}

export async function getNetStatus(): Promise<{
  nodeInfo: { network: string; moniker: string; version: string };
  syncInfo: { latestHeight: string; latestTime: string; catching_up: boolean };
  validatorCount: number;
}> {
  const data = await get<any>(`${RPC}/status`);
  const r = data.result;
  return {
    nodeInfo: {
      network: r.node_info.network,
      moniker: r.node_info.moniker,
      version: r.node_info.version,
    },
    syncInfo: {
      latestHeight: r.sync_info.latest_block_height,
      latestTime: r.sync_info.latest_block_time,
      catching_up: r.sync_info.catching_up,
    },
    validatorCount: parseInt(r.validator_info?.voting_power ?? "0") > 0 ? 1 : 0,
  };
}

// Validators
export async function getValidators(): Promise<Validator[]> {
  const data = await get<any>(
    `${REST}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`
  );
  return (data.validators ?? []).map((v: any) => ({
    moniker: v.description?.moniker ?? "",
    operatorAddress: v.operator_address,
    tokens: v.tokens,
    status: v.status,
    commission: v.commission?.commission_rates?.rate ?? "0",
    jailed: v.jailed,
  }));
}

// Account
export async function getBalances(address: string): Promise<AccountBalance[]> {
  const data = await get<any>(
    `${REST}/cosmos/bank/v1beta1/balances/${address}`
  );
  return data.balances ?? [];
}

export async function getAccount(address: string): Promise<{
  address: string;
  accountNumber: string;
  sequence: string;
}> {
  try {
    const data = await get<any>(
      `${REST}/cosmos/auth/v1beta1/accounts/${address}`
    );
    const acc = data.account;
    return {
      address: acc.address ?? address,
      accountNumber: acc.account_number ?? "0",
      sequence: acc.sequence ?? "0",
    };
  } catch {
    return { address, accountNumber: "0", sequence: "0" };
  }
}

// Transactions
export async function getTxsByHeight(height: string): Promise<Tx[]> {
  try {
    const data = await get<any>(
      `${REST}/cosmos/tx/v1beta1/txs?events=tx.height=${height}&pagination.limit=50`
    );
    return (data.tx_responses ?? []).map(parseTx);
  } catch {
    return [];
  }
}

export async function getTxByHash(hash: string): Promise<Tx | null> {
  try {
    const data = await get<any>(`${REST}/cosmos/tx/v1beta1/txs/${hash}`);
    return parseTx(data.tx_response);
  } catch {
    return null;
  }
}

export async function getTxsBySender(address: string): Promise<Tx[]> {
  try {
    const data = await get<any>(
      `${REST}/cosmos/tx/v1beta1/txs?events=message.sender='${address}'&pagination.limit=25&order_by=ORDER_BY_DESC`
    );
    return (data.tx_responses ?? []).map(parseTx);
  } catch {
    return [];
  }
}

export async function getTxsByRecipient(address: string): Promise<Tx[]> {
  try {
    const data = await get<any>(
      `${REST}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=25&order_by=ORDER_BY_DESC`
    );
    return (data.tx_responses ?? []).map(parseTx);
  } catch {
    return [];
  }
}

export async function getTxPageByAddress(
  address: string,
  page = 1,
  limit = 10
): Promise<{ txs: Tx[]; total: number }> {
  const [sent, received] = await Promise.all([
    getTxsBySender(address),
    getTxsByRecipient(address),
  ]);
  const sentSet = new Set(sent.map((tx) => tx.hash));
  const recvSet = new Set(received.map((tx) => tx.hash));
  const merged = new Map<string, Tx>();
  [...sent, ...received].forEach((tx) => {
    const inSent = sentSet.has(tx.hash);
    const inRecv = recvSet.has(tx.hash);
    merged.set(tx.hash, {
      ...tx,
      direction: inSent && inRecv ? "self" : inSent ? "out" : "in",
    });
  });
  const sorted = [...merged.values()].sort(
    (a, b) => Number(b.height || 0) - Number(a.height || 0)
  );
  const start = Math.max(0, (page - 1) * limit);
  const end = start + limit;
  return { txs: sorted.slice(start, end), total: sorted.length };
}

function parseTx(r: any): Tx {
  return {
    hash: r.txhash,
    height: r.height,
    code: r.code ?? 0,
    timestamp: r.timestamp,
    gasUsed: r.gas_used ?? "0",
    gasWanted: r.gas_wanted ?? "0",
    memo: r.tx?.body?.memo ?? "",
    messages: (r.tx?.body?.messages ?? []).map((m: any) => {
      const { "@type": typeUrl, ...rest } = m;
      return { typeUrl: typeUrl ?? "", value: rest };
    }),
  };
}

/** Fetch a range of blocks by height (descending). */
export async function getBlockRange(
  fromHeight: number,
  count: number
): Promise<Block[]> {
  if (fromHeight < 1) return [];
  const start = Math.max(1, fromHeight - count + 1);
  const promises: Promise<Block>[] = [];
  for (let i = fromHeight; i >= start; i--) {
    promises.push(getBlock(String(i)));
  }
  return Promise.all(promises);
}

export async function getDelegations(address: string): Promise<Delegation[]> {
  try {
    const data = await get<any>(
      `${REST}/cosmos/staking/v1beta1/delegations/${address}`
    );
    return (data.delegation_responses ?? []).map((d: any) => ({
      delegatorAddress: d.delegation?.delegator_address ?? address,
      validatorAddress: d.delegation?.validator_address ?? "",
      shares: d.delegation?.shares ?? "0",
      amount: d.balance?.amount ?? "0",
      denom: d.balance?.denom ?? chainConfig.coinMinimalDenom,
    }));
  } catch {
    return [];
  }
}

// Agent module
export async function getAgentInfo(address: string): Promise<AgentInfo | null> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/agent/v1/agent/${address}`
    );
    const a = data.agent ?? data;
    return {
      address: a.address ?? address,
      name: a.name ?? "",
      endpoint: a.endpoint ?? "",
      active: a.active ?? false,
      pubkey: a.pubkey ?? "",
      supportedTools: a.supported_tools ?? [],
    };
  } catch {
    return null;
  }
}

export async function getLiveAgents(): Promise<AgentInfo[]> {
  try {
    const data = await get<any>(`${REST}/clawchain/agent/v1/live`);
    return (data.agents ?? []).map((a: any) => ({
      address: a.address ?? "",
      name: a.name ?? a.agent_name ?? "",
      endpoint: a.endpoint ?? "",
      active: true,
      pubkey: a.pubkey ?? "",
      supportedTools: a.supported_tools ?? [],
    }));
  } catch {
    return [];
  }
}

export interface AgentLiveness {
  lastHeartbeat: string;
  uptimeBlocks: number;
  isHealthy: boolean;
}

export async function getAgentLiveness(address: string): Promise<AgentLiveness | null> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/agent/v1/agent_liveness/${address}`
    );
    return {
      lastHeartbeat: data.last_heartbeat ?? "",
      uptimeBlocks: parseInt(data.uptime_blocks ?? "0"),
      isHealthy: data.is_healthy ?? false,
    };
  } catch {
    return null;
  }
}

export interface AgentTask {
  id: string;
  description: string;
  status: string;
  completedAt: string;
}

export async function getTasksByAssignee(address: string): Promise<AgentTask[]> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/agent/v1/tasks_by_assignee/${address}`
    );
    return (data.tasks ?? []).map((t: any) => ({
      id: t.id ?? t.task_id ?? "",
      description: t.description ?? "",
      status: t.status ?? "unknown",
      completedAt: t.completed_at ?? t.updated_at ?? "",
    }));
  } catch {
    return [];
  }
}

// Marketplace
export async function getSkills(): Promise<Skill[]> {
  try {
    const data = await get<any>(`${REST}/clawchain/marketplace/v1/skills`);
    return (data.skills ?? []).map((s: any) => ({
      id: s.id ?? "0",
      name: s.name ?? "",
      description: s.description ?? "",
      owner: s.owner ?? "",
      price: s.price ?? "0",
      denom: s.denom ?? "uclaw",
      purchaseCount: s.purchase_count ?? "0",
    }));
  } catch {
    return [];
  }
}

// Ratings for an agent
export interface RatingEntry {
  id: number;
  rater: string;
  score: number;
  comment: string;
  blockHeight: number;
}

export async function getRatings(address: string): Promise<RatingEntry[]> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/reputation/v1/ratings/${address}`
    );
    return (data.ratings ?? []).map((r: any) => ({
      id: parseInt(r.id ?? "0"),
      rater: r.rater ?? "",
      score: parseInt(r.score ?? "0"),
      comment: r.comment ?? "",
      blockHeight: parseInt(r.block_height ?? "0"),
    }));
  } catch {
    return [];
  }
}

// Reputation
export async function getReputation(
  address: string
): Promise<Reputation | null> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/reputation/v1/reputation/${address}`
    );
    const r = data.reputation ?? data;
    return {
      agentAddress: r.agent_address ?? address,
      totalRatings: r.total_ratings ?? "0",
      ratingSum: r.rating_sum ?? "0",
      avgRatingBps: r.avg_rating_bps ?? "0",
      endorsementCount: r.endorsement_count ?? "0",
    };
  } catch {
    return null;
  }
}

export async function getTopAgents(): Promise<Reputation[]> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/reputation/v1/top_agents?limit=20`
    );
    return (data.agents ?? []).map((r: any) => ({
      agentAddress: r.agent_address ?? "",
      totalRatings: r.total_ratings ?? "0",
      ratingSum: r.rating_sum ?? "0",
      avgRatingBps: r.avg_rating_bps ?? "0",
      endorsementCount: r.endorsement_count ?? "0",
    }));
  } catch {
    return [];
  }
}

// Endorsements for an agent
export interface EndorsementEntry {
  id: number;
  endorser: string;
  reason: string;
  blockHeight: number;
}

export async function getEndorsements(address: string): Promise<EndorsementEntry[]> {
  try {
    const data = await get<any>(
      `${REST}/clawchain/reputation/v1/endorsements/${address}`
    );
    return (data.endorsements ?? []).map((e: any) => ({
      id: parseInt(e.id ?? "0"),
      endorser: e.endorser ?? "",
      reason: e.reason ?? "",
      blockHeight: parseInt(e.block_height ?? "0"),
    }));
  } catch {
    return [];
  }
}

// Agent mining rewards
export async function getAgentRewards(address: string): Promise<{
  address: string;
  cumulativeRewards: string;
  denom: string;
}> {
  const data = await get<any>(`${REST}/clawchain/agent/v1/rewards/${address}`);
  return {
    address: data.address || address,
    cumulativeRewards: data.cumulative_rewards || "0",
    denom: data.denom || "uclaw",
  };
}

export async function getRewardLeaderboard(): Promise<Array<{
  address: string;
  name: string;
  cumulativeRewards: string;
}>> {
  // Fetch live agents, then query rewards for each.
  const agents = await getLiveAgents();

  const results = await Promise.all(
    agents.map(async (agent) => {
      try {
        const rewards = await getAgentRewards(agent.address);
        return {
          address: agent.address,
          name: agent.name || "Unknown",
          cumulativeRewards: rewards.cumulativeRewards,
        };
      } catch {
        return {
          address: agent.address,
          name: agent.name || "Unknown",
          cumulativeRewards: "0",
        };
      }
    })
  );

  // Sort by rewards descending.
  return results.sort((a, b) => {
    const aVal = parseInt(a.cumulativeRewards) || 0;
    const bVal = parseInt(b.cumulativeRewards) || 0;
    return bVal - aVal;
  });
}

// IBC task result query
export interface IBCTaskResult {
  taskId: number;
  status: string;
  result: string;
  assignee: string;
  delegator: string;
  budget: string;
  createdAt: number;
  completedAt: number;
}

export async function getIBCTaskResult(taskId: number): Promise<IBCTaskResult | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/agent/v1/task/${taskId}`);
    const t = data.task ?? data;
    return {
      taskId: parseInt(t.task_id ?? t.taskId ?? String(taskId)),
      status: t.status ?? "unknown",
      result: t.result ?? "",
      assignee: t.assignee_address ?? t.assigneeAddress ?? "",
      delegator: t.delegator_address ?? t.delegatorAddress ?? "",
      budget: t.budget ?? "0",
      createdAt: t.created_at ?? t.createdAt ?? 0,
      completedAt: t.completed_at ?? t.completedAt ?? 0,
    };
  } catch {
    return null;
  }
}

// Remote agents (IBC cross-chain discovery)
export interface RemoteAgent {
  chainId: string;
  address: string;
  name: string;
  endpoint: string;
  tools: string[];
}

export async function getRemoteAgents(): Promise<RemoteAgent[]> {
  try {
    const data = await get<any>(`${REST}/clawchain/agent/v1/remote_agents`);
    return (data.agents ?? []).map((a: any) => ({
      chainId: a.chain_id ?? a.chainId ?? "",
      address: a.address ?? "",
      name: a.name ?? "",
      endpoint: a.endpoint ?? "",
      tools: a.tools ?? [],
    }));
  } catch {
    return [];
  }
}

// GPU Compute Marketplace
export interface ComputeResource {
  id: string;
  owner: string;
  name: string;
  description: string;
  gpuModel: string;
  gpuCount: number;
  vramGb: number;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  pricePerHourUclaw: string;
  minLeaseHours: number;
  maxLeaseHours: number;
  active: boolean;
  currentLessee: string;
  leaseExpiresAt: number;
  region: string;
  endpoint: string;
  tags: string[];
  totalLeases: number;
  totalRevenue: string;
}

export interface ComputeLease {
  id: string;
  resourceId: string;
  lessee: string;
  provider: string;
  startBlock: number;
  endBlock: number;
  totalCostUclaw: string;
  status: string;
}

export async function getComputeResources(onlyAvailable?: boolean): Promise<ComputeResource[]> {
  try {
    const qs = onlyAvailable ? "?only_available=true" : "";
    const data = await get<any>(`${REST}/clawchain/marketplace/v1/compute_resources${qs}`);
    return (data.resources ?? []).map((r: any) => ({
      id: r.id ?? "0",
      owner: r.owner ?? "",
      name: r.name ?? "",
      description: r.description ?? "",
      gpuModel: r.gpu_model ?? r.gpuModel ?? "",
      gpuCount: r.gpu_count ?? r.gpuCount ?? 0,
      vramGb: r.vram_gb ?? r.vramGb ?? 0,
      cpuCores: r.cpu_cores ?? r.cpuCores ?? 0,
      ramGb: r.ram_gb ?? r.ramGb ?? 0,
      storageGb: r.storage_gb ?? r.storageGb ?? 0,
      pricePerHourUclaw: r.price_per_hour_uclaw ?? r.pricePerHourUclaw ?? "0",
      minLeaseHours: r.min_lease_hours ?? r.minLeaseHours ?? 1,
      maxLeaseHours: r.max_lease_hours ?? r.maxLeaseHours ?? 0,
      active: r.active ?? false,
      currentLessee: r.current_lessee ?? r.currentLessee ?? "",
      leaseExpiresAt: r.lease_expires_at ?? r.leaseExpiresAt ?? 0,
      region: r.region ?? "",
      endpoint: r.endpoint ?? "",
      tags: r.tags ?? [],
      totalLeases: r.total_leases ?? r.totalLeases ?? 0,
      totalRevenue: r.total_revenue ?? r.totalRevenue ?? "0",
    }));
  } catch {
    return [];
  }
}

export async function getComputeResource(id: number): Promise<ComputeResource | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/marketplace/v1/compute_resource/${id}`);
    const r = data.resource ?? data;
    return {
      id: r.id ?? String(id),
      owner: r.owner ?? "",
      name: r.name ?? "",
      description: r.description ?? "",
      gpuModel: r.gpu_model ?? r.gpuModel ?? "",
      gpuCount: r.gpu_count ?? r.gpuCount ?? 0,
      vramGb: r.vram_gb ?? r.vramGb ?? 0,
      cpuCores: r.cpu_cores ?? r.cpuCores ?? 0,
      ramGb: r.ram_gb ?? r.ramGb ?? 0,
      storageGb: r.storage_gb ?? r.storageGb ?? 0,
      pricePerHourUclaw: r.price_per_hour_uclaw ?? r.pricePerHourUclaw ?? "0",
      minLeaseHours: r.min_lease_hours ?? r.minLeaseHours ?? 1,
      maxLeaseHours: r.max_lease_hours ?? r.maxLeaseHours ?? 0,
      active: r.active ?? false,
      currentLessee: r.current_lessee ?? r.currentLessee ?? "",
      leaseExpiresAt: r.lease_expires_at ?? r.leaseExpiresAt ?? 0,
      region: r.region ?? "",
      endpoint: r.endpoint ?? "",
      tags: r.tags ?? [],
      totalLeases: r.total_leases ?? r.totalLeases ?? 0,
      totalRevenue: r.total_revenue ?? r.totalRevenue ?? "0",
    };
  } catch {
    return null;
  }
}

// GPU Compute Jobs
export interface ComputeJob {
  id: string;
  resourceId: string;
  leaseId: string;
  submitter: string;
  provider: string;
  name: string;
  jobType: string;
  executionType: string;
  dockerImage: string;
  scriptContent: string;
  inputDataUri: string;
  outputDataUri: string;
  gpuType: string;
  gpuCount: number;
  status: string;
  result: string;
  errorMessage: string;
  submittedAt: number;
  startedAt: number;
  completedAt: number;
  params: string;
}

// Provider Stats
export interface ProviderStats {
  address: string;
  totalResources: number;
  activeLeases: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalRevenue: string;
  avgRating: number;
  uptimeBlocks: number;
  lastHeartbeat: number;
}

export async function getComputeJobs(address?: string, resourceId?: number): Promise<ComputeJob[]> {
  try {
    const params: string[] = [];
    if (address) params.push(`address=${encodeURIComponent(address)}`);
    if (resourceId !== undefined) params.push(`resource_id=${resourceId}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    const data = await get<any>(`${REST}/clawchain/marketplace/v1/compute_jobs${qs}`);
    return (data.jobs ?? []).map((j: any) => ({
      id: j.id ?? "0",
      resourceId: j.resource_id ?? j.resourceId ?? "0",
      leaseId: j.lease_id ?? j.leaseId ?? "0",
      submitter: j.submitter ?? "",
      provider: j.provider ?? "",
      name: j.name ?? "",
      jobType: j.job_type ?? j.jobType ?? "general",
      executionType: j.execution_type ?? j.executionType ?? "docker",
      dockerImage: j.docker_image ?? j.dockerImage ?? "",
      scriptContent: j.script_content ?? j.scriptContent ?? "",
      inputDataUri: j.input_data_uri ?? j.inputDataUri ?? "",
      outputDataUri: j.output_data_uri ?? j.outputDataUri ?? "",
      gpuType: j.gpu_type ?? j.gpuType ?? "",
      gpuCount: j.gpu_count ?? j.gpuCount ?? 0,
      status: j.status ?? "unknown",
      result: j.result ?? "",
      errorMessage: j.error_message ?? j.errorMessage ?? "",
      submittedAt: j.submitted_at ?? j.submittedAt ?? 0,
      startedAt: j.started_at ?? j.startedAt ?? 0,
      completedAt: j.completed_at ?? j.completedAt ?? 0,
      params: j.params ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getProviderStats(address: string): Promise<ProviderStats | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/marketplace/v1/provider_stats/${address}`);
    const s = data.stats ?? data;
    return {
      address: s.address ?? address,
      totalResources: s.total_resources ?? s.totalResources ?? 0,
      activeLeases: s.active_leases ?? s.activeLeases ?? 0,
      totalJobs: s.total_jobs ?? s.totalJobs ?? 0,
      completedJobs: s.completed_jobs ?? s.completedJobs ?? 0,
      failedJobs: s.failed_jobs ?? s.failedJobs ?? 0,
      totalRevenue: s.total_revenue ?? s.totalRevenue ?? "0",
      avgRating: s.avg_rating ?? s.avgRating ?? 0,
      uptimeBlocks: s.uptime_blocks ?? s.uptimeBlocks ?? 0,
      lastHeartbeat: s.last_heartbeat ?? s.lastHeartbeat ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getComputeLeases(address?: string): Promise<ComputeLease[]> {
  try {
    const addrPart = address ? `/${address}` : "";
    const data = await get<any>(`${REST}/clawchain/marketplace/v1/compute_leases${addrPart}`);
    return (data.leases ?? []).map((l: any) => ({
      id: l.id ?? "0",
      resourceId: l.resource_id ?? l.resourceId ?? "0",
      lessee: l.lessee ?? "",
      provider: l.provider ?? "",
      startBlock: l.start_block ?? l.startBlock ?? 0,
      endBlock: l.end_block ?? l.endBlock ?? 0,
      totalCostUclaw: l.total_cost_uclaw ?? l.totalCostUclaw ?? "0",
      status: l.status ?? "unknown",
    }));
  } catch {
    return [];
  }
}

// Model Registry
export interface ModelRecord {
  id: string;
  owner: string;
  name: string;
  description: string;
  framework: string;
  architecture: string;
  parameterCount: string;
  license: string;
  tags: string[];
  storageType: string;
  storageUri: string;
  checksumSha256: string;
  sizeBytes: number;
  accessType: string;
  pricePerQueryUclaw: string;
  priceOneTimeUclaw: string;
  active: boolean;
  currentVersion: number;
  totalDownloads: number;
  totalRevenue: string;
  rating: number;
  ratingCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ModelVersion {
  id: string;
  modelId: string;
  version: number;
  storageUri: string;
  checksumSha256: string;
  sizeBytes: number;
  changelog: string;
  createdAt: number;
}

export async function getModels(framework?: string, onlyFree?: boolean): Promise<ModelRecord[]> {
  try {
    const params: string[] = [];
    if (framework) params.push(`framework=${encodeURIComponent(framework)}`);
    if (onlyFree) params.push("only_free=true");
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/models${qs}`);
    return (data.models ?? []).map((m: any) => ({
      id: m.id ?? "0",
      owner: m.owner ?? "",
      name: m.name ?? "",
      description: m.description ?? "",
      framework: m.framework ?? "",
      architecture: m.architecture ?? "",
      parameterCount: m.parameter_count ?? m.parameterCount ?? "",
      license: m.license ?? "",
      tags: m.tags ?? [],
      storageType: m.storage_type ?? m.storageType ?? "",
      storageUri: m.storage_uri ?? m.storageUri ?? "",
      checksumSha256: m.checksum_sha256 ?? m.checksumSha256 ?? "",
      sizeBytes: m.size_bytes ?? m.sizeBytes ?? 0,
      accessType: m.access_type ?? m.accessType ?? "free",
      pricePerQueryUclaw: m.price_per_query_uclaw ?? m.pricePerQueryUclaw ?? "0",
      priceOneTimeUclaw: m.price_one_time_uclaw ?? m.priceOneTimeUclaw ?? "0",
      active: m.active ?? false,
      currentVersion: m.current_version ?? m.currentVersion ?? 1,
      totalDownloads: m.total_downloads ?? m.totalDownloads ?? 0,
      totalRevenue: m.total_revenue ?? m.totalRevenue ?? "0",
      rating: m.rating ?? 0,
      ratingCount: m.rating_count ?? m.ratingCount ?? 0,
      createdAt: m.created_at ?? m.createdAt ?? 0,
      updatedAt: m.updated_at ?? m.updatedAt ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getModel(id: number): Promise<ModelRecord | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/model/${id}`);
    const m = data.model ?? data;
    return {
      id: m.id ?? String(id),
      owner: m.owner ?? "",
      name: m.name ?? "",
      description: m.description ?? "",
      framework: m.framework ?? "",
      architecture: m.architecture ?? "",
      parameterCount: m.parameter_count ?? m.parameterCount ?? "",
      license: m.license ?? "",
      tags: m.tags ?? [],
      storageType: m.storage_type ?? m.storageType ?? "",
      storageUri: m.storage_uri ?? m.storageUri ?? "",
      checksumSha256: m.checksum_sha256 ?? m.checksumSha256 ?? "",
      sizeBytes: m.size_bytes ?? m.sizeBytes ?? 0,
      accessType: m.access_type ?? m.accessType ?? "free",
      pricePerQueryUclaw: m.price_per_query_uclaw ?? m.pricePerQueryUclaw ?? "0",
      priceOneTimeUclaw: m.price_one_time_uclaw ?? m.priceOneTimeUclaw ?? "0",
      active: m.active ?? false,
      currentVersion: m.current_version ?? m.currentVersion ?? 1,
      totalDownloads: m.total_downloads ?? m.totalDownloads ?? 0,
      totalRevenue: m.total_revenue ?? m.totalRevenue ?? "0",
      rating: m.rating ?? 0,
      ratingCount: m.rating_count ?? m.ratingCount ?? 0,
      createdAt: m.created_at ?? m.createdAt ?? 0,
      updatedAt: m.updated_at ?? m.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

// Inference Marketplace
export interface InferenceJob {
  jobId: string;
  modelId: string;
  modelVersion: number;
  requester: string;
  provider: string;
  input: string;
  output: string;
  status: string;
  maxTokens: number;
  temperature: string;
  payment: string;
  gasUsed: number;
  createdAt: number;
  startedAt: number;
  completedAt: number;
  timeoutBlock: number;
  errorMsg: string;
}

export interface InferenceProvider {
  address: string;
  modelIds: number[];
  maxConcurrent: number;
  activeJobs: number;
  totalJobs: number;
  totalEarnings: string;
  avgLatencyMs: number;
  endpoint: string;
  isOnline: boolean;
  lastHeartbeat: number;
}

export interface InferencePricing {
  modelId: string;
  pricePerToken: string;
  pricePerQuery: string;
  minPayment: string;
  maxTokens: number;
}

export async function getInferenceJobs(modelId?: number, status?: string): Promise<InferenceJob[]> {
  try {
    const params: string[] = [];
    if (modelId !== undefined) params.push(`model_id=${modelId}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/inference_jobs${qs}`);
    return (data.jobs ?? []).map((j: any) => ({
      jobId: j.job_id ?? j.jobId ?? "0",
      modelId: j.model_id ?? j.modelId ?? "0",
      modelVersion: j.model_version ?? j.modelVersion ?? 0,
      requester: j.requester ?? "",
      provider: j.provider ?? "",
      input: j.input ?? "",
      output: j.output ?? "",
      status: j.status ?? "unknown",
      maxTokens: j.max_tokens ?? j.maxTokens ?? 0,
      temperature: j.temperature ?? "0",
      payment: j.payment ?? "0",
      gasUsed: j.gas_used ?? j.gasUsed ?? 0,
      createdAt: j.created_at ?? j.createdAt ?? 0,
      startedAt: j.started_at ?? j.startedAt ?? 0,
      completedAt: j.completed_at ?? j.completedAt ?? 0,
      timeoutBlock: j.timeout_block ?? j.timeoutBlock ?? 0,
      errorMsg: j.error_msg ?? j.errorMsg ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getInferenceProviders(modelId?: number): Promise<InferenceProvider[]> {
  try {
    const qs = modelId !== undefined ? `?model_id=${modelId}` : "";
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/inference_providers${qs}`);
    return (data.providers ?? []).map((p: any) => ({
      address: p.address ?? "",
      modelIds: p.model_ids ?? p.modelIds ?? [],
      maxConcurrent: p.max_concurrent ?? p.maxConcurrent ?? 0,
      activeJobs: p.active_jobs ?? p.activeJobs ?? 0,
      totalJobs: p.total_jobs ?? p.totalJobs ?? 0,
      totalEarnings: p.total_earnings ?? p.totalEarnings ?? "0",
      avgLatencyMs: p.avg_latency_ms ?? p.avgLatencyMs ?? 0,
      endpoint: p.endpoint ?? "",
      isOnline: p.is_online ?? p.isOnline ?? false,
      lastHeartbeat: p.last_heartbeat ?? p.lastHeartbeat ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getInferencePricing(modelId: number): Promise<InferencePricing | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/inference_pricing/${modelId}`);
    const p = data.pricing ?? data;
    return {
      modelId: p.model_id ?? p.modelId ?? String(modelId),
      pricePerToken: p.price_per_token ?? p.pricePerToken ?? "0",
      pricePerQuery: p.price_per_query ?? p.pricePerQuery ?? "0",
      minPayment: p.min_payment ?? p.minPayment ?? "0",
      maxTokens: p.max_tokens ?? p.maxTokens ?? 0,
    };
  } catch {
    return null;
  }
}

// Privacy
export async function getMerkleRoot(): Promise<string> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/merkle_root`);
    return data.root ?? "";
  } catch {
    return "";
  }
}

export async function getTreeStats(): Promise<{
  leafCount: string;
  root: string;
  depth: string;
}> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/tree_stats`);
    return {
      leafCount: data.leaf_count ?? "0",
      root: data.root ?? "",
      depth: data.depth ?? "0",
    };
  } catch {
    return { leafCount: "0", root: "", depth: "0" };
  }
}

export async function getNullifierExists(nullifier: string): Promise<boolean> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/nullifier_exists/${nullifier}`);
    return data.exists ?? false;
  } catch {
    return false;
  }
}

export async function getRootHistory(): Promise<{ roots: string[]; heights: string[] }> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/root_history`);
    return {
      roots: data.roots ?? [],
      heights: data.heights ?? [],
    };
  } catch {
    return { roots: [], heights: [] };
  }
}

export async function getViewKey(address: string): Promise<{ viewKey: string; commitmentHex: string } | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/view_key/${address}`);
    return data.view_key ? { viewKey: data.view_key, commitmentHex: data.commitment_hex ?? '' } : null;
  } catch {
    return null;
  }
}

export async function getCommitmentIndex(commitment: string): Promise<{ index: number; found: boolean }> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/commitment_index/${commitment}`);
    return { index: Number(data.index ?? 0), found: data.found ?? false };
  } catch {
    return { index: 0, found: false };
  }
}

export async function getMerkleProof(leafIndex: number): Promise<{ siblings: string[]; pathIndices: number[] }> {
  try {
    const data = await get<any>(`${REST}/clawchain/privacy/v1/merkle_proof/${leafIndex}`);
    return {
      siblings: data.siblings ?? [],
      pathIndices: data.path_indices?.map(Number) ?? [],
    };
  } catch {
    return { siblings: [], pathIndices: [] };
  }
}

// Supply
export async function getTotalSupply(): Promise<AccountBalance[]> {
  try {
    const data = await get<any>(`${REST}/cosmos/bank/v1beta1/supply`);
    return data.supply ?? [];
  } catch {
    return [];
  }
}

// Faucet
export async function requestFaucet(address: string): Promise<{ ok: boolean; message: string; txHash?: string }> {
  try {
    const base = chainConfig.faucetEndpoint.replace(/\/?$/, "");
    const endpoints = ["/send", "/faucet/request"];
    let lastError = "Unknown faucet error";

    for (const path of endpoints) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (res.ok) {
        return { ok: true, message: data.message ?? "Tokens sent!", txHash: data.txHash };
      }
      lastError = data.error ?? `HTTP ${res.status}`;
      if (res.status !== 404) break;
    }
    return { ok: false, message: lastError };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}

// Inference job submission helpers
export function buildSubmitInferenceJobMsg(
  requester: string,
  modelId: number,
  modelVersion: number,
  input: string,
  maxTokens: number,
  temperature: string,
  paymentUclaw: string
) {
  return {
    type: "clawchain/modelregistry/MsgSubmitInferenceJob",
    value: {
      requester,
      model_id: String(modelId),
      model_version: String(modelVersion),
      input,
      max_tokens: String(maxTokens),
      temperature,
      payment: paymentUclaw,
    },
  };
}

export function buildSubmitComputeJobMsg(
  submitter: string,
  resourceId: number,
  dockerImage: string,
  scriptContent: string,
  gpuType: string,
  gpuCount: number,
  maxBudgetUclaw: string
) {
  return {
    type: "clawchain/marketplace/MsgSubmitComputeJob",
    value: {
      submitter,
      resource_id: String(resourceId),
      docker_image: dockerImage,
      script_content: scriptContent,
      gpu_type: gpuType,
      gpu_count: String(gpuCount),
      max_budget: maxBudgetUclaw,
    },
  };
}

export function buildLeaseComputeResourceMsg(
  lessee: string,
  resourceId: number,
  durationHours: number
) {
  return {
    type: "clawchain/marketplace/MsgLeaseComputeResource",
    value: {
      lessee,
      resource_id: String(resourceId),
      duration_hours: String(durationHours),
    },
  };
}

export async function getModelVersions(modelId: number): Promise<ModelVersion[]> {
  try {
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/model/${modelId}/versions`);
    return (data.versions ?? []).map((v: any) => ({
      id: v.id ?? "0",
      modelId: v.model_id ?? String(modelId),
      version: v.version ?? 0,
      storageUri: v.storage_uri ?? "",
      checksumSha256: v.checksum_sha256 ?? "",
      sizeBytes: v.size_bytes ?? 0,
      changelog: v.changelog ?? "",
      createdAt: v.created_at ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getInferenceJob(jobId: number): Promise<InferenceJob | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/modelregistry/v1/inference_job/${jobId}`);
    const j = data.job ?? data;
    return {
      jobId: j.job_id ?? String(jobId),
      modelId: j.model_id ?? "0",
      modelVersion: j.model_version ?? 0,
      requester: j.requester ?? "",
      provider: j.provider ?? "",
      input: j.input ?? "",
      output: j.output ?? "",
      status: j.status ?? "unknown",
      maxTokens: j.max_tokens ?? 0,
      temperature: j.temperature ?? "0",
      payment: j.payment ?? "0",
      gasUsed: j.gas_used ?? 0,
      createdAt: j.created_at ?? 0,
      startedAt: j.started_at ?? 0,
      completedAt: j.completed_at ?? 0,
      timeoutBlock: j.timeout_block ?? 0,
      errorMsg: j.error_msg ?? "",
    };
  } catch {
    return null;
  }
}

// Module params
export async function getModuleParams(module: string): Promise<Record<string, string>> {
  const moduleEndpoints: Record<string, string> = {
    agent: '/clawchain/agent/v1/params',
    privacy: '/clawchain/privacy/v1/params',
    marketplace: '/clawchain/marketplace/v1/params',
    modelregistry: '/clawchain/modelregistry/v1/params',
    messaging: '/clawchain/messaging/v1/params',
    reputation: '/clawchain/reputation/v1/params',
    governance: '/clawchain/governance/v1/params',
  };
  const endpoint = moduleEndpoints[module];
  if (!endpoint) return {};
  try {
    const data = await get<any>(`${REST}${endpoint}`);
    const params = data.params ?? {};
    // Flatten to string key-value pairs
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(params)) {
      result[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
    }
    return result;
  } catch {
    return {};
  }
}

// Format helpers
export function formatClaw(uclaw: string): string {
  const n = BigInt(uclaw || "0");
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  if (frac === 0n) return `${whole} CLAW`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} CLAW`;
}

export function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

export function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Agent Negotiations
export interface NegotiationRound {
  round: number;
  proposer: string;
  budget: string;
  deadline: number;
  message?: string;
  height: number;
}

export interface Negotiation {
  id: number;
  initiator: string;
  counterparty: string;
  description: string;
  requirements: string;
  skillId?: number;
  proposedBudget: string;
  proposedDeadline: number;
  status: string;
  round: number;
  maxRounds: number;
  lastProposer: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  history: NegotiationRound[];
}

export async function getNegotiations(address?: string): Promise<Negotiation[]> {
  try {
    const addrPart = address ? `/${address}` : "";
    const data = await get<any>(`${REST}/clawchain/agent/v1/negotiations${addrPart}`);
    return (data.negotiations ?? []).map((n: any) => ({
      id: n.id ?? 0,
      initiator: n.initiator ?? "",
      counterparty: n.counterparty ?? "",
      description: n.description ?? "",
      requirements: n.requirements ?? "",
      skillId: n.skill_id ?? n.skillId ?? 0,
      proposedBudget: n.proposed_budget ?? n.proposedBudget ?? "0",
      proposedDeadline: n.proposed_deadline ?? n.proposedDeadline ?? 0,
      status: n.status ?? "unknown",
      round: n.round ?? 0,
      maxRounds: n.max_rounds ?? n.maxRounds ?? 5,
      lastProposer: n.last_proposer ?? n.lastProposer ?? "",
      createdAt: n.created_at ?? n.createdAt ?? 0,
      updatedAt: n.updated_at ?? n.updatedAt ?? 0,
      expiresAt: n.expires_at ?? n.expiresAt ?? 0,
      history: (n.history ?? []).map((h: any) => ({
        round: h.round ?? 0,
        proposer: h.proposer ?? "",
        budget: h.budget ?? "0",
        deadline: h.deadline ?? 0,
        message: h.message ?? "",
        height: h.height ?? 0,
      })),
    }));
  } catch {
    return [];
  }
}

export async function getNegotiation(id: number): Promise<Negotiation | null> {
  try {
    const data = await get<any>(`${REST}/clawchain/agent/v1/negotiation/${id}`);
    const n = data.negotiation ?? data;
    return {
      id: n.id ?? id,
      initiator: n.initiator ?? "",
      counterparty: n.counterparty ?? "",
      description: n.description ?? "",
      requirements: n.requirements ?? "",
      skillId: n.skill_id ?? n.skillId ?? 0,
      proposedBudget: n.proposed_budget ?? n.proposedBudget ?? "0",
      proposedDeadline: n.proposed_deadline ?? n.proposedDeadline ?? 0,
      status: n.status ?? "unknown",
      round: n.round ?? 0,
      maxRounds: n.max_rounds ?? n.maxRounds ?? 5,
      lastProposer: n.last_proposer ?? n.lastProposer ?? "",
      createdAt: n.created_at ?? n.createdAt ?? 0,
      updatedAt: n.updated_at ?? n.updatedAt ?? 0,
      expiresAt: n.expires_at ?? n.expiresAt ?? 0,
      history: (n.history ?? []).map((h: any) => ({
        round: h.round ?? 0,
        proposer: h.proposer ?? "",
        budget: h.budget ?? "0",
        deadline: h.deadline ?? 0,
        message: h.message ?? "",
        height: h.height ?? 0,
      })),
    };
  } catch {
    return null;
  }
}

// Messaging
export interface MessageEntry {
  id: string;
  sender: string;
  recipient: string;
  ciphertext: string;
  nonce: string;
  blockHeight: number;
  timestamp: number;
  acknowledged: boolean;
}

export async function getMessages(address: string): Promise<MessageEntry[]> {
  try {
    const data = await get<any>(`${REST}/clawchain/messaging/v1/messages/${address}`);
    return (data.messages ?? []).map((m: any) => ({
      id: m.id ?? "0",
      sender: m.sender ?? "",
      recipient: m.recipient ?? "",
      ciphertext: m.ciphertext ?? "",
      nonce: m.nonce ?? "",
      blockHeight: m.block_height ?? m.blockHeight ?? 0,
      timestamp: m.timestamp ?? 0,
      acknowledged: m.acknowledged ?? false,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CosmWasm
// ---------------------------------------------------------------------------

export interface WasmCode {
  codeId: string;
  creator: string;
  dataHash: string;
  instantiatePermission: string;
}

export interface WasmContract {
  address: string;
  codeId: string;
  creator: string;
  admin: string;
  label: string;
}

export async function getWasmCodes(): Promise<WasmCode[]> {
  try {
    const data = await get<any>(`${REST}/cosmwasm/wasm/v1/code?pagination.limit=100`);
    return (data.code_infos ?? []).map((c: any) => ({
      codeId: c.code_id ?? "0",
      creator: c.creator ?? "",
      dataHash: c.data_hash ?? "",
      instantiatePermission: c.instantiate_permission?.permission ?? "Everybody",
    }));
  } catch {
    return [];
  }
}

export async function getWasmContractsByCode(codeId: string): Promise<WasmContract[]> {
  try {
    const data = await get<any>(`${REST}/cosmwasm/wasm/v1/code/${codeId}/contracts?pagination.limit=100`);
    const addrs: string[] = data.contracts ?? [];
    const contracts: WasmContract[] = [];
    for (const addr of addrs.slice(0, 50)) {
      try {
        const info = await get<any>(`${REST}/cosmwasm/wasm/v1/contract/${addr}`);
        const ci = info.contract_info ?? {};
        contracts.push({
          address: addr,
          codeId: ci.code_id ?? codeId,
          creator: ci.creator ?? "",
          admin: ci.admin ?? "",
          label: ci.label ?? "",
        });
      } catch {
        contracts.push({ address: addr, codeId, creator: "", admin: "", label: "" });
      }
    }
    return contracts;
  } catch {
    return [];
  }
}

export async function queryWasmContract(address: string, queryMsg: Record<string, unknown>): Promise<unknown> {
  const encoded = btoa(JSON.stringify(queryMsg));
  const data = await get<any>(`${REST}/cosmwasm/wasm/v1/contract/${address}/smart/${encoded}`);
  return data.data;
}

export async function getConversation(addressA: string, addressB: string): Promise<MessageEntry[]> {
  try {
    const data = await get<any>(`${REST}/clawchain/messaging/v1/conversation/${addressA}/${addressB}`);
    return (data.messages ?? []).map((m: any) => ({
      id: m.id ?? "0",
      sender: m.sender ?? "",
      recipient: m.recipient ?? "",
      ciphertext: m.ciphertext ?? "",
      nonce: m.nonce ?? "",
      blockHeight: m.block_height ?? m.blockHeight ?? 0,
      timestamp: m.timestamp ?? 0,
      acknowledged: m.acknowledged ?? false,
    }));
  } catch {
    return [];
  }
}
