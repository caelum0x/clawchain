package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func init() {
	// Configure the bech32 prefix so ValidateClawAddress works in tests.
	sdkCfg := sdk.GetConfig()
	sdkCfg.SetBech32PrefixForAccount("claw", "clawpub")
	sdkCfg.SetBech32PrefixForValidator("clawvaloper", "clawvaloperpub")
	sdkCfg.SetBech32PrefixForConsensusNode("clawvalcons", "clawvalconspub")
	sdkCfg.Seal()
}

// testFaucetServer builds a FaucetServer with a nil signer (no real chain).
// The HandleFaucetRequest will panic on nil signer, so we only use it for
// endpoints that don't need signing (health, status, validation tests).
func testFaucetServer(cooldown, dailyCap int64) *FaucetServer {
	cfg := Config{
		ListenAddr: ":8888",
		ChainREST:  "http://localhost:1317",
		ChainRPC:   "http://localhost:26657",
		ChainID:    "clawchain-test",
		Amount:     10_000_000,
		Denom:      "uclaw",
		Cooldown:   cooldown,
		DailyCap:   dailyCap,
	}
	limiter := NewRateLimiter(cooldown, dailyCap)
	return NewFaucetServer(cfg, nil, limiter)
}

// mockSigner creates a FaucetServer that intercepts at the handler level,
// simulating tx signing/broadcast by replacing HandleFaucetRequest.
type mockFaucetServer struct {
	*FaucetServer
	broadcastFunc func(address string) (string, error)
}

func newMockFaucetServer(cooldown, dailyCap, amount int64) *mockFaucetServer {
	cfg := Config{
		ListenAddr: ":8888",
		ChainREST:  "http://localhost:1317",
		ChainRPC:   "http://localhost:26657",
		ChainID:    "clawchain-test",
		Amount:     amount,
		Denom:      "uclaw",
		Cooldown:   cooldown,
		DailyCap:   dailyCap,
	}
	limiter := NewRateLimiter(cooldown, dailyCap)
	return &mockFaucetServer{
		FaucetServer: &FaucetServer{
			cfg:     cfg,
			signer:  nil,
			limiter: limiter,
		},
		broadcastFunc: func(address string) (string, error) {
			return "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890", nil
		},
	}
}

// handleFaucetMock is a mock version of HandleFaucetRequest that does not sign real txs.
func (m *mockFaucetServer) handleFaucetMock(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req faucetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	if err := ValidateClawAddress(req.Address); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if reason := m.limiter.Check(req.Address, m.cfg.Amount); reason != "" {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": reason})
		return
	}

	txHash, err := m.broadcastFunc(req.Address)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("transaction failed: %v", err)})
		return
	}

	m.limiter.Record(req.Address, m.cfg.Amount)

	amountStr := fmt.Sprintf("%d%s", m.cfg.Amount, m.cfg.Denom)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tx_hash": txHash,
		"txHash":  txHash,
		"amount":  amountStr,
		"message": fmt.Sprintf("Sent %s to %s", amountStr, req.Address),
	})
}

// validTestAddress generates a valid claw1... bech32 address for test use.
func validTestAddress() string {
	// This is a deterministic address derived from a known test key.
	// We generate it using the SDK to ensure validity.
	addr, _ := sdk.AccAddressFromBech32("claw1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5acvjm9")
	if addr != nil {
		return addr.String()
	}
	// Fallback: create from bytes.
	bz := make([]byte, 20)
	for i := range bz {
		bz[i] = byte(i + 1)
	}
	return sdk.AccAddress(bz).String()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestValidateAddress(t *testing.T) {
	tests := []struct {
		name    string
		address string
		wantErr bool
	}{
		{
			name:    "valid claw address",
			address: validTestAddress(),
			wantErr: false,
		},
		{
			name:    "invalid prefix (cosmos)",
			address: "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lz5us",
			wantErr: true,
		},
		{
			name:    "empty address",
			address: "",
			wantErr: true,
		},
		{
			name:    "malformed bech32",
			address: "claw1invalidaddress!!!",
			wantErr: true,
		},
		{
			name:    "wrong prefix but valid bech32",
			address: "osmo1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5h2dcg",
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateClawAddress(tc.address)
			if tc.wantErr && err == nil {
				t.Errorf("expected error for address %q, got nil", tc.address)
			}
			if !tc.wantErr && err != nil {
				t.Errorf("unexpected error for address %q: %v", tc.address, err)
			}
		})
	}
}

