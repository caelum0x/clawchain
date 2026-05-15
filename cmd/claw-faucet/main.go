// Package main implements the ClawChain testnet faucet HTTP server.
//
// It dispenses uclaw tokens to any valid claw-prefixed bech32 address,
// enforcing per-address cooldowns and a global daily cap.
package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/cosmos/cosmos-sdk/client"
	clienttx "github.com/cosmos/cosmos-sdk/client/tx"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/crypto/hd"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	cryptotypes "github.com/cosmos/cosmos-sdk/crypto/types"
	"github.com/cosmos/cosmos-sdk/std"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/tx/signing"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	authsigning "github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/cosmos/go-bip39"
)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Config holds the faucet configuration populated from environment variables.
type Config struct {
	ListenAddr string // HTTP listen address (default ":8888")
	ChainREST  string // Chain REST endpoint (default "http://localhost:1317")
	ChainRPC   string // Chain RPC endpoint (default "http://localhost:26657")
	ChainID    string // Chain ID (default "clawchain-1")
	Amount     int64  // Amount in uclaw per request (default 10_000_000 = 10 CLAW)
	Denom      string // Token denom (default "uclaw")
	Mnemonic   string // BIP39 mnemonic for the faucet wallet (REQUIRED)
	Cooldown   int64  // Cooldown per address in seconds (default 86400 = 24h)
	DailyCap   int64  // Max total uclaw dispensed per day (default 1_000_000_000 = 1000 CLAW)
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

// RateLimiter tracks per-address cooldowns and a global daily cap.
type RateLimiter struct {
	mu          sync.Mutex
	lastRequest map[string]time.Time // address -> last request time
	dailySpent  int64                // total uclaw dispensed today
	dayStart    time.Time            // start of current UTC day
	cooldown    time.Duration
	dailyCap    int64
}

// NewRateLimiter creates a new rate limiter with the given cooldown and daily cap.
func NewRateLimiter(cooldownSecs, dailyCap int64) *RateLimiter {
	now := time.Now().UTC()
	return &RateLimiter{
		lastRequest: make(map[string]time.Time),
		dayStart:    time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC),
		cooldown:    time.Duration(cooldownSecs) * time.Second,
		dailyCap:    dailyCap,
	}
}

// Check verifies whether a request for the given address and amount is allowed.
// Returns an error string if rate limited, or empty string if OK.
func (rl *RateLimiter) Check(address string, amount int64) string {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now().UTC()

	// Reset daily counter at midnight UTC.
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if todayStart.After(rl.dayStart) {
		rl.dailySpent = 0
		rl.dayStart = todayStart
	}

	// Check daily cap.
	if rl.dailySpent+amount > rl.dailyCap {
		return "daily faucet cap reached, please try again tomorrow"
	}

	// Check per-address cooldown.
	if last, ok := rl.lastRequest[address]; ok {
		elapsed := now.Sub(last)
		if elapsed < rl.cooldown {
			remaining := rl.cooldown - elapsed
			return fmt.Sprintf("rate limited: please wait %d seconds", int(remaining.Seconds()))
		}
	}

	return ""
}

// Record marks a successful dispense for the given address and amount.
func (rl *RateLimiter) Record(address string, amount int64) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.lastRequest[address] = time.Now().UTC()
	rl.dailySpent += amount
}

// DailyRemaining returns the remaining daily allowance in uclaw.
func (rl *RateLimiter) DailyRemaining() int64 {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now().UTC()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if todayStart.After(rl.dayStart) {
		rl.dailySpent = 0
		rl.dayStart = todayStart
	}

	remaining := rl.dailyCap - rl.dailySpent
	if remaining < 0 {
		return 0
	}
	return remaining
}

// ---------------------------------------------------------------------------
// TX Signer (adapted from claw-inference-sidecar)
// ---------------------------------------------------------------------------

// TxSigner handles building, signing, and broadcasting Cosmos SDK transactions.
type TxSigner struct {
	privKey   cryptotypes.PrivKey
	pubKey    cryptotypes.PubKey
	address   sdk.AccAddress
	chainID   string
	chainREST string
	txConfig  client.TxConfig
	gasLimit  uint64
	feeCoins  sdk.Coins

	seqMu  sync.Mutex
	accNum uint64
	accSeq uint64
	seqOk  bool
}

