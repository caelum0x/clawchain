package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/agent module sentinel errors
var (
	ErrInvalidSigner          = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrAgentAlreadyExists     = errors.Register(ModuleName, 1101, "agent already registered")
	ErrAgentNotFound          = errors.Register(ModuleName, 1102, "agent not found")
	ErrUnsupportedAction      = errors.Register(ModuleName, 1103, "unsupported action type")
	ErrInvalidAddress         = errors.Register(ModuleName, 1104, "invalid address")
	ErrInvalidAgentName       = errors.Register(ModuleName, 1105, "invalid agent name")
	ErrInvalidPubkey          = errors.Register(ModuleName, 1106, "invalid pubkey")
	ErrIntentNotFound         = errors.Register(ModuleName, 1107, "intent not found")
	ErrIntentNotPending       = errors.Register(ModuleName, 1108, "intent is not in pending status")
	ErrIntentAlreadyResponded = errors.Register(ModuleName, 1109, "agent has already responded to this intent")
	ErrNotIntentCreator       = errors.Register(ModuleName, 1110, "only the intent creator can perform this action")
	ErrUnsupportedIntentType  = errors.Register(ModuleName, 1111, "unsupported intent type")
	ErrInvalidIntentPayload   = errors.Register(ModuleName, 1112, "invalid intent payload")
	ErrSelfResponse           = errors.Register(ModuleName, 1113, "creator cannot respond to their own intent")
	ErrAgentInactive          = errors.Register(ModuleName, 1114, "agent is inactive (deactivated due to stale heartbeat)")
	ErrTaskNotFound           = errors.Register(ModuleName, 1115, "task not found")
	ErrNotAssignee            = errors.Register(ModuleName, 1116, "only the assignee can perform this action")
	ErrTaskNotPending         = errors.Register(ModuleName, 1117, "task is not in pending status")
	ErrTaskNotAccepted        = errors.Register(ModuleName, 1118, "task is not in accepted status")
	ErrSelfDelegation         = errors.Register(ModuleName, 1119, "cannot delegate task to yourself")
	ErrInvalidBudget          = errors.Register(ModuleName, 1120, "invalid budget amount")
	ErrRateLimitExceeded      = errors.Register(ModuleName, 1121, "agent action rate limit exceeded")
	ErrHeartbeatTooFrequent   = errors.Register(ModuleName, 1122, "heartbeat sent too frequently")
	ErrPayloadTooLarge        = errors.Register(ModuleName, 1123, "payload exceeds max_payload_bytes")
	ErrInsufficientDeposit    = errors.Register(ModuleName, 1124, "insufficient deposit")
	ErrAgentHasActiveTasks    = errors.Register(ModuleName, 1125, "agent has active tasks and cannot deregister")
	ErrNegotiationNotFound    = errors.Register(ModuleName, 1126, "negotiation not found")
	ErrNegotiationNotActive   = errors.Register(ModuleName, 1127, "negotiation is not in an active status")
	ErrNotNegotiationParty    = errors.Register(ModuleName, 1128, "caller is not a party to this negotiation")
	ErrNotCounterparty        = errors.Register(ModuleName, 1129, "only the counterparty (non-last-proposer) may perform this action")
	ErrNegotiationMaxRounds   = errors.Register(ModuleName, 1130, "negotiation has reached the maximum number of rounds")
	ErrSelfNegotiation        = errors.Register(ModuleName, 1131, "cannot negotiate with yourself")
	ErrInsufficientReputation = errors.Register(ModuleName, 1132, "agent reputation below minimum for this task tier")
	ErrInvalidCheckpoint      = errors.Register(ModuleName, 1133, "invalid checkpoint data")
)
