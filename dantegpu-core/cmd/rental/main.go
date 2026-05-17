package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"crypto/tls"
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
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
	"golang.org/x/crypto/hkdf"

	hash "crypto/sha256"

	"github.com/dante-gpu/dante-backend/common"
)

// AuthResponse from API Gateway login
type AuthResponse struct {
	Token        string    `json:"token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
	UserID       string    `json:"user_id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	Role         string    `json:"role"`
	Permissions  []string  `json:"permissions"`
}

// UserProfile represents user profile information
type UserProfile struct {
	ID               string          `json:"id"`
	Username         string          `json:"username"`
	Email            string          `json:"email"`
	FullName         string          `json:"full_name"`
	Role             string          `json:"role"`
	TotalSpentCLAW   decimal.Decimal `json:"total_spent_claw"`
	JobsCompleted    int             `json:"jobs_completed"`
	JobsActive       int             `json:"jobs_active"`
	AccountStatus    string          `json:"account_status"`
	CreatedAt        time.Time       `json:"created_at"`
	LastLoginAt      *time.Time      `json:"last_login_at,omitempty"`
	PreferredGPUType string          `json:"preferred_gpu_type"`
	Timezone         string          `json:"timezone"`
}

// WalletResponse from billing service
type WalletResponse struct {
	ID                  uuid.UUID       `json:"id"`
	UserID              string          `json:"user_id"`
	WalletType          string          `json:"wallet_type"`
	ClawChainAddress    string          `json:"clawchain_address"`
	Balance             decimal.Decimal `json:"balance"`
	LockedBalance       decimal.Decimal `json:"locked_balance"`
	PendingBalance      decimal.Decimal `json:"pending_balance"`
	StakedBalance       decimal.Decimal `json:"staked_balance"`
	RewardsBalance      decimal.Decimal `json:"rewards_balance"`
	IsActive            bool            `json:"is_active"`
	IsVerified          bool            `json:"is_verified"`
	DailySpendLimit     decimal.Decimal `json:"daily_spend_limit"`
	MonthlySpendLimit   decimal.Decimal `json:"monthly_spend_limit"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
	LastActivityAt      *time.Time      `json:"last_activity_at,omitempty"`
	SecuritySettings    WalletSecurity  `json:"security_settings"`
}

// WalletSecurity represents wallet security settings
type WalletSecurity struct {
	RequireConfirmation bool            `json:"require_confirmation"`
	MaxTransactionLimit decimal.Decimal `json:"max_transaction_limit"`
	EnableNotifications bool            `json:"enable_notifications"`
	TwoFactorEnabled    bool            `json:"two_factor_enabled"`
}

// BalanceResponse from billing service
type BalanceResponse struct {
	WalletID           uuid.UUID       `json:"wallet_id"`
	Balance            decimal.Decimal `json:"balance"`
	LockedBalance      decimal.Decimal `json:"locked_balance"`
	PendingBalance     decimal.Decimal `json:"pending_balance"`
	AvailableBalance   decimal.Decimal `json:"available_balance"`
	TotalBalance       decimal.Decimal `json:"total_balance"`
	StakedBalance      decimal.Decimal `json:"staked_balance"`
	RewardsBalance     decimal.Decimal `json:"rewards_balance"`
	DailySpent         decimal.Decimal `json:"daily_spent"`
	MonthlySpent       decimal.Decimal `json:"monthly_spent"`
	TransactionCount   int             `json:"transaction_count"`
	LastTransaction    *time.Time      `json:"last_transaction,omitempty"`
	LastUpdated        time.Time       `json:"last_updated"`
	ExchangeRate       decimal.Decimal `json:"exchange_rate_usd"`
	RecentTransactions []Transaction   `json:"recent_transactions"`
}

// Transaction represents a wallet transaction
type Transaction struct {
	ID              uuid.UUID              `json:"id"`
	Type            string                 `json:"type"`
	Amount          decimal.Decimal        `json:"amount"`
	Fee             decimal.Decimal        `json:"fee"`
	Status          string                 `json:"status"`
	Description     string                 `json:"description"`
	JobID           *string                `json:"job_id,omitempty"`
	ProviderID      *uuid.UUID             `json:"provider_id,omitempty"`
	ChainTxHash     string                 `json:"chain_tx_hash,omitempty"`
	CreatedAt       time.Time              `json:"created_at"`
	ConfirmedAt     *time.Time             `json:"confirmed_at,omitempty"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
}

// JobSubmissionRequest for submitting comprehensive jobs
type JobSubmissionRequest struct {
	Type          string   `json:"type"`
	Name          string   `json:"name"`
	Description   string   `json:"description,omitempty"`
	ExecutionType string   `json:"execution_type"` // docker, script, python, bash
	Priority      int      `json:"priority,omitempty"`
	Tags          []string `json:"tags,omitempty"`

	// Execution parameters
	DockerImage    string            `json:"docker_image,omitempty"`
	DockerCommand  []string          `json:"docker_command,omitempty"`
	Script         string            `json:"script,omitempty"`
	ScriptLanguage string            `json:"script_language,omitempty"`
	Environment    map[string]string `json:"environment,omitempty"`

	// Resource requirements
	Requirements ResourceRequirements `json:"requirements"`
	Constraints  JobConstraints       `json:"constraints"`

	// File management
	InputFiles  []FileSpec `json:"input_files,omitempty"`
	OutputFiles []FileSpec `json:"output_files,omitempty"`

	// Cost and time limits
	MaxCostCLAW        decimal.Decimal `json:"max_cost_claw"`
	MaxDurationMinutes int             `json:"max_duration_minutes"`

	// Provider preferences
	PreferredProviders []uuid.UUID `json:"preferred_providers,omitempty"`
	ExcludedProviders  []uuid.UUID `json:"excluded_providers,omitempty"`
	PreferredLocation  string      `json:"preferred_location,omitempty"`
	RequireGPUAccess   bool        `json:"require_gpu_access"`

	// Advanced options
	RetryCount          int                    `json:"retry_count,omitempty"`
	NotificationWebhook string                 `json:"notification_webhook,omitempty"`
	MetadataCallback    string                 `json:"metadata_callback,omitempty"`
	CustomParams        map[string]interface{} `json:"custom_params,omitempty"`
}

