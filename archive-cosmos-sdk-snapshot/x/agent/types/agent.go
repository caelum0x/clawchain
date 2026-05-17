package types

// SupportedActionTypes lists the allowed action types for MVP.
var SupportedActionTypes = map[string]bool{
	"transfer":   true,
	"coordinate": true,
	"query":      true,
}

// SupportedIntentTypes lists the allowed intent types for coordination.
var SupportedIntentTypes = map[string]bool{
	"joint_transfer": true,
	"data_share":     true,
	"consensus_vote": true,
}
