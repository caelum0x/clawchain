// REST response types for the x/marketplace module.
// Paths verified against x/marketplace/types/query.pb.gw.go:
//   GET /clawchain/marketplace/v1/params
//   GET /clawchain/marketplace/v1/skills
//   GET /clawchain/marketplace/v1/skill/{skill_id}

// A single skill listing as returned by the gRPC-gateway (JSON, snake_case).
export interface SkillRecord {
  id: string;
  owner: string;
  name: string;
  description: string;
  price: string;
  denom: string;
  active: boolean;
  purchase_count: string;
  version: string;
  category: string;
  tags?: string[];
  dependencies?: string[];
  total_revenue: string;
  block_height: string;
  timestamp: string;
}

export interface MarketplaceParams {
  max_skills_per_agent: string;
}

export interface ParamsResponse {
  params: MarketplaceParams;
}

export interface SkillsResponse {
  skills: SkillRecord[];
}
