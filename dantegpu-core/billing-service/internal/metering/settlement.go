package metering

// SettlementResult represents the calculated payment for a completed GPU job.
type SettlementResult struct {
	JobID           string  `json:"job_id"`
	ProviderID      string  `json:"provider_id"`
	GPUSeconds      float64 `json:"gpu_seconds"`
	PricePerGPUHour int64   `json:"price_per_gpu_hour_uclaw"`
	TotalCostUclaw  int64   `json:"total_cost_uclaw"`
}

// CalculateSettlement computes the payment owed for a completed usage record.
// pricePerGPUHour is denominated in uclaw (micro-CLAW) per GPU-hour.
//
// Formula: totalCost = ceil(gpuSeconds / 3600 * pricePerGPUHour)
// A minimum of 1 uclaw is charged for any non-zero usage.
func CalculateSettlement(usage UsageRecord, pricePerGPUHour int64) SettlementResult {
	if usage.GPUSeconds <= 0 || pricePerGPUHour <= 0 {
		return SettlementResult{
			JobID:           usage.JobID,
			ProviderID:      usage.ProviderID,
			GPUSeconds:      usage.GPUSeconds,
			PricePerGPUHour: pricePerGPUHour,
			TotalCostUclaw:  0,
		}
	}

	// GPU-hours = GPU-seconds / 3600
	gpuHours := usage.GPUSeconds / 3600.0
	costFloat := gpuHours * float64(pricePerGPUHour)

	// Ceiling: provider always gets rounded up to nearest uclaw.
	totalCost := int64(costFloat)
	if costFloat > float64(totalCost) {
		totalCost++
	}

	// Minimum charge of 1 uclaw for any non-zero usage.
	if totalCost < 1 {
		totalCost = 1
	}

	return SettlementResult{
		JobID:           usage.JobID,
		ProviderID:      usage.ProviderID,
		GPUSeconds:      usage.GPUSeconds,
		PricePerGPUHour: pricePerGPUHour,
		TotalCostUclaw:  totalCost,
	}
}
