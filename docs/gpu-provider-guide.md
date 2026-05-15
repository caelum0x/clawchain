# GPU Provider Guide

## 1. Overview of the GPU Compute Marketplace

ClawChain includes an on-chain GPU compute marketplace implemented in the `x/marketplace` module. GPU owners register their hardware as **compute resources**, set an hourly price in `uclaw`, and run a provider daemon that listens for jobs. Consumers browse available resources, create time-bound **leases**, and submit **compute jobs** that execute on the provider's hardware inside Docker containers or as scripts.

Key on-chain primitives:

| Concept | Description |
|---------|-------------|
| **ComputeResource** | A registered GPU listing (model, VRAM, price, region, active status). |
| **ComputeLease** | A time-bound rental agreement. Payment is escrowed on creation and released to the provider on expiry or completion. |
| **ComputeJob** | A unit of work (Docker image or script) submitted against an active lease. Status transitions: `pending` -> `running` -> `completed` / `failed`. |
| **GPUMetrics** | Real-time utilization, temperature, power draw, and VRAM usage reported by the provider daemon via heartbeats. |

The marketplace module automatically expires leases past their `end_block` and releases escrowed funds to the provider. Lease duration is approximated at ~600 blocks per hour (6-second block time).

---

## 2. Prerequisites

### Hardware

- NVIDIA GPU with CUDA support (the daemon calls `nvidia-smi` for metrics and job execution)
- Minimum 8 GB system RAM (16 GB recommended)
- SSD with at least 50 GB free space

### Software

| Dependency | Minimum Version | Purpose |
|------------|----------------|---------|
| NVIDIA Driver | 525+ | GPU access |
| CUDA Toolkit | 12.0+ | GPU compute |
| `nvidia-smi` | (bundled with driver) | Metrics collection |
| Docker | 20.10+ | Job execution (`--gpus all`) |
| NVIDIA Container Toolkit | latest | Docker GPU passthrough |
| Go | 1.24+ | Building the provider binary |

### Chain access

- A funded ClawChain account (bech32 address with `claw` prefix)
- The account's BIP-39 mnemonic for transaction signing
- Access to a running `clawchaind` node (RPC at `localhost:26657`, REST at `localhost:1317` by default)

Verify your GPU is detected:

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
```

Expected output (example):

```
NVIDIA GeForce RTX 4090, 24564 MiB
```

Verify Docker can access the GPU:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

---

## 3. Setting Up the GPU Provider Daemon

The provider daemon lives at `cmd/claw-gpu-provider/`. It is a standalone Go binary that:

- Sends periodic GPU heartbeat metrics to the chain
- Listens for compute job assignments via WebSocket events (with HTTP polling fallback)
- Executes jobs in Docker containers or as Python scripts
- Reports job status back to the chain
- Optionally routes jobs through the DanteGPU adapter for advanced orchestration

### Build from source

```bash
cd /path/to/clawchain
go build -o claw-gpu-provider ./cmd/claw-gpu-provider/
```

### Build with Docker

The provided Dockerfile uses `nvidia/cuda:12.4.0-runtime-ubuntu22.04` as the runtime base image and includes Python 3, pip, Docker CLI, and the compiled binary:

```bash
docker build -t claw-gpu-provider -f cmd/claw-gpu-provider/Dockerfile .
```

### Configuration

Copy the example configuration and edit it:

```bash
cp cmd/claw-gpu-provider/config.toml.example config.toml
```

The full configuration file is divided into sections:

```toml
[chain]
rest_url = "http://localhost:1317"
rpc_url = "http://localhost:26657"
chain_id = "clawchain-1"
denom = "uclaw"

[provider]
name = "my-gpu-provider"
address = "claw1abc..."          # your bech32 provider address
mnemonic = ""                    # BIP-39 mnemonic (or set MNEMONIC env var)
resource_id = 0                  # filled after on-chain registration

[jobs]
max_concurrent = 2               # max parallel jobs
docker_enabled = true
work_dir = "/tmp/claw-gpu-jobs"
job_timeout_sec = 3600           # 1 hour default

[events]
websocket_enabled = true         # real-time job dispatch (recommended)
poll_fallback = true             # HTTP polling when WS disconnects
poll_interval_sec = 15
ws_reconnect_sec = 5

[heartbeat]
interval_sec = 60                # GPU metrics reporting interval

[metrics]
port = 9090                      # Prometheus + health endpoint

