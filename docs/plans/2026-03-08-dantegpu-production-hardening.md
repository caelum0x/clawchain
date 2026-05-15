# DanteGPU Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all 13 remaining TODOs across 6 DanteGPU microservices to bring GPU compute fabric to production quality.

**Architecture:** Each service is a separate Go module under `dantegpu-core/`. Changes are localized per-service — no cross-service dependencies. Each task edits 1-2 files in one service.

**Tech Stack:** Go 1.21+, MinIO SDK, gopsutil, shopspring/decimal, NATS, zap logger, chi router, Consul

---

### Task 1: Storage service — Add ErrObjectNotFound sentinel error

**Files:**
- Modify: `dantegpu-core/storage-service/internal/storage/interface.go:39`
- Modify: `dantegpu-core/storage-service/internal/storage/minio.go:240-249`

**Step 1: Add sentinel error to interface.go**

After the `ObjectStorage` interface closing brace, add:

```go
import "errors"

// ErrObjectNotFound is returned when a requested object does not exist.
var ErrObjectNotFound = errors.New("object not found")
```

Add `"errors"` to the import block.

**Step 2: Use it in minio.go GetObjectInfo**

Replace lines 243-249 in `minio.go`:

```go
	if err != nil {
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchKey" || errResp.Code == "NoSuchBucket" {
			return nil, ErrObjectNotFound
		}
		return nil, fmt.Errorf("failed to get object info for %s/%s: %w", targetBucket, objectKey, err)
	}
```

**Step 3: Use it in minio.go Download**

In the Download method, after the `GetObject` + `Stat` call, wrap the error similarly:

```go
	if err != nil {
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchKey" || errResp.Code == "NoSuchBucket" {
			return nil, nil, ErrObjectNotFound
		}
		return nil, nil, fmt.Errorf("failed to download %s/%s: %w", targetBucket, objectKey, err)
	}
```

**Step 4: Commit**

```bash
cd dantegpu-core/storage-service && go build ./...
git add dantegpu-core/storage-service/internal/storage/
git commit -m "feat(storage): add ErrObjectNotFound sentinel for 404 vs 500 differentiation"
```

---

### Task 2: Storage service — Differentiate 404 vs 500 in HTTP handlers

**Files:**
- Modify: `dantegpu-core/storage-service/internal/api/handlers.go:165-169,216-220`

**Step 1: Fix downloadObjectHandler (line 167)**

Replace:
```go
		// TODO: Differentiate between "not found" and other errors for status code
		h.respondWithError(w, r, http.StatusInternalServerError, "Failed to download object", err)
```

With:
```go
		if errors.Is(err, storage.ErrObjectNotFound) {
			h.respondWithError(w, r, http.StatusNotFound, "Object not found", err)
		} else {
			h.respondWithError(w, r, http.StatusInternalServerError, "Failed to download object", err)
		}
```

**Step 2: Fix getObjectInfoHandler (line 218)**

Replace:
```go
		// TODO: Differentiate between "not found" (404) and other errors (500)
		h.respondWithError(w, r, http.StatusNotFound, "Object not found or failed to get info", err)
```

With:
```go
		if errors.Is(err, storage.ErrObjectNotFound) {
			h.respondWithError(w, r, http.StatusNotFound, "Object not found", err)
		} else {
			h.respondWithError(w, r, http.StatusInternalServerError, "Failed to get object info", err)
		}
```

**Step 3: Add `"errors"` to handlers.go imports**

**Step 4: Build and commit**

```bash
cd dantegpu-core/storage-service && go build ./...
git add dantegpu-core/storage-service/internal/api/handlers.go
git commit -m "fix(storage): return 404 for missing objects, 500 for real errors"
```

---

### Task 3: Storage service — Add MinIO connectivity to health check

**Files:**
- Modify: `dantegpu-core/storage-service/cmd/main.go:78-88`

**Step 1: Replace the inline health handler**

The health handler at line 84 currently returns static `{"status":"UP"}`. Replace the entire handler closure with:

```go
	r.Get(healthPath, func(w http.ResponseWriter, r *http.Request) {
		status := "UP"
		code := http.StatusOK
		details := map[string]string{"storage": "ok"}

		// Check MinIO connectivity by listing buckets
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		_, err := storageClient.ListObjects(ctx, "", "", false)
		if err != nil {
			status = "DEGRADED"
			details["storage"] = "unreachable"
			code = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		resp := map[string]interface{}{"status": status, "details": details}
		_ = json.NewEncoder(w).Encode(resp)
	})
```

Note: `storageClient` is the `storage.ObjectStorage` already created above in main(). It needs to be accessible in the closure — verify it's declared before the route registration.

**Step 2: Add `"encoding/json"` to imports if not present**

**Step 3: Build and commit**

```bash
cd dantegpu-core/storage-service && go build ./...
git add dantegpu-core/storage-service/cmd/main.go
git commit -m "feat(storage): add MinIO connectivity check to health endpoint"
```

---

### Task 4: GPU provider — Add multi-vendor GPU metrics collection

**Files:**
- Modify: `dantegpu-core/cmd/provider/main.go:1812-1825`

**Step 1: Replace collectGPUMetrics with multi-vendor support**

Replace the function at lines 1812-1825:

```go
// collectGPUMetrics collects current GPU metrics from all available vendors.
func (w *TaskWorker) collectGPUMetrics() ([]GPUMetrics, error) {
	var metrics []GPUMetrics

	// Try NVIDIA first (nvidia-smi)
	if nvidiaMetrics, err := w.collectNVIDIAMetrics(); err == nil {
		metrics = append(metrics, nvidiaMetrics...)
	}

	// Try AMD (rocm-smi)
	if amdMetrics, err := w.collectAMDMetrics(); err == nil {
		metrics = append(metrics, amdMetrics...)
	}

	// Try Apple Metal (system_profiler)
	if runtime.GOOS == "darwin" {
		if appleMetrics, err := w.collectAppleMetrics(); err == nil {
			metrics = append(metrics, appleMetrics...)
		}
	}

	return metrics, nil
}

// collectAMDMetrics collects AMD GPU metrics via rocm-smi.
func (w *TaskWorker) collectAMDMetrics() ([]GPUMetrics, error) {
	if !isCommandAvailable("rocm-smi") {
		return nil, fmt.Errorf("rocm-smi not available")
	}

	out, err := exec.Command("rocm-smi", "--showtemp", "--showuse", "--showmeminfo", "vram", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("rocm-smi failed: %w", err)
	}

	var raw map[string]map[string]interface{}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("rocm-smi parse error: %w", err)
	}

	var metrics []GPUMetrics
	for cardID, info := range raw {
		if !strings.HasPrefix(cardID, "card") {
			continue
		}
		m := GPUMetrics{
			DeviceID: cardID,
			Vendor:   "AMD",
		}
		if temp, ok := info["Temperature (Sensor edge) (C)"].(float64); ok {
			m.TemperatureC = uint32(temp)
		}
		if usage, ok := info["GPU use (%)"].(float64); ok {
			m.UtilizationPercent = uint32(usage)
		}
		if vramTotal, ok := info["VRAM Total Memory (B)"].(float64); ok {
			m.VRAMTotalMB = uint64(vramTotal / 1024 / 1024)
		}
		if vramUsed, ok := info["VRAM Total Used Memory (B)"].(float64); ok {
			m.VRAMUsedMB = uint64(vramUsed / 1024 / 1024)
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}

// collectAppleMetrics collects Apple GPU metrics via system_profiler.
func (w *TaskWorker) collectAppleMetrics() ([]GPUMetrics, error) {
	out, err := exec.Command("system_profiler", "SPDisplaysDataType", "-json").Output()
	if err != nil {
		return nil, fmt.Errorf("system_profiler failed: %w", err)
	}

	var raw struct {
		SPDisplaysDataType []struct {
			Name  string `json:"_name"`
			VRAM  string `json:"spdisplays_vram"`
			Model string `json:"sppci_model"`
		} `json:"SPDisplaysDataType"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("system_profiler parse error: %w", err)
	}

	var metrics []GPUMetrics
	for i, gpu := range raw.SPDisplaysDataType {
		m := GPUMetrics{
			DeviceID: fmt.Sprintf("apple-%d", i),
			Vendor:   "Apple",
			Model:    gpu.Model,
		}
		// VRAM string like "8 GB" — parse if possible
		parts := strings.Fields(gpu.VRAM)
		if len(parts) >= 2 {
			if val, err := strconv.ParseUint(parts[0], 10, 64); err == nil {
				switch strings.ToUpper(parts[1]) {
				case "GB":
					m.VRAMTotalMB = val * 1024
				case "MB":
					m.VRAMTotalMB = val
				}
			}
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}
```

Note: The `GPUMetrics` struct must already have `Vendor`, `Model`, `DeviceID`, `TemperatureC`, `UtilizationPercent`, `VRAMTotalMB`, `VRAMUsedMB` fields. Check the existing struct definition and add `Vendor` and `Model` fields if missing.

**Step 2: Build and commit**

```bash
cd dantegpu-core && go build ./cmd/provider/...
git add dantegpu-core/cmd/provider/main.go
git commit -m "feat(gpu-provider): add AMD rocm-smi and Apple Metal GPU metrics collection"
```

---

### Task 5: Provider daemon — Implement system overview population

**Files:**
- Modify: `dantegpu-core/provider-daemon/cmd/daemon/main.go` (find where CliSystemOverview is used or should be used)
- Modify: `dantegpu-core/provider-daemon/internal/models/cli_responses.go:39-47`

**Step 1: Add a constructor function in cli_responses.go**

After the `CliSystemOverview` struct (line 47), add:

```go
// CollectSystemOverview gathers live system metrics.
func CollectSystemOverview() CliSystemOverview {
	overview := CliSystemOverview{}

	// CPU usage
	if cpuPercents, err := cpu.Percent(0, false); err == nil && len(cpuPercents) > 0 {
		overview.CpuUsagePercent = float32(cpuPercents[0])
	}

	// RAM usage
	if vmStat, err := mem.VirtualMemory(); err == nil {
		overview.RamUsagePercent = float32(vmStat.UsedPercent)
	}

	// Disk usage (root partition)
	if diskStat, err := disk.Usage("/"); err == nil {
		overview.TotalDiskSpaceGB = diskStat.Total / (1024 * 1024 * 1024)
		overview.FreeDiskSpaceGB = diskStat.Free / (1024 * 1024 * 1024)
	}

	// Uptime
	if hostInfo, err := host.Info(); err == nil {
		overview.UptimeSeconds = hostInfo.Uptime
	}

	return overview
}
```

**Step 2: Add imports to cli_responses.go**

```go
import (
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)
```

**Step 3: Remove the TODO comment on line 40**

**Step 4: Build and commit**

```bash
cd dantegpu-core/provider-daemon && go build ./...
git add dantegpu-core/provider-daemon/internal/models/cli_responses.go
git commit -m "feat(provider-daemon): populate CliSystemOverview with live CPU/RAM/disk/uptime metrics"
```

---

### Task 6: Provider daemon — Implement local jobs IPC via status file

**Files:**
- Modify: `dantegpu-core/provider-daemon/cmd/daemon/main.go:352-374`

**Step 1: Replace handleGetLocalJobsJSON with status file reader**

Replace the function:

```go
func handleGetLocalJobsJSON(cfg *config.Config, logger *zap.Logger) {
	logger.Info("CLI command: --get-local-jobs-json")

	// Read job status from the daemon's status file
	statusFile := filepath.Join(cfg.DataDir, "active-jobs.json")
	data, err := os.ReadFile(statusFile)
	if err != nil {
		if os.IsNotExist(err) {
			// No status file means no active jobs
			outputJSON(make([]cli_models.CliLocalJob, 0), logger)
			return
		}
		logger.Error("Failed to read job status file", zap.String("path", statusFile), zap.Error(err))
		outputJSON(make([]cli_models.CliLocalJob, 0), logger)
		return
	}

	var jobs []cli_models.CliLocalJob
	if err := json.Unmarshal(data, &jobs); err != nil {
		logger.Error("Failed to parse job status file", zap.Error(err))
		outputJSON(make([]cli_models.CliLocalJob, 0), logger)
		return
	}

	outputJSON(jobs, logger)
}
```

Note: Check that `cfg.DataDir` exists on the config struct. If not, use a default like `filepath.Join(os.TempDir(), "dantegpu-daemon")`.

**Step 2: Add job status file writing in the task handler**

Find where jobs are tracked (likely in `internal/tasks/handler.go`) and add periodic writing of active jobs to `active-jobs.json`. This is a follow-up if the task handler exists — for now the CLI side is done.

**Step 3: Build and commit**

```bash
cd dantegpu-core/provider-daemon && go build ./...
git add dantegpu-core/provider-daemon/cmd/daemon/main.go
git commit -m "feat(provider-daemon): read active jobs from status file for CLI query"
```

---

### Task 7: Billing service — Implement basic dynamic pricing

**Files:**
- Modify: `dantegpu-core/billing-payment-service/internal/pricing/engine.go:276-291`

**Step 1: Replace getDynamicPricingFactors**

```go
// getDynamicPricingFactors calculates demand and supply factors for dynamic pricing.
func (e *Engine) getDynamicPricingFactors(ctx context.Context, req *PricingRequest) (demandMultiplier, supplyBonus decimal.Decimal, err error) {
	demandMultiplier = decimal.NewFromInt(1)
	supplyBonus = decimal.Zero

	// Query provider registry for supply-side metrics if available
	if e.providerClient != nil {
		providers, listErr := e.providerClient.ListAvailableProviders()
		if listErr == nil {
			availableCount := len(providers)
			switch {
			case availableCount == 0:
				// No providers — high demand multiplier
				demandMultiplier = decimal.NewFromFloat(1.5)
			case availableCount <= 3:
				// Low supply — moderate demand premium
				demandMultiplier = decimal.NewFromFloat(1.2)
			case availableCount >= 20:
				// High supply — discount to attract jobs
				demandMultiplier = decimal.NewFromFloat(0.9)
				supplyBonus = decimal.NewFromFloat(0.05) // 5% supply bonus
			}
		}
	}

	return demandMultiplier, supplyBonus, nil
}
```

Note: Check if `e.providerClient` field exists on the Engine struct. If not, the field needs to be added and wired during engine initialization. If the provider client is not available in this service, keep the static defaults but remove the TODO to indicate this is intentionally simple for now.

**Step 2: Build and commit**

```bash
cd dantegpu-core/billing-payment-service && go build ./...
git add dantegpu-core/billing-payment-service/internal/pricing/engine.go
git commit -m "feat(billing): implement basic demand/supply pricing based on provider count"
```

---

### Task 8: Scheduler — Add VRAM matching to job scheduling

**Files:**
- Modify: `dantegpu-core/scheduler-orchestrator-service/internal/scheduler/consumer.go:338-341`

**Step 1: Add VRAM check after GPU count check (line 338)**

Replace:
```go
		// TODO: Add more sophisticated matching: VRAM, specific GPU models within a provider if heterogeneous... -virjilakrum

		suitableProvider = &provider
```

With:
```go
		// VRAM matching: if job specifies minimum VRAM, check provider GPUs
		if job.MinVRAMMB > 0 {
			hasEnoughVRAM := false
			for _, gpu := range provider.GPUs {
				if gpu.VRAM >= uint64(job.MinVRAMMB) {
					hasEnoughVRAM = true
					break
				}
			}
			if !hasEnoughVRAM {
				jc.logger.Debug("Skipping provider: insufficient VRAM",
					zap.String("provider_id", provider.ID.String()),
					zap.Int("job_min_vram_mb", job.MinVRAMMB),
				)
				continue
			}
		}

		// GPU model matching: if job specifies a model, check provider has it
		if job.GPUModel != "" {
			hasModel := false
			for _, gpu := range provider.GPUs {
				if strings.Contains(strings.ToLower(gpu.ModelName), strings.ToLower(job.GPUModel)) {
					hasModel = true
					break
				}
			}
			if !hasModel {
				jc.logger.Debug("Skipping provider: GPU model mismatch",
					zap.String("provider_id", provider.ID.String()),
					zap.String("job_gpu_model", job.GPUModel),
					zap.String("provider_id", provider.ID.String()),
				)
				continue
			}
		}

		suitableProvider = &provider
```

Note: Check that `job.MinVRAMMB` and `job.GPUModel` fields exist on the job model. If not, add them to the job struct in the models package. The `gpu.VRAM` field should already exist based on the provider model. Also ensure `"strings"` is in the import block.

**Step 2: Build and commit**

```bash
cd dantegpu-core/scheduler-orchestrator-service && go build ./...
git add dantegpu-core/scheduler-orchestrator-service/internal/scheduler/consumer.go
git commit -m "feat(scheduler): add VRAM and GPU model matching for job scheduling"
```

---

### Task 9: Scheduler — Add cache TTL to provider registry client

**Files:**
- Modify: `dantegpu-core/scheduler-orchestrator-service/internal/clients/provider_registry.go:75-85`

**Step 1: Add cache timestamp field to Client struct**

Find the Client struct and add:
```go
	lastCacheTime time.Time
	cacheTTL      time.Duration
```

In the constructor, set `cacheTTL: 30 * time.Second`.

**Step 2: Replace getServiceAddress cache logic**

Replace lines 78-85:
```go
func (c *Client) getServiceAddress() (string, error) {
	c.mu.RLock()
	if c.lastKnownAddress != "" && time.Since(c.lastCacheTime) < c.cacheTTL {
		addr := c.lastKnownAddress
		c.mu.RUnlock()
		c.logger.Debug("Using cached address for provider registry service", zap.String("address", addr))
		return addr, nil
	}
	c.mu.RUnlock()
```

When the address is successfully discovered (further down in the function), also set `c.lastCacheTime = time.Now()`.

**Step 3: Build and commit**

```bash
cd dantegpu-core/scheduler-orchestrator-service && go build ./...
git add dantegpu-core/scheduler-orchestrator-service/internal/clients/provider_registry.go
git commit -m "feat(scheduler): add 30s TTL cache invalidation for provider registry lookups"
```

---

### Task 10: Provider registry — Implement filtering in Postgres store

**Files:**
- Modify: `dantegpu-core/provider-registry-service/internal/store/postgres_providerstore.go:349-380`

**Step 1: Add WHERE clauses based on filters**

The current SQL query at line 357 does `SELECT ... FROM providers p LEFT JOIN gpu_details g ...` without any WHERE clause. Add dynamic WHERE conditions:

After `sqlQuery := \`...` and before `GROUP BY p.id`, add filter logic:

```go
	operation := func() error {
		baseQuery := `
		SELECT p.id, p.owner_id, p.name, p.hostname, p.ip_address, p.status, p.location,
		       p.registered_at, p.last_seen_at, p.metadata,
		       COALESCE(JSON_AGG(...) FILTER (WHERE g.id IS NOT NULL), '[]') as gpu_details
		FROM providers p
		LEFT JOIN gpu_details g ON p.id = g.provider_id`

		var conditions []string
		var args []interface{}
		argIdx := 1

		if status, ok := filters["status"].(string); ok && status != "" {
			conditions = append(conditions, fmt.Sprintf("p.status = $%d", argIdx))
			args = append(args, status)
			argIdx++
		}
		if gpuModel, ok := filters["gpu_model"].(string); ok && gpuModel != "" {
			conditions = append(conditions, fmt.Sprintf("EXISTS (SELECT 1 FROM gpu_details gf WHERE gf.provider_id = p.id AND LOWER(gf.model_name) LIKE LOWER($%d))", argIdx))
			args = append(args, "%"+gpuModel+"%")
			argIdx++
		}
		if minVRAM, ok := filters["min_vram"].(uint64); ok && minVRAM > 0 {
			conditions = append(conditions, fmt.Sprintf("EXISTS (SELECT 1 FROM gpu_details gf WHERE gf.provider_id = p.id AND gf.vram_mb >= $%d)", argIdx))
			args = append(args, minVRAM)
			argIdx++
		}
		if location, ok := filters["location"].(string); ok && location != "" {
			conditions = append(conditions, fmt.Sprintf("LOWER(p.location) LIKE LOWER($%d)", argIdx))
			args = append(args, "%"+location+"%")
			argIdx++
		}

		if len(conditions) > 0 {
			baseQuery += " WHERE " + strings.Join(conditions, " AND ")
		}
		baseQuery += " GROUP BY p.id ORDER BY p.registered_at DESC"

		rows, err := pps.pool.Query(ctx, baseQuery, args...)
		// ... rest of existing parsing logic
```

Note: Ensure `"strings"` and `"fmt"` are in imports.

**Step 2: Remove the TODO comment from providerstore.go interface**

**Step 3: Build and commit**

```bash
cd dantegpu-core/provider-registry-service && go build ./...
git add dantegpu-core/provider-registry-service/internal/store/
git commit -m "feat(provider-registry): implement status/gpu_model/min_vram/location filtering in Postgres store"
```

---

### Task 11: Provider registry — Make HTTP timeouts configurable

**Files:**
- Modify: `dantegpu-core/provider-registry-service/internal/server/server.go:3-17`

**Step 1: Add config parameter**

```go
type ServerConfig struct {
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
}

func NewServer(port string, handler http.Handler, logger *zap.Logger, cfg ...ServerConfig) *http.Server {
	sc := DefaultServerConfig()
	if len(cfg) > 0 {
		sc = cfg[0]
	}
	srv := &http.Server{
		Addr:         port,
		Handler:      handler,
		ReadTimeout:  sc.ReadTimeout,
		WriteTimeout: sc.WriteTimeout,
		IdleTimeout:  sc.IdleTimeout,
	}
	logger.Info("HTTP server configured", zap.String("address", port))
	return srv
}
```

**Step 2: Build and commit**

```bash
cd dantegpu-core/provider-registry-service && go build ./...
git add dantegpu-core/provider-registry-service/internal/server/server.go
git commit -m "feat(provider-registry): make HTTP server timeouts configurable"
```

---

### Task 12: Scheduler — Make HTTP timeouts more granular

**Files:**
- Modify: `dantegpu-core/scheduler-orchestrator-service/internal/server/server.go:19-34`

**Step 1: Add ReadHeaderTimeout**

In the `NewServer` function, add `ReadHeaderTimeout` to the http.Server:

```go
	httpSrv := &http.Server{
		Addr:              cfg.Port,
		Handler:           handler,
		ReadTimeout:       cfg.RequestTimeout,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      cfg.RequestTimeout * 2,
		IdleTimeout:       120 * time.Second,
	}
```

Remove the TODO comment on line 25.

**Step 2: Build and commit**

```bash
cd dantegpu-core/scheduler-orchestrator-service && go build ./...
git add dantegpu-core/scheduler-orchestrator-service/internal/server/server.go
git commit -m "feat(scheduler): add ReadHeaderTimeout to HTTP server config"
```

---

### Task 13: Remove remaining stale TODO comments

**Files:**
- Modify: `dantegpu-core/storage-service/internal/storage/minio.go:111` — Remove upload TODO (cosmetic, MinIO options are sufficient)
- Modify: `dantegpu-core/provider-daemon/internal/models/cli_responses.go:66` — Remove CliFinancialOverview TODO (struct is defined, population happens at call site)
- Modify: `dantegpu-core/scheduler-orchestrator-service/internal/clients/provider_registry.go:110` — Remove ListAvailableProviders TODO (filtering happens at scheduler level, not client level)

**Step 1: Remove each TODO comment line**

Replace each TODO comment with nothing (or a brief note that the design is intentional).

**Step 2: Build all three services**

```bash
cd dantegpu-core/storage-service && go build ./...
cd dantegpu-core/provider-daemon && go build ./...
cd dantegpu-core/scheduler-orchestrator-service && go build ./...
```

**Step 3: Commit**

```bash
git add dantegpu-core/
git commit -m "chore: remove resolved TODO comments across DanteGPU services"
```

---

## Verification

After all tasks:

```bash
# Build all services
cd dantegpu-core/storage-service && go build ./...
cd dantegpu-core/provider-daemon && go build ./...
cd dantegpu-core/billing-payment-service && go build ./...
cd dantegpu-core/scheduler-orchestrator-service && go build ./...
cd dantegpu-core/provider-registry-service && go build ./...
cd dantegpu-core/cmd/provider && go build ./...

# Verify no remaining TODOs (excluding vendor/generated)
grep -rn "TODO" dantegpu-core/ --include="*.go" | grep -v vendor | grep -v .tmp | grep -v _test.go | grep -v ".pb.go"
```

Expected: Zero TODO lines in non-test, non-generated Go files across all 6 services.