// ResourceRequirements specifies detailed resource requirements
type ResourceRequirements struct {
	GPUModel           string  `json:"gpu_model,omitempty"`
	GPUMemoryMB        uint64  `json:"gpu_memory_mb"`
	GPUComputeUnits    float64 `json:"gpu_compute_units,omitempty"`
	MinGPUMemoryMB     uint64  `json:"min_gpu_memory_mb"`
	CPUCores           int     `json:"cpu_cores"`
	MemoryMB           uint64  `json:"memory_mb"`
	DiskSpaceMB        uint64  `json:"disk_space_mb"`
	NetworkBandwidthMB uint64  `json:"network_bandwidth_mb"`
	Architecture       string  `json:"architecture,omitempty"` // x86_64, arm64, etc.
}

// JobConstraints specifies execution constraints
type JobConstraints struct {
	MaxCPUUsagePercent    float64 `json:"max_cpu_usage_percent"`
	MaxMemoryUsagePercent float64 `json:"max_memory_usage_percent"`
	MaxGPUUsagePercent    float64 `json:"max_gpu_usage_percent"`
	MaxNetworkUsageMB     uint64  `json:"max_network_usage_mb"`
	AllowNetworkAccess    bool    `json:"allow_network_access"`
	AllowFileSystemAccess bool    `json:"allow_filesystem_access"`
	IsolationLevel        string  `json:"isolation_level"` // container, vm, process
}

// FileSpec specifies input/output file details
type FileSpec struct {
	URL         string            `json:"url"`
	Path        string            `json:"path"`
	Size        int64             `json:"size,omitempty"`
	Checksum    string            `json:"checksum,omitempty"`
	Compression string            `json:"compression,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Required    bool              `json:"required"`
}

// JobSubmissionResponse from scheduler
type JobSubmissionResponse struct {
	JobID            string          `json:"job_id"`
	Status           string          `json:"status"`
	QueuePosition    int             `json:"queue_position"`
	EstimatedStart   *time.Time      `json:"estimated_start,omitempty"`
	EstimatedCost    decimal.Decimal `json:"estimated_cost"`
	ReservedFunds    decimal.Decimal `json:"reserved_funds"`
	SessionID        uuid.UUID       `json:"session_id"`
	Timestamp        time.Time       `json:"timestamp"`
	Message          string          `json:"message"`
	ValidationErrors []string        `json:"validation_errors,omitempty"`
}

// JobStatusResponse from scheduler with comprehensive details
type JobStatusResponse struct {
	JobID         string     `json:"job_id"`
	UserID        string     `json:"user_id"`
	SessionID     uuid.UUID  `json:"session_id"`
	Status        string     `json:"status"`
	Stage         string     `json:"stage"`
	Progress      float32    `json:"progress"`
	ProviderID    *uuid.UUID `json:"provider_id,omitempty"`
	ProviderName  string     `json:"provider_name,omitempty"`
	QueuePosition int        `json:"queue_position,omitempty"`

	// Results and output
	Result    string `json:"result,omitempty"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
	ErrorCode string `json:"error_code,omitempty"`
	ExitCode  *int   `json:"exit_code,omitempty"`

	// Timing information
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	StartedAt   *time.Time     `json:"started_at,omitempty"`
	CompletedAt *time.Time     `json:"completed_at,omitempty"`
	Duration    *time.Duration `json:"duration,omitempty"`

	// Resource usage
	ResourceUsage ResourceUsage `json:"resource_usage"`
	GPUMetrics    []GPUMetrics  `json:"gpu_metrics"`

	// Cost information
	EstimatedCost decimal.Decimal `json:"estimated_cost"`
	ActualCost    decimal.Decimal `json:"actual_cost"`
	EnergyUsed    decimal.Decimal `json:"energy_used_kwh"`

	// Files and artifacts
	LogsURL        string     `json:"logs_url,omitempty"`
	OutputFilesURL []string   `json:"output_files_url,omitempty"`
	Artifacts      []Artifact `json:"artifacts,omitempty"`

	// Additional metadata
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
	Retries    int                    `json:"retries"`
	MaxRetries int                    `json:"max_retries"`
}

// ResourceUsage represents resource usage during execution
type ResourceUsage struct {
	CPUPercent       float64   `json:"cpu_percent"`
	MemoryMB         uint64    `json:"memory_mb"`
	MemoryPercent    float64   `json:"memory_percent"`
	DiskReadMB       uint64    `json:"disk_read_mb"`
	DiskWriteMB      uint64    `json:"disk_write_mb"`
	NetworkTxMB      uint64    `json:"network_tx_mb"`
	NetworkRxMB      uint64    `json:"network_rx_mb"`
	GPUUtilization   float64   `json:"gpu_utilization_percent"`
	GPUMemoryUsage   uint64    `json:"gpu_memory_usage_mb"`
	PowerConsumption uint32    `json:"power_consumption_w"`
	Timestamp        time.Time `json:"timestamp"`
}

// GPUMetrics represents GPU performance metrics
type GPUMetrics struct {
	Index             int       `json:"index"`
	Name              string    `json:"name"`
	UtilizationGPU    uint8     `json:"utilization_gpu_percent"`
	UtilizationMemory uint8     `json:"utilization_memory_percent"`
	MemoryTotal       uint64    `json:"memory_total_mb"`
	MemoryUsed        uint64    `json:"memory_used_mb"`
	Temperature       uint8     `json:"temperature_celsius"`
	PowerDraw         uint32    `json:"power_draw_watts"`
	ClockCore         uint32    `json:"clock_core_mhz"`
	ClockMemory       uint32    `json:"clock_memory_mhz"`
	FanSpeed          uint8     `json:"fan_speed_percent"`
	Timestamp         time.Time `json:"timestamp"`
}

// Artifact represents a generated artifact
type Artifact struct {
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Size      int64     `json:"size"`
	URL       string    `json:"url"`
	Checksum  string    `json:"checksum"`
	CreatedAt time.Time `json:"created_at"`
}