// NewTxSignerFromMnemonic derives a secp256k1 key from a BIP39 mnemonic using
// the standard Cosmos HD path (m/44'/118'/0'/0/0) and returns a TxSigner.
func NewTxSignerFromMnemonic(mnemonic, chainID, chainREST string, gasLimit uint64, feeCoins sdk.Coins) (*TxSigner, error) {
	if !bip39.IsMnemonicValid(mnemonic) {
		return nil, fmt.Errorf("invalid BIP39 mnemonic")
	}

	// Derive seed and private key via the standard Cosmos HD path.
	seed, err := bip39.NewSeedWithErrorChecking(mnemonic, "")
	if err != nil {
		return nil, fmt.Errorf("failed to derive seed: %w", err)
	}

	hdPath := hd.CreateHDPath(118, 0, 0).String()
	master, ch := hd.ComputeMastersFromSeed(seed)
	derivedKey, err := hd.DerivePrivateKeyForPath(master, ch, hdPath)
	if err != nil {
		return nil, fmt.Errorf("failed to derive key: %w", err)
	}

	privKey := &secp256k1.PrivKey{Key: derivedKey}
	pubKey := privKey.PubKey()
	address := sdk.AccAddress(pubKey.Address())

	// Build a minimal TxConfig with bank types registered.
	ir := codectypes.NewInterfaceRegistry()
	std.RegisterInterfaces(ir)
	banktypes.RegisterInterfaces(ir)
	protoCodec := codec.NewProtoCodec(ir)
	txCfg := authtx.NewTxConfig(protoCodec, authtx.DefaultSignModes)

	return &TxSigner{
		privKey:   privKey,
		pubKey:    pubKey,
		address:   address,
		chainID:   chainID,
		chainREST: chainREST,
		txConfig:  txCfg,
		gasLimit:  gasLimit,
		feeCoins:  feeCoins,
	}, nil
}

// Address returns the bech32-encoded faucet address.
func (t *TxSigner) Address() string {
	return t.address.String()
}

// FetchAccountInfo queries the chain REST API for the signer's account number and sequence.
func (t *TxSigner) FetchAccountInfo() error {
	url := fmt.Sprintf("%s/cosmos/auth/v1beta1/accounts/%s", t.chainREST, t.address.String())
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("account query failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read account response: %w", err)
	}

	var result struct {
		Account struct {
			AccountNumber string `json:"account_number"`
			Sequence      string `json:"sequence"`
		} `json:"account"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse account info: %w (body: %s)", err, string(body))
	}

	accNum, _ := strconv.ParseUint(result.Account.AccountNumber, 10, 64)
	accSeq, _ := strconv.ParseUint(result.Account.Sequence, 10, 64)

	t.seqMu.Lock()
	t.accNum = accNum
	t.accSeq = accSeq
	t.seqOk = true
	t.seqMu.Unlock()

	return nil
}

// FetchBalance queries the chain for the faucet account's balance in the given denom.
func (t *TxSigner) FetchBalance(denom string) (string, error) {
	url := fmt.Sprintf("%s/cosmos/bank/v1beta1/balances/%s/by_denom?denom=%s", t.chainREST, t.address.String(), denom)
	resp, err := http.Get(url)
	if err != nil {
		return "0", fmt.Errorf("balance query failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "0", nil
	}

	var result struct {
		Balance struct {
			Amount string `json:"amount"`
		} `json:"balance"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "0", nil
	}

	if result.Balance.Amount == "" {
		return "0", nil
	}
	return result.Balance.Amount, nil
}

// SignAndBroadcast builds, signs, and broadcasts a transaction containing the given message.
func (t *TxSigner) SignAndBroadcast(ctx context.Context, msg sdk.Msg) (string, error) {
	t.seqMu.Lock()
	if !t.seqOk {
		t.seqMu.Unlock()
		if err := t.FetchAccountInfo(); err != nil {
			return "", err
		}
		t.seqMu.Lock()
	}
	accNum := t.accNum
	accSeq := t.accSeq
	t.seqMu.Unlock()

	// Build the transaction.
	txBuilder := t.txConfig.NewTxBuilder()
	if err := txBuilder.SetMsgs(msg); err != nil {
		return "", fmt.Errorf("failed to set msgs: %w", err)
	}
	txBuilder.SetGasLimit(t.gasLimit)
	txBuilder.SetFeeAmount(t.feeCoins)
	txBuilder.SetMemo("ClawChain Testnet Faucet")

	// Set an empty signature first (required for sign bytes computation).
	emptySig := signing.SignatureV2{
		PubKey: t.pubKey,
		Data: &signing.SingleSignatureData{
			SignMode:  signing.SignMode_SIGN_MODE_DIRECT,
			Signature: nil,
		},
		Sequence: accSeq,
	}
	if err := txBuilder.SetSignatures(emptySig); err != nil {
		return "", fmt.Errorf("failed to set empty signature: %w", err)
	}

	// Sign the transaction.
	signerData := authsigning.SignerData{
		Address:       t.address.String(),
		ChainID:       t.chainID,
		AccountNumber: accNum,
		Sequence:      accSeq,
	}
	sigV2, err := clienttx.SignWithPrivKey(
		ctx,
		signing.SignMode_SIGN_MODE_DIRECT,
		signerData,
		txBuilder,
		t.privKey,
		t.txConfig,
		accSeq,
	)
	if err != nil {
		return "", fmt.Errorf("failed to sign tx: %w", err)
	}
	if err := txBuilder.SetSignatures(sigV2); err != nil {
		return "", fmt.Errorf("failed to set final signature: %w", err)
	}

	// Encode to bytes.
	txBytes, err := t.txConfig.TxEncoder()(txBuilder.GetTx())
	if err != nil {
		return "", fmt.Errorf("failed to encode tx: %w", err)
	}

	// Broadcast via REST.
	txHash, err := t.broadcastTxREST(txBytes)
	if err != nil {
		// If sequence mismatch, refresh and retry once.
		if strings.Contains(err.Error(), "account sequence mismatch") {
			log.Printf("[Faucet] Sequence mismatch, refreshing account info and retrying...")
			if fetchErr := t.FetchAccountInfo(); fetchErr != nil {
				return "", fmt.Errorf("retry fetch failed: %w (original: %v)", fetchErr, err)
			}
			return t.SignAndBroadcast(ctx, msg)
		}
		return "", err
	}

	// Increment sequence for next tx.
	t.seqMu.Lock()
	t.accSeq++
	t.seqMu.Unlock()

	return txHash, nil
}

