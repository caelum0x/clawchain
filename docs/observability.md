# ClawChain Observability Guide

Phase 13 Track C - Production Observability

This document covers how to enable, configure, and operate the ClawChain monitoring stack (Prometheus + Grafana) for production and testnet deployments.

---

## 1. Enabling Prometheus Metrics in CometBFT

CometBFT exposes metrics on a dedicated HTTP endpoint when enabled. Edit the node configuration file:

```
~/.clawchain/config/config.toml
```

Find the `[instrumentation]` section and set:

```toml
[instrumentation]

# When true, Prometheus metrics are served under /metrics on
# prometheus_listen_addr.
prometheus = true

# Address to listen for Prometheus collector(s) connections.
prometheus_listen_addr = ":26660"

# Maximum number of simultaneous connections.
max_open_connections = 3

# Instrumentation namespace.
namespace = "cometbft"
```

After editing, restart the node:

```bash
systemctl restart clawchaind
# or
clawchaind start
```

Verify metrics are exposed:

```bash
curl -s http://localhost:26660/metrics | head -20
```

### Cosmos SDK Application Telemetry

To enable Cosmos SDK application-level metrics, edit:

```
~/.clawchain/config/app.toml
```

Find the `[telemetry]` section and set:

```toml
[telemetry]

# Enabled enables the application telemetry functionality.
enabled = true

# Enable prefixing gauge values with hostname.
enable-hostname = false

# Enable adding hostname to labels.
enable-hostname-label = false

# Enable adding service to labels.
enable-service-label = false

# PrometheusRetentionTime defines the retention time for Prometheus metrics
# in seconds. A value of 0 disables Prometheus support. Recommended: 60.
prometheus-retention-time = 60
```

---

## 2. Setting Up Prometheus

### Install Prometheus

**Linux (apt):**
```bash
sudo apt-get update && sudo apt-get install -y prometheus
```

**macOS (Homebrew):**
```bash
brew install prometheus
```

**Docker:**
```bash
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml \
  -v $(pwd)/monitoring/alerting-rules.yml:/etc/prometheus/alerting-rules.yml \
  prom/prometheus:latest
```

### Configure Prometheus

Copy the provided configuration:

```bash
cp monitoring/prometheus.yml /etc/prometheus/prometheus.yml
cp monitoring/alerting-rules.yml /etc/prometheus/alerting-rules.yml
```

Or point Prometheus at the repo configs directly:

```bash
prometheus --config.file=monitoring/prometheus.yml
```

### Verify Prometheus

Open `http://localhost:9090/targets` in a browser and confirm all targets are UP.

---

## 3. Setting Up Grafana

### Install Grafana

**Linux (apt):**
```bash
sudo apt-get install -y apt-transport-https software-properties-common
sudo add-apt-repository "deb https://apt.grafana.com stable main"
sudo apt-get update && sudo apt-get install -y grafana
sudo systemctl enable grafana-server && sudo systemctl start grafana-server
```

**macOS (Homebrew):**
```bash
brew install grafana
brew services start grafana
```

**Docker:**
```bash
docker run -d \
  --name grafana \
  -p 3000:3000 \
  grafana/grafana:latest
```

### Import the Dashboard

1. Open Grafana at `http://localhost:3000` (default credentials: admin/admin).
2. Go to **Configuration > Data Sources** and add a Prometheus data source pointing to `http://localhost:9090`.
3. Go to **Dashboards > Import** and upload `monitoring/grafana-dashboard.json`.
4. Select the Prometheus data source when prompted.

---

## 4. Node Exporter (System Metrics)

Prometheus does not collect system-level metrics (CPU, memory, disk) on its own. Install `node_exporter`:

**Linux:**
```bash
sudo apt-get install -y prometheus-node-exporter
```

**macOS:**
```bash
brew install node_exporter
```

**Docker:**
```bash
docker run -d \
  --name node-exporter \
  --net=host \
  --pid=host \
  -v /:/host:ro,rslave \
  quay.io/prometheus/node-exporter:latest \
  --path.rootfs=/host
```

Node exporter listens on port `9100` by default. The Prometheus config in `monitoring/prometheus.yml` already includes a scrape job for it.

---

