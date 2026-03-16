package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
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
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	cryptotypes "github.com/cosmos/cosmos-sdk/crypto/types"
	"github.com/cosmos/cosmos-sdk/std"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/tx/signing"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	authsigning "github.com/cosmos/cosmos-sdk/x/auth/signing"

	modelregistrytypes "clawchain/x/modelregistry/types"
)

// Config holds the sidecar configuration, populated from environment variables.
type Config struct {
	ChainREST       string        // REST endpoint (default: http://localhost:1317)
	ChainRPC        string        // RPC endpoint (default: http://localhost:26657)
	ListenAddr      string        // HTTP listen address (default: :8090)
	RuntimeEndpoint string        // Model runtime URL (default: http://localhost:8080)
	ProviderAddress string        // On-chain provider address
	ProviderKeyHex  string        // Hex-encoded secp256k1 private key
	ChainID         string        // Chain ID for tx signing
	PollInterval    time.Duration // How often to poll for pending jobs
	GasLimit        uint64        // Gas limit for tx (default: 200000)
	FeeDenom        string        // Fee denom (default: uclaw)
	FeeAmount       int64         // Fee amount (default: 5000)
	MetricsAddr     string        // Prometheus metrics listen address (default: :9091)
	AuthToken       string        // Bearer token for auth (empty = auth disabled)
}

// InferenceJob represents an on-chain inference job fetched from the chain REST API.
type InferenceJob struct {
	JobID        uint64 `json:"job_id"`
	ModelID      uint64 `json:"model_id"`
	ModelVersion uint64 `json:"model_version"`
	Requester    string `json:"requester"`
	Input        string `json:"input"`
	MaxTokens    uint64 `json:"max_tokens"`
	Temperature  string `json:"temperature"`
	Payment      string `json:"payment"`
	Status       string `json:"status"`
}

// Sidecar is the main service struct that manages job polling, streaming, and
// broadcasting SSE events to connected web clients.
type Sidecar struct {
	cfg        Config
	txSigner   *txSigner
	mu         sync.RWMutex
	streams    map[uint64][]chan SSEEvent
	activeJobs map[uint64]*InferenceJob
}

// SSEEvent is a server-sent event pushed to streaming clients.
type SSEEvent struct {
	Type       string `json:"type"`                  // "partial", "complete", "error"
	Data       string `json:"data"`                  // token fragment or full output
	TxHash     string `json:"tx_hash,omitempty"`     // set on complete events
	TokensUsed uint64 `json:"tokens_used,omitempty"` // set on complete events
}

// ---------------------------------------------------------------------------
// TX Signer — signs and broadcasts Cosmos SDK transactions
// ---------------------------------------------------------------------------

// txSigner handles building, signing, and broadcasting transactions to the chain.
type txSigner struct {
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
	seqOk  bool // whether accNum/accSeq have been fetched
}

