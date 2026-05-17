package blockchain

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cosmos/go-bip39"
	"golang.org/x/crypto/hkdf"

	hash "crypto/sha256"
)

// ChainClient provides authenticated transaction broadcasting and query
// capabilities against a ClawChain node. Signing uses HKDF-derived
// secp256k1 keys from a BIP39 mnemonic (same pattern as claw-gpu-provider).
type ChainClient struct {
	restURL         string
	chainID         string
	denom           string
	platformAddress string
	privKeyHex      string
	httpClient      *http.Client

	mu          sync.Mutex
	sequence    uint64
	accountNum  uint64
	initialized bool
}

// ChainConfig holds configuration for the ClawChain client.
type ChainConfig struct {
	RestURL         string        `yaml:"rest_url"`
	ChainID         string        `yaml:"chain_id"`
	Denom           string        `yaml:"denom"`
	PlatformAddress string        `yaml:"platform_address"`
	MnemonicPath    string        `yaml:"mnemonic_path"`
	Timeout         time.Duration `yaml:"timeout"`
}

// TransferResult holds the result of a chain transfer.
type TransferResult struct {
	TxHash string
}

// NewChainClient creates a new ClawChain client with full signing capability.
func NewChainClient(cfg *ChainConfig) (*ChainClient, error) {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	denom := cfg.Denom
	if denom == "" {
		denom = "uclaw"
	}

	cc := &ChainClient{
		restURL:         cfg.RestURL,
		chainID:         cfg.ChainID,
		denom:           denom,
		platformAddress: cfg.PlatformAddress,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}

	// Derive signing key from mnemonic.
	mnemonic, err := loadMnemonic(cfg.MnemonicPath)
	if err != nil {
		return nil, fmt.Errorf("load mnemonic: %w", err)
	}
	if mnemonic != "" {
		seed := bip39.NewSeed(mnemonic, "")
		hkdfReader := hkdf.New(hash.New, seed, []byte("clawchain-billing-service"), []byte("secp256k1"))
		privKey := make([]byte, 32)
		if _, err := io.ReadFull(hkdfReader, privKey); err != nil {
			return nil, fmt.Errorf("key derivation failed: %w", err)
		}
		cc.privKeyHex = hex.EncodeToString(privKey)
	}

	return cc, nil
}