// PricingEstimateRequest for cost estimation
type PricingEstimateRequest struct {
	GPUModel         string          `json:"gpu_model"`
	RequestedVRAMGB  int             `json:"requested_vram_gb"`
	EstimatedPowerW  uint32          `json:"estimated_power_w"`
	DurationHours    decimal.Decimal `json:"duration_hours"`
	Location         string          `json:"location,omitempty"`
	ProviderID       *uuid.UUID      `json:"provider_id,omitempty"`
	CPUCores         int             `json:"cpu_cores,omitempty"`
	MemoryGB         int             `json:"memory_gb,omitempty"`
	StorageGB        int             `json:"storage_gb,omitempty"`
	NetworkBandwidth int             `json:"network_bandwidth_mbps,omitempty"`
	Priority         string          `json:"priority,omitempty"`
}

// PricingEstimateResponse from billing service
type PricingEstimateResponse struct {
	BaseHourlyRate     decimal.Decimal `json:"base_hourly_rate"`
	VRAMHourlyRate     decimal.Decimal `json:"vram_hourly_rate"`
	PowerHourlyRate    decimal.Decimal `json:"power_hourly_rate"`
	CPUHourlyRate      decimal.Decimal `json:"cpu_hourly_rate"`
	MemoryHourlyRate   decimal.Decimal `json:"memory_hourly_rate"`
	StorageHourlyRate  decimal.Decimal `json:"storage_hourly_rate"`
	NetworkHourlyRate  decimal.Decimal `json:"network_hourly_rate"`
	TotalHourlyRate    decimal.Decimal `json:"total_hourly_rate"`
	TotalCost          decimal.Decimal `json:"total_cost"`
	PlatformFee        decimal.Decimal `json:"platform_fee"`
	PlatformFeePercent decimal.Decimal `json:"platform_fee_percent"`
	ProviderEarnings   decimal.Decimal `json:"provider_earnings"`
	VRAMPercentage     decimal.Decimal `json:"vram_percentage"`
	EstimatedEnergyKWh decimal.Decimal `json:"estimated_energy_kwh"`
	CarbonFootprintKg  decimal.Decimal `json:"carbon_footprint_kg"`
	CalculatedAt       time.Time       `json:"calculated_at"`
	ValidUntil         time.Time       `json:"valid_until"`
	DiscountApplied    decimal.Decimal `json:"discount_applied"`
	RecommendedGPUs    []string        `json:"recommended_gpus"`
}

// ProviderFilter for filtering available providers
type ProviderFilter struct {
	Location        string          `json:"location,omitempty"`
	GPUModel        string          `json:"gpu_model,omitempty"`
	MinVRAM         uint64          `json:"min_vram_mb,omitempty"`
	MaxPricePerHour decimal.Decimal `json:"max_price_per_hour,omitempty"`
	MinRating       float64         `json:"min_rating,omitempty"`
	IsOnline        *bool           `json:"is_online,omitempty"`
	HasCapacity     *bool           `json:"has_capacity,omitempty"`
	SortBy          string          `json:"sort_by,omitempty"`    // price, rating, capacity, location
	SortOrder       string          `json:"sort_order,omitempty"` // asc, desc
	Limit           int             `json:"limit,omitempty"`
	Offset          int             `json:"offset,omitempty"`
}

// ChainWalletManager manages ClawChain operations for the client
type ChainWalletManager struct {
	privKeyHex  string
	address     string
	restURL     string
	chainID     string
	denom       string
	httpClient  *http.Client
	logger      *zap.Logger

	mu          sync.Mutex
	accountNum  uint64
	sequence    uint64
	initialized bool
}

// GPURentalClient manages comprehensive GPU rental operations
type GPURentalClient struct {
	config       *common.GPURentalConfig
	logger       *zap.Logger
	httpClient   *http.Client
	authToken    string
	refreshToken string
	tokenExpiry  time.Time
	userID       string
	userProfile  *UserProfile
	walletID     uuid.UUID
	wallet       *WalletResponse
	chainWallet  *ChainWalletManager
	activeJobs   map[string]*JobStatusResponse
	jobHistory   []*JobStatusResponse
}

// NewGPURentalClient creates a comprehensive GPU rental client
func NewGPURentalClient(config *common.GPURentalConfig) (*GPURentalClient, error) {
	logger, err := common.SetupLogger()
	if err != nil {
		return nil, fmt.Errorf("failed to setup logger: %v", err)
	}

	// Create HTTP client with proper configuration
	httpClient := &http.Client{
		Timeout: config.RequestTimeout,
		Transport: &http.Transport{
			TLSClientConfig:    &tls.Config{InsecureSkipVerify: false},
			MaxIdleConns:       10,
			IdleConnTimeout:    30 * time.Second,
			DisableCompression: false,
		},
	}

	client := &GPURentalClient{
		config:     config,
		logger:     logger,
		httpClient: httpClient,
		activeJobs: make(map[string]*JobStatusResponse),
		jobHistory: make([]*JobStatusResponse, 0),
	}

	// Initialize ClawChain wallet if configured
	if config.ClawChainMnemonic != "" {
		chainWallet, err := client.initializeChainWallet()
		if err != nil {
			logger.Warn("Failed to initialize ClawChain wallet", zap.Error(err))
		} else {
			client.chainWallet = chainWallet
		}
	}

	return client, nil
}

