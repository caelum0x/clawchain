package billing

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
	// For CliFinancialSummary type if needed, or define local types
)

// Client represents a client for the billing service
type Client struct {
	baseURL    string
	httpClient *http.Client
	logger     *zap.Logger
	sessionsMu sync.RWMutex
	sessions   map[string]uuid.UUID
}

// Config represents billing client configuration
type Config struct {
	BaseURL string        `yaml:"base_url"`
	Timeout time.Duration `yaml:"timeout"`
}

// NewClient creates a new billing service client
func NewClient(config *Config, logger *zap.Logger) *Client {
	return &Client{
		baseURL: config.BaseURL,
		httpClient: &http.Client{
			Timeout: config.Timeout,
		},
		logger:   logger,
		sessions: make(map[string]uuid.UUID),
	}
}

// UsageUpdateRequest represents a usage update request
type UsageUpdateRequest struct {
	SessionID       uuid.UUID `json:"session_id"`
	GPUUtilization  uint8     `json:"gpu_utilization_percent"`
	VRAMUtilization uint8     `json:"vram_utilization_percent"`
	PowerDraw       uint32    `json:"power_draw_w"`
	Temperature     uint8     `json:"temperature_c"`
	Timestamp       time.Time `json:"timestamp"`
}

// SessionResponse represents a session response from billing service
type SessionResponse struct {
	Session struct {
		ID               uuid.UUID       `json:"id"`
		UserID           string          `json:"user_id"`
		ProviderID       uuid.UUID       `json:"provider_id"`
		JobID            *string         `json:"job_id,omitempty"`
		Status           string          `json:"status"`
		GPUModel         string          `json:"gpu_model"`
		AllocatedVRAM    uint64          `json:"allocated_vram_mb"`
		TotalVRAM        uint64          `json:"total_vram_mb"`
		VRAMPercentage   decimal.Decimal `json:"vram_percentage"`
		HourlyRate       decimal.Decimal `json:"hourly_rate"`
		VRAMRate         decimal.Decimal `json:"vram_rate"`
		PowerRate        decimal.Decimal `json:"power_rate"`
		PlatformFeeRate  decimal.Decimal `json:"platform_fee_rate"`
		EstimatedPowerW  uint32          `json:"estimated_power_w"`
		ActualPowerW     *uint32         `json:"actual_power_w,omitempty"`
		StartedAt        time.Time       `json:"started_at"`
		EndedAt          *time.Time      `json:"ended_at,omitempty"`
		LastBilledAt     time.Time       `json:"last_billed_at"`
		TotalCost        decimal.Decimal `json:"total_cost"`
		PlatformFee      decimal.Decimal `json:"platform_fee"`
		ProviderEarnings decimal.Decimal `json:"provider_earnings"`
		CreatedAt        time.Time       `json:"created_at"`
		UpdatedAt        time.Time       `json:"updated_at"`
	} `json:"session"`
	CurrentCost         decimal.Decimal `json:"current_cost"`
	EstimatedHourlyCost decimal.Decimal `json:"estimated_hourly_cost"`
	RemainingBalance    decimal.Decimal `json:"remaining_balance"`
	EstimatedRuntime    decimal.Decimal `json:"estimated_runtime_hours"`
}

// SendUsageUpdate sends real-time usage data to the billing service
func (c *Client) SendUsageUpdate(ctx context.Context, req *UsageUpdateRequest) error {
	c.logger.Debug("Sending usage update",
		zap.String("session_id", req.SessionID.String()),
		zap.Uint8("gpu_utilization", req.GPUUtilization),
		zap.Uint32("power_draw", req.PowerDraw),
	)

	jsonData, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal usage update: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/billing/usage-update", c.baseURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send usage update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("billing service returned status %d", resp.StatusCode)
	}

	c.logger.Debug("Usage update sent successfully")
	return nil
}

// GetCurrentUsage gets current usage information for a session
func (c *Client) GetCurrentUsage(ctx context.Context, sessionID uuid.UUID) (*SessionResponse, error) {
	url := fmt.Sprintf("%s/api/v1/billing/current-usage/%s", c.baseURL, sessionID.String())

	httpReq, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to get current usage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("billing service returned status %d", resp.StatusCode)
	}

	var sessionResp SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&sessionResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &sessionResp, nil
}