[dantegpu]
enabled = false
api_url = "http://localhost:8080"
api_key = ""
use_remote_storage = false
storage_url = "http://localhost:9000"
```

All `[chain]` and `[provider]` fields can also be set via environment variables:

```bash
export CHAIN_REST="http://localhost:1317"
export CHAIN_RPC="http://localhost:26657"
export CHAIN_ID="clawchain-1"
export PROVIDER_ADDRESS="claw1abc..."
export RESOURCE_ID="1"
export MNEMONIC="your twenty four word mnemonic ..."
```

### Onboarding wizard

The daemon includes an interactive onboarding wizard that detects your GPU hardware, collects connection details, generates `config.toml`, and registers your resource on-chain in a single flow. Run it before starting the daemon for the first time:

```bash
./claw-gpu-provider --onboard
```

The wizard walks through six steps:

1. GPU hardware detection (via `nvidia-smi`)
2. Chain connection (REST, RPC, chain ID)
3. Provider identity (display name)
4. Signing key (BIP-39 mnemonic and bech32 address)
5. Config file generation (`config.toml`)
6. On-chain registration (`MsgListComputeResource`)

### Start the daemon

```bash
./claw-gpu-provider
```

You should see log output confirming startup:

```
[Provider] Started — address=claw1abc... resource=1 metrics=:9090 ws=true dante=false
[Heartbeat] Sent — GPU:12% Mem:5% Temp:42°C Power:35W
[Events] WebSocket connected to ws://localhost:26657/websocket
```

---

## 4. Registering GPU Resources On-Chain

If you did not use the onboarding wizard, you can register manually. The marketplace module exposes `MsgListComputeResource`. Required fields:

| Field | Description |
|-------|-------------|
| `provider` | Your bech32 address |
| `name` | Human-readable resource name |
| `gpu_model` | e.g., `NVIDIA GeForce RTX 4090` |
| `gpu_count` | Number of GPUs |
| `price_per_hour_uclaw` | Hourly rate in `uclaw` (e.g., `1000000` = 1 CLAW) |
| `endpoint` | Provider daemon URL for job submission |
| `region` | (optional) Geographic region |
| `vram_gb` | (optional) VRAM per GPU in GB |
| `min_lease_hours` | (optional, default `1`) Minimum lease duration |
| `max_lease_hours` | (optional, default `0` = unlimited) Maximum lease duration |

Using `clawchaind tx`:

```bash
clawchaind tx marketplace list-compute-resource \
  --name "RTX 4090 Provider" \
  --gpu-model "NVIDIA GeForce RTX 4090" \
  --gpu-count 1 \
  --vram-gb 24 \
  --price-per-hour 1000000 \
  --endpoint "https://myprovider.example.com:9090" \
  --region "us-east" \
  --from my-key \
  --chain-id clawchain-1 \
  --gas auto \
  --gas-adjustment 1.3
```

The transaction emits a `list_compute_resource` event with your new `resource_id`. Update `config.toml` with this ID:

```toml
[provider]
resource_id = 1
```

### Updating and delisting

To deactivate your resource (no new leases will be accepted, but existing leases continue until expiry):

```bash
clawchaind tx marketplace delist-compute-resource \
  --resource-id 1 \
  --from my-key \
  --chain-id clawchain-1
```

You cannot delist while a lease is active.

---

## 5. Managing Compute Leases

### How leases work

1. A consumer calls `MsgLeaseComputeResource` specifying the resource ID and desired hours.
2. The marketplace module calculates `total_cost = price_per_hour * hours` and transfers `total_cost` uclaw from the consumer to the module's escrow account.
3. The resource is marked as leased (`current_lessee` is set, `lease_expires_at` is calculated).
4. At `end_block`, the `ExpireComputeLeases` end-blocker releases escrowed funds to the provider.
5. Either party can call `MsgReleaseComputeResource` to end a lease early. Payment still goes to the provider.

### Querying leases as a provider

```bash
# All leases involving your address (as provider)
clawchaind query marketplace compute-leases --address claw1abc...
```

REST API equivalent:

```bash
curl "http://localhost:1317/clawchain/marketplace/v1/compute/leases?address=claw1abc..."
```

The provider daemon's `ChainClient` also queries leases programmatically:

```
GET /clawchain/marketplace/v1/compute/leases?resource_id={id}
```

Response fields per lease:

| Field | Description |
|-------|-------------|
| `id` | Lease ID |
| `resource_id` | Which resource is leased |
| `lessee` | Consumer address |
| `provider` | Provider address |
| `start_block` | Block height when lease began |
| `end_block` | Block height when lease expires |
| `total_cost_uclaw` | Total escrowed amount |
| `status` | `active`, `completed`, or `expired` |

---

## 6. Using the clawd CLI for GPU Operations

The `clawd` CLI (TypeScript, in `cmd/clawd/`) provides three GPU subcommands for consumers interacting with the marketplace.

### clawd gpu list

List all registered GPU compute resources:

```bash
clawd gpu list
```

Filter to only available (active and unleased) resources:

```bash
clawd gpu list --available
```

Output as JSON:

```bash
clawd gpu list --json
```

The command queries the REST endpoint:

```
GET /clawchain/compute/v1/resources[?only_available=true]
```

Example table output:

```
GPU Resources (3)