// getDefaultRentalConfig returns comprehensive default configuration
func getDefaultRentalConfig() *common.GPURentalConfig {
	return &common.GPURentalConfig{
		APIGatewayURL:         getenvDefault("API_GATEWAY_URL", "http://localhost:8080"),
		ProviderRegistryURL:   getenvDefault("PROVIDER_REGISTRY_URL", "http://localhost:8001"),
		BillingServiceURL:     getenvDefault("BILLING_SERVICE_URL", "http://localhost:8003"),
		StorageServiceURL:     getenvDefault("STORAGE_SERVICE_URL", "http://localhost:8082"),
		Username:              os.Getenv("DANTE_USERNAME"),
		Password:              os.Getenv("DANTE_PASSWORD"),
		ClawChainMnemonic:     os.Getenv("CLAWCHAIN_MNEMONIC"),
		DefaultJobType:        getenvDefault("DEFAULT_JOB_TYPE", "ai-training"),
		DefaultMaxCostCLAW:    getenvDecimalDefault("DEFAULT_MAX_COST_CLAW", "10.0"),
		DefaultMaxDurationHrs: getenvIntDefault("DEFAULT_MAX_DURATION_HRS", 24),
		DefaultGPUType:        getenvDefault("DEFAULT_GPU_TYPE", "any"),
		DefaultVRAMGB:         getenvIntDefault("DEFAULT_VRAM_GB", 8),
		RequestTimeout:        30 * time.Second,
		PollingInterval:       5 * time.Second,
		EnableAutoRetry:       getenvBoolDefault("ENABLE_AUTO_RETRY", true),
		MaxRetryAttempts:      getenvIntDefault("MAX_RETRY_ATTEMPTS", 3),
		EnableNotifications:   getenvBoolDefault("ENABLE_NOTIFICATIONS", true),
	}
}

// Helper functions for environment variables
func getenvDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getenvIntDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getenvDecimalDefault(key, defaultValue string) decimal.Decimal {
	if value := os.Getenv(key); value != "" {
		if decVal, err := decimal.NewFromString(value); err == nil {
			return decVal
		}
	}
	decVal, _ := decimal.NewFromString(defaultValue)
	return decVal
}

func getenvBoolDefault(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}

// initializeChainWallet initializes the ClawChain wallet for the client
func (c *GPURentalClient) initializeChainWallet() (*ChainWalletManager, error) {
	mnemonic := c.config.ClawChainMnemonic

	// Derive signing key from mnemonic via HKDF
	seed := bip39.NewSeed(mnemonic, "")
	hkdfReader := hkdf.New(hash.New, seed, []byte("clawchain-rental-client"), []byte("secp256k1"))
	privBytes := make([]byte, 32)
	if _, err := io.ReadFull(hkdfReader, privBytes); err != nil {
		return nil, fmt.Errorf("key derivation failed: %w", err)
	}

	// Derive public key and bech32 address
	curve := elliptic.P256()
	x, y := curve.ScalarBaseMult(privBytes)
	pubBytes := compressedPubKey(x, y)
	addrHash := sha256.Sum256(pubBytes)
	address := fmt.Sprintf("claw1%s", hex.EncodeToString(addrHash[:20]))

	restURL := getenvDefault("CLAWCHAIN_REST_URL", "http://localhost:1317")
	chainID := getenvDefault("CLAWCHAIN_CHAIN_ID", "clawchain-1")

	wm := &ChainWalletManager{
		privKeyHex: hex.EncodeToString(privBytes),
		address:    address,
		restURL:    restURL,
		chainID:    chainID,
		denom:      "uclaw",
		httpClient: &http.Client{Timeout: 30 * time.Second},
		logger:     c.logger,
	}

	// Test connection
	if err := wm.testConnection(); err != nil {
		return nil, fmt.Errorf("ClawChain wallet connection test failed: %w", err)
	}

	c.logger.Info("ClawChain wallet initialized successfully",
		zap.String("address", address))

	return wm, nil
}

// testConnection tests the ClawChain REST connection
func (wm *ChainWalletManager) testConnection() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	url := fmt.Sprintf("%s/cosmos/bank/v1beta1/balances/%s/by_denom?denom=%s",
		wm.restURL, wm.address, wm.denom)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := wm.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to ClawChain REST: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Balance struct {
			Amount string `json:"amount"`
		} `json:"balance"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse balance response: %w", err)
	}

	amount, _ := strconv.ParseUint(result.Balance.Amount, 10, 64)
	balanceCLAW := decimal.NewFromInt(int64(amount)).Div(decimal.NewFromInt(1e6))

	wm.logger.Info("ClawChain wallet connection test successful",
		zap.Uint64("uclaw_balance", amount),
		zap.String("claw_balance", balanceCLAW.String()))

	return nil
}

// getBalance gets the CLAW token balance
func (wm *ChainWalletManager) getBalance() (decimal.Decimal, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	url := fmt.Sprintf("%s/cosmos/bank/v1beta1/balances/%s/by_denom?denom=%s",
		wm.restURL, wm.address, wm.denom)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return decimal.Zero, fmt.Errorf("create request: %w", err)
	}

	resp, err := wm.httpClient.Do(req)
	if err != nil {
		return decimal.Zero, fmt.Errorf("query balance: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Balance struct {
			Amount string `json:"amount"`
		} `json:"balance"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return decimal.Zero, err
	}

	amount, _ := strconv.ParseUint(result.Balance.Amount, 10, 64)
	return decimal.NewFromInt(int64(amount)).Div(decimal.NewFromInt(1e6)), nil
}

