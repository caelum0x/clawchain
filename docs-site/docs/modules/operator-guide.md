---
sidebar_position: 11
---

# Operator Guide

This guide covers running a ClawChain validator node, GPU provider, and supporting services in production. It includes systemd service configuration, monitoring setup, and operational best practices.

## Prerequisites

- **Hardware**: 4+ CPU cores, 16+ GB RAM, 500+ GB SSD (NVMe recommended)
- **GPU provider (optional)**: NVIDIA GPU with CUDA drivers, Docker runtime
- **OS**: Ubuntu 22.04+ or similar Linux distribution
- **Network**: Static IP or DNS, ports 26656 (P2P), 26657 (RPC), 1317 (REST), 26660 (Prometheus)

## Quick Start

```bash
# Install the chain binary
make install

# Initialize the node
clawchaind init my-validator --chain-id clawchain-1

# Or use the clawd one-command bootstrap
clawd up
```

## Node Configuration

### Key Files

| File | Path | Description |
|------|------|-------------|
| `config.toml` | `~/.clawchain/config/config.toml` | CometBFT configuration (P2P, RPC, mempool) |
| `app.toml` | `~/.clawchain/config/app.toml` | Cosmos SDK app configuration (API, telemetry, pruning) |
| `genesis.json` | `~/.clawchain/config/genesis.json` | Genesis state |
| `priv_validator_key.json` | `~/.clawchain/config/priv_validator_key.json` | Validator signing key (keep secure!) |

### Recommended config.toml Settings

```toml
[p2p]
max_num_inbound_peers = 40
max_num_outbound_peers = 10
persistent_peers = "<peer-id>@<ip>:26656,..."

[mempool]
size = 5000
max_txs_bytes = 1073741824

[consensus]
timeout_commit = "5s"

[instrumentation]
prometheus = true
prometheus_listen_addr = ":26660"
```

### Recommended app.toml Settings

```toml
[api]
enable = true
address = "tcp://0.0.0.0:1317"

[telemetry]
enabled = true
prometheus-retention-time = 60

[pruning]
pruning = "custom"
pruning-keep-recent = "100"
pruning-interval = "10"

minimum-gas-prices = "0.025uclaw"
```

## Systemd Services

ClawChain provides systemd unit files for all daemons in `deploy/systemd/`.

### Validator Node (clawchaind)

```ini
[Unit]
Description=ClawChain Validator Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=clawchain
Group=clawchain
ExecStart=/usr/local/bin/clawchaind start --home /var/lib/clawchain/.clawchain
Restart=on-failure
RestartSec=10
LimitNOFILE=65535
LimitNPROC=4096
MemoryMax=8G
CPUQuota=400%
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/clawchain

[Install]
WantedBy=multi-user.target
```

Install and enable:

```bash
sudo cp deploy/systemd/clawchaind.service /etc/systemd/system/
sudo useradd -r -s /bin/false -d /var/lib/clawchain clawchain
sudo mkdir -p /var/lib/clawchain
sudo chown clawchain:clawchain /var/lib/clawchain
sudo systemctl daemon-reload
sudo systemctl enable --now clawchaind
```

### GPU Provider

```ini
[Unit]
Description=ClawChain GPU Provider Daemon
After=network-online.target clawchaind.service

[Service]
Type=simple
User=clawchain
ExecStart=/usr/local/bin/claw-gpu-provider
Restart=on-failure
RestartSec=15
EnvironmentFile=-/etc/default/claw-gpu-provider
SupplementaryGroups=video render docker
LimitNOFILE=65535
MemoryMax=16G

[Install]
WantedBy=multi-user.target
```

GPU provider environment variables (`/etc/default/claw-gpu-provider`):

```bash
CHAIN_REST=http://localhost:1317
CHAIN_RPC=http://localhost:26657
CHAIN_ID=clawchain-1
WEBSOCKET_ENABLED=true
```

### Additional Services

| Service | Description |
|---------|-------------|
| `claw-inference-sidecar.service` | Inference sidecar for model serving |
| `claw-txhistoryd.service` | Transaction history indexer |
| `claw-faucet.service` | Testnet faucet service |
| `claw-eventsd.service` | Event indexing daemon |
| `claw-notifyd.service` | Notification daemon |
| `clawd.service` | clawd CLI gateway |