ID  Name                GPU Model                GPUs  VRAM    Price/hr  Active  Region
1   RTX 4090 Provider   NVIDIA GeForce RTX 4090  1     24 GB   1.0 CLAW  true    us-east
2   A100 Cluster        NVIDIA A100              4     80 GB   5.0 CLAW  true    eu-west
3   Budget 3090         NVIDIA GeForce RTX 3090  1     24 GB   0.5 CLAW  true    us-west
```

### clawd gpu lease

Create a lease on a specific resource:

```bash
clawd gpu lease --resource-id 1 --hours 4
```

The command broadcasts a `MsgLeaseComputeResource` transaction. On success it prints:

```
GPU resource #1 leased successfully.
  Lease ID: 7
  Hours:    4
  TxHash:   A1B2C3D4...
```

The lease ID is extracted from the `lease_compute_resource` transaction event.

### clawd gpu submit-job

Submit a compute job against an active lease:

```bash
clawd gpu submit-job \
  --resource-id 1 \
  --lease-id 7 \
  --name "train-resnet50" \
  --job-type "ml-training" \
  --execution-type "docker" \
  --docker-image "pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime" \
  --input-data-uri "ipfs://Qm..." \
  --output-data-uri "ipfs://Qm..." \
  --params '{"gpu_count":1,"memory_limit_mb":16384}'
```

Parameters:

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--resource-id` | yes | | Resource to run on |
| `--lease-id` | yes | | Active lease ID |
| `--name` | yes | | Job name |
| `--job-type` | no | `general` | Job category (e.g., `ml-training`, `inference`, `rendering`) |
| `--execution-type` | no | `docker` | `docker` or `script` |
| `--docker-image` | no | | Docker image (required when execution-type is `docker`) |
| `--script-content` | no | | Inline Python script (for `script` execution type) |
| `--input-data-uri` | no | | URI to input data |
| `--output-data-uri` | no | | URI for output storage |
| `--params` | no | | JSON string with extra parameters |

The command broadcasts `MsgSubmitComputeJob` and prints:

```
Compute job submitted successfully.
  Job ID:      42
  Resource ID: 1
  Lease ID:    7
  TxHash:      E5F6G7H8...
```

Only the lessee of the active lease can submit jobs. The provider daemon picks up the job via WebSocket events or polling and begins execution.

---

## 7. Monitoring GPU Utilization and Earnings

### Provider daemon endpoints

The daemon exposes two HTTP endpoints on the configured metrics port (default `9090`):

**Prometheus metrics** at `/metrics`:

```bash
curl http://localhost:9090/metrics
```

```
# HELP gpu_utilization GPU utilization percentage
# TYPE gpu_utilization gauge
gpu_utilization 45
# HELP gpu_memory_utilization GPU memory utilization percentage
# TYPE gpu_memory_utilization gauge
gpu_memory_utilization 62
# HELP gpu_temperature GPU temperature in Celsius
# TYPE gpu_temperature gauge
gpu_temperature 68
# HELP gpu_power_draw GPU power draw in watts
# TYPE gpu_power_draw gauge
gpu_power_draw 285
# HELP gpu_memory_used GPU memory used in MB
# TYPE gpu_memory_used gauge
gpu_memory_used 15234
# HELP gpu_memory_total GPU memory total in MB
# TYPE gpu_memory_total gauge
gpu_memory_total 24564
# HELP gpu_healthy GPU health status (1=healthy, 0=unhealthy)
# TYPE gpu_healthy gauge
gpu_healthy 1
```

**JSON health check** at `/health`:

```bash
curl http://localhost:9090/health
```

