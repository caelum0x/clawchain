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

// DisputeReputationPenalty is the number of reputation points a provider loses
// when one of its completed inference jobs is disputed by the requester. Kept
// small/conservative; the reputation slash is best-effort and never blocks the
// dispute itself.
const DisputeReputationPenalty uint64 = 1
