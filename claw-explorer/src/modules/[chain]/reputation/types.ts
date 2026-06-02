// Types for the x/reputation REST query surface.
// Field names mirror the JSON tags emitted by the gRPC-gateway
// (snake_case), sourced from x/reputation/types/*.pb.go.

export interface ReputationParams {
  max_comment_length: string;
  heartbeat_penalty_bps: string;
  heartbeat_recovery_bps: string;
  task_sla_on_time_reward_bps: string;
  task_sla_late_penalty_bps: string;
  task_sla_lateness_step_blocks: string;
  decay_rate_bps: string;
  decay_interval_blocks: string;
}

export interface ReputationRecord {
  agent_address: string;
  total_ratings: string;
  rating_sum: string;
  avg_rating_bps: string;
  intents_created: string;
  intents_completed: string;
  skill_purchases: string;
  endorsements: string;
  last_updated: string;
  uptime_score_bps: string;
  heartbeat_sla_penalties: string;
  heartbeat_sla_recoveries: string;
  task_sla_on_time_count: string;
  task_sla_late_count: string;
  task_sla_penalty_bps_total: string;
  task_sla_reward_bps_total: string;
}

export interface Endorsement {
  id: string;
  endorser: string;
  endorsed: string;
  reason: string;
  block_height: string;
}

export interface ParamsResponse {
  params: ReputationParams;
}

export interface TopAgentsResponse {
  agents: ReputationRecord[];
}

export interface ReputationResponse {
  reputation: ReputationRecord;
  found: boolean;
}

export interface EndorsementsResponse {
  endorsements: Endorsement[];
}