```json
{
  "healthy": true,
  "provider": "claw1abc...",
  "resource": 1,
  "jobs": 1
}
```

### On-chain metrics

The heartbeat loop (default every 60 seconds) calls `nvidia-smi` to collect GPU utilization, memory usage, temperature, and power draw, then posts these to the chain via the REST endpoint:

```
POST /clawchain/marketplace/v1/gpu/metrics
```

The marketplace module stores the latest metrics alongside the resource and updates the provider status (`idle`, `busy`, or `offline`).

### Querying provider stats and earnings

Provider stats are tracked on-chain and include total jobs, completed jobs, failed jobs, total revenue, and last heartbeat time:

```bash
# Query via REST
curl "http://localhost:1317/clawchain/marketplace/v1/provider/stats?address=claw1abc..."
```

Revenue accumulates as leases expire or complete. Each lease's `total_cost_uclaw` is released from escrow to the provider address.

### Grafana integration

Point Prometheus at the daemon's `/metrics` endpoint to build dashboards:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'claw-gpu-provider'
    static_configs:
      - targets: ['localhost:9090']
```

Useful panels:
- GPU utilization over time (`gpu_utilization`)
- Memory pressure (`gpu_memory_used / gpu_memory_total`)
- Temperature alerts (`gpu_temperature > 85`)
- Active job count (`jobs` from `/health`)

---

## 8. DanteGPU Integration Overview

The provider daemon includes a built-in adapter (`dantegpu_adapter.go`) that bridges ClawChain compute jobs to the [DanteGPU](https://github.com/dante-gpu/dantegpu-core) decentralized GPU rental platform. When enabled, jobs are routed through DanteGPU's scheduler for advanced orchestration, multi-GPU scheduling, remote storage, and monitoring.

### Enabling DanteGPU

In `config.toml`:

```toml
[dantegpu]
enabled = true
api_url = "http://localhost:8080"    # DanteGPU API gateway
api_key = "your-dante-api-key"       # obtained from DanteGPU provider registration
use_remote_storage = true            # store job outputs in MinIO/S3
storage_url = "http://localhost:9000"
```

Or via environment variables:

```bash
export DANTE_ENABLED=true
export DANTE_API_URL="http://localhost:8080"
export DANTE_API_KEY="your-dante-api-key"
```

### How it works

1. When a new compute job arrives, the daemon converts it from the ClawChain `ComputeJob` format to a `DanteTask`:
   - `docker` execution type maps to `container` task type
   - `script` execution type maps to `script` task type
   - Extra parameters (`gpu_count`, `gpu_model`, `memory_limit_mb`, `timeout_sec`) are parsed from the job's `params` JSON field

2. The task is submitted to DanteGPU's API gateway at `POST /api/v1/tasks`.

3. The daemon polls `GET /api/v1/tasks/{id}/status` every 10 seconds and relays status updates back to the chain. DanteGPU statuses map to chain statuses as follows:

   | DanteGPU Status | Chain Status | Result |
   |-----------------|-------------|--------|
   | `queued` | `pending` | |
   | `running` | `running` | `progress: N%` |
   | `completed` | `completed` | task output (truncated to 4 KB) |
   | `failed` | `failed` | error message |
   | `cancelled` | `failed` | `cancelled by DanteGPU scheduler` |

4. If DanteGPU submission fails, the daemon automatically falls back to local Docker/script execution.

5. On provider shutdown, any in-flight DanteGPU tasks are cancelled via `POST /api/v1/tasks/{id}/cancel`.

### DanteGPU architecture at a glance

DanteGPU is a microservices platform with the following components relevant to providers:

- **API Gateway** (port 8080) -- central entry point, JWT auth, rate limiting
- **Provider Registry** (port 8081) -- GPU registration and capability tracking
- **Scheduler Orchestrator** (port 8084) -- job queuing, container orchestration, resource allocation
- **Storage Service** (port 8083) -- S3-compatible file storage via MinIO
- **Monitoring** -- Prometheus, Grafana, and Loki for observability

To deploy DanteGPU alongside your provider:

```bash
cd dantegpu-core
cp .env.example .env
# Edit .env with your database, Redis, and blockchain settings
docker-compose up -d
```

Verify DanteGPU is running:

```bash
curl http://localhost:8080/health
```

Once DanteGPU is healthy and the adapter is enabled in your provider config, ClawChain compute jobs will be routed through DanteGPU's scheduler automatically.
