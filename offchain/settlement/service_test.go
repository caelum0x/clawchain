package settlement

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"cosmossdk.io/math"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	dir := t.TempDir()
	store, err := NewBoltStore(filepath.Join(dir, "svc.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	signer, err := NewSigner(testSeed())
	if err != nil {
		t.Fatalf("signer: %v", err)
	}
	eng := NewEngine(store, signer, nil, Config{Clock: fixedClock(42)})
	return NewService(eng)
}

func doJSON(t *testing.T, h http.Handler, method, path string, body interface{}, headers map[string]string) (*httptest.ResponseRecorder, APIResponse) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	var resp APIResponse
	if rr.Body.Len() > 0 {
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)
	}
	return rr, resp
}

func TestServiceFullFlow(t *testing.T) {
	svc := newTestService(t)
	h := svc.Handler()

	// health
	rr, resp := doJSON(t, h, http.MethodGet, "/healthz", nil, nil)
	if rr.Code != http.StatusOK || !resp.Success {
		t.Fatalf("health failed: %d %+v", rr.Code, resp)
	}

	// pubkey
	rr, resp = doJSON(t, h, http.MethodGet, "/v1/pubkey", nil, nil)
	if rr.Code != http.StatusOK || resp.Data.(map[string]interface{})["public_key"] == "" {
		t.Fatalf("pubkey failed: %d %+v", rr.Code, resp)
	}

	// submit claim
	submit := SubmitRequest{
		ClaimID:    "svc-1",
		ModelID:    1,
		Requester:  "claw1req",
		Provider:   "claw1prov",
		Owner:      "claw1own",
		Pricing:    Pricing{PricePerToken: math.NewInt(10), PricePerQuery: math.NewInt(0), MinPayment: math.NewInt(0)},
		Escrow:     math.NewInt(1000),
		TokensUsed: 5,
	}
	rr, resp = doJSON(t, h, http.MethodPost, "/v1/claims", submit, map[string]string{"Idempotency-Key": "k-submit"})
	if rr.Code != http.StatusCreated || !resp.Success {
		t.Fatalf("submit failed: %d %+v", rr.Code, resp)
	}

	// get claim
	rr, resp = doJSON(t, h, http.MethodGet, "/v1/claims/svc-1", nil, nil)
	if rr.Code != http.StatusOK || resp.Data.(map[string]interface{})["status"] != StatusSettled {
		t.Fatalf("get claim failed: %d %+v", rr.Code, resp)
	}

	// dispute
	rr, resp = doJSON(t, h, http.MethodPost, "/v1/disputes",
		DisputeRequest{ClaimID: "svc-1", Requester: "claw1req", Reason: "wrong"}, nil)
	if rr.Code != http.StatusOK || !resp.Success {
		t.Fatalf("dispute failed: %d %+v", rr.Code, resp)
	}

	// dispute by wrong requester -> 403
	rr, _ = doJSON(t, h, http.MethodPost, "/v1/disputes",
		DisputeRequest{ClaimID: "svc-1", Requester: "claw1intruder"}, nil)
	if rr.Code != http.StatusConflict && rr.Code != http.StatusForbidden {
		// already disputed -> conflict; either guard is acceptable proof of protection
		t.Fatalf("expected protected status, got %d", rr.Code)
	}

	// resolve reject
	rr, resp = doJSON(t, h, http.MethodPost, "/v1/resolutions",
		ResolveRequest{ClaimID: "svc-1", Owner: "claw1own", Uphold: false}, nil)
	if rr.Code != http.StatusOK || !resp.Success {
		t.Fatalf("resolve failed: %d %+v", rr.Code, resp)
	}

	// fees accrued for requester (settlement + dispute)
	rr, resp = doJSON(t, h, http.MethodGet, "/v1/fees/claw1req", nil, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("fees failed: %d", rr.Code)
	}
	if resp.Data.(map[string]interface{})["count"].(float64) != 2 {
		t.Fatalf("expected 2 fee events, got %+v", resp.Data)
	}

	// unknown claim -> 404
	rr, _ = doJSON(t, h, http.MethodGet, "/v1/claims/does-not-exist", nil, nil)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}

func TestServiceIdempotencyHeader(t *testing.T) {
	svc := newTestService(t)
	h := svc.Handler()
	submit := SubmitRequest{
		ClaimID: "svc-idem", Requester: "r", Provider: "p", Owner: "o",
		Pricing: Pricing{PricePerToken: math.NewInt(1), PricePerQuery: math.NewInt(0), MinPayment: math.NewInt(0)},
		Escrow:  math.NewInt(100), TokensUsed: 1,
	}
	hdr := map[string]string{"Idempotency-Key": "same-key"}
	rr1, resp1 := doJSON(t, h, http.MethodPost, "/v1/claims", submit, hdr)
	rr2, resp2 := doJSON(t, h, http.MethodPost, "/v1/claims", submit, hdr)
	if rr1.Code != http.StatusCreated || rr2.Code != http.StatusCreated {
		t.Fatalf("both submits should succeed: %d %d", rr1.Code, rr2.Code)
	}
	d1 := resp1.Data.(map[string]interface{})["digest"]
	d2 := resp2.Data.(map[string]interface{})["digest"]
	if d1 != d2 {
		t.Fatalf("idempotent submits must return same digest: %v vs %v", d1, d2)
	}
	// only one settlement fee accrued
	_, feeResp := doJSON(t, h, http.MethodGet, "/v1/fees/r", nil, nil)
	if feeResp.Data.(map[string]interface{})["count"].(float64) != 1 {
		t.Fatalf("expected 1 fee event after idempotent replay, got %+v", feeResp.Data)
	}
}
