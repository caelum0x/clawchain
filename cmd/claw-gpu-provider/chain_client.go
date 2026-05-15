package main

import (
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
	"strconv"
	"sync"

	"github.com/cosmos/cosmos-sdk/crypto/hd"
	sdksecp256k1 "github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
)

// ChainClient provides authenticated transaction broadcasting and query
// capabilities against a CometBFT/Cosmos SDK node. It derives a secp256k1
// key pair from the configured mnemonic and signs transactions locally before
// broadcasting via the RPC endpoint.
type ChainClient struct {
	cfg         Config
	privKeyHex  string
	address     string
	mu          sync.Mutex
	sequence    uint64
	accountNum  uint64
	initialized bool
}

// NewChainClient creates a new chain client. The mnemonic is used to derive
// a deterministic signing key. Actual transaction signing uses Cosmos SDK
// amino/direct sign modes via the REST broadcast endpoint.
func NewChainClient(cfg Config) (*ChainClient, error) {
	cc := &ChainClient{cfg: cfg, address: cfg.ProviderAddress}

	if cfg.Mnemonic != "" {
		hdPath := hd.CreateHDPath(118, 0, 0).String()
		privKey, err := hd.Secp256k1.Derive()(cfg.Mnemonic, "", hdPath)
		if err != nil {
			return nil, fmt.Errorf("key derivation failed: %w", err)
		}
		cc.privKeyHex = hex.EncodeToString(privKey)
	}

	return cc, nil
}

// initAccount fetches the account number and sequence from the chain REST
// endpoint. This is required before signing any transaction.
func (cc *ChainClient) initAccount(ctx context.Context) error {
	cc.mu.Lock()
	defer cc.mu.Unlock()

	if cc.initialized {
		return nil
	}

	url := fmt.Sprintf("%s/cosmos/auth/v1beta1/accounts/%s", cc.cfg.ChainREST, cc.address)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("create account request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch account: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("account query HTTP %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		Account struct {
			AccountNumber string `json:"account_number"`
			Sequence      string `json:"sequence"`
		} `json:"account"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode account response: %w", err)
	}

	accNum, err := strconv.ParseUint(result.Account.AccountNumber, 10, 64)
	if err != nil {
		return fmt.Errorf("parse account_number: %w", err)
	}
	seq, err := strconv.ParseUint(result.Account.Sequence, 10, 64)
	if err != nil {
		return fmt.Errorf("parse sequence: %w", err)
	}

	cc.accountNum = accNum
	cc.sequence = seq
	cc.initialized = true

	log.Printf("[ChainClient] Account initialized: number=%d sequence=%d", accNum, seq)
	return nil
}

// getPrivateKey decodes the hex-encoded private key and returns a Cosmos
// secp256k1 private key.
func (cc *ChainClient) getPrivateKey() (*sdksecp256k1.PrivKey, error) {
	privBytes, err := hex.DecodeString(cc.privKeyHex)
	if err != nil {
		return nil, fmt.Errorf("decode private key hex: %w", err)
	}

	return &sdksecp256k1.PrivKey{Key: privBytes}, nil
}

// BroadcastMsg sends a signed transaction to the chain via the REST broadcast
// endpoint. It derives the signing key from privKeyHex, constructs a proper
// Cosmos SDK tx with signer_infos and signatures, and broadcasts in sync mode.
func (cc *ChainClient) BroadcastMsg(ctx context.Context, msgTypeURL string, msgJSON json.RawMessage) error {
	// Ensure we have account number and sequence.
	if !cc.initialized {
		if err := cc.initAccount(ctx); err != nil {
			return fmt.Errorf("init account: %w", err)
		}
	}

	// Derive the signing key pair.
	privKey, err := cc.getPrivateKey()
	if err != nil {
		return fmt.Errorf("get private key: %w", err)
	}
	pubKeyBytes := privKey.PubKey().Bytes()

	cc.mu.Lock()
	accountNum := cc.accountNum
	sequence := cc.sequence
	cc.mu.Unlock()

	// Build the tx body.
	txBody := map[string]interface{}{
		"messages": []map[string]interface{}{
			{
				"@type": msgTypeURL,
				"data":  msgJSON,
			},
		},
		"memo":           "claw-gpu-provider",
		"timeout_height": "0",
	}
	bodyBytes, err := json.Marshal(txBody)
	if err != nil {
		return fmt.Errorf("marshal tx body: %w", err)
	}

	// Build the auth_info.
	authInfo := map[string]interface{}{
		"signer_infos": []map[string]interface{}{
			{
				"public_key": map[string]interface{}{
					"@type": "/cosmos.crypto.secp256k1.PubKey",
					"key":   base64.StdEncoding.EncodeToString(pubKeyBytes),
				},
				"mode_info": map[string]interface{}{
					"single": map[string]interface{}{
						"mode": "SIGN_MODE_DIRECT",
					},
				},
				"sequence": fmt.Sprintf("%d", sequence),
			},
		},
		"fee": map[string]interface{}{
			"amount":    []map[string]string{{"denom": cc.cfg.Denom, "amount": "5000"}},
			"gas_limit": "200000",
		},
	}
	authInfoBytes, err := json.Marshal(authInfo)
	if err != nil {
		return fmt.Errorf("marshal auth_info: %w", err)
	}

	// Construct the SignDoc: canonical JSON with chain_id, account_number,
	// sequence, body_bytes, and auth_info_bytes.
	signDoc := map[string]interface{}{
		"body_bytes":      base64.StdEncoding.EncodeToString(bodyBytes),
		"auth_info_bytes": base64.StdEncoding.EncodeToString(authInfoBytes),
		"chain_id":        cc.cfg.ChainID,
		"account_number":  fmt.Sprintf("%d", accountNum),
	}
	signDocBytes, err := json.Marshal(signDoc)
	if err != nil {
		return fmt.Errorf("marshal sign doc: %w", err)
	}

	// Sign the canonical SignDoc bytes with Cosmos secp256k1.
	sig, err := privKey.Sign(signDocBytes)
	if err != nil {
		return fmt.Errorf("sign tx: %w", err)
	}

	// Build the complete tx for broadcast.
	tx := map[string]interface{}{
		"body":       txBody,
		"auth_info":  authInfo,
		"signatures": []string{base64.StdEncoding.EncodeToString(sig)},
	}

	broadcastReq, err := json.Marshal(map[string]interface{}{
		"tx_bytes": base64.StdEncoding.EncodeToString(mustMarshalJSON(tx)),
		"mode":     "BROADCAST_MODE_SYNC",
	})
	if err != nil {
		return fmt.Errorf("marshal broadcast request: %w", err)
	}

	url := fmt.Sprintf("%s/cosmos/tx/v1beta1/txs", cc.cfg.ChainREST)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(broadcastReq))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("broadcast request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("broadcast HTTP %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		TxResponse struct {
			Code   int    `json:"code"`
			RawLog string `json:"raw_log"`
			TxHash string `json:"txhash"`
		} `json:"tx_response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode broadcast response: %w", err)
	}

	if result.TxResponse.Code != 0 {
		return fmt.Errorf("tx failed (code %d): %s", result.TxResponse.Code, result.TxResponse.RawLog)
	}

	// Increment sequence on success for the next transaction.
	cc.mu.Lock()
	cc.sequence++
	cc.mu.Unlock()

	log.Printf("[ChainClient] Tx broadcast: hash=%s", result.TxResponse.TxHash)
	return nil
}

