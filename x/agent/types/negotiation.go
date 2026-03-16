package types

// NegotiationStatus defines the lifecycle of a negotiation.
const (
	NegotiationStatusOpen      = "open"
	NegotiationStatusCountered = "countered"
	NegotiationStatusAccepted  = "accepted"
	NegotiationStatusRejected  = "rejected"
	NegotiationStatusExpired   = "expired"
	NegotiationStatusCancelled = "cancelled"
)

// Negotiation represents an on-chain negotiation between two agents.
type Negotiation struct {
	Id               uint64             `json:"id"`
	Initiator        string             `json:"initiator"`                   // agent proposing
	Counterparty     string             `json:"counterparty"`                // agent receiving proposal
	Description      string             `json:"description"`                 // what the task is
	Requirements     string             `json:"requirements"`                // structured requirements (JSON)
	SkillId          uint64             `json:"skill_id,omitempty"`          // optional marketplace skill ref
	ProposedBudget   string             `json:"proposed_budget"`             // uclaw amount
	ProposedDeadline int64              `json:"proposed_deadline"`           // blocks from creation
	Status           string             `json:"status"`
	Round            uint32             `json:"round"`                       // negotiation round (0=initial, increments on counter)
	MaxRounds        uint32             `json:"max_rounds"`                  // max rounds before auto-expire (default 5)
	LastProposer     string             `json:"last_proposer"`               // who made the last proposal
	CreatedAt        int64              `json:"created_at"`                  // block height
	UpdatedAt        int64              `json:"updated_at"`
	ExpiresAt        int64              `json:"expires_at"`                  // block height for auto-expiry
	History          []NegotiationRound `json:"history,omitempty"`
}

// NegotiationRound records one proposal or counter-proposal.
type NegotiationRound struct {
	Round    uint32 `json:"round"`
	Proposer string `json:"proposer"`
	Budget   string `json:"budget"`
	Deadline int64  `json:"deadline"`
	Message  string `json:"message,omitempty"` // optional message
	Height   int64  `json:"height"`
}

// DefaultNegotiationMaxRounds is the default maximum number of rounds before
// a negotiation auto-expires.
const DefaultNegotiationMaxRounds uint32 = 5

// DefaultNegotiationExpiryBlocks is the default number of blocks from creation
// until a negotiation auto-expires.
const DefaultNegotiationExpiryBlocks int64 = 200