## 5. Alert Routing Guidance

### Alertmanager Setup

For production, deploy Prometheus Alertmanager to route alerts:

```bash
# Install
sudo apt-get install -y prometheus-alertmanager  # Linux
brew install alertmanager                         # macOS
```

Uncomment the `alerting` block in `monitoring/prometheus.yml` and point it at your Alertmanager instance.

### Recommended Routing

| Severity   | Channel            | Response SLA |
|------------|--------------------|--------------|
| `critical` | PagerDuty / Opsgenie + Slack #clawchain-critical | 5 minutes |
| `warning`  | Slack #clawchain-alerts | 30 minutes |
| `info`     | Slack #clawchain-monitoring | Best effort |

### Example Alertmanager Config

```yaml
route:
  group_by: ['alertname', 'chain_id']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-warnings'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      repeat_interval: 1h
    - match:
        severity: warning
      receiver: 'slack-warnings'
      repeat_interval: 4h

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<YOUR_PAGERDUTY_KEY>'
  - name: 'slack-warnings'
    slack_configs:
      - api_url: '<YOUR_SLACK_WEBHOOK>'
        channel: '#clawchain-alerts'
```

---

## 6. Retention Policy Recommendations

| Tier       | Resolution | Retention | Storage Estimate (single node) |
|------------|-----------|-----------|-------------------------------|
| Raw        | 15s       | 30 days   | ~2-5 GB                       |
| Aggregated | 5m        | 1 year    | ~500 MB                       |
| Long-term  | 1h        | 3 years   | ~50 MB                        |

### Prometheus Local Storage

In `prometheus.yml` or launch flags:

```bash
prometheus \
  --config.file=monitoring/prometheus.yml \
  --storage.tsdb.retention.time=30d \
  --storage.tsdb.retention.size=5GB
```

### Long-Term Storage

For retention beyond 30 days, use a remote write backend:

- **Thanos** - HA Prometheus with object storage (S3, GCS)
- **Cortex** - Horizontally scalable, multi-tenant
- **VictoriaMetrics** - High-performance, drop-in compatible

Configure remote write in `prometheus.yml`:

```yaml
remote_write:
  - url: "http://thanos-receive:19291/api/v1/receive"
```

---

## 7. Key Metrics to Watch

| Metric | Type | Description | Healthy Range |
|--------|------|-------------|---------------|
| `cometbft_consensus_height` | Counter | Current block height | Steadily increasing |
| `cometbft_consensus_rounds` | Gauge | Current consensus round | 0 (ideal) |
| `cometbft_consensus_block_interval_seconds` | Histogram | Time between blocks | < 7s |
| `cometbft_consensus_num_txs` | Gauge | Txs in latest block | Varies |
| `cometbft_consensus_missing_validators_power` | Gauge | Missing validator voting power | 0 (ideal) |
| `cometbft_consensus_byzantine_validators_power` | Gauge | Byzantine validator power | 0 (must be) |
| `cometbft_p2p_peers` | Gauge | Connected peers | >= 5 |
| `cometbft_mempool_size` | Gauge | Pending mempool txs | < 500 |
| `cometbft_mempool_size_bytes` | Gauge | Mempool size in bytes | < 50 MB |
| `cometbft_mempool_failed_txs` | Counter | Failed mempool txs | Low / zero |
| `cometbft_state_block_processing_time` | Histogram | Block processing time | < 1s |
| `node_memory_MemAvailable_bytes` | Gauge | Available memory | > 20% of total |
| `node_filesystem_avail_bytes` | Gauge | Free disk space | > 10% of total |
| `clawchain_agent_registrations_total` | Counter | Agent registrations (custom) | Steadily increasing |

---

## 8. Alert Runbooks

### ChainHalted

**Severity:** Critical

**Trigger:** `increase(cometbft_consensus_height[2m]) == 0` for 60s

**Possible Causes:**
- Insufficient validators online (< 2/3 voting power)
- Network partition
- Software bug causing consensus panic
- All validators halted due to state corruption

**Response Steps:**
1. Check validator logs: `journalctl -u clawchaind -n 100 --no-pager`
2. Check if other validators are reachable: `curl http://<peer>:26657/status`
3. Check consensus state: `clawchaind query consensus comet block-latest`
4. If panic, collect core dump and restart with `--unsafe-skip-upgrades` if needed
5. Coordinate with other validators if network-wide halt