## Monitoring

### Prometheus Configuration

ClawChain ships a production Prometheus configuration in `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    chain_id: "clawchain-1"
    environment: "production"

scrape_configs:
  - job_name: "cometbft"
    static_configs:
      - targets: ["localhost:26660"]
    # CometBFT consensus metrics

  - job_name: "cosmos-sdk-app"
    static_configs:
      - targets: ["localhost:1317"]
    # Cosmos SDK application metrics

  - job_name: "node-exporter"
    static_configs:
      - targets: ["localhost:9100"]
    # System metrics (CPU, memory, disk)

  - job_name: "claw-gpu-provider"
    static_configs:
      - targets: ["localhost:2112"]
    # GPU provider metrics (8 custom metrics + /health)
```

### Grafana Dashboard

A 32-panel Grafana dashboard is available in `monitoring/grafana-dashboard.json` with 7 rows:

| Row | Panels | Description |
|-----|--------|-------------|
| Chain | 5 | Block height, block time, tx throughput, validators, peer count |
| Economics | 4 | Total supply, staking ratio, inflation rate, fee revenue |
| Agents | 5 | Active agents, tasks delegated/completed, reward distribution, heartbeat rate |
| GPU Compute | 5 | Active jobs, queue size, GPU utilization, provider count, reconciler metrics |
| Privacy | 4 | Shield/unshield volume, tree size, nullifier count, ZK verification time |
| Marketplace | 5 | Skills listed, escrows active, compute jobs, dispute rate, revenue |
| System | 4 | CPU, memory, disk I/O, network traffic |

### GPU Provider Metrics

The GPU provider exposes Prometheus metrics on `:2112/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `claw_gpu_provider_active_jobs` | Gauge | Currently running GPU jobs |
| `claw_gpu_provider_jobs_total` | Counter | Total jobs processed |
| `claw_gpu_provider_job_duration_seconds` | Histogram | Job execution time |
| `claw_gpu_provider_reconciler_runs_total` | Counter | Reconciler cycle count |
| `claw_gpu_provider_reconciler_mismatches_total` | Counter | State mismatches detected |
| `claw_gpu_provider_event_cursor_height` | Gauge | Last processed block height |
| `claw_gpu_provider_scheduler_queue_size` | Gauge | Pending jobs in queue |
| `claw_gpu_provider_gpu_available` | Gauge | Available GPU resources |

### Health Check

The GPU provider exposes a `/health` endpoint on the metrics port (`:2112`) for load balancer health checks.

### Alerting

Alert rules are defined in `monitoring/alerting-rules.yml`. Configure Alertmanager in `monitoring/alertmanager.yml` for PagerDuty, Slack, or email notifications.

## Kubernetes Deployment

Kubernetes manifests are available in `deploy/k8s/` for containerized deployments:

| Directory | Description |
|-----------|-------------|
| `clawchain-node/` | Validator/full node StatefulSet |
| `gpu-provider/` | GPU provider Deployment |
| `inference-sidecar/` | Inference sidecar Deployment |
| `web/` | Web dashboard Deployment |
| `clawd/` | clawd CLI gateway Deployment |
| `faucet/` | Faucet Service |
| `explorer/` | Block explorer |
| `monitoring/` | Prometheus + Grafana |
| `dex/` | DEX frontend |

Additional cluster resources:
- `namespace.yaml` -- ClawChain namespace
- `rbac.yaml` -- RBAC roles and bindings
- `secrets.yaml` -- Secrets template
- `tls.yaml` -- TLS certificate configuration
- `ingress.yaml` -- Ingress rules
- `network-policies.yaml` -- Network policies
- `autoscaling.yaml` -- Horizontal pod autoscaling

## Operational Procedures

### Creating a Validator

```bash
# Create validator transaction
clawchaind tx staking create-validator \
  --amount 1000000000uclaw \
  --pubkey $(clawchaind tendermint show-validator) \
  --moniker "my-validator" \
  --chain-id clawchain-1 \
  --commission-rate 0.05 \
  --commission-max-rate 0.20 \
  --commission-max-change-rate 0.01 \
  --min-self-delegation 1 \
  --from validator-key