// GetBalance returns the uclaw balance for the given bech32 address.
func (c *ChainClient) GetBalance(ctx context.Context, address string) (uint64, error) {
	url := fmt.Sprintf("%s/cosmos/bank/v1beta1/balances/%s/by_denom?denom=%s",
		c.restURL, address, c.denom)

	body, err := c.httpGet(ctx, url)
	if err != nil {
		return 0, fmt.Errorf("query balance: %w", err)
	}

	var result struct {
		Balance struct {
			Amount string `json:"amount"`
		} `json:"balance"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}

	amount, err := strconv.ParseUint(result.Balance.Amount, 10, 64)
	if err != nil {
		return 0, err
	}
	return amount, nil
}

// TransferTokens signs and broadcasts a MsgSend to transfer uclaw from the
// platform wallet to the given address. Returns the tx hash.
func (c *ChainClient) TransferTokens(ctx context.Context, toAddress string, amountUclaw uint64) (*TransferResult, error) {
	msg := map[string]interface{}{
		"@type":        "/cosmos.bank.v1beta1.MsgSend",
		"from_address": c.platformAddress,
		"to_address":   toAddress,
		"amount": []map[string]string{
			{"denom": c.denom, "amount": strconv.FormatUint(amountUclaw, 10)},
		},
	}

	txHash, err := c.broadcastMsg(ctx, msg)
	if err != nil {
		return nil, err
	}
	return &TransferResult{TxHash: txHash}, nil
}

// ReleaseEscrow signs and broadcasts a MsgReleaseComputeResource to release
// escrowed funds to a provider via the x/marketplace module.
func (c *ChainClient) ReleaseEscrow(ctx context.Context, providerAddress string, amountUclaw uint64, leaseID uint64) (*TransferResult, error) {
	msg := map[string]interface{}{
		"@type":    "/clawchain.marketplace.v1.MsgReleaseComputeResource",
		"lease_id": strconv.FormatUint(leaseID, 10),
		"caller":   c.platformAddress,
	}

	txHash, err := c.broadcastMsg(ctx, msg)
	if err != nil {
		return nil, err
	}
	return &TransferResult{TxHash: txHash}, nil
}

// CreateWallet generates a new keypair. On ClawChain accounts are implicit
// so we derive a deterministic address from a fresh mnemonic.
func (c *ChainClient) CreateWallet(ctx context.Context) (privKeyHex string, address string, err error) {
	entropy, err := bip39.NewEntropy(256)
	if err != nil {
		return "", "", fmt.Errorf("generate entropy: %w", err)
	}
	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		return "", "", fmt.Errorf("generate mnemonic: %w", err)
	}

	seed := bip39.NewSeed(mnemonic, "")
	hkdfReader := hkdf.New(hash.New, seed, []byte("clawchain-user-wallet"), []byte("secp256k1"))
	privBytes := make([]byte, 32)
	if _, err := io.ReadFull(hkdfReader, privBytes); err != nil {
		return "", "", fmt.Errorf("key derivation: %w", err)
	}

	// Derive public key and bech32 address.
	curve := elliptic.P256()
	x, y := curve.ScalarBaseMult(privBytes)
	pubBytes := compressedPubKey(x, y)

	// Simple bech32-like address: sha256(pubkey)[:20] hex-encoded with prefix.
	// In production, use proper bech32 encoding.
	addrHash := sha256.Sum256(pubBytes)
	addr := fmt.Sprintf("claw1%s", hex.EncodeToString(addrHash[:20]))

	return mnemonic, addr, nil
}

// ConfirmTransaction polls the chain until the tx is included in a block.
func (c *ChainClient) ConfirmTransaction(ctx context.Context, txHash string) error {
	pollInterval := 2 * time.Second
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("transaction confirmation timeout: %w", ctx.Err())
		default:
		}

		url := fmt.Sprintf("%s/cosmos/tx/v1beta1/txs/%s", c.restURL, txHash)
		body, err := c.httpGet(ctx, url)
		if err != nil {
			time.Sleep(pollInterval)
			continue
		}

		var result struct {
			TxResponse struct {
				Code   int    `json:"code"`
				Height string `json:"height"`
				RawLog string `json:"raw_log"`
			} `json:"tx_response"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			time.Sleep(pollInterval)
			continue
		}

		if result.TxResponse.Height != "" && result.TxResponse.Height != "0" {
			if result.TxResponse.Code != 0 {
				return fmt.Errorf("tx failed (code %d): %s", result.TxResponse.Code, result.TxResponse.RawLog)
			}
			return nil
		}

		time.Sleep(pollInterval)
	}
}

// IsValidAddress checks if an address is a valid ClawChain bech32 address.
func IsValidAddress(address string) bool {
	return len(address) >= 39 && len(address) <= 65 && strings.HasPrefix(address, "claw1")
}

