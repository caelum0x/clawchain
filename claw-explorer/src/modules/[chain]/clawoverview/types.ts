// Response shapes for the ClawChain Modules overview dashboard.
// Each stat is derived best-effort from these REST envelopes; one failing
// endpoint must not break the rest of the grid.

export interface ModelsResponse {
  models?: unknown[];
}

export interface InferenceJobsResponse {
  jobs?: unknown[];
}

export interface InferenceProvidersResponse {
  providers?: unknown[];
}

export interface LiveAgentsResponse {
  agents?: unknown[];
}

export interface SkillsResponse {
  skills?: unknown[];
}

export interface ActivesResponse {
  actives?: string[];
}

export interface TreeStatsResponse {
  leaf_count?: string;
}

export interface ProposalsResponse {
  proposals?: unknown[];
}

// A single stat card rendered in the grid. `value` is null while loading or
// when the source endpoint is unavailable (rendered as a dash).
export interface StatCard {
  key: string;
  label: string;
  hint: string;
  to: string;
  value: number | null;
}
