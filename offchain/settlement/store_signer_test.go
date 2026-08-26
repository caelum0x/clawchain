package settlement

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestBoltStoreEdgeCases(t *testing.T) {
	ctx := context.Background()
	store, err := NewBoltStore(filepath.Join(t.TempDir(), "edge.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer store.Close()

	// Missing claim.
	if _, err := store.GetClaim(ctx, "missing"); err != ErrClaimNotFound {
		t.Fatalf("want ErrClaimNotFound, got %v", err)
	}
	// Unknown provider defaults to max reputation.
	if rep, err := store.Reputation(ctx, "unknown"); err != nil || rep != MaxReputationBps {
		t.Fatalf("unknown provider rep = %d (%v), want %d", rep, err, MaxReputationBps)
	}
	// Empty-key idempotency is a no-op.
	if o, err := store.GetIdempotent(ctx, ""); err != nil || o != nil {
		t.Fatalf("empty idem key must be nil no-op, got %v %v", o, err)
	}
	if err := store.PutIdempotent(ctx, "", &Outcome{}); err != nil {
		t.Fatalf("empty idem put must no-op, got %v", err)
	}
	// Missing idempotency key returns nil.
	if o, err := store.GetIdempotent(ctx, "never"); err != nil || o != nil {
		t.Fatalf("missing idem must be nil, got %v %v", o, err)
	}
	// Fee ledger accumulates and rejects bad amounts.
	if _, err := store.AddFee(ctx, "acct", "ufee", "not-a-number"); err == nil {
		t.Fatalf("AddFee must reject non-integer amount")
	}
	l1, err := store.AddFee(ctx, "acct", "ufee", "100")
	if err != nil || l1.Count != 1 || l1.Total != "100" {
		t.Fatalf("first fee wrong: %+v (%v)", l1, err)
	}
	l2, err := store.AddFee(ctx, "acct", "ufee", "50")
	if err != nil || l2.Count != 2 || l2.Total != "150" {
		t.Fatalf("second fee wrong: %+v (%v)", l2, err)
	}
	// Empty account fee ledger is zeroed, not an error.
	empty, err := store.GetFee(ctx, "nobody")
	if err != nil || empty.Total != "0" || empty.Count != 0 {
		t.Fatalf("empty ledger wrong: %+v (%v)", empty, err)
	}
}

func TestSignerErrors(t *testing.T) {
	if _, err := NewSigner([]byte("too-short")); err == nil {
		t.Fatalf("NewSigner must reject short seed")
	}
	signer, err := NewSigner(testSeed())
	if err != nil {
		t.Fatalf("signer: %v", err)
	}
	claim := &Claim{ID: "x", Status: StatusSettled}
	out, err := signer.Sign(EventSettled, claim, 1)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if err := VerifyOutcome(out); err != nil {
		t.Fatalf("valid outcome must verify: %v", err)
	}
	// Bad public key.
	bad := *out
	bad.PublicKey = "!!!not-base64!!!"
	if err := VerifyOutcome(&bad); err == nil {
		t.Fatalf("bad pubkey must fail verification")
	}
	// Bad signature encoding.
	bad2 := *out
	bad2.Signature = "!!!not-base64!!!"
	if err := VerifyOutcome(&bad2); err == nil {
		t.Fatalf("bad signature encoding must fail verification")
	}
	// Wrong digest.
	bad3 := *out
	bad3.Digest = "deadbeef"
	if err := VerifyOutcome(&bad3); err == nil {
		t.Fatalf("wrong digest must fail verification")
	}
}

func TestServiceErrorBranches(t *testing.T) {
	svc := newTestService(t)
	h := svc.Handler()

	// Wrong method on POST endpoints.
	for _, path := range []string{"/v1/claims", "/v1/disputes", "/v1/resolutions"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s GET want 405, got %d", path, rr.Code)
		}
	}
	// Wrong method on GET endpoints.
	for _, path := range []string{"/v1/fees/x"} {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s POST want 405, got %d", path, rr.Code)
		}
	}
	// Bad JSON body.
	req := httptest.NewRequest(http.MethodPost, "/v1/claims", bytes.NewBufferString("{not json"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("bad json want 400, got %d", rr.Code)
	}
}
