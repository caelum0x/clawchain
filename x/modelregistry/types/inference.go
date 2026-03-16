package types

const (
	InferenceStatusPending   = "pending"
	InferenceStatusRunning   = "running"
	InferenceStatusCompleted = "completed"
	InferenceStatusFailed    = "failed"
	InferenceStatusTimeout   = "timeout"
)

// DefaultInferenceTimeoutBlocks is the default number of blocks before an inference job times out.
const DefaultInferenceTimeoutBlocks int64 = 100

// ProviderHeartbeatTimeout is the number of blocks after which a provider is considered offline.
const ProviderHeartbeatTimeout int64 = 50