// Monitor starts monitoring a session and sends periodic usage updates
func (c *Client) Monitor(ctx context.Context, sessionID uuid.UUID, gpuID string, interval time.Duration) error {
	c.logger.Info("Starting billing monitor",
		zap.String("session_id", sessionID.String()),
		zap.String("gpu_id", gpuID),
		zap.Duration("interval", interval),
	)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			c.logger.Info("Billing monitor stopped", zap.String("session_id", sessionID.String()))
			return ctx.Err()
		case <-ticker.C:
			// Get current GPU metrics
			metrics, err := c.getGPUMetrics(gpuID)
			if err != nil {
				c.logger.Error("Failed to get GPU metrics", zap.Error(err))
				continue
			}

			// Send usage update
			req := &UsageUpdateRequest{
				SessionID:       sessionID,
				GPUUtilization:  metrics.Utilization,
				VRAMUtilization: metrics.VRAMUtilization,
				PowerDraw:       metrics.PowerDraw,
				Temperature:     metrics.Temperature,
				Timestamp:       time.Now().UTC(),
			}

			if err := c.SendUsageUpdate(ctx, req); err != nil {
				c.logger.Error("Failed to send usage update", zap.Error(err))
				// Continue monitoring even if one update fails
			}
		}
	}
}

// GPUMetrics represents GPU metrics for billing
type GPUMetrics struct {
	Utilization     uint8  `json:"utilization_percent"`
	VRAMUtilization uint8  `json:"vram_utilization_percent"`
	PowerDraw       uint32 `json:"power_draw_w"`
	Temperature     uint8  `json:"temperature_c"`
}

// getGPUMetrics gets current GPU metrics
func (c *Client) getGPUMetrics(gpuID string) (*GPUMetrics, error) {
	// This would integrate with the GPU detector
	// For now, return mock data
	return &GPUMetrics{
		Utilization:     75,  // mock data
		VRAMUtilization: 50,  // mock data
		PowerDraw:       150, // mock data
		Temperature:     65,  // mock data
	}, nil
}

// StartBilling informs the billing service that a task's billable period has begun.
func (c *Client) StartBilling(ctx context.Context, jobID string, userID string, gpuInstanceID string, pricePerHour float64) error {
	c.logger.Info("Starting billing session",
		zap.String("job_id", jobID),
		zap.String("user_id", userID),
		zap.String("gpu_instance_id", gpuInstanceID),
		zap.Float64("price_per_hour", pricePerHour),
	)

	rate := decimal.NewFromFloat(pricePerHour)
	req := map[string]interface{}{
		"user_id":           userID,
		"provider_id":       deriveUUID(gpuInstanceID),
		"job_id":            jobID,
		"gpu_model":         gpuInstanceID,
		"requested_vram_mb": 1024,
		"estimated_power_w": 150,
		"max_hourly_rate":   rate.String(),
	}

	var resp SessionResponse
	if err := c.doJSON(ctx, http.MethodPost, "/api/v1/billing/start-session", req, &resp); err != nil {
		return fmt.Errorf("failed to start billing: %w", err)
	}

	c.sessionsMu.Lock()
	c.sessions[jobID] = resp.Session.ID
	c.sessionsMu.Unlock()
	return nil
}

// StopBilling informs the billing service that a task's billable period has ended.
func (c *Client) StopBilling(ctx context.Context, jobID string, userID string, durationHours float64) error {
	c.logger.Info("Stopping billing session",
		zap.String("job_id", jobID),
		zap.String("user_id", userID),
		zap.Float64("duration_hours", durationHours),
	)

	c.sessionsMu.RLock()
	sessionID, ok := c.sessions[jobID]
	c.sessionsMu.RUnlock()
	if !ok {
		if parsed, err := uuid.Parse(jobID); err == nil {
			sessionID = parsed
		} else {
			return fmt.Errorf("no billing session found for job %s", jobID)
		}
	}

	req := map[string]interface{}{
		"session_id": sessionID.String(),
		"reason":     fmt.Sprintf("provider-daemon task completed after %.4f hours", durationHours),
	}
	if err := c.doJSON(ctx, http.MethodPost, "/api/v1/billing/end-session", req, nil); err != nil {
		return fmt.Errorf("failed to stop billing: %w", err)
	}

	c.sessionsMu.Lock()
	delete(c.sessions, jobID)
	c.sessionsMu.Unlock()
	return nil
}