```

### Key Management

- Store `priv_validator_key.json` securely; consider HSM integration (see `docs/hsm-integration-guide.md`)
- Use a separate key for the validator operator account
- Back up the mnemonic offline in multiple secure locations
- Rotate keys according to the key rotation policy (see `docs/key-rotation-failover-runbook.md`)

### Upgrades

ClawChain uses the standard Cosmos SDK upgrade mechanism:
1. A governance proposal specifies the upgrade height
2. The chain halts at the specified height
3. Operators install the new binary
4. The chain resumes with the upgraded state

Upgrade handlers are registered in `app/upgrades.go`. Each module defines migrations in its `keeper/migrations.go`.

```bash
# Check current module versions
clawchaind query upgrade module_versions

# Apply upgrade (after governance approval)
sudo systemctl stop clawchaind
cp clawchaind-new /usr/local/bin/clawchaind
sudo systemctl start clawchaind
```

### Backup and Recovery

```bash
# Stop the node
sudo systemctl stop clawchaind

# Backup data directory
tar czf clawchain-backup-$(date +%Y%m%d).tar.gz /var/lib/clawchain/.clawchain/data

# Restart
sudo systemctl start clawchaind
```

### Log Management

```bash
# View validator logs
journalctl -u clawchaind -f

# View GPU provider logs
journalctl -u claw-gpu-provider -f

# Filter by severity
journalctl -u clawchaind -p err
```

## Ports Reference

| Port | Service | Protocol | Description |
|------|---------|----------|-------------|
| 26656 | CometBFT P2P | TCP | Peer-to-peer gossip |
| 26657 | CometBFT RPC | HTTP | Tendermint RPC |
| 26660 | CometBFT Prometheus | HTTP | Consensus metrics |
| 1317 | Cosmos REST API | HTTP | Application queries and transactions |
| 9090 | gRPC | gRPC | gRPC query and broadcast |
| 2112 | GPU Provider | HTTP | Prometheus metrics + health |
| 9100 | Node Exporter | HTTP | System metrics |
| 9090 | Prometheus | HTTP | Monitoring UI |
| 3000 | Grafana | HTTP | Dashboard UI |

## Oracle Price Feeder

Validators must run an oracle price feeder to submit exchange rate votes. Missing too many votes results in slashing and jailing.

### Setup

```bash
# 1. Create feeder key (separate from validator key for security)
clawchaind keys add oracle-feeder --keyring-backend test

# 2. Fund the feeder (needs gas for vote transactions)
clawchaind tx bank send <validator-account> <feeder-address> 10000000uclaw \
  --chain-id clawchain-1 -y

# 3. Delegate feed consent
clawchaind tx oracle set-feeder <feeder-address> --from <validator-account> -y

# 4. Configure price feeder
cp cmd/claw-price-feeder/price-feeder.example.toml /etc/clawchain/price-feeder.toml
# Edit: set account.address, account.validator, keyring.dir

# 5. Start as systemd service
sudo cp deploy/systemd/claw-price-feeder.service /etc/systemd/system/
sudo systemctl enable --now claw-price-feeder
```

### Monitoring

```bash
# Check miss counter (should stay low)
clawd oracle miss <your-clawvaloper-address>

# Verify feeder delegation
clawd oracle feeder <your-clawvaloper-address>

# Check prices are updating
clawd oracle prices
```

Grafana dashboard: `monitoring/grafana/dashboards/oracle.json` (11 panels).

Alert rules fire on: no vote periods, zero active rates, high miss rate, validator slashed, low participation.

### Exchange Providers

The price feeder fetches from 19 exchanges: Binance, Coinbase, Kraken, OKX, Gate, Bitget, MEXC, Crypto.com, Huobi, Osmosis, Kujira, Astroport, Uniswap, Camelot, Balancer, Pancake, Curve, Polygon.

Default currency pairs: ATOM/USD, USDT/USD, USDC/USD, BTC/USD, ETH/USD.

| Port | Service | Protocol | Notes |
|------|---------|----------|-------|
| 7171 | Price Feeder API | HTTP | Health check + price debug (bind to localhost in production) |

## Related Pages

- [Oracle Module](/docs/modules/oracle) -- Full oracle documentation
- [CLI Reference](/docs/modules/cli-reference) -- clawd command reference
- [REST API Reference](/docs/api/rest-api) -- HTTP endpoints
- [Chain Modules](/docs/modules/overview) -- Module documentation