// newTxSigner creates a tx signer from a hex-encoded secp256k1 private key.
func newTxSigner(keyHex string, chainID string, chainREST string, gasLimit uint64, feeCoins sdk.Coins) (*txSigner, error) {
	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid PROVIDER_KEY_HEX: %w", err)
	}
	if len(keyBytes) != 32 {
		return nil, fmt.Errorf("PROVIDER_KEY_HEX must be 32 bytes (64 hex chars), got %d bytes", len(keyBytes))
	}

	privKey := &secp256k1.PrivKey{Key: keyBytes}
	pubKey := privKey.PubKey()
	address := sdk.AccAddress(pubKey.Address())

	// Build a minimal TxConfig with the modelregistry msg types registered.
	ir := codectypes.NewInterfaceRegistry()
	std.RegisterInterfaces(ir)
	modelregistrytypes.RegisterInterfaces(ir)
	protoCodec := codec.NewProtoCodec(ir)
	txCfg := authtx.NewTxConfig(protoCodec, authtx.DefaultSignModes)

	return &txSigner{
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

// fetchAccountInfo queries the chain REST API for the signer's account number and sequence.
func (t *txSigner) fetchAccountInfo() error {
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

	// Parse the REST response. The account field is a protobuf Any with a
	// BaseAccount inside, but the JSON representation includes the fields directly.
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

// signAndBroadcast builds, signs, and broadcasts a transaction containing the given message.
// Returns the tx hash on success.
func (t *txSigner) signAndBroadcast(ctx context.Context, msg sdk.Msg) (string, error) {
	t.seqMu.Lock()
	if !t.seqOk {
		t.seqMu.Unlock()
		if err := t.fetchAccountInfo(); err != nil {
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
			log.Printf("[TxSigner] Sequence mismatch, refreshing account info and retrying...")
			if fetchErr := t.fetchAccountInfo(); fetchErr != nil {
				return "", fmt.Errorf("retry fetch failed: %w (original: %v)", fetchErr, err)
			}
			return t.signAndBroadcast(ctx, msg)
		}
		return "", err
	}

	// Increment sequence for next tx.
	t.seqMu.Lock()
	t.accSeq++
	t.seqMu.Unlock()

	return txHash, nil
}

// broadcastTxREST submits signed tx bytes to the chain via the REST /cosmos/tx/v1beta1/txs endpoint.
func (t *txSigner) broadcastTxREST(txBytes []byte) (string, error) {
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

// completeJob signs and broadcasts a MsgCompleteInferenceJob to the chain.
func (t *txSigner) completeJob(ctx context.Context, jobID uint64, output string, tokensUsed uint64) (string, error) {
	msg := &modelregistrytypes.MsgCompleteInferenceJob{
		Provider:   t.address.String(),
		JobId:      jobID,
		Output:     output,
		TokensUsed: tokensUsed,
	}
	return t.signAndBroadcast(ctx, msg)
}

// failJob signs and broadcasts a MsgFailInferenceJob to the chain.
func (t *txSigner) failJob(ctx context.Context, jobID uint64, errorMsg string) (string, error) {
	msg := &modelregistrytypes.MsgFailInferenceJob{
		Provider: t.address.String(),
		JobId:    jobID,
		ErrorMsg: errorMsg,
	}
	return t.signAndBroadcast(ctx, msg)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	// Check for mock mode: either MOCK_MODE env or --mock flag.
	mockMode := os.Getenv("MOCK_MODE") == "true"
	for _, arg := range os.Args[1:] {
		if arg == "--mock" || arg == "-mock" {
			mockMode = true
		}
	}
	if mockMode {
		RunMockMode()
		return
	}

	cfg := Config{
		ChainREST:       envOr("CHAIN_REST", "http://localhost:1317"),
		ChainRPC:        envOr("CHAIN_RPC", "http://localhost:26657"),
		ListenAddr:      envOr("LISTEN_ADDR", ":8090"),
		RuntimeEndpoint: envOr("RUNTIME_ENDPOINT", "http://localhost:8080"),
		ProviderAddress: envOr("PROVIDER_ADDRESS", ""),
		ProviderKeyHex:  envOr("PROVIDER_KEY_HEX", ""),
		ChainID:         envOr("CHAIN_ID", "clawchain-1"),
		PollInterval:    5 * time.Second,
		GasLimit:        200000,
		FeeDenom:        "uclaw",
		FeeAmount:       5000,
		MetricsAddr:     envOr("METRICS_ADDR", ":9091"),
		AuthToken:       envOr("AUTH_TOKEN", ""),
	}

	if cfg.ProviderAddress == "" {
		log.Fatal("PROVIDER_ADDRESS is required")
	}
	if cfg.ProviderKeyHex == "" {
		log.Fatal("PROVIDER_KEY_HEX is required (64 hex chars = 32 byte secp256k1 private key)")
	}

	// Initialize the tx signer.
	feeCoins := sdk.NewCoins(sdk.NewInt64Coin(cfg.FeeDenom, cfg.FeeAmount))
	signer, err := newTxSigner(cfg.ProviderKeyHex, cfg.ChainID, cfg.ChainREST, cfg.GasLimit, feeCoins)
	if err != nil {
		log.Fatalf("Failed to initialize tx signer: %v", err)
	}

	// Verify the derived address matches the configured provider address.
	derivedAddr := signer.address.String()
	if derivedAddr != cfg.ProviderAddress {
		log.Fatalf("PROVIDER_KEY_HEX derives address %s, but PROVIDER_ADDRESS is %s — mismatch", derivedAddr, cfg.ProviderAddress)
	}
	log.Printf("[Sidecar] TX signer initialized for %s on chain %s", derivedAddr, cfg.ChainID)

	s := &Sidecar{
		cfg:        cfg,
		txSigner:   signer,
		streams:    make(map[uint64][]chan SSEEvent),
		activeJobs: make(map[uint64]*InferenceJob),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/stream/", s.handleStream)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprintf(w, `{"status":"ok"}`)
	})
	mux.HandleFunc("/jobs", s.handleListJobs)

	// Layer middleware: CORS -> request logging -> auth.
	handler := withCORS(authMiddleware(cfg.AuthToken, requestLogging(mux)))

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start Prometheus metrics server.
	go func() {
		log.Printf("[Sidecar] Metrics server on %s", cfg.MetricsAddr)
		if err := serveMetrics(cfg.MetricsAddr); err != nil && err != http.ErrServerClosed {
			log.Printf("[Sidecar] Metrics server error: %v", err)
		}
	}()

	// Start job poller
	go s.pollJobs(ctx)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("[Sidecar] Shutting down...")
		cancel()
		server.Close()
	}()

	log.Printf("[Sidecar] Listening on %s (chain=%s, runtime=%s)", cfg.ListenAddr, cfg.ChainREST, cfg.RuntimeEndpoint)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Job Polling & Processing
// ---------------------------------------------------------------------------

// pollJobs periodically checks the chain for pending inference jobs.
func (s *Sidecar) pollJobs(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.checkForPendingJobs(ctx)
		}
	}
}

