// Package settlement implements ClawChain's inference-settlement and
// dispute/slash lifecycle as an off-chain, chain-independent SaaS surface.
//
// It is a faithful off-chain port of the deterministic domain logic that lives
// on-chain in x/modelregistry (Keeper.CompleteInferenceJob settlement math,
// Keeper.DisputeInferenceJob / Keeper.ResolveInferenceDispute status machine)
// and x/reputation (saturating SlashReputation / RestoreReputation). It reuses
// the on-chain status vocabulary and the DisputeReputationPenalty constant from
// x/modelregistry/types so the off-chain outcomes stay bit-for-bit aligned with
// what the chain would compute — WITHOUT importing or running consensus,
// validators, keys, or the bank module. No funds move: settlement here is a
// deterministic accounting outcome (payout / refund split) that a caller can
// settle however they like.
package settlement

import (
	"errors"

	"cosmossdk.io/math"

	mrtypes "clawchain/x/modelregistry/types"
)

// Claim lifecycle statuses. These mirror the meaningful terminal states of an
// on-chain inference job as it flows through the dispute machine. A claim is
// created already "settled" because an off-chain settlement claim represents a
// completed inference job whose payout/refund split has been computed.
const (
	StatusSettled  = "settled"
	StatusDisputed = "disputed"
	StatusResolved = "resolved"
)

// Event names for signed outcomes, one per state transition.
const (
	EventSettled  = "settled"
	EventDisputed = "disputed"
	EventResolved = "resolved"
)

// DefaultDisputePenalty is the reputation penalty applied to a provider when one
// of its settlements is disputed. It defaults to the exact on-chain constant so
// off-chain slashing matches the chain; it is configurable per deployment.
const DefaultDisputePenalty = mrtypes.DisputeReputationPenalty

// MaxReputationBps is the ceiling for a provider reputation score, matching the
// on-chain x/reputation maxUptimeScoreBps. Fresh providers start here.
const MaxReputationBps uint64 = 10000

// Pricing mirrors x/modelregistry types.InferencePricing. All amounts are
// integer base units (e.g. uclaw), matching the on-chain math.Int usage.
type Pricing struct {
	PricePerToken math.Int `json:"price_per_token"`
	PricePerQuery math.Int `json:"price_per_query"`
	MinPayment    math.Int `json:"min_payment"`
	MaxTokens     uint64   `json:"max_tokens"`
}

// Claim is the persisted state of one inference-settlement claim as it moves
// through the settle -> dispute -> resolve lifecycle. It is the off-chain analog
// of the on-chain types.InferenceJob dispute fields.
type Claim struct {
	ID          string `json:"id"`
	ModelID     uint64 `json:"model_id"`
	Requester   string `json:"requester"`    // party who paid for inference (may dispute)
	Provider    string `json:"provider"`     // party who served inference (gets slashed)
	Owner       string `json:"owner"`        // arbiter (model owner) authorized to resolve
	InputDigest string `json:"input_digest"` // opaque hash of the inference input/output

	Pricing    Pricing  `json:"pricing"`
	Escrow     math.Int `json:"escrow"` // amount the requester escrowed
	TokensUsed uint64   `json:"tokens_used"`

	// Deterministic settlement outcome (payout to provider, refund to requester).
	Payout math.Int `json:"payout"`
	Refund math.Int `json:"refund"`

	Status    string `json:"status"`
	CreatedAt int64  `json:"created_at"`

	// Dispute fields (set on OpenDispute).
	Disputed      bool   `json:"disputed"`
	DisputeReason string `json:"dispute_reason,omitempty"`
	DisputedAt    int64  `json:"disputed_at,omitempty"`

	// Resolution fields (set on ResolveDispute).
	Resolved         bool  `json:"resolved"`
	ResolutionUpheld bool  `json:"resolution_upheld"`
	ResolvedAt       int64 `json:"resolved_at,omitempty"`

	// ProviderReputationBps is the provider's reputation after the latest
	// transition (post-slash on dispute, post-restore on rejected resolution).
	ProviderReputationBps uint64 `json:"provider_reputation_bps"`

	// Sequence is a monotonic per-claim counter incremented on every signed
	// transition. It makes replayed/idempotent outcomes verifiable and ordered.
	Sequence uint64 `json:"sequence"`
}

// Domain errors. These map cleanly onto HTTP status codes in the service layer.
var (
	ErrInvalidRequest      = errors.New("invalid request")
	ErrClaimNotFound       = errors.New("claim not found")
	ErrInsufficientPayment = errors.New("payment below minimum")
	ErrNotRequester        = errors.New("only the requester may dispute this claim")
	ErrNotOwner            = errors.New("only the claim owner may resolve this dispute")
	ErrNotSettled          = errors.New("claim is not in a disputable (settled) state")
	ErrAlreadyDisputed     = errors.New("claim already disputed")
	ErrNotDisputed         = errors.New("claim is not disputed")
	ErrAlreadyResolved     = errors.New("dispute already resolved")
)