func TestCooldown(t *testing.T) {
	rl := NewRateLimiter(10, 1_000_000_000) // 10 second cooldown
	addr := validTestAddress()
	amount := int64(10_000_000)

	// First request should be OK.
	if reason := rl.Check(addr, amount); reason != "" {
		t.Fatalf("first request should be allowed, got: %s", reason)
	}
	rl.Record(addr, amount)

	// Second request within cooldown should be rejected.
	if reason := rl.Check(addr, amount); reason == "" {
		t.Fatal("second request within cooldown should be rejected")
	}

	// Manually reset the last request time to simulate cooldown expiry.
	rl.mu.Lock()
	rl.lastRequest[addr] = time.Now().UTC().Add(-11 * time.Second)
	rl.mu.Unlock()

	// After cooldown, request should be allowed again.
	if reason := rl.Check(addr, amount); reason != "" {
		t.Fatalf("request after cooldown should be allowed, got: %s", reason)
	}
}

func TestDailyCap(t *testing.T) {
	cap := int64(30_000_000) // 30 CLAW cap = 3 requests of 10 CLAW
	rl := NewRateLimiter(0, cap)
	amount := int64(10_000_000)

	// Use different addresses to avoid cooldown interference.
	addresses := []string{}
	base := []byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20}
	for i := 0; i < 4; i++ {
		bz := make([]byte, 20)
		copy(bz, base)
		bz[0] = byte(i + 1)
		addresses = append(addresses, sdk.AccAddress(bz).String())
	}

	// First three requests should be OK (3 * 10M = 30M = cap).
	for i := 0; i < 3; i++ {
		if reason := rl.Check(addresses[i], amount); reason != "" {
			t.Fatalf("request %d under cap should be allowed, got: %s", i+1, reason)
		}
		rl.Record(addresses[i], amount)
	}

	// Fourth request should be rejected (over cap).
	if reason := rl.Check(addresses[3], amount); reason == "" {
		t.Fatal("request over daily cap should be rejected")
	}
}

func TestHealthEndpoint(t *testing.T) {
	fs := testFaucetServer(86400, 1_000_000_000)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	fs.HandleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("expected status=ok, got %q", body["status"])
	}
}

func TestFaucetStatus(t *testing.T) {
	fs := testFaucetServer(86400, 1_000_000_000)

	req := httptest.NewRequest(http.MethodGet, "/faucet/status", nil)
	w := httptest.NewRecorder()

	fs.HandleFaucetStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Should have address, balance, daily_remaining, cooldown_seconds fields.
	for _, key := range []string{"address", "balance", "daily_remaining", "cooldown_seconds"} {
		if _, ok := body[key]; !ok {
			t.Errorf("response missing field %q", key)
		}
	}
}

func TestFaucetRequest_BadAddress(t *testing.T) {
	mock := newMockFaucetServer(86400, 1_000_000_000, 10_000_000)

	tests := []struct {
		name    string
		body    string
		wantMsg string
	}{
		{
			name:    "empty address",
			body:    `{"address":""}`,
			wantMsg: "address is required",
		},
		{
			name:    "wrong prefix",
			body:    `{"address":"cosmos1abc"}`,
			wantMsg: "claw",
		},
		{
			name:    "malformed",
			body:    `{"address":"claw1!!!invalid"}`,
			wantMsg: "invalid bech32",
		},
		{
			name:    "invalid JSON",
			body:    `not json`,
			wantMsg: "invalid JSON",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/faucet", bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			mock.handleFaucetMock(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d (body: %s)", w.Code, w.Body.String())
			}

			var resp map[string]string
			json.Unmarshal(w.Body.Bytes(), &resp)
			if errMsg, ok := resp["error"]; !ok || errMsg == "" {
				t.Fatal("expected error field in response")
			}
		})
	}
}

