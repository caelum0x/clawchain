// Types mirror x/modelregistry proto messages (snake_case JSON over REST).
// Source: proto/clawchain/modelregistry/v1/types.proto + query.proto

export interface ModelRecord {
  id: string;
  owner: string;
  name: string;
  description: string;
  framework: string;
  architecture: string;
  parameter_count: string;
  license: string;
  tags: string[];
  storage_type: string;
  storage_uri: string;
  checksum_sha256: string;
  size_bytes: string;
  access_type: string;
  price_per_query_uclaw: string;
  price_one_time_uclaw: string;
  active: boolean;
  current_version: string;
  total_downloads: string;
  total_revenue: string;
  rating: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
  price_subscription_uclaw: string;
  subscription_period_blocks: string;
}

export interface InferenceJob {
  job_id: string;
  model_id: string;
  model_version: string;
  requester: string;
  provider: string;
  input: string;
  output: string;
  status: string;
  max_tokens: string;
  temperature: string;
  payment: string;
  gas_used: string;
  created_at: string;
  started_at: string;
  completed_at: string;
  timeout_block: string;
  error_msg: string;
  // P4 usage attestation
  attestation_hash: string;
  attested_output_tokens: string;
  attested_at: string;
  // P4 dispute
  disputed: boolean;
  dispute_reason: string;
  disputed_at: string;
}

export interface InferenceProvider {
  address: string;
  model_ids: string[];
  max_concurrent: string;
  active_jobs: string;
  total_jobs: string;
  total_earnings: string;
  avg_latency_ms: string;
  endpoint: string;
  is_online: boolean;
  last_heartbeat: string;
}

export interface ModelVersion {
  id: string;
  model_id: string;
  version: string;
  storage_uri: string;
  checksum_sha256: string;
  size_bytes: string;
  changelog: string;
  created_at: string;
}

export interface QueryModelsResponse {
  models?: ModelRecord[];
}

export interface QueryModelResponse {
  model?: ModelRecord;
}

export interface QueryModelVersionsResponse {
  versions?: ModelVersion[];
}

export interface QueryInferenceJobResponse {
  job?: InferenceJob;
}

export interface QueryInferenceJobsResponse {
  jobs?: InferenceJob[];
}

export interface QueryInferenceProvidersResponse {
  providers?: InferenceProvider[];
}

export type ActiveTab = 'models' | 'jobs' | 'providers';