// broadcastTxREST submits signed tx bytes to the chain via REST.
func (t *TxSigner) broadcastTxREST(txBytes []byte) (string, error) {
	payload := map[string]interface{}{
		"tx_bytes": base64.StdEncoding.EncodeToString(txBytes),
		"mode":     "BROADCAST_MODE_SYNC",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal broadcast request: %w", err)
	}

	url := fmt.Sprintf("%s/cosmos/tx/v1beta1/txs", t.chainREST)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("broadcast request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read broadcast response: %w", err)
	}

	var result struct {
		TxResponse struct {
			TxHash string `json:"txhash"`
			Code   uint32 `json:"code"`
			RawLog string `json:"raw_log"`
		} `json:"tx_response"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse broadcast response: %w (body: %s)", err, string(respBody))
	}

	if result.TxResponse.Code != 0 {
		return "", fmt.Errorf("tx failed with code %d: %s", result.TxResponse.Code, result.TxResponse.RawLog)
	}

	return result.TxResponse.TxHash, nil
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

// ValidateClawAddress checks that the given string is a valid bech32 address
// with the "claw" prefix.
func ValidateClawAddress(address string) error {
	if address == "" {
		return fmt.Errorf("address is required")
	}
	if !strings.HasPrefix(address, "claw1") {
		return fmt.Errorf("address must have 'claw' prefix (start with claw1)")
	}
	_, err := sdk.AccAddressFromBech32(address)
	if err != nil {
		return fmt.Errorf("invalid bech32 address: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Faucet server
// ---------------------------------------------------------------------------

// FaucetServer holds the HTTP faucet service state.
type FaucetServer struct {
	cfg     Config
	signer  *TxSigner
	limiter *RateLimiter
}

// NewFaucetServer creates a new faucet server. The signer may be nil for testing.
func NewFaucetServer(cfg Config, signer *TxSigner, limiter *RateLimiter) *FaucetServer {
	return &FaucetServer{
		cfg:     cfg,
		signer:  signer,
		limiter: limiter,
	}
}

// faucetRequest is the JSON body for POST /faucet.
type faucetRequest struct {
	Address string `json:"address"`
}

// HandleFaucetRequest handles POST /faucet (and POST /faucet/send for frontend compat).
func (f *FaucetServer) HandleFaucetRequest(w http.ResponseWriter, r *http.Request) {
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

	// Validate address.
	if err := ValidateClawAddress(req.Address); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Check rate limit.
	if reason := f.limiter.Check(req.Address, f.cfg.Amount); reason != "" {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": reason})
		return
	}

	// Build and broadcast MsgSend.
	toAddr, _ := sdk.AccAddressFromBech32(req.Address)
	coins := sdk.NewCoins(sdk.NewInt64Coin(f.cfg.Denom, f.cfg.Amount))
	msg := banktypes.NewMsgSend(f.signer.address, toAddr, coins)

	txHash, err := f.signer.SignAndBroadcast(r.Context(), msg)
	if err != nil {
		log.Printf("[Faucet] TX broadcast error for %s: %v", req.Address, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("transaction failed: %v", err)})
		return
	}

	// Record successful dispense.
	f.limiter.Record(req.Address, f.cfg.Amount)

	amountStr := fmt.Sprintf("%d%s", f.cfg.Amount, f.cfg.Denom)
	log.Printf("[Faucet] Sent %s to %s (tx=%s)", amountStr, req.Address, txHash)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tx_hash": txHash,
		"txHash":  txHash,
		"amount":  amountStr,
		"message": fmt.Sprintf("Sent %s to %s", amountStr, req.Address),
	})
}

// HandleFaucetStatus handles GET /faucet/status.
func (f *FaucetServer) HandleFaucetStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	address := ""
	balance := "0"
	if f.signer != nil {
		address = f.signer.Address()
		bal, err := f.signer.FetchBalance(f.cfg.Denom)
		if err == nil {
			balance = bal
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"address":          address,
		"balance":          balance,
		"daily_remaining":  fmt.Sprintf("%d", f.limiter.DailyRemaining()),
		"cooldown_seconds": f.cfg.Cooldown,
	})
}

// HandleHealth handles GET /health.
func (f *FaucetServer) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// statusWriter wraps http.ResponseWriter to capture the status code for logging.
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.code = code
	sw.ResponseWriter.WriteHeader(code)
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func requestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Printf("[HTTP] %s %s %d %s", r.Method, r.URL.Path, sw.code, time.Since(start).Truncate(time.Microsecond))
	})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt64(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		log.Printf("[Faucet] Warning: invalid %s=%q, using default %d", key, v, fallback)
		return fallback
	}
	return n
}

func main() {
	// Set the bech32 prefix for the "claw" address space.
	sdkCfg := sdk.GetConfig()
	sdkCfg.SetBech32PrefixForAccount("claw", "clawpub")
	sdkCfg.SetBech32PrefixForValidator("clawvaloper", "clawvaloperpub")
	sdkCfg.SetBech32PrefixForConsensusNode("clawvalcons", "clawvalconspub")
	sdkCfg.Seal()

	cfg := Config{
		ListenAddr: envOr("FAUCET_LISTEN", ":8888"),
		ChainREST:  envOr("CHAIN_REST", "http://localhost:1317"),
		ChainRPC:   envOr("CHAIN_RPC", "http://localhost:26657"),
		ChainID:    envOr("CHAIN_ID", "clawchain-1"),
		Amount:     envInt64("FAUCET_AMOUNT", 10_000_000),
		Denom:      envOr("FAUCET_DENOM", "uclaw"),
		Mnemonic:   os.Getenv("FAUCET_MNEMONIC"),
		Cooldown:   envInt64("FAUCET_COOLDOWN", 86400),
		DailyCap:   envInt64("FAUCET_DAILY_CAP", 1_000_000_000),
	}

	if cfg.Mnemonic == "" {
		log.Fatal("FAUCET_MNEMONIC is required (BIP39 mnemonic for the faucet account)")
	}

	// Initialize the tx signer from mnemonic.
	feeCoins := sdk.NewCoins(sdk.NewInt64Coin(cfg.Denom, 5000))
	signer, err := NewTxSignerFromMnemonic(cfg.Mnemonic, cfg.ChainID, cfg.ChainREST, 200000, feeCoins)
	if err != nil {
		log.Fatalf("Failed to initialize tx signer: %v", err)
	}
	log.Printf("[Faucet] Address: %s", signer.Address())
	log.Printf("[Faucet] Chain: %s (REST=%s, RPC=%s)", cfg.ChainID, cfg.ChainREST, cfg.ChainRPC)
	log.Printf("[Faucet] Amount: %d%s per request, cooldown: %ds, daily cap: %d%s",
		cfg.Amount, cfg.Denom, cfg.Cooldown, cfg.DailyCap, cfg.Denom)

	limiter := NewRateLimiter(cfg.Cooldown, cfg.DailyCap)
	faucet := NewFaucetServer(cfg, signer, limiter)

	mux := http.NewServeMux()

	// Primary endpoints per spec.
	mux.HandleFunc("/faucet", faucet.HandleFaucetRequest)
	mux.HandleFunc("/faucet/status", faucet.HandleFaucetStatus)

	// Frontend compatibility: the Vite proxy sends "/faucet/send" and
	// "/faucet/faucet/request" because the frontend tries multiple paths.
	mux.HandleFunc("/faucet/send", faucet.HandleFaucetRequest)
	mux.HandleFunc("/faucet/request", faucet.HandleFaucetRequest)
	mux.HandleFunc("/faucet/faucet/request", faucet.HandleFaucetRequest)

	// Also handle the case where the proxy is NOT used (direct access).
	mux.HandleFunc("/send", faucet.HandleFaucetRequest)

	// Health check.
	mux.HandleFunc("/health", faucet.HandleHealth)

	handler := withCORS(requestLogging(mux))

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown on SIGINT/SIGTERM.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("[Faucet] Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("[Faucet] Listening on %s", cfg.ListenAddr)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
	log.Println("[Faucet] Stopped.")
}
