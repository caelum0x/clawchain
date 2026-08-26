package settlement

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cosmossdk.io/math"
)

// Clock returns the current unix time. Injectable for deterministic tests.
type Clock func() int64

// Config configures an Engine.
type Config struct {
	// DisputePenalty is the reputation slash applied on a dispute (and restored
	// on rejection). Defaults to DefaultDisputePenalty (the on-chain constant).
	DisputePenalty uint64
	// Fees configures the metered per-operation charges.
	Fees FeeConfig
	// Clock overrides the time source (defaults to time.Now().Unix()).
	Clock Clock
}

// Engine runs the off-chain inference-settlement dispute/slash lifecycle. It is
// the reusable domain service; the HTTP layer (service.go) is a thin adapter
// over it.
type Engine struct {
	store   Store
	signer  *Signer
	feeHook FeeHook
	cfg     Config
}

// NewEngine wires an engine over a store, signer, and fee hook. A nil feeHook
// defaults to a LedgerFeeHook over the same store.
func NewEngine(store Store, signer *Signer, feeHook FeeHook, cfg Config) *Engine {
	if cfg.DisputePenalty == 0 {
		cfg.DisputePenalty = DefaultDisputePenalty
	}
	if cfg.Fees.Denom == "" {
		cfg.Fees = DefaultFeeConfig()
	}
	if cfg.Clock == nil {
		cfg.Clock = func() int64 { return time.Now().Unix() }
	}
	if feeHook == nil {
		feeHook = NewLedgerFeeHook(store)
	}
	return &Engine{store: store, signer: signer, feeHook: feeHook, cfg: cfg}
}

// SubmitRequest creates and settles an inference-settlement claim.
type SubmitRequest struct {
	IdempotencyKey string   `json:"idempotency_key"`
	ClaimID        string   `json:"claim_id"`
	ModelID        uint64   `json:"model_id"`
	Requester      string   `json:"requester"`
	Provider       string   `json:"provider"`
	Owner          string   `json:"owner"`
	InputDigest    string   `json:"input_digest"`
	Pricing        Pricing  `json:"pricing"`
	Escrow         math.Int `json:"escrow"`
	TokensUsed     uint64   `json:"tokens_used"`
}

// SubmitClaim validates a settlement claim, computes the deterministic
// payout/refund split, persists it as settled, meters a settlement fee, and
// returns a signed outcome. Idempotent on IdempotencyKey.
func (e *Engine) SubmitClaim(ctx context.Context, req SubmitRequest) (*Outcome, error) {
	if prior, err := e.replay(ctx, req.IdempotencyKey); err != nil || prior != nil {
		return prior, err
	}
	if err := validateSubmit(req); err != nil {
		return nil, err
	}
	if _, err := e.store.GetClaim(ctx, req.ClaimID); err == nil {
		return nil, fmt.Errorf("%w: claim %q already exists", ErrInvalidRequest, req.ClaimID)
	}

	escrow := orZero(req.Escrow)
	minPay := orZero(req.Pricing.MinPayment)
	if escrow.LT(minPay) {
		return nil, fmt.Errorf("%w: escrow %s < min payment %s", ErrInsufficientPayment, escrow, minPay)
	}

	payout, refund := ComputeSettlement(req.Pricing, escrow, req.TokensUsed)
	repBps, err := e.store.Reputation(ctx, req.Provider)
	if err != nil {
		return nil, err
	}

	now := e.cfg.Clock()
	claim := &Claim{
		ID:                    req.ClaimID,
		ModelID:               req.ModelID,
		Requester:             req.Requester,
		Provider:              req.Provider,
		Owner:                 req.Owner,
		InputDigest:           req.InputDigest,
		Pricing:               req.Pricing,
		Escrow:                escrow,
		TokensUsed:            req.TokensUsed,
		Payout:                payout,
		Refund:                refund,
		Status:                StatusSettled,
		CreatedAt:             now,
		ProviderReputationBps: repBps,
		Sequence:              1,
	}
	if err := e.store.PutClaim(ctx, claim); err != nil {
		return nil, err
	}
	if err := e.feeHook.Charge(ctx, FeeEvent{
		Kind: FeeKindSettlement, Account: req.Requester,
		Amount: e.cfg.Fees.amountFor(FeeKindSettlement), Denom: e.cfg.Fees.Denom, ClaimID: claim.ID,
	}); err != nil {
		return nil, fmt.Errorf("settlement fee charge failed: %w", err)
	}
	return e.finish(ctx, EventSettled, claim, req.IdempotencyKey, now)
}

// DisputeRequest opens a dispute against a settled claim.
type DisputeRequest struct {
	IdempotencyKey string `json:"idempotency_key"`
	ClaimID        string `json:"claim_id"`
	Requester      string `json:"requester"`
	Reason         string `json:"reason"`
}

