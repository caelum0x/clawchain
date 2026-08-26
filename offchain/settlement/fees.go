package settlement

import (
	"context"

	"cosmossdk.io/math"
)

// FeeKind identifies which billable operation triggered a fee.
type FeeKind string

const (
	FeeKindSettlement FeeKind = "settlement"
	FeeKindDispute    FeeKind = "dispute"
)

// FeeEvent describes a single billable event handed to a FeeHook. It is the
// metering primitive that makes the service chargeable: every settlement and
// every dispute produces exactly one FeeEvent (once — idempotency-protected).
type FeeEvent struct {
	Kind    FeeKind  `json:"kind"`
	Account string   `json:"account"` // party billed for the event
	Amount  math.Int `json:"amount"`
	Denom   string   `json:"denom"`
	ClaimID string   `json:"claim_id"`
}

// FeeHook is invoked once per billable event. Implementations can accrue to a
// ledger, forward to a payments provider, or emit usage records. A hook error
// aborts the operation before any state transition is persisted, so billing and
// state stay consistent.
type FeeHook interface {
	Charge(ctx context.Context, ev FeeEvent) error
}

// FeeConfig configures per-operation pricing for the metered SaaS surface. All
// amounts are integer base units of Denom. Zero amounts disable that charge.
type FeeConfig struct {
	Denom         string
	PerSettlement math.Int
	PerDispute    math.Int
}

// DefaultFeeConfig returns a sane, non-zero default so the surface is billable
// out of the box: 1000 base units per settlement, 5000 per dispute.
func DefaultFeeConfig() FeeConfig {
	return FeeConfig{
		Denom:         "ufee",
		PerSettlement: math.NewInt(1000),
		PerDispute:    math.NewInt(5000),
	}
}

// amountFor returns the configured fee for a given kind (zero if unset).
func (c FeeConfig) amountFor(kind FeeKind) math.Int {
	switch kind {
	case FeeKindSettlement:
		return orZero(c.PerSettlement)
	case FeeKindDispute:
		return orZero(c.PerDispute)
	default:
		return math.ZeroInt()
	}
}

// LedgerFeeHook is the default FeeHook: it accrues charges into the Store's
// per-account fee ledger, which the SaaS bills against. It is real persistence,
// not a mock.
type LedgerFeeHook struct {
	store Store
}

// NewLedgerFeeHook builds a LedgerFeeHook over the given store.
func NewLedgerFeeHook(store Store) *LedgerFeeHook {
	return &LedgerFeeHook{store: store}
}

// Charge implements FeeHook by accruing the amount to the account's ledger.
// A zero amount is a no-op (no ledger row churn for free operations).
func (h *LedgerFeeHook) Charge(ctx context.Context, ev FeeEvent) error {
	amt := orZero(ev.Amount)
	if !amt.IsPositive() {
		return nil
	}
	_, err := h.store.AddFee(ctx, ev.Account, ev.Denom, amt.String())
	return err
}
