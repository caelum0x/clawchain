package types

// ComputeResource represents a GPU compute listing on the marketplace.
type ComputeResource struct {
	Id          uint64   `json:"id"`
	Owner       string   `json:"owner"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	// GPU specifications
	GpuModel  string `json:"gpu_model"`  // e.g. "NVIDIA A100", "RTX 4090"
	GpuCount  uint32 `json:"gpu_count"`  // number of GPUs
	VramGb    uint32 `json:"vram_gb"`    // VRAM per GPU in GB
	CpuCores  uint32 `json:"cpu_cores"`  // available CPU cores
	RamGb     uint32 `json:"ram_gb"`     // system RAM in GB
	StorageGb uint32 `json:"storage_gb"` // available storage in GB
	// Pricing
	PricePerHourUclaw string `json:"price_per_hour_uclaw"` // price per hour in uclaw
	MinLeaseHours     uint32 `json:"min_lease_hours"`      // minimum lease duration
	MaxLeaseHours     uint32 `json:"max_lease_hours"`      // maximum lease duration (0=unlimited)
	// Status
	Active         bool   `json:"active"`
	CurrentLessee  string `json:"current_lessee,omitempty"`  // who's currently using it
	LeaseExpiresAt int64  `json:"lease_expires_at,omitempty"` // block height
	// Metadata
	Region       string   `json:"region,omitempty"` // geographic region
	Endpoint     string   `json:"endpoint"`         // SSH/API endpoint
	Tags         []string `json:"tags,omitempty"`
	TotalLeases  uint64   `json:"total_leases"`
	TotalRevenue string   `json:"total_revenue"`
	BlockHeight  int64    `json:"block_height"`
	Timestamp    int64    `json:"timestamp"`
	// Additional GPU details (inspired by Dante)
	DriverVersion     string `json:"driver_version,omitempty"`
	CudaCores         uint32 `json:"cuda_cores,omitempty"`
	TensorCores       uint32 `json:"tensor_cores,omitempty"`
	MemoryBandwidthGb uint32 `json:"memory_bandwidth_gb,omitempty"`
	PowerLimitWatts   uint32 `json:"power_limit_watts,omitempty"`
	// Fractional VRAM rental support
	FractionalVram      bool   `json:"fractional_vram"`
	MinVramGb           uint32 `json:"min_vram_gb,omitempty"`
	PricePerGbHourUclaw string `json:"price_per_gb_hour_uclaw,omitempty"`
	// Provider status
	ProviderStatus string      `json:"provider_status"` // "idle", "busy", "offline", "maintenance"
	LastMetrics    *GPUMetrics `json:"last_metrics,omitempty"`
}

// ComputeLease represents an active or completed GPU lease.
type ComputeLease struct {
	Id             uint64 `json:"id"`
	ResourceId     uint64 `json:"resource_id"`
	Lessee         string `json:"lessee"`
	Provider       string `json:"provider"`
	StartBlock     int64  `json:"start_block"`
	EndBlock       int64  `json:"end_block"`
	TotalCostUclaw string `json:"total_cost_uclaw"`
	Status         string `json:"status"`             // "active", "completed", "expired", "cancelled", "settled"
	EscrowId       uint64 `json:"escrow_id,omitempty"` // linked marketplace escrow
}

// GPUMetrics tracks real-time GPU health/performance.
type GPUMetrics struct {
	UtilizationGPU uint8  `json:"utilization_gpu"`  // 0-100%
	UtilizationMem uint8  `json:"utilization_mem"`  // 0-100%
	Temperature    uint8  `json:"temperature"`      // Celsius
	PowerDrawWatts uint32 `json:"power_draw_watts"`
	MemoryUsedMb   uint64 `json:"memory_used_mb"`
	MemoryTotalMb  uint64 `json:"memory_total_mb"`
	IsHealthy      bool   `json:"is_healthy"`
	UpdatedAt      int64  `json:"updated_at"`
}

// ComputeJob represents a GPU compute job submitted by a consumer.
type ComputeJob struct {
	Id            uint64 `json:"id"`
	ResourceId    uint64 `json:"resource_id"`
	LeaseId       uint64 `json:"lease_id"`
	Submitter     string `json:"submitter"`
	Provider      string `json:"provider"`
	Name          string `json:"name"`
	JobType       string `json:"job_type"`                    // "ai-training", "inference", "rendering", "general"
	ExecutionType string `json:"execution_type"`              // "docker", "script"
	DockerImage   string `json:"docker_image,omitempty"`
	ScriptContent string `json:"script_content,omitempty"`
	InputDataUri  string `json:"input_data_uri,omitempty"`
	OutputDataUri string `json:"output_data_uri,omitempty"`
	GpuType       string `json:"gpu_type"`
	GpuCount      uint32 `json:"gpu_count"`
	Status        string `json:"status"`                     // "pending", "running", "completed", "failed", "cancelled"
	Result        string `json:"result,omitempty"`
	ResultHash         string `json:"result_hash,omitempty"`           // SHA256 hash of result for verification
	ChallengeResponse  string `json:"challenge_response,omitempty"`    // sha256(resultHash + challengeSeed)
	ErrorMessage  string `json:"error_message,omitempty"`
	SubmittedAt   int64  `json:"submitted_at"`
	StartedAt     int64  `json:"started_at,omitempty"`
	CompletedAt   int64  `json:"completed_at,omitempty"`
	Params        string `json:"params,omitempty"`            // JSON of extra params
}

// ComputeChallenge stores the challenge seed issued when a job is assigned.
type ComputeChallenge struct {
	JobId         uint64 `json:"job_id"`
	ChallengeSeed string `json:"challenge_seed"` // hex-encoded seed
	BlockHeight   int64  `json:"block_height"`
}

// UsageRecord tracks per-period usage for billing.
type UsageRecord struct {
	LeaseId      uint64 `json:"lease_id"`
	ResourceId   uint64 `json:"resource_id"`
	PeriodStart  int64  `json:"period_start"` // block height
	PeriodEnd    int64  `json:"period_end"`
	AvgGpuUtil   uint8  `json:"avg_gpu_util"`
	AvgMemUtil   uint8  `json:"avg_mem_util"`
	AvgPowerDraw uint32 `json:"avg_power_draw"`
	PeriodCostUclaw string `json:"period_cost_uclaw"`
}

// ProviderStats tracks aggregate provider performance.
type ProviderStats struct {
	Address        string `json:"address"`
	TotalResources uint32 `json:"total_resources"`
	ActiveLeases   uint32 `json:"active_leases"`
	TotalJobs      uint64 `json:"total_jobs"`
	CompletedJobs  uint64 `json:"completed_jobs"`
	FailedJobs     uint64 `json:"failed_jobs"`
	TotalRevenue   string `json:"total_revenue"`
	AvgRating      uint32 `json:"avg_rating"`     // 0-500
	Uptime         uint64 `json:"uptime_blocks"`  // total blocks active
	LastHeartbeat  int64  `json:"last_heartbeat"`
}
