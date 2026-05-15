# claw-gpu-provider

Off-chain GPU provider daemon for ClawChain. Run this alongside your chain node
to advertise GPU capacity, report hardware metrics, and execute compute jobs
dispatched by consumers through the marketplace module.

## Building

```bash
go build -o claw-gpu-provider ./cmd/claw-gpu-provider/
```

## Environment Variables

| Variable           | Description                        | Default                  |
|--------------------|------------------------------------|--------------------------|
| `CHAIN_REST`       | Chain REST API endpoint            | `http://localhost:1317`  |
| `CHAIN_RPC`        | Chain RPC endpoint                 | `http://localhost:26657` |
| `PROVIDER_ADDRESS` | Bech32 address of the provider     | (required)               |
| `RESOURCE_ID`      | On-chain resource ID for this GPU  | (required)               |
| `MNEMONIC`         | Mnemonic for signing transactions  | (required)               |

## Running

```bash
export PROVIDER_ADDRESS=claw1abc...
export RESOURCE_ID=42
export MNEMONIC="your twenty-four word mnemonic ..."
./claw-gpu-provider
```

## Docker

Build and run with GPU passthrough:

```bash
docker build -f cmd/claw-gpu-provider/Dockerfile -t claw-gpu-provider .
docker run --gpus all \
  -e PROVIDER_ADDRESS=claw1abc... \
  -e RESOURCE_ID=42 \
  -e MNEMONIC="..." \
  -p 9090:9090 \
  claw-gpu-provider
```

## Endpoints

| Path       | Description                                    |
|------------|------------------------------------------------|
| `/metrics` | Prometheus-compatible GPU metrics               |
| `/health`  | JSON health check (provider address, job count) |

## Job Execution Types

- **docker** -- Runs the specified Docker image with `--gpus all`. Input data URI
  is passed via the `INPUT_DATA` environment variable.
- **script** -- Writes `script_content` to a temporary Python file and executes it
  with `python3`. Output is captured and truncated to 4 KB for on-chain storage.

## Heartbeat

The daemon periodically reads GPU telemetry via `nvidia-smi` and POSTs it to the
chain REST API. When `nvidia-smi` is unavailable (e.g., CPU-only hosts) the daemon
falls back to basic health reporting.