// OpenDispute lets the original requester dispute a settled claim. It slashes
// the provider's reputation (saturating at 0), meters a dispute fee, and returns
// a signed outcome. Idempotent on IdempotencyKey.
func (e *Engine) OpenDispute(ctx context.Context, req DisputeRequest) (*Outcome, error) {
	if prior, err := e.replay(ctx, req.IdempotencyKey); err != nil || prior != nil {
		return prior, err
	}
	claim, err := e.store.GetClaim(ctx, req.ClaimID)
	if err != nil {
		return nil, err
	}
	if claim.Disputed {
		return nil, ErrAlreadyDisputed
	}
	if claim.Status != StatusSettled {
		return nil, ErrNotSettled
	}
	if req.Requester != claim.Requester {
		return nil, ErrNotRequester
	}

	// Slash the provider's reputation — faithful to the on-chain dispute slash.
	cur, err := e.store.Reputation(ctx, claim.Provider)
	if err != nil {
		return nil, err
	}
	newScore := SlashReputation(cur, e.cfg.DisputePenalty)
	if err := e.store.SetReputation(ctx, claim.Provider, newScore); err != nil {
		return nil, err
	}

	now := e.cfg.Clock()
	claim.Disputed = true
	claim.DisputeReason = req.Reason
	claim.DisputedAt = now
	claim.Status = StatusDisputed
	claim.ProviderReputationBps = newScore
	claim.Sequence++
	if err := e.store.PutClaim(ctx, claim); err != nil {
		return nil, err
	}
	if err := e.feeHook.Charge(ctx, FeeEvent{
		Kind: FeeKindDispute, Account: req.Requester,
		Amount: e.cfg.Fees.amountFor(FeeKindDispute), Denom: e.cfg.Fees.Denom, ClaimID: claim.ID,
	}); err != nil {
		return nil, fmt.Errorf("dispute fee charge failed: %w", err)
	}
	return e.finish(ctx, EventDisputed, claim, req.IdempotencyKey, now)
}

// ResolveRequest resolves a disputed claim.
type ResolveRequest struct {
	IdempotencyKey string `json:"idempotency_key"`
	ClaimID        string `json:"claim_id"`
	Owner          string `json:"owner"`
	Uphold         bool   `json:"uphold"`
}

// ResolveDispute lets the claim owner (arbiter/model owner) uphold or reject a
// dispute. Rejecting restores the reputation the dispute slashed; upholding
// leaves the slash standing. Status/reputation only — no funds move. Idempotent.
func (e *Engine) ResolveDispute(ctx context.Context, req ResolveRequest) (*Outcome, error) {
	if prior, err := e.replay(ctx, req.IdempotencyKey); err != nil || prior != nil {
		return prior, err
	}
	claim, err := e.store.GetClaim(ctx, req.ClaimID)
	if err != nil {
		return nil, err
	}
	if !claim.Disputed {
		return nil, ErrNotDisputed
	}
	if claim.Resolved {
		return nil, ErrAlreadyResolved
	}
	if req.Owner != claim.Owner {
		return nil, ErrNotOwner
	}

	score := claim.ProviderReputationBps
	if !req.Uphold {
		cur, err := e.store.Reputation(ctx, claim.Provider)
		if err != nil {
			return nil, err
		}
		score = RestoreReputation(cur, e.cfg.DisputePenalty)
		if err := e.store.SetReputation(ctx, claim.Provider, score); err != nil {
			return nil, err
		}
	}

	now := e.cfg.Clock()
	claim.Resolved = true
	claim.ResolutionUpheld = req.Uphold
	claim.ResolvedAt = now
	claim.Status = StatusResolved
	claim.ProviderReputationBps = score
	claim.Sequence++
	if err := e.store.PutClaim(ctx, claim); err != nil {
		return nil, err
	}
	return e.finish(ctx, EventResolved, claim, req.IdempotencyKey, now)
}

// GetClaim returns a stored claim by ID.
func (e *Engine) GetClaim(ctx context.Context, id string) (*Claim, error) {
	return e.store.GetClaim(ctx, id)
}

// Fees returns the accrued fee ledger for an account.
func (e *Engine) Fees(ctx context.Context, account string) (*FeeLedger, error) {
	return e.store.GetFee(ctx, account)
}

// PublicKeyB64 exposes the signer public key for verifiers.
func (e *Engine) PublicKeyB64() string { return e.signer.PublicKeyB64() }

// replay returns a previously stored idempotent outcome, if any.
func (e *Engine) replay(ctx context.Context, key string) (*Outcome, error) {
	if key == "" {
		return nil, nil
	}
	return e.store.GetIdempotent(ctx, key)
}

// finish signs the transition outcome, records it under the idempotency key,
// and returns it.
func (e *Engine) finish(ctx context.Context, event string, claim *Claim, idemKey string, now int64) (*Outcome, error) {
	outcome, err := e.signer.Sign(event, claim, now)
	if err != nil {
		return nil, err
	}
	if err := e.store.PutIdempotent(ctx, idemKey, outcome); err != nil {
		return nil, err
	}
	return outcome, nil
}

func validateSubmit(req SubmitRequest) error {
	missing := func(name, v string) error {
		if strings.TrimSpace(v) == "" {
			return fmt.Errorf("%w: %s is required", ErrInvalidRequest, name)
		}
		return nil
	}
	for _, check := range []struct {
		name, val string
	}{
		{"claim_id", req.ClaimID},
		{"requester", req.Requester},
		{"provider", req.Provider},
		{"owner", req.Owner},
	} {
		if err := missing(check.name, check.val); err != nil {
			return err
		}
	}
	if !orZero(req.Escrow).IsNegative() {
		return nil
	}
	return fmt.Errorf("%w: escrow must be non-negative", ErrInvalidRequest)
}
