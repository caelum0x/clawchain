package types

// QueryAgentRewardsRequest is the request for the AgentRewards query.
type QueryAgentRewardsRequest struct {
	Address string
}

// QueryAgentRewardsResponse is the response for the AgentRewards query.
type QueryAgentRewardsResponse struct {
	Address           string `json:"address"`
	CumulativeRewards string `json:"cumulative_rewards"`
	Denom             string `json:"denom"`
}
