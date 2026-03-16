package types

// ModelAccess records who has access to a model (for paid models).
type ModelAccess struct {
	ModelId    uint64 `json:"model_id"`
	Address    string `json:"address"`
	GrantedAt  int64  `json:"granted_at"`
	ExpiresAt  int64  `json:"expires_at,omitempty"` // 0 = permanent
	QueryCount uint64 `json:"query_count"`
}

// ModelUsageRecord tracks per-query usage for billing.
type ModelUsageRecord struct {
	ModelId     uint64 `json:"model_id"`
	User        string `json:"user"`
	QueryCount  uint64 `json:"query_count"`
	TotalPaid   string `json:"total_paid"`
	LastQueryAt int64  `json:"last_query_at"`
}