// checkForPendingJobs queries the chain REST API for pending inference jobs
// and starts processing any that are not already active.
func (s *Sidecar) checkForPendingJobs(ctx context.Context) {
	url := fmt.Sprintf("%s/clawchain/modelregistry/v1/inference_jobs?status=pending", s.cfg.ChainREST)

	var result struct {
		Jobs []InferenceJob `json:"jobs"`
	}

	err := retryWithBackoff(ctx, 2, 500*time.Millisecond, func() error {
		resp, err := http.Get(url)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		return json.NewDecoder(resp.Body).Decode(&result)
	})
	if err != nil {
		log.Printf("[Sidecar] Poll error: %v", err)
		return
	}

	for _, job := range result.Jobs {
		s.mu.RLock()
		_, active := s.activeJobs[job.JobID]
		s.mu.RUnlock()

		if !active {
			s.mu.Lock()
			s.activeJobs[job.JobID] = &job
			s.mu.Unlock()

			go s.processJob(ctx, job)
		}
	}
}

// processJob delegates inference to the model runtime, streams partial results
// to SSE listeners, signs and broadcasts the completion tx on-chain.
func (s *Sidecar) processJob(ctx context.Context, job InferenceJob) {
	activeJobs.Inc()
	defer activeJobs.Dec()
	done := observeJobDuration()
	defer done()

	log.Printf("[Sidecar] Processing job %d (model=%d, input=%d chars)", job.JobID, job.ModelID, len(job.Input))

	// Call the model runtime for streaming inference
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model_id":    job.ModelID,
		"input":       job.Input,
		"max_tokens":  job.MaxTokens,
		"temperature": job.Temperature,
		"stream":      true,
	})

	runtimeURL := fmt.Sprintf("%s/v1/inference", s.cfg.RuntimeEndpoint)

	var resp *http.Response
	runtimeErr := retryWithBackoff(ctx, 2, 500*time.Millisecond, func() error {
		req, err := http.NewRequestWithContext(ctx, "POST", runtimeURL, bytes.NewReader(reqBody))
		if err != nil {
			return fmt.Errorf("request error: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")

		resp, err = http.DefaultClient.Do(req)
		if err != nil {
			runtimeErrors.Inc()
			return fmt.Errorf("runtime error: %w", err)
		}
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			runtimeErrors.Inc()
			return fmt.Errorf("runtime returned %d: %s", resp.StatusCode, string(body))
		}
		return nil
	})
	if runtimeErr != nil {
		s.handleJobError(ctx, job.JobID, runtimeErr.Error())
		return
	}
	defer resp.Body.Close()

	// Stream partial results from runtime
	var fullOutput strings.Builder
	var tokensUsed uint64
	scanner := bufio.NewScanner(resp.Body)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Token  string `json:"token"`
			Tokens uint64 `json:"tokens_used"`
			Done   bool   `json:"done"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		fullOutput.WriteString(chunk.Token)
		tokensUsed = chunk.Tokens

		s.broadcastEvent(job.JobID, SSEEvent{
			Type: "partial",
			Data: chunk.Token,
		})

		if chunk.Done {
			break
		}
	}

	// Sign and broadcast MsgCompleteInferenceJob on-chain.
	output := fullOutput.String()
	resultHash := fmt.Sprintf("%x", sha256.Sum256([]byte(output)))
	log.Printf("[Sidecar] Job %d complete: %d tokens, hash=%s — broadcasting tx...", job.JobID, tokensUsed, resultHash[:16])

	var txHash string
	txErr := retryWithBackoff(ctx, 2, 1*time.Second, func() error {
		var err error
		txHash, err = s.txSigner.completeJob(ctx, job.JobID, output, tokensUsed)
		return err
	})
	if txErr != nil {
		txBroadcastTotal.WithLabelValues("fail").Inc()
		log.Printf("[Sidecar] Job %d: tx broadcast failed: %v", job.JobID, txErr)
		jobsTotal.WithLabelValues("completed").Inc()
		// Still send complete event to SSE listeners (inference succeeded, just tx failed).
		s.broadcastEvent(job.JobID, SSEEvent{
			Type:       "complete",
			Data:       output,
			TokensUsed: tokensUsed,
		})
	} else {
		txBroadcastTotal.WithLabelValues("success").Inc()
		jobsTotal.WithLabelValues("completed").Inc()
		log.Printf("[Sidecar] Job %d: tx broadcast OK — hash=%s", job.JobID, txHash)
		s.broadcastEvent(job.JobID, SSEEvent{
			Type:       "complete",
			Data:       output,
			TxHash:     txHash,
			TokensUsed: tokensUsed,
		})
	}

	s.cleanupJob(job.JobID)
}

// handleJobError broadcasts an error SSE event and submits MsgFailInferenceJob on-chain.
func (s *Sidecar) handleJobError(ctx context.Context, jobID uint64, errMsg string) {
	log.Printf("[Sidecar] Job %d error: %s", jobID, errMsg)
	jobsTotal.WithLabelValues("failed").Inc()

	// Broadcast failure to SSE listeners.
	s.broadcastEvent(jobID, SSEEvent{Type: "error", Data: errMsg})

	// Sign and broadcast MsgFailInferenceJob on-chain so the requester gets refunded.
	var txHash string
	txErr := retryWithBackoff(ctx, 2, 1*time.Second, func() error {
		var err error
		txHash, err = s.txSigner.failJob(ctx, jobID, errMsg)
		return err
	})
	if txErr != nil {
		txBroadcastTotal.WithLabelValues("fail").Inc()
		log.Printf("[Sidecar] Job %d: fail tx broadcast error: %v", jobID, txErr)
	} else {
		txBroadcastTotal.WithLabelValues("success").Inc()
		log.Printf("[Sidecar] Job %d: fail tx broadcast OK — hash=%s", jobID, txHash)
	}

	s.cleanupJob(jobID)
}

// ---------------------------------------------------------------------------
// SSE Broadcasting
// ---------------------------------------------------------------------------

// broadcastEvent sends an SSE event to all listeners subscribed to a given job.
func (s *Sidecar) broadcastEvent(jobID uint64, event SSEEvent) {
	s.mu.RLock()
	listeners := s.streams[jobID]
	s.mu.RUnlock()

	for _, ch := range listeners {
		select {
		case ch <- event:
		default: // drop if listener is slow
		}
	}
}

// addListener registers a new SSE listener channel for a given job ID.
func (s *Sidecar) addListener(jobID uint64) chan SSEEvent {
	ch := make(chan SSEEvent, 64)
	s.mu.Lock()
	s.streams[jobID] = append(s.streams[jobID], ch)
	s.mu.Unlock()
	return ch
}

// removeListener unregisters an SSE listener channel for a given job ID.
func (s *Sidecar) removeListener(jobID uint64, ch chan SSEEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	listeners := s.streams[jobID]
	for i, l := range listeners {
		if l == ch {
			s.streams[jobID] = append(listeners[:i], listeners[i+1:]...)
			break
		}
	}
	close(ch)
}

// cleanupJob removes a completed or errored job from active tracking and
// closes all remaining listener channels.
func (s *Sidecar) cleanupJob(jobID uint64) {
	s.mu.Lock()
	delete(s.activeJobs, jobID)
	// Close remaining listeners
	for _, ch := range s.streams[jobID] {
		close(ch)
	}
	delete(s.streams, jobID)
	s.mu.Unlock()
}

// ---------------------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------------------

// handleStream serves an SSE endpoint at /stream/{job_id} that pushes
// partial inference tokens and completion events to connected web clients.
func (s *Sidecar) handleStream(w http.ResponseWriter, r *http.Request) {
	// Parse job ID from /stream/{job_id}
	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/stream/"), "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		http.Error(w, "job_id required", http.StatusBadRequest)
		return
	}
	jobID, err := strconv.ParseUint(pathParts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid job_id", http.StatusBadRequest)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := s.addListener(jobID)
	defer s.removeListener(jobID, ch)

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(event)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()

			if event.Type == "complete" || event.Type == "error" {
				return
			}
		}
	}
}

// handleListJobs returns a JSON list of currently active job IDs.
func (s *Sidecar) handleListJobs(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	jobs := make([]uint64, 0, len(s.activeJobs))
	for id := range s.activeJobs {
		jobs = append(jobs, id)
	}
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"active_jobs": jobs})
}

// statusWriter wraps http.ResponseWriter to capture the status code.
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.code = code
	sw.ResponseWriter.WriteHeader(code)
}

// requestLogging is HTTP middleware that logs the method, path, status code,
// and duration of each request.
func requestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Printf("[HTTP] %s %s %d %s", r.Method, r.URL.Path, sw.code, time.Since(start).Truncate(time.Microsecond))
	})
}

// withCORS wraps an HTTP handler to add permissive CORS headers for browser clients.
func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// envOr reads an environment variable, returning fallback if it is empty or unset.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
