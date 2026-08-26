package settlement

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"cosmossdk.io/math"
)

// fixedClock returns a deterministic time source.
func fixedClock(t int64) Clock { return func() int64 { return t } }

// testSeed is a deterministic 32-byte ed25519 seed for reproducible signatures.
func testSeed() []byte {
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = byte(i + 1)
	}
	return seed
}

// countingHook wraps a FeeHook and records every event for assertions. It is a
// real hook over a real ledger, not a mock of the domain.
type countingHook struct {
	mu     sync.Mutex
	inner  FeeHook
	events []FeeEvent
}

func (h *countingHook) Charge(ctx context.Context, ev FeeEvent) error {
	h.mu.Lock()
	h.events = append(h.events, ev)
	h.mu.Unlock()
	return h.inner.Charge(ctx, ev)
}

func (h *countingHook) count(kind FeeKind) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, e := range h.events {
		if e.Kind == kind {
			n++
		}
	}
	return n
}

// newTestEngine builds an Engine over a real bbolt store in a temp dir.
func newTestEngine(t *testing.T, clock int64) (*Engine, *BoltStore, *countingHook) {
	t.Helper()
	dir := t.TempDir()
	store, err := NewBoltStore(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	signer, err := NewSigner(testSeed())
	if err != nil {
		t.Fatalf("signer: %v", err)
	}
	hook := &countingHook{inner: NewLedgerFeeHook(store)}
	eng := NewEngine(store, signer, hook, Config{Clock: fixedClock(clock)})
	return eng, store, hook
}

func sampleSubmit(id string) SubmitRequest {
	return SubmitRequest{
		IdempotencyKey: "idem-" + id,
		ClaimID:        id,
		ModelID:        7,
		Requester:      "claw1requester",
		Provider:       "claw1provider",
		Owner:          "claw1owner",
		InputDigest:    "sha256:abc",
		Pricing:        Pricing{PricePerToken: math.NewInt(10), PricePerQuery: math.NewInt(50), MinPayment: math.NewInt(100)},
		Escrow:         math.NewInt(1000),
		TokensUsed:     20,
	}
}

// TestLifecycleUpheld drives submit -> dispute -> resolve(uphold): the slash stands.
func TestLifecycleUpheld(t *testing.T) {
	ctx := context.Background()
	eng, store, hook := newTestEngine(t, 1000)

	out, err := eng.SubmitClaim(ctx, sampleSubmit("job-1"))
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if out.Event != EventSettled || out.Claim.Status != StatusSettled {
		t.Fatalf("unexpected settle outcome: %+v", out.Claim)
	}
	if !out.Claim.Payout.Equal(math.NewInt(200)) || !out.Claim.Refund.Equal(math.NewInt(800)) {
		t.Fatalf("settlement math wrong: payout=%s refund=%s", out.Claim.Payout, out.Claim.Refund)
	}
	if out.Claim.ProviderReputationBps != MaxReputationBps {
		t.Fatalf("provider should start at max rep, got %d", out.Claim.ProviderReputationBps)
	}
	if err := VerifyOutcome(out); err != nil {
		t.Fatalf("settle outcome must verify: %v", err)
	}

	dout, err := eng.OpenDispute(ctx, DisputeRequest{IdempotencyKey: "d-1", ClaimID: "job-1", Requester: "claw1requester", Reason: "bad output"})
	if err != nil {
		t.Fatalf("dispute: %v", err)
	}
	if !dout.Claim.Disputed || dout.Claim.Status != StatusDisputed {
		t.Fatalf("claim should be disputed: %+v", dout.Claim)
	}
	wantSlashed := MaxReputationBps - DefaultDisputePenalty
	if dout.Claim.ProviderReputationBps != wantSlashed {
		t.Fatalf("provider rep after slash = %d, want %d", dout.Claim.ProviderReputationBps, wantSlashed)
	}
	if err := VerifyOutcome(dout); err != nil {
		t.Fatalf("dispute outcome must verify: %v", err)
	}

	rout, err := eng.ResolveDispute(ctx, ResolveRequest{IdempotencyKey: "r-1", ClaimID: "job-1", Owner: "claw1owner", Uphold: true})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if !rout.Claim.Resolved || !rout.Claim.ResolutionUpheld || rout.Claim.Status != StatusResolved {
		t.Fatalf("claim should be resolved+upheld: %+v", rout.Claim)
	}
	// Upheld: slash stands.
	if rout.Claim.ProviderReputationBps != wantSlashed {
		t.Fatalf("upheld rep = %d, want %d", rout.Claim.ProviderReputationBps, wantSlashed)
	}
	repNow, _ := store.Reputation(ctx, "claw1provider")
	if repNow != wantSlashed {
		t.Fatalf("stored rep = %d, want %d", repNow, wantSlashed)
	}
	// One settlement fee + one dispute fee.
	if hook.count(FeeKindSettlement) != 1 || hook.count(FeeKindDispute) != 1 {
		t.Fatalf("fee events wrong: settle=%d dispute=%d", hook.count(FeeKindSettlement), hook.count(FeeKindDispute))
	}
}

// TestLifecycleRejected drives submit -> dispute -> resolve(reject): rep restored.
func TestLifecycleRejected(t *testing.T) {
	ctx := context.Background()
	eng, store, _ := newTestEngine(t, 2000)

	if _, err := eng.SubmitClaim(ctx, sampleSubmit("job-2")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err := eng.OpenDispute(ctx, DisputeRequest{IdempotencyKey: "d-2", ClaimID: "job-2", Requester: "claw1requester", Reason: "x"}); err != nil {
		t.Fatalf("dispute: %v", err)
	}
	rout, err := eng.ResolveDispute(ctx, ResolveRequest{IdempotencyKey: "r-2", ClaimID: "job-2", Owner: "claw1owner", Uphold: false})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if rout.Claim.ResolutionUpheld {
		t.Fatalf("resolution should be rejected")
	}
	if rout.Claim.ProviderReputationBps != MaxReputationBps {
		t.Fatalf("rejected dispute must restore rep to %d, got %d", MaxReputationBps, rout.Claim.ProviderReputationBps)
	}
	rep, _ := store.Reputation(ctx, "claw1provider")
	if rep != MaxReputationBps {
		t.Fatalf("stored rep after restore = %d, want %d", rep, MaxReputationBps)
	}
}

// TestDeterminism proves identical inputs yield byte-identical signed outcomes
// across two independent engines/stores.
func TestDeterminism(t *testing.T) {
	ctx := context.Background()
	engA, _, _ := newTestEngine(t, 12345)
	engB, _, _ := newTestEngine(t, 12345)

	outA, err := engA.SubmitClaim(ctx, sampleSubmit("job-det"))
	if err != nil {
		t.Fatalf("A submit: %v", err)
	}
	outB, err := engB.SubmitClaim(ctx, sampleSubmit("job-det"))
	if err != nil {
		t.Fatalf("B submit: %v", err)
	}
	if outA.Digest != outB.Digest {
		t.Fatalf("digests differ: %s vs %s", outA.Digest, outB.Digest)
	}
	if outA.Signature != outB.Signature {
		t.Fatalf("signatures differ across engines")
	}
}

// TestIdempotency proves replays don't double-charge or double-slash.
func TestIdempotency(t *testing.T) {
	ctx := context.Background()
	eng, store, hook := newTestEngine(t, 500)

	req := sampleSubmit("job-idem")
	out1, err := eng.SubmitClaim(ctx, req)
	if err != nil {
		t.Fatalf("submit 1: %v", err)
	}
	out2, err := eng.SubmitClaim(ctx, req) // same idempotency key
	if err != nil {
		t.Fatalf("submit 2: %v", err)
	}
	if out1.Signature != out2.Signature || out1.Digest != out2.Digest {
		t.Fatalf("idempotent submit must return identical outcome")
	}
	if hook.count(FeeKindSettlement) != 1 {
		t.Fatalf("settlement charged %d times, want 1", hook.count(FeeKindSettlement))
	}

	// Dispute twice with same idempotency key -> slash exactly once.
	dreq := DisputeRequest{IdempotencyKey: "d-idem", ClaimID: "job-idem", Requester: "claw1requester", Reason: "r"}
	if _, err := eng.OpenDispute(ctx, dreq); err != nil {
		t.Fatalf("dispute 1: %v", err)
	}
	if _, err := eng.OpenDispute(ctx, dreq); err != nil {
		t.Fatalf("dispute 2 (replay): %v", err)
	}
	if hook.count(FeeKindDispute) != 1 {
		t.Fatalf("dispute charged %d times, want 1", hook.count(FeeKindDispute))
	}
	rep, _ := store.Reputation(ctx, "claw1provider")
	if rep != MaxReputationBps-DefaultDisputePenalty {
		t.Fatalf("rep slashed %d, want single slash to %d", rep, MaxReputationBps-DefaultDisputePenalty)
	}

	// Fee ledger reflects exactly one settlement + one dispute charge.
	ledger, _ := store.GetFee(ctx, "claw1requester")
	if ledger.Count != 2 {
		t.Fatalf("fee ledger count = %d, want 2", ledger.Count)
	}
	wantTotal := math.NewInt(1000 + 5000) // default settle+dispute fees
	gotTotal, _ := math.NewIntFromString(ledger.Total)
	if !gotTotal.Equal(wantTotal) {
		t.Fatalf("fee ledger total = %s, want %s", ledger.Total, wantTotal)
	}
}

// TestGuards checks the authorization and state-machine guards.
func TestGuards(t *testing.T) {
	ctx := context.Background()
	eng, _, _ := newTestEngine(t, 1)

	// dispute before submit -> not found
	if _, err := eng.OpenDispute(ctx, DisputeRequest{ClaimID: "nope", Requester: "claw1requester"}); !errors.Is(err, ErrClaimNotFound) {
		t.Fatalf("want ErrClaimNotFound, got %v", err)
	}

	if _, err := eng.SubmitClaim(ctx, sampleSubmit("g1")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	// wrong requester
	if _, err := eng.OpenDispute(ctx, DisputeRequest{ClaimID: "g1", Requester: "claw1intruder"}); !errors.Is(err, ErrNotRequester) {
		t.Fatalf("want ErrNotRequester, got %v", err)
	}
	// resolve before dispute
	if _, err := eng.ResolveDispute(ctx, ResolveRequest{ClaimID: "g1", Owner: "claw1owner", Uphold: true}); !errors.Is(err, ErrNotDisputed) {
		t.Fatalf("want ErrNotDisputed, got %v", err)
	}
	// valid dispute, then wrong owner resolve
	if _, err := eng.OpenDispute(ctx, DisputeRequest{ClaimID: "g1", Requester: "claw1requester", Reason: "r"}); err != nil {
		t.Fatalf("dispute: %v", err)
	}
	if _, err := eng.OpenDispute(ctx, DisputeRequest{ClaimID: "g1", Requester: "claw1requester", Reason: "again"}); !errors.Is(err, ErrAlreadyDisputed) {
		t.Fatalf("want ErrAlreadyDisputed, got %v", err)
	}
	if _, err := eng.ResolveDispute(ctx, ResolveRequest{ClaimID: "g1", Owner: "claw1intruder", Uphold: true}); !errors.Is(err, ErrNotOwner) {
		t.Fatalf("want ErrNotOwner, got %v", err)
	}
	if _, err := eng.ResolveDispute(ctx, ResolveRequest{ClaimID: "g1", Owner: "claw1owner", Uphold: true}); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	// double resolve
	if _, err := eng.ResolveDispute(ctx, ResolveRequest{ClaimID: "g1", Owner: "claw1owner", Uphold: true}); !errors.Is(err, ErrAlreadyResolved) {
		t.Fatalf("want ErrAlreadyResolved, got %v", err)
	}
}

// TestInsufficientPayment checks the min-payment guard from SubmitInferenceJob.
func TestInsufficientPayment(t *testing.T) {
	ctx := context.Background()
	eng, _, _ := newTestEngine(t, 1)
	req := sampleSubmit("low")
	req.Escrow = math.NewInt(50) // below MinPayment=100
	if _, err := eng.SubmitClaim(ctx, req); !errors.Is(err, ErrInsufficientPayment) {
		t.Fatalf("want ErrInsufficientPayment, got %v", err)
	}
}

// TestTamperDetection ensures a mutated outcome fails verification.
func TestTamperDetection(t *testing.T) {
	ctx := context.Background()
	eng, _, _ := newTestEngine(t, 1)
	out, err := eng.SubmitClaim(ctx, sampleSubmit("tamper"))
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if err := VerifyOutcome(out); err != nil {
		t.Fatalf("clean outcome must verify: %v", err)
	}
	out.Claim.Payout = math.NewInt(999999) // tamper
	if err := VerifyOutcome(out); err == nil {
		t.Fatalf("tampered outcome must NOT verify")
	}
}
