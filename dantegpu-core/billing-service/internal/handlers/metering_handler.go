package handlers

import (
	"net/http"
	"strings"

	"github.com/dante-gpu/dante-backend/billing-service/internal/metering"
)

// MeteringHandler serves HTTP endpoints for GPU usage metering data.
type MeteringHandler struct {
	meter    *metering.Meter
	store    *metering.UsageStore
	priceMap map[string]int64 // gpuType -> uclaw per GPU-hour, for settlement calc
}

// NewMeteringHandler creates a new MeteringHandler.
func NewMeteringHandler(meter *metering.Meter, store *metering.UsageStore, priceMap map[string]int64) *MeteringHandler {
	return &MeteringHandler{
		meter:    meter,
		store:    store,
		priceMap: priceMap,
	}
}

// RegisterRoutes registers all metering HTTP routes on the given ServeMux.
func (h *MeteringHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/usage/active", h.handleActiveUsage)
	mux.HandleFunc("/api/v1/usage/provider/", h.handleProviderRoutes)
	mux.HandleFunc("/api/v1/usage/", h.handleJobUsage)
}

// handleJobUsage handles GET /api/v1/usage/{jobId}
func (h *MeteringHandler) handleJobUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	jobID := strings.TrimPrefix(r.URL.Path, "/api/v1/usage/")
	if jobID == "" {
		respondError(w, http.StatusBadRequest, "missing job ID")
		return
	}

	// First check active meters for a live snapshot.
	record, err := h.meter.GetUsage(jobID)
	if err == nil {
		respondJSON(w, http.StatusOK, record)
		return
	}

	// Fall back to completed records in the store.
	record, err = h.store.GetUsageByJob(jobID)
	if err != nil {
		respondError(w, http.StatusNotFound, "usage record not found for job "+jobID)
		return
	}

	respondJSON(w, http.StatusOK, record)
}

// handleProviderRoutes dispatches provider sub-routes:
//
//	GET /api/v1/usage/provider/{providerId}
//	GET /api/v1/usage/provider/{providerId}/summary
func (h *MeteringHandler) handleProviderRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	remainder := strings.TrimPrefix(r.URL.Path, "/api/v1/usage/provider/")
	if remainder == "" {
		respondError(w, http.StatusBadRequest, "missing provider ID")
		return
	}

	// Check if the path ends with /summary
	if strings.HasSuffix(remainder, "/summary") {
		providerID := strings.TrimSuffix(remainder, "/summary")
		if providerID == "" {
			respondError(w, http.StatusBadRequest, "missing provider ID")
			return
		}
		h.handleProviderSummary(w, providerID)
		return
	}

	// Otherwise treat the full remainder as the provider ID.
	h.handleProviderUsage(w, remainder)
}

// handleProviderUsage handles GET /api/v1/usage/provider/{providerId}
func (h *MeteringHandler) handleProviderUsage(w http.ResponseWriter, providerID string) {
	records, err := h.store.GetUsageByProvider(providerID)
	if err != nil {
		respondError(w, http.StatusNotFound, "no usage records for provider "+providerID)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"provider_id": providerID,
		"records":     records,
		"count":       len(records),
	})
}

// providerSummaryResponse is the JSON shape for the provider summary endpoint.
type providerSummaryResponse struct {
	ProviderID        string  `json:"provider_id"`
	TotalGPUSeconds   float64 `json:"total_gpu_seconds"`
	EstimatedCostUclaw int64  `json:"estimated_cost_uclaw"`
	RecordCount       int     `json:"record_count"`
}

// handleProviderSummary handles GET /api/v1/usage/provider/{providerId}/summary
func (h *MeteringHandler) handleProviderSummary(w http.ResponseWriter, providerID string) {
	records, err := h.store.GetUsageByProvider(providerID)
	if err != nil {
		respondError(w, http.StatusNotFound, "no usage records for provider "+providerID)
		return
	}

	totalGPUSeconds, _ := h.store.GetTotalGPUSeconds(providerID)

	// Calculate estimated total cost across all records using the price map.
	var totalCost int64
	for _, rec := range records {
		price, ok := h.priceMap[rec.GPUType]
		if !ok {
			continue
		}
		settlement := metering.CalculateSettlement(rec, price)
		totalCost += settlement.TotalCostUclaw
	}

	respondJSON(w, http.StatusOK, providerSummaryResponse{
		ProviderID:        providerID,
		TotalGPUSeconds:   totalGPUSeconds,
		EstimatedCostUclaw: totalCost,
		RecordCount:       len(records),
	})
}

// handleActiveUsage handles GET /api/v1/usage/active
func (h *MeteringHandler) handleActiveUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	records := h.meter.ListActiveUsage()

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"active_jobs": records,
		"count":       len(records),
	})
}
