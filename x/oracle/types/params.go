package types

// OracleParams defines the oracle module parameters.
type OracleParams struct {
	VotePeriod        uint64   `json:"vote_period"`
	VoteThreshold     string   `json:"vote_threshold"`
	RewardBand        string   `json:"reward_band"`
	SlashFraction     string   `json:"slash_fraction"`
	SlashWindow       uint64   `json:"slash_window"`
	MinValidPerWindow string   `json:"min_valid_per_window"`
	Whitelist         []string `json:"whitelist"`
}

// DefaultParams returns the default oracle parameters.
var DefaultParams = OracleParams{
	VotePeriod:        10,
	VoteThreshold:     "0.50",
	RewardBand:        "0.02",
	SlashFraction:     "0.0001",
	SlashWindow:       100,
	MinValidPerWindow: "0.05",
	Whitelist:         []string{"CLAW/USD", "CLAW/ATOM", "ATOM/USD"},
}

// NewParams returns a copy of the default params.
func NewParams() OracleParams {
	return DefaultParams
}