// CheckSessionStatus checks if a session is still considered active by the billing service.
// This might be useful for the daemon to periodically verify if it should continue processing a task.
// Returns true if active, false if not active or error.
func (c *Client) CheckSessionStatus(ctx context.Context, sessionID uuid.UUID) (bool, error) {
	usage, err := c.GetCurrentUsage(ctx, sessionID)
	if err != nil {
		return false, err
	}

	// Check if session is still active and has remaining balance
	isActive := usage.Session.Status == "active" && usage.RemainingBalance.GreaterThan(decimal.Zero)

	if !isActive {
		c.logger.Warn("Session is no longer active or funded",
			zap.String("session_id", sessionID.String()),
			zap.String("status", usage.Session.Status),
			zap.String("remaining_balance", usage.RemainingBalance.String()),
		)
	}

	return isActive, nil
}

// FinancialSummaryDetails represents the detailed financial data expected from the billing service.
// This is a local representation, mapping to what CliFinancialSummary might need.
type FinancialSummaryDetails struct {
	TotalEarnedCLAW    float32
	PendingPayoutCLAW  float32
	CurrentBalanceCLAW float32 // This might be the primary balance query
	LastPayoutCLAW     float32
	LastPayoutAt       *time.Time
	// Potentially other fields like NextEstimatedPayout etc.
}

func (c *Client) GetBalance(ctx context.Context, providerID string) (float64, error) {
	walletID := deriveUUID(providerID)
	var resp struct {
		AvailableBalance decimal.Decimal `json:"available_balance"`
	}
	if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/api/v1/wallet/%s/balance", walletID), nil, &resp); err != nil {
		return 0, fmt.Errorf("failed to fetch balance: %w", err)
	}
	balance, _ := resp.AvailableBalance.Float64()
	return balance, nil
}

func (c *Client) GetFinancialSummary(ctx context.Context, providerID string) (*FinancialSummaryDetails, error) {
	var earnings struct {
		TotalEarnings   decimal.Decimal `json:"total_earnings"`
		PendingEarnings decimal.Decimal `json:"pending_earnings"`
		PaidEarnings    decimal.Decimal `json:"paid_earnings"`
	}
	if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/api/v1/provider/%s/earnings", deriveUUID(providerID)), nil, &earnings); err != nil {
		return nil, fmt.Errorf("failed to fetch provider earnings: %w", err)
	}

	balance, err := c.GetBalance(ctx, providerID)
	if err != nil {
		return nil, err
	}

	totalEarned, _ := earnings.TotalEarnings.Float64()
	pendingPayout, _ := earnings.PendingEarnings.Float64()
	lastPayout, _ := earnings.PaidEarnings.Float64()
	return &FinancialSummaryDetails{
		TotalEarnedCLAW:    float32(totalEarned),
		PendingPayoutCLAW:  float32(pendingPayout),
		CurrentBalanceCLAW: float32(balance),
		LastPayoutCLAW:     float32(lastPayout),
		LastPayoutAt:       nil,
	}, nil
}

func (c *Client) doJSON(ctx context.Context, method string, path string, reqBody interface{}, out interface{}) error {
	var body io.Reader
	if reqBody != nil {
		encoded, err := json.Marshal(reqBody)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		body = bytes.NewBuffer(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, strings.TrimSuffix(c.baseURL, "/")+path, body)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("billing service returned %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

func deriveUUID(source string) uuid.UUID {
	if parsed, err := uuid.Parse(source); err == nil {
		return parsed
	}
	sum := sha1.Sum([]byte(source))
	return uuid.NewHash(sha1.New(), uuid.NameSpaceOID, sum[:], 5)
}