---

### MissedBlocks

**Severity:** Warning

**Trigger:** `increase(cometbft_consensus_missing_validators_power[10m]) > 10`

**Possible Causes:**
- Validator node is down or restarting
- Signing key is unavailable (KMS issue)
- Network latency causing late votes
- Clock drift (NTP misconfigured)

**Response Steps:**
1. Verify validator process is running: `systemctl status clawchaind`
2. Check signing: `clawchaind query slashing signing-info <valcons-addr>`
3. Verify NTP: `timedatectl status`
4. Check peer connectivity: `curl localhost:26657/net_info | jq '.result.n_peers'`

---

### HighMemoryUsage

**Severity:** Warning

**Trigger:** Memory usage > 80% for 5 minutes

**Possible Causes:**
- State DB growth (IAVL tree)
- Mempool flood
- Memory leak in application module
- Insufficient RAM for workload

**Response Steps:**
1. Check process memory: `ps aux | grep clawchaind`
2. Check mempool: `curl localhost:26657/num_unconfirmed_txs`
3. If mempool flood, flush: `curl localhost:26657/unsafe_flush_mempool` (unsafe, testnet only)
4. Consider pruning state or increasing instance memory
5. Monitor for trend (gradual increase = possible leak)

---

### DiskSpaceLow

**Severity:** Critical

**Trigger:** Root filesystem < 10% free for 5 minutes

**Possible Causes:**
- Chain data growth (blocks, state, WAL)
- Log files not rotated
- Snapshots accumulating

**Response Steps:**
1. Check disk usage: `df -h /`
2. Check chain data: `du -sh ~/.clawchain/data/`
3. Prune old state: `clawchaind tendermint unsafe-reset-all` (testnet only) or configure pruning in `app.toml`
4. Rotate/compress logs
5. Expand disk volume if cloud instance

---

### PeerCountLow

**Severity:** Warning

**Trigger:** `cometbft_p2p_peers < 3` for 5 minutes

**Possible Causes:**
- Firewall blocking P2P port (26656)
- Seeds/persistent peers misconfigured
- Network-wide issue
- NAT traversal failure

**Response Steps:**
1. Check P2P port: `ss -tlnp | grep 26656`
2. Check config seeds/persistent_peers in `config.toml`
3. Test connectivity: `telnet <seed-ip> 26656`
4. Run peer diagnostics: `make clawd-doctor`
5. Sync peers from manifest: `make clawd-peers-sync-manifest MANIFEST=<url>`

---

### SlowBlockTime

**Severity:** Warning

**Trigger:** Average block interval > 10s for 2 minutes

**Possible Causes:**
- Low validator participation
- Network latency between validators
- Heavy block processing (large transactions)
- Timeout misconfiguration

**Response Steps:**
1. Check consensus state: `curl localhost:26657/consensus_state`
2. Check number of validators online vs expected
3. Review timeout settings in `config.toml` (`[consensus]` section)
4. Check for large transactions blocking processing

---

### ConsensusRoundHigh

**Severity:** Warning

**Trigger:** `cometbft_consensus_rounds > 2` for 60s

**Possible Causes:**
- Proposer is down or slow
- Network partitions between validators
- Clock skew among validators
- Validator set changes causing instability

**Response Steps:**
1. Identify current proposer: `curl localhost:26657/consensus_state | jq '.result.round_state.proposer'`
2. Check if proposer is reachable
3. Review validator set: `clawchaind query staking validators`
4. Check NTP sync across all validators

---

### TxPoolBacklog

**Severity:** Warning

**Trigger:** `cometbft_mempool_size > 1000` for 2 minutes

**Possible Causes:**
- Spam transactions flooding mempool
- Block gas limit too low
- Chain producing blocks slowly
- Application module processing bottleneck

**Response Steps:**
1. Check mempool: `curl localhost:26657/num_unconfirmed_txs`
2. Check if blocks are being produced (height increasing)
3. Review block gas limit in genesis or governance
4. If spam, consider enabling mempool fee floor
5. Monitor whether backlog is draining or growing
