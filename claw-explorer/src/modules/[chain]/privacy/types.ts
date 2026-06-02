// Response shapes for x/privacy REST endpoints.
// Field names mirror the json tags in x/privacy/types/query.pb.go.

export interface PrivacyParams {
  max_privacy_tx_per_block: string;
}

export interface ParamsResponse {
  params: PrivacyParams;
}

export interface TreeStatsResponse {
  leaf_count: string;
  current_root: string;
  tree_depth: number;
}

export interface MerkleRootResponse {
  root: string;
}

export interface NullifierExistsResponse {
  exists: boolean;
}
