// REST response types for the x/governance (ClawChain parameter-governance) module.
// Paths verified against x/governance/types/query.pb.gw.go:
//   GET /clawchain/governance/v1/proposals            (list, optional ?status=)
//   GET /clawchain/governance/v1/proposal/{proposal_id}
//   GET /clawchain/governance/v1/proposal/{proposal_id}/votes
//   GET /clawchain/governance/v1/params
// Field names from x/governance/types/*.pb.go json tags.

// A single parameter-change governance proposal (JSON, snake_case).
export interface Proposal {
  proposal_id: string;
  title: string;
  description: string;
  module: string;
  param_key: string;
  proposed_value: string;
  proposer: string;
  deposit: string;
  status: string;
  voting_end_block: string;
  yes_votes: string;
  no_votes: string;
  abstain_votes: string;
  veto_votes: string;
  created_at: string;
  execution_height: string;
  execution_error: string;
}

export interface Vote {
  proposal_id: string;
  voter: string;
  option: string;
  weight: string;
}

export interface GovParams {
  voting_period_blocks: string;
  min_deposit_uclaw: string;
  quorum_bps: string;
  threshold_bps: string;
}

export interface ProposalsResponse {
  proposals: Proposal[];
}

export interface ProposalResponse {
  proposal: Proposal | null;
}

export interface VotesResponse {
  votes: Vote[];
}

export interface ParamsResponse {
  params: GovParams | null;
}
