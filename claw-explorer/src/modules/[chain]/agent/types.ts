// Types for the x/agent REST query responses.
// REST base path: /clawchain/agent/v1

// GET /clawchain/agent/v1/live -> QueryLiveAgentsResponse
// Field json tags from x/agent/types/query.pb.go (LiveAgentEntry, AgentLiveness)
export interface AgentLiveness {
  agent_address?: string;
  last_heartbeat_height?: string;
  last_heartbeat_time?: string;
  reported_node_height?: string;
  endpoint?: string;
  metadata?: string;
  heartbeat_count?: string;
}

export interface LiveAgentEntry {
  address?: string;
  name?: string;
  endpoint?: string;
  liveness?: AgentLiveness;
}

export interface PageResponse {
  next_key?: string | null;
  total?: string;
}

export interface LiveAgentsResponse {
  agents: LiveAgentEntry[];
  pagination?: PageResponse | null;
}

// GET /clawchain/agent/v1/params -> QueryParamsResponse
// Field json tags from x/agent/types/params.pb.go (Params)
export interface AgentParams {
  max_heartbeat_gap_blocks?: string;
  max_actions_per_block?: string;
  min_heartbeat_interval_blocks?: string;
  max_intents_per_block?: string;
  max_tasks_per_block?: string;
  max_payload_bytes?: string;
  min_agent_deposit_uclaw?: string;
  deposit_slash_per_penalty_bps?: string;
  min_task_budget_uclaw?: string;
  high_impact_min_deposit_uclaw?: string;
  standard_task_min_budget_uclaw?: string;
  expedited_task_min_budget_uclaw?: string;
  expedited_task_max_deadline_blocks?: string;
  agent_reward_pool_fraction_bps?: string;
  min_reputation_for_reward_bps?: string;
  reward_distribution_interval_blocks?: string;
}

export interface ParamsResponse {
  params: AgentParams;
}