// mustMarshalJSON marshals v to JSON, panicking on error. Used only for
// constructing intermediate tx bytes where marshalling cannot fail.
func mustMarshalJSON(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("json marshal: %v", err))
	}
	return b
}

// UpdateGPUMetrics sends a GPU metrics update transaction to the chain.
func (cc *ChainClient) UpdateGPUMetrics(ctx context.Context, resourceID uint64, metrics GPUMetrics) error {
	payload, _ := json.Marshal(map[string]interface{}{
		"resource_id": resourceID,
		"caller":      cc.address,
		"metrics":     metrics,
	})

	// Use REST API endpoint for metrics (lightweight, doesn't require full tx).
	url := fmt.Sprintf("%s/clawchain/marketplace/v1/gpu/metrics", cc.cfg.ChainREST)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("metrics HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// UpdateJobStatus sends a job status update to the chain.
func (cc *ChainClient) UpdateJobStatus(ctx context.Context, jobID uint64, status, result string) error {
	payload, _ := json.Marshal(map[string]interface{}{
		"job_id": jobID,
		"caller": cc.address,
		"status": status,
		"result": result,
	})

	url := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/job/status", cc.cfg.ChainREST)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("job status HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// FetchPendingJobs queries the chain for pending compute jobs assigned to this provider.
func (cc *ChainClient) FetchPendingJobs(ctx context.Context) ([]ComputeJob, error) {
	url := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/jobs?address=%s&status=pending",
		cc.cfg.ChainREST, cc.address)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Jobs []ComputeJob `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Jobs, nil
}

// QueryResourceLeases returns active leases for the provider's resource.
func (cc *ChainClient) QueryResourceLeases(ctx context.Context, resourceID uint64) ([]ComputeLease, error) {
	url := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/leases?resource_id=%d",
		cc.cfg.ChainREST, resourceID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Leases []ComputeLease `json:"leases"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Leases, nil
}

// ComputeLease represents an on-chain compute lease.
type ComputeLease struct {
	Id             uint64 `json:"id"`
	ResourceId     uint64 `json:"resource_id"`
	Lessee         string `json:"lessee"`
	Provider       string `json:"provider"`
	DurationHours  uint32 `json:"duration_hours"`
	StartBlock     int64  `json:"start_block"`
	EndBlock       int64  `json:"end_block"`
	TotalCostUclaw string `json:"total_cost_uclaw"`
	Status         string `json:"status"`
}

// GetBlockHeight returns the current block height from the chain.
func (cc *ChainClient) GetBlockHeight(ctx context.Context) (int64, error) {
	url := fmt.Sprintf("%s/cosmos/base/tendermint/v1beta1/blocks/latest", cc.cfg.ChainREST)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	var result struct {
		Block struct {
			Header struct {
				Height string `json:"height"`
			} `json:"header"`
		} `json:"block"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	height, err := strconv.ParseInt(result.Block.Header.Height, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse height: %w", err)
	}
	return height, nil
}

// TxHash computes a SHA256 hash for logging purposes.
func TxHash(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:8])
}
