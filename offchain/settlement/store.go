package settlement

import "context"

// FeeLedger is the accrued, billable fee total for one account. It is the
// metering record the SaaS bills against.
type FeeLedger struct {
	Account string `json:"account"`
	Denom   string `json:"denom"`
	Total   string `json:"total"` // math.Int as string
	Count   uint64 `json:"count"` // number of chargeable events
}

// Store is the persistence boundary for the settlement service. It is
// deliberately small and storage-agnostic; the production implementation is a
// real embedded bbolt database (see boltstore.go). All methods must be safe for
// concurrent use.
type Store interface {
	// GetClaim returns the claim by ID, or (nil, ErrClaimNotFound).
	GetClaim(ctx context.Context, id string) (*Claim, error)
	// PutClaim persists a claim (create or overwrite).
	PutClaim(ctx context.Context, c *Claim) error

	// Reputation returns a provider's current reputation in bps, defaulting to
	// MaxReputationBps for a provider never seen before (fresh providers start
	// at the ceiling, matching on-chain semantics for a full-score agent).
	Reputation(ctx context.Context, provider string) (uint64, error)
	// SetReputation persists a provider reputation score.
	SetReputation(ctx context.Context, provider string, bps uint64) error

	// GetIdempotent returns a previously stored outcome for an idempotency key,
	// or (nil, nil) if none exists. This gives exactly-once semantics for
	// slashing and fee charges across client retries.
	GetIdempotent(ctx context.Context, key string) (*Outcome, error)
	// PutIdempotent stores the outcome produced for an idempotency key.
	PutIdempotent(ctx context.Context, key string, o *Outcome) error

	// AddFee atomically accrues a fee for an account and returns the new ledger.
	AddFee(ctx context.Context, account, denom, amount string) (*FeeLedger, error)
	// GetFee returns the accrued fee ledger for an account (zeroed if none).
	GetFee(ctx context.Context, account string) (*FeeLedger, error)

	// Close releases resources.
	Close() error
}