func TestFaucetRequest_RateLimited(t *testing.T) {
	mock := newMockFaucetServer(3600, 1_000_000_000, 10_000_000) // 1h cooldown
	addr := validTestAddress()

	// First request should succeed.
	body1 := fmt.Sprintf(`{"address":"%s"}`, addr)
	req1 := httptest.NewRequest(http.MethodPost, "/faucet", bytes.NewBufferString(body1))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	mock.handleFaucetMock(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("first request expected 200, got %d: %s", w1.Code, w1.Body.String())
	}

	// Verify response has tx_hash.
	var resp1 map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &resp1)
	if _, ok := resp1["tx_hash"]; !ok {
		t.Fatal("expected tx_hash in success response")
	}
	if _, ok := resp1["txHash"]; !ok {
		t.Fatal("expected txHash (camelCase) in success response for frontend compat")
	}

	// Second request should be rate limited.
	req2 := httptest.NewRequest(http.MethodPost, "/faucet", bytes.NewBufferString(body1))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	mock.handleFaucetMock(w2, req2)

	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("second request expected 429, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestFaucetRequest_DailyCapExhausted(t *testing.T) {
	// Set daily cap to 10M (allows exactly 1 request of 10M).
	mock := newMockFaucetServer(0, 10_000_000, 10_000_000)

	// Use two different addresses.
	addr1 := validTestAddress()
	base2 := make([]byte, 20)
	for i := range base2 {
		base2[i] = byte(i + 100)
	}
	addr2 := sdk.AccAddress(base2).String()

	// First request succeeds.
	body1 := fmt.Sprintf(`{"address":"%s"}`, addr1)
	req1 := httptest.NewRequest(http.MethodPost, "/faucet", bytes.NewBufferString(body1))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	mock.handleFaucetMock(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("first request expected 200, got %d: %s", w1.Code, w1.Body.String())
	}

	// Second request (different address) should hit daily cap.
	body2 := fmt.Sprintf(`{"address":"%s"}`, addr2)
	req2 := httptest.NewRequest(http.MethodPost, "/faucet", bytes.NewBufferString(body2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	mock.handleFaucetMock(w2, req2)

	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("daily cap request expected 429, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestFaucetRequest_BroadcastFailure(t *testing.T) {
	mock := newMockFaucetServer(0, 1_000_000_000, 10_000_000)
	mock.broadcastFunc = func(address string) (string, error) {
		return "", fmt.Errorf("chain unavailable")
	}

	addr := validTestAddress()
	body := fmt.Sprintf(`{"address":"%s"}`, addr)
	req := httptest.NewRequest(http.MethodPost, "/faucet", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mock.handleFaucetMock(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("broadcast failure expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDailyRemaining(t *testing.T) {
	rl := NewRateLimiter(0, 100_000_000)

	remaining := rl.DailyRemaining()
	if remaining != 100_000_000 {
		t.Fatalf("expected 100000000, got %d", remaining)
	}

	rl.Record("addr1", 30_000_000)
	remaining = rl.DailyRemaining()
	if remaining != 70_000_000 {
		t.Fatalf("expected 70000000, got %d", remaining)
	}
}

func TestCORS(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := withCORS(inner)

	// Test preflight OPTIONS request.
	req := httptest.NewRequest(http.MethodOptions, "/faucet", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS expected 204, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected CORS origin *, got %q", got)
	}

	// Test normal GET request has CORS headers.
	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)

	if got := w2.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected CORS origin *, got %q", got)
	}
}

func TestHTTPIntegration_Mux(t *testing.T) {
	// Test that the mux routes work correctly with the mock handler.
	mock := newMockFaucetServer(0, 1_000_000_000, 10_000_000)

	mux := http.NewServeMux()
	mux.HandleFunc("/faucet", mock.handleFaucetMock)
	mux.HandleFunc("/faucet/status", mock.HandleFaucetStatus)
	mux.HandleFunc("/faucet/send", mock.handleFaucetMock)
	mux.HandleFunc("/health", mock.HandleHealth)

	ts := httptest.NewServer(withCORS(mux))
	defer ts.Close()

	ctx := context.Background()

	// Health check.
	req, _ := http.NewRequestWithContext(ctx, "GET", ts.URL+"/health", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("health expected 200, got %d", resp.StatusCode)
	}

	// Faucet status.
	req2, _ := http.NewRequestWithContext(ctx, "GET", ts.URL+"/faucet/status", nil)
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("status check failed: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != 200 {
		t.Fatalf("status expected 200, got %d", resp2.StatusCode)
	}

	// Faucet send (via /faucet/send path).
	addr := validTestAddress()
	body := fmt.Sprintf(`{"address":"%s"}`, addr)
	req3, _ := http.NewRequestWithContext(ctx, "POST", ts.URL+"/faucet/send", bytes.NewBufferString(body))
	req3.Header.Set("Content-Type", "application/json")
	resp3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatalf("faucet send failed: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != 200 {
		bodyBytes, _ := json.Marshal(resp3.Body)
		t.Fatalf("faucet send expected 200, got %d: %s", resp3.StatusCode, string(bodyBytes))
	}
}