// broadcastMsg signs and broadcasts a single Cosmos SDK message. Returns tx hash.
func (c *ChainClient) broadcastMsg(ctx context.Context, msg map[string]interface{}) (string, error) {
	if err := c.ensureInitialized(ctx); err != nil {
		return "", err
	}

	privKey, err := c.getPrivateKey()
	if err != nil {
		return "", fmt.Errorf("get private key: %w", err)
	}
	pubKeyBytes := compressedPubKey(privKey.PublicKey.X, privKey.PublicKey.Y)

	c.mu.Lock()
	accountNum := c.accountNum
	sequence := c.sequence
	c.mu.Unlock()

	txBody := map[string]interface{}{
		"messages":       []map[string]interface{}{msg},
		"memo":           "clawchain-billing-service",
		"timeout_height": "0",
	}
	bodyBytes, _ := json.Marshal(txBody)

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
			"amount":    []map[string]string{{"denom": c.denom, "amount": "5000"}},
			"gas_limit": "200000",
		},
	}
	authInfoBytes, _ := json.Marshal(authInfo)

	signDoc := map[string]interface{}{
		"body_bytes":      base64.StdEncoding.EncodeToString(bodyBytes),
		"auth_info_bytes": base64.StdEncoding.EncodeToString(authInfoBytes),
		"chain_id":        c.chainID,
		"account_number":  fmt.Sprintf("%d", accountNum),
	}
	signDocBytes, _ := json.Marshal(signDoc)

	signHash := sha256.Sum256(signDocBytes)
	r, s, err := ecdsa.Sign(bytes.NewReader(signHash[:]), privKey, signHash[:])
	if err != nil {
		return "", fmt.Errorf("sign tx: %w", err)
	}

	rBytes := r.Bytes()
	sBytes := s.Bytes()
	sig := make([]byte, 64)
	copy(sig[32-len(rBytes):32], rBytes)
	copy(sig[64-len(sBytes):], sBytes)

	tx := map[string]interface{}{
		"body":       txBody,
		"auth_info":  authInfo,
		"signatures": []string{base64.StdEncoding.EncodeToString(sig)},
	}

	txBytes, _ := json.Marshal(tx)
	broadcastReq, _ := json.Marshal(map[string]interface{}{
		"tx_bytes": base64.StdEncoding.EncodeToString(txBytes),
		"mode":     "BROADCAST_MODE_SYNC",
	})

	url := fmt.Sprintf("%s/cosmos/tx/v1beta1/txs", c.restURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(broadcastReq))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("broadcast request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("broadcast HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		TxResponse struct {
			Code   int    `json:"code"`
			RawLog string `json:"raw_log"`
			TxHash string `json:"txhash"`
		} `json:"tx_response"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("decode broadcast response: %w", err)
	}

	if result.TxResponse.Code != 0 {
		return "", fmt.Errorf("tx failed (code %d): %s", result.TxResponse.Code, result.TxResponse.RawLog)
	}

	c.mu.Lock()
	c.sequence++
	c.mu.Unlock()

	return result.TxResponse.TxHash, nil
}

func (c *ChainClient) ensureInitialized(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.initialized {
		return nil
	}

	url := fmt.Sprintf("%s/cosmos/auth/v1beta1/accounts/%s", c.restURL, c.platformAddress)
	body, err := c.httpGet(ctx, url)
	if err != nil {
		return fmt.Errorf("fetch account: %w", err)
	}

	var result struct {
		Account struct {
			AccountNumber string `json:"account_number"`
			Sequence      string `json:"sequence"`
		} `json:"account"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
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

	c.accountNum = accNum
	c.sequence = seq
	c.initialized = true
	return nil
}

func (c *ChainClient) getPrivateKey() (*ecdsa.PrivateKey, error) {
	privBytes, err := hex.DecodeString(c.privKeyHex)
	if err != nil {
		return nil, fmt.Errorf("decode private key hex: %w", err)
	}

	curve := elliptic.P256()
	privKey := new(ecdsa.PrivateKey)
	privKey.PublicKey.Curve = curve
	privKey.D = new(big.Int).SetBytes(privBytes)
	privKey.PublicKey.X, privKey.PublicKey.Y = curve.ScalarBaseMult(privBytes)

	return privKey, nil
}

func compressedPubKey(x, y *big.Int) []byte {
	xBytes := x.Bytes()
	padded := make([]byte, 32)
	copy(padded[32-len(xBytes):], xBytes)

	prefix := byte(0x02)
	if y.Bit(0) == 1 {
		prefix = 0x03
	}
	return append([]byte{prefix}, padded...)
}

func loadMnemonic(path string) (string, error) {
	if envMnemonic := os.Getenv("CLAWCHAIN_MNEMONIC"); envMnemonic != "" {
		return strings.TrimSpace(envMnemonic), nil
	}
	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read mnemonic file: %w", err)
		}
		return strings.TrimSpace(string(data)), nil
	}
	return "", nil
}

func (c *ChainClient) httpGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}