// ensureInitialized fetches account number and sequence from the chain.
func (wm *ChainWalletManager) ensureInitialized(ctx context.Context) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	if wm.initialized {
		return nil
	}

	url := fmt.Sprintf("%s/cosmos/auth/v1beta1/accounts/%s", wm.restURL, wm.address)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	resp, err := wm.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch account: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Account struct {
			AccountNumber string `json:"account_number"`
			Sequence      string `json:"sequence"`
		} `json:"account"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}
	wm.accountNum, _ = strconv.ParseUint(result.Account.AccountNumber, 10, 64)
	wm.sequence, _ = strconv.ParseUint(result.Account.Sequence, 10, 64)
	wm.initialized = true
	return nil
}

// broadcastMsg signs and broadcasts a Cosmos SDK message.
func (wm *ChainWalletManager) broadcastMsg(ctx context.Context, msg map[string]interface{}) (string, error) {
	if err := wm.ensureInitialized(ctx); err != nil {
		return "", err
	}

	privBytes, _ := hex.DecodeString(wm.privKeyHex)
	curve := elliptic.P256()
	privKey := new(ecdsa.PrivateKey)
	privKey.PublicKey.Curve = curve
	privKey.D = new(big.Int).SetBytes(privBytes)
	privKey.PublicKey.X, privKey.PublicKey.Y = curve.ScalarBaseMult(privBytes)
	pubKeyBytes := compressedPubKey(privKey.PublicKey.X, privKey.PublicKey.Y)

	wm.mu.Lock()
	accountNum := wm.accountNum
	sequence := wm.sequence
	wm.mu.Unlock()

	txBody := map[string]interface{}{
		"messages":       []map[string]interface{}{msg},
		"memo":           "clawchain-rental-client",
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
					"single": map[string]interface{}{"mode": "SIGN_MODE_DIRECT"},
				},
				"sequence": fmt.Sprintf("%d", sequence),
			},
		},
		"fee": map[string]interface{}{
			"amount":    []map[string]string{{"denom": wm.denom, "amount": "5000"}},
			"gas_limit": "200000",
		},
	}
	authInfoBytes, _ := json.Marshal(authInfo)

	signDoc := map[string]interface{}{
		"body_bytes":      base64.StdEncoding.EncodeToString(bodyBytes),
		"auth_info_bytes": base64.StdEncoding.EncodeToString(authInfoBytes),
		"chain_id":        wm.chainID,
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

	broadcastURL := fmt.Sprintf("%s/cosmos/tx/v1beta1/txs", wm.restURL)
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", broadcastURL, bytes.NewReader(broadcastReq))
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := wm.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("broadcast: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var txResult struct {
		TxResponse struct {
			Code   int    `json:"code"`
			RawLog string `json:"raw_log"`
			TxHash string `json:"txhash"`
		} `json:"tx_response"`
	}
	if err := json.Unmarshal(respBody, &txResult); err != nil {
		return "", fmt.Errorf("decode broadcast response: %w", err)
	}
	if txResult.TxResponse.Code != 0 {
		return "", fmt.Errorf("tx failed (code %d): %s", txResult.TxResponse.Code, txResult.TxResponse.RawLog)
	}

	wm.mu.Lock()
	wm.sequence++
	wm.mu.Unlock()

	return txResult.TxResponse.TxHash, nil
}

// transferTokens sends CLAW to the given address via MsgSend.
func (wm *ChainWalletManager) transferTokens(ctx context.Context, toAddress string, amountUclaw uint64) (string, error) {
	msg := map[string]interface{}{
		"@type":        "/cosmos.bank.v1beta1.MsgSend",
		"from_address": wm.address,
		"to_address":   toAddress,
		"amount":       []map[string]string{{"denom": wm.denom, "amount": strconv.FormatUint(amountUclaw, 10)}},
	}
	return wm.broadcastMsg(ctx, msg)
}

// isValidClawChainAddress checks if an address is a valid claw1... bech32 address.
func isValidClawChainAddress(address string) bool {
	return len(address) >= 39 && len(address) <= 65 && strings.HasPrefix(address, "claw1")
}

// compressedPubKey returns the SEC1 compressed form of the public key.
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

// refreshTokenIfNeeded refreshes the auth token if it's about to expire
func (c *GPURentalClient) refreshTokenIfNeeded() error {
	if time.Until(c.tokenExpiry) > 5*time.Minute {
		// Token is still valid for more than 5 minutes
		return nil
	}

	// Refresh the token
	refreshData := map[string]string{
		"refresh_token": c.refreshToken,
	}

	jsonData, err := json.Marshal(refreshData)
	if err != nil {
		return fmt.Errorf("failed to marshal refresh data: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.config.APIGatewayURL+"/auth/refresh",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return fmt.Errorf("failed to refresh token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("token refresh failed with status %d", resp.StatusCode)
	}

	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return fmt.Errorf("failed to decode refresh response: %w", err)
	}

	c.authToken = authResp.Token
	c.refreshToken = authResp.RefreshToken
	c.tokenExpiry = authResp.ExpiresAt

	c.logger.Info("Auth token refreshed successfully")
	return nil
}

// makeAuthenticatedRequest makes an HTTP request with authentication
func (c *GPURentalClient) makeAuthenticatedRequest(method, url string, body io.Reader) (*http.Response, error) {
	// Refresh token if needed
	if err := c.refreshTokenIfNeeded(); err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.authToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Dante-GPU-Rental-Client/1.0")

	return c.httpClient.Do(req)
}

// getUserProfile gets the user profile information
func (c *GPURentalClient) getUserProfile() error {
	resp, err := c.makeAuthenticatedRequest("GET", c.config.APIGatewayURL+"/auth/profile", nil)
	if err != nil {
		return fmt.Errorf("failed to get user profile: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("get profile failed with status %d", resp.StatusCode)
	}

	var profile UserProfile
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		return fmt.Errorf("failed to decode profile response: %w", err)
	}

	c.userProfile = &profile
	c.logger.Info("User profile loaded",
		zap.String("username", profile.Username),
		zap.String("role", profile.Role),
		zap.Int("jobs_completed", profile.JobsCompleted),
		zap.String("total_spent", profile.TotalSpentCLAW.String()))

	return nil
}

// Initialize sets up the rental client
func (c *GPURentalClient) Initialize() error {
	// Authenticate with API Gateway
	if err := c.authenticate(); err != nil {
		return fmt.Errorf("authentication failed: %v", err)
	}

	// Setup wallet
	if err := c.setupWallet(); err != nil {
		return fmt.Errorf("wallet setup failed: %v", err)
	}

	c.logger.Info("GPU rental client initialized successfully",
		zap.String("user_id", c.userID),
		zap.String("wallet_id", c.walletID.String()))

	return nil
}

// authenticate with API Gateway
func (c *GPURentalClient) authenticate() error {
	loginData := map[string]string{
		"username": c.config.Username,
		"password": c.config.Password,
	}

	jsonData, err := json.Marshal(loginData)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.config.APIGatewayURL+"/auth/login",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("authentication failed with status %d", resp.StatusCode)
	}

	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return err
	}

	c.authToken = authResp.Token
	c.refreshToken = authResp.RefreshToken
	c.tokenExpiry = authResp.ExpiresAt
	c.userID = authResp.UserID

	c.logger.Info("Authentication successful", zap.String("user_id", c.userID))
	return nil
}

// setupWallet creates or retrieves user wallet
func (c *GPURentalClient) setupWallet() error {
	// Try to get existing wallet
	wallet, err := c.getUserWallet()
	if err == nil {
		c.walletID = wallet.ID
		return nil
	}

	// Create new wallet if not found
	wallet, err = c.createWallet()
	if err != nil {
		return err
	}

	c.walletID = wallet.ID
	return nil
}

// getUserWallet retrieves user's existing wallet
func (c *GPURentalClient) getUserWallet() (*WalletResponse, error) {
	req, err := http.NewRequest("GET", c.config.APIGatewayURL+"/billing/wallet", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get wallet: status %d", resp.StatusCode)
	}

	var wallet WalletResponse
	if err := json.NewDecoder(resp.Body).Decode(&wallet); err != nil {
		return nil, err
	}

	return &wallet, nil
}

// createWallet creates a new wallet for the user
func (c *GPURentalClient) createWallet() (*WalletResponse, error) {
	walletData := map[string]interface{}{
		"user_id":        c.userID,
		"wallet_type":    "user",
		"clawchain_address": "", // Placeholder - filled by billing service
	}

	jsonData, err := json.Marshal(walletData)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", c.config.APIGatewayURL+"/billing/wallet", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("failed to create wallet: status %d", resp.StatusCode)
	}

	var wallet WalletResponse
	if err := json.NewDecoder(resp.Body).Decode(&wallet); err != nil {
		return nil, err
	}

	c.logger.Info("Created new wallet", zap.String("wallet_id", wallet.ID.String()))
	return &wallet, nil
}

// GetWalletBalance retrieves current wallet balance
func (c *GPURentalClient) GetWalletBalance() (*BalanceResponse, error) {
	req, err := http.NewRequest("GET", c.config.APIGatewayURL+"/billing/wallet/balance", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get balance: status %d", resp.StatusCode)
	}

	var balance BalanceResponse
	if err := json.NewDecoder(resp.Body).Decode(&balance); err != nil {
		return nil, err
	}

	return &balance, nil
}

// ListAvailableProviders retrieves available GPU providers
func (c *GPURentalClient) ListAvailableProviders(filters map[string]string) ([]common.Provider, error) {
	req, err := http.NewRequest("GET", c.config.ProviderRegistryURL+"/api/providers", nil)
	if err != nil {
		return nil, err
	}

	// Add query parameters for filters
	q := req.URL.Query()
	for key, value := range filters {
		q.Add(key, value)
	}
	req.URL.RawQuery = q.Encode()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to list providers: status %d", resp.StatusCode)
	}

	var providers []common.Provider
	if err := json.NewDecoder(resp.Body).Decode(&providers); err != nil {
		return nil, err
	}

	return providers, nil
}

// EstimateJobCost estimates the cost of running a job
func (c *GPURentalClient) EstimateJobCost(req *PricingEstimateRequest) (*PricingEstimateResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", c.config.APIGatewayURL+"/billing/estimate", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to estimate cost: status %d", resp.StatusCode)
	}

	var estimate PricingEstimateResponse
	if err := json.NewDecoder(resp.Body).Decode(&estimate); err != nil {
		return nil, err
	}

	return &estimate, nil
}

// SubmitJob submits a new job for execution
func (c *GPURentalClient) SubmitJob(req *JobSubmissionRequest) (*JobSubmissionResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", c.config.APIGatewayURL+"/jobs", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("failed to submit job: status %d", resp.StatusCode)
	}

	var jobResp JobSubmissionResponse
	if err := json.NewDecoder(resp.Body).Decode(&jobResp); err != nil {
		return nil, err
	}

	return &jobResp, nil
}

// GetJobStatus retrieves the current status of a job
func (c *GPURentalClient) GetJobStatus(jobID string) (*JobStatusResponse, error) {
	req, err := http.NewRequest("GET", c.config.APIGatewayURL+"/jobs/"+jobID, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get job status: status %d", resp.StatusCode)
	}

	var status JobStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, err
	}

	return &status, nil
}

// CancelJob cancels a running job
func (c *GPURentalClient) CancelJob(jobID string) error {
	req, err := http.NewRequest("DELETE", c.config.APIGatewayURL+"/jobs/"+jobID, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to cancel job: status %d", resp.StatusCode)
	}

	return nil
}

// WaitForJobCompletion waits for a job to complete
func (c *GPURentalClient) WaitForJobCompletion(jobID string, pollInterval time.Duration) (*JobStatusResponse, error) {
	for {
		status, err := c.GetJobStatus(jobID)
		if err != nil {
			return nil, err
		}

		switch status.Status {
		case "completed", "failed", "cancelled":
			return status, nil
		default:
			c.logger.Info("Job still running",
				zap.String("job_id", jobID),
				zap.String("status", status.Status),
				zap.Float32("progress", status.Progress))
			time.Sleep(pollInterval)
		}
	}
}

// printProviders displays provider information
func (c *GPURentalClient) printProviders(providers []common.Provider) {
	fmt.Printf("\n=== Available GPU Providers ===\n")
	for i, provider := range providers {
		fmt.Printf("\n%d. Provider: %s\n", i+1, provider.Name)
		fmt.Printf("   ID: %s\n", provider.ID.String())
		fmt.Printf("   Location: %s\n", provider.Location)
		fmt.Printf("   Status: %s\n", provider.Status)
		fmt.Printf("   GPUs:\n")

		for j, gpu := range provider.GPUs {
			fmt.Printf("     %d. %s\n", j+1, gpu.ModelName)
			fmt.Printf("        VRAM: %d MB\n", gpu.VRAM)
			fmt.Printf("        Architecture: %s\n", gpu.Architecture)
			fmt.Printf("        Power: %d W\n", gpu.PowerConsumption)
			fmt.Printf("        Healthy: %t\n", gpu.IsHealthy)
		}
	}
	fmt.Printf("\n")
}

// runInteractiveMode runs the interactive command interface
func (c *GPURentalClient) runInteractiveMode() error {
	fmt.Println("\n=== Dante GPU Rental Platform ===")
	fmt.Printf("Welcome, User ID: %s\n", c.userID)

	// Show wallet balance
	balance, err := c.GetWalletBalance()
	if err != nil {
		c.logger.Warn("Failed to get wallet balance", zap.Error(err))
	} else {
		fmt.Printf("Wallet Balance: %s CLAW tokens\n", balance.AvailableBalance.StringFixed(4))
	}

	for {
		fmt.Println("\n=== Main Menu ===")
		fmt.Println("1. List Available Providers")
		fmt.Println("2. Check Wallet Balance")
		fmt.Println("3. Submit AI Training Job")
		fmt.Println("4. Submit Custom Script Job")
		fmt.Println("5. Check Job Status")
		fmt.Println("6. Cancel Job")
		fmt.Println("7. Estimate Job Cost")
		fmt.Println("8. Exit")
		fmt.Print("\nSelect option (1-8): ")

		var choice int
		if _, err := fmt.Scanf("%d", &choice); err != nil {
			fmt.Println("Invalid input. Please enter a number.")
			continue
		}

		switch choice {
		case 1:
			providers, err := c.ListAvailableProviders(map[string]string{"status": "available"})
			if err != nil {
				fmt.Printf("Error listing providers: %v\n", err)
			} else {
				c.printProviders(providers)
			}

		case 2:
			balance, err := c.GetWalletBalance()
			if err != nil {
				fmt.Printf("Error getting balance: %v\n", err)
			} else {
				fmt.Printf("\n=== Wallet Balance ===\n")
				fmt.Printf("Available: %s CLAW\n", balance.AvailableBalance.StringFixed(4))
				fmt.Printf("Locked: %s CLAW\n", balance.LockedBalance.StringFixed(4))
				fmt.Printf("Total: %s CLAW\n", balance.TotalBalance.StringFixed(4))
			}

		case 3:
			c.submitAITrainingJob()

		case 4:
			c.submitCustomScriptJob()

		case 5:
			fmt.Print("Enter Job ID: ")
			var jobID string
			fmt.Scanf("%s", &jobID)

			status, err := c.GetJobStatus(jobID)
			if err != nil {
				fmt.Printf("Error getting job status: %v\n", err)
			} else {
				fmt.Printf("\n=== Job Status ===\n")
				fmt.Printf("Job ID: %s\n", status.JobID)
				fmt.Printf("Status: %s\n", status.Status)
				fmt.Printf("Progress: %.2f%%\n", status.Progress*100)
				if status.Error != "" {
					fmt.Printf("Error: %s\n", status.Error)
				}
			}

		case 6:
			fmt.Print("Enter Job ID to cancel: ")
			var jobID string
			fmt.Scanf("%s", &jobID)

			if err := c.CancelJob(jobID); err != nil {
				fmt.Printf("Error cancelling job: %v\n", err)
			} else {
				fmt.Printf("Job %s cancelled successfully\n", jobID)
			}

		case 7:
			c.estimateJobCost()

		case 8:
			fmt.Println("Goodbye!")
			return nil

		default:
			fmt.Println("Invalid option. Please select 1-8.")
		}
	}
}

// submitAITrainingJob handles AI training job submission
func (c *GPURentalClient) submitAITrainingJob() {
	fmt.Println("\n=== Submit AI Training Job ===")

	// Get job details from user
	fmt.Print("Enter job name: ")
	var jobName string
	fmt.Scanln(&jobName)

	fmt.Print("Enter GPU type (e.g., nvidia-rtx-4090): ")
	var gpuType string
	fmt.Scanln(&gpuType)

	fmt.Print("Enter VRAM requirement (GB): ")
	var vramInput string
	fmt.Scanln(&vramInput)
	vramGB, _ := strconv.Atoi(vramInput)

	fmt.Print("Enter max cost (CLAW tokens): ")
	var costInput string
	fmt.Scanln(&costInput)
	maxCost, _ := decimal.NewFromString(costInput)

	fmt.Print("Enter max duration (hours): ")
	var hoursInput string
	fmt.Scanln(&hoursInput)
	maxHours, _ := strconv.Atoi(hoursInput)

	req := &JobSubmissionRequest{
		Type:        "ai-training",
		Name:        jobName,
		Description: "AI model training job",
		Requirements: ResourceRequirements{
			GPUModel:    gpuType,
			GPUMemoryMB: uint64(vramGB * 1024),
			CPUCores:    4,
			MemoryMB:    8192,
		},
		MaxCostCLAW:        maxCost,
		MaxDurationMinutes: maxHours * 60,
		CustomParams: map[string]interface{}{
			"framework":    "pytorch",
			"model_type":   "transformer",
			"dataset_size": "large",
		},
	}

	resp, err := c.SubmitJob(req)
	if err != nil {
		fmt.Printf("Error submitting job: %v\n", err)
		return
	}

	fmt.Printf("Job submitted successfully!\n")
	fmt.Printf("Job ID: %s\n", resp.JobID)
	fmt.Printf("Status: %s\n", resp.Status)
	fmt.Printf("Estimated Cost: %s CLAW\n", resp.EstimatedCost.String())
}

// submitCustomScriptJob handles custom script job submission
func (c *GPURentalClient) submitCustomScriptJob() {
	fmt.Println("\n=== Submit Custom Script Job ===")

	fmt.Print("Enter job name: ")
	var jobName string
	fmt.Scanln(&jobName)

	fmt.Print("Enter script language (python/bash): ")
	var language string
	fmt.Scanln(&language)

	fmt.Print("Enter script content: ")
	var scriptContent string
	fmt.Scanln(&scriptContent)

	fmt.Print("Enter GPU type: ")
	var gpuType string
	fmt.Scanln(&gpuType)

	fmt.Print("Enter VRAM requirement (GB): ")
	var vramInput string
	fmt.Scanln(&vramInput)
	vramGB, _ := strconv.Atoi(vramInput)

	req := &JobSubmissionRequest{
		Type:        "script-execution",
		Name:        jobName,
		Description: "Custom script execution",
		Requirements: ResourceRequirements{
			GPUModel:    gpuType,
			GPUMemoryMB: uint64(vramGB * 1024),
			CPUCores:    2,
			MemoryMB:    4096,
		},
		MaxCostCLAW:        decimal.NewFromFloat(5.0),
		MaxDurationMinutes: 120,
		Script:             scriptContent,
		ScriptLanguage:     language,
	}

	resp, err := c.SubmitJob(req)
	if err != nil {
		fmt.Printf("Error submitting job: %v\n", err)
		return
	}

	fmt.Printf("Job submitted successfully!\n")
	fmt.Printf("Job ID: %s\n", resp.JobID)
	fmt.Printf("Status: %s\n", resp.Status)
}

// estimateJobCost handles cost estimation
func (c *GPURentalClient) estimateJobCost() {
	fmt.Println("\n=== Estimate Job Cost ===")

	fmt.Print("GPU Model (RTX 4090/RTX 3080/etc.): ")
	var gpuModel string
	fmt.Scanf("%s", &gpuModel)

	fmt.Print("VRAM Required (GB): ")
	var vramGB int
	fmt.Scanf("%d", &vramGB)

	fmt.Print("Estimated Power Draw (W): ")
	var powerW uint32
	fmt.Scanf("%d", &powerW)

	fmt.Print("Duration (hours): ")
	var hoursStr string
	fmt.Scanf("%s", &hoursStr)
	hours, _ := decimal.NewFromString(hoursStr)

	req := &PricingEstimateRequest{
		GPUModel:        gpuModel,
		RequestedVRAMGB: vramGB,
		EstimatedPowerW: powerW,
		DurationHours:   hours,
	}

	estimate, err := c.EstimateJobCost(req)
	if err != nil {
		fmt.Printf("Error estimating cost: %v\n", err)
		return
	}

	fmt.Printf("\n=== Cost Estimate ===\n")
	fmt.Printf("GPU Model: %s\n", gpuModel)
	fmt.Printf("Duration: %s hours\n", hours.StringFixed(2))
	fmt.Printf("Base Rate: %s CLAW/hour\n", estimate.BaseHourlyRate.StringFixed(4))
	fmt.Printf("VRAM Rate: %s CLAW/hour\n", estimate.VRAMHourlyRate.StringFixed(4))
	fmt.Printf("Power Rate: %s CLAW/hour\n", estimate.PowerHourlyRate.StringFixed(4))
	fmt.Printf("Total Rate: %s CLAW/hour\n", estimate.TotalHourlyRate.StringFixed(4))
	fmt.Printf("Total Cost: %s CLAW\n", estimate.TotalCost.StringFixed(4))
	fmt.Printf("Platform Fee: %s CLAW\n", estimate.PlatformFee.StringFixed(4))
	fmt.Printf("Provider Earnings: %s CLAW\n", estimate.ProviderEarnings.StringFixed(4))
}

func main() {
	// Get configuration
	config := getDefaultRentalConfig()

	// Override from environment variables
	if apiURL := os.Getenv("API_GATEWAY_URL"); apiURL != "" {
		config.APIGatewayURL = apiURL
	}
	if registryURL := os.Getenv("PROVIDER_REGISTRY_URL"); registryURL != "" {
		config.ProviderRegistryURL = registryURL
	}
	if billingURL := os.Getenv("BILLING_SERVICE_URL"); billingURL != "" {
		config.BillingServiceURL = billingURL
	}
	if storageURL := os.Getenv("STORAGE_SERVICE_URL"); storageURL != "" {
		config.StorageServiceURL = storageURL
	}
	if username := os.Getenv("DANTE_USERNAME"); username != "" {
		config.Username = username
	}
	if password := os.Getenv("DANTE_PASSWORD"); password != "" {
		config.Password = password
	}

	// Get credentials from command line if not set
	if config.Username == "" {
		fmt.Print("Enter username: ")
		fmt.Scanf("%s", &config.Username)
	}
	if config.Password == "" {
		fmt.Print("Enter password: ")
		fmt.Scanf("%s", &config.Password)
	}

	// Create client
	client, err := NewGPURentalClient(config)
	if err != nil {
		fmt.Printf("Failed to create GPU rental client: %v\n", err)
		os.Exit(1)
	}

	// Initialize client
	if err := client.Initialize(); err != nil {
		fmt.Printf("Failed to initialize client: %v\n", err)
		os.Exit(1)
	}

	// Check for command line arguments
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "providers":
			providers, err := client.ListAvailableProviders(map[string]string{})
			if err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
			client.printProviders(providers)

		case "balance":
			balance, err := client.GetWalletBalance()
			if err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("Available Balance: %s CLAW tokens\n", balance.AvailableBalance.StringFixed(4))

		case "submit":
			// Quick job submission
			req := &JobSubmissionRequest{
				Type:        "ai-training",
				Name:        os.Args[2],
				Description: "Command line submitted job",
				Requirements: ResourceRequirements{
					GPUModel:    "any",
					GPUMemoryMB: 4096,
					CPUCores:    2,
					MemoryMB:    4096,
				},
				CustomParams: map[string]interface{}{
					"framework": "pytorch",
				},
			}

			resp, err := client.SubmitJob(req)
			if err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("Job ID: %s\n", resp.JobID)

		case "status":
			if len(os.Args) < 3 {
				fmt.Println("Usage: rental status <job_id>")
				os.Exit(1)
			}

			status, err := client.GetJobStatus(os.Args[2])
			if err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("Status: %s, Progress: %.2f%%\n", status.Status, status.Progress*100)

		default:
			fmt.Printf("Unknown command: %s\n", os.Args[1])
			fmt.Println("Available commands: providers, balance, submit, status")
			os.Exit(1)
		}
	} else {
		// Run interactive mode
		if err := client.runInteractiveMode(); err != nil {
			fmt.Printf("Error in interactive mode: %v\n", err)
			os.Exit(1)
		}
	}
}
