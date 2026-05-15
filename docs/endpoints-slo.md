# ClawChain Endpoints and SLO Targets

Phase 13 Track B -- Production Endpoint Configuration and Health Monitoring

---

## 1. Endpoint Reference

| Service        | Protocol | Default URL                                     | Port  | Notes                                    |
|----------------|----------|-------------------------------------------------|-------|------------------------------------------|
| Tendermint RPC | HTTP     | `http://localhost:26657`                        | 26657 | Block queries, tx broadcast, consensus   |
| gRPC           | gRPC     | `localhost:9090`                                | 9090  | Cosmos SDK module queries, tx service    |
| gRPC-gateway   | HTTP     | `http://localhost:1317`                         | 1317  | REST-compatible gateway over gRPC        |
| REST API       | HTTP     | `http://localhost:1317`                         | 1317  | Shared with gRPC-gateway                 |
| P2P            | TCP      | `tcp://localhost:26656`                         | 26656 | Peer-to-peer networking                  |
| Prometheus     | HTTP     | `http://localhost:26660/metrics`                | 26660 | Tendermint metrics (if enabled)          |

### Configuration Files

| File                                          | Purpose                         |
|-----------------------------------------------|---------------------------------|
| `~/.clawchain/config/config.toml`            | Tendermint / CometBFT settings  |
| `~/.clawchain/config/app.toml`               | Cosmos SDK app settings         |
| `~/.clawchain/config/client.toml`            | CLI default client settings     |

### Key config.toml Settings

```toml
[rpc]
laddr = "tcp://0.0.0.0:26657"

[p2p]
laddr = "tcp://0.0.0.0:26656"
```

### Key app.toml Settings

```toml
[grpc]
address = "0.0.0.0:9090"
enable = true

[api]
enable = true
address = "tcp://0.0.0.0:1317"
swagger = false               # disable in production

[telemetry]
enabled = true
prometheus-retention-time = 60
```

---

## 2. SLO Targets

### 2.1 Availability

| Metric             | Target | Measurement Window | Notes                            |
|--------------------|--------|--------------------|----------------------------------|
| RPC availability   | 99.9%  | Rolling 30 days    | /status returns HTTP 200         |
| REST availability  | 99.9%  | Rolling 30 days    | /node_info returns HTTP 200      |
| gRPC availability  | 99.9%  | Rolling 30 days    | gRPC health or syncing endpoint  |

**Allowed downtime at 99.9%:** ~43 minutes per 30-day window.

### 2.2 Latency

| Metric                  | Target      | Percentile | Notes                                    |
|-------------------------|-------------|------------|------------------------------------------|
| Block time              | < 6 seconds | p95        | Time between consecutive blocks          |
| Query latency (REST)    | < 500 ms    | p99        | Single-key queries (bank balance, etc.)  |
| Query latency (gRPC)    | < 200 ms    | p99        | Native gRPC calls                        |
| Tx inclusion            | < 12 s      | p95        | Broadcast to inclusion (~2 blocks)       |

### 2.3 Throughput

| Metric              | Target           | Notes                                         |
|----------------------|------------------|-----------------------------------------------|
| Sustained tx/s      | >= 50 tx/s       | Under normal agent load                       |
| Peak tx/s           | >= 200 tx/s      | Burst capacity over 10 s window               |
| Block size          | < 80% of max     | Sustained -- headroom for burst               |

### 2.4 Resource Bounds

| Metric                    | Warning    | Critical   | Notes                              |
|---------------------------|------------|------------|------------------------------------|
| Disk usage                | 80%        | 95%        | Data directory partition            |
| Memory (clawchaind RSS)   | 4 GB       | 8 GB       | Single process                      |
| Open file descriptors     | 80% ulimit | 95% ulimit | Monitor with `lsof -p <pid>`       |
| Missed blocks (validator) | 50         | 500        | Per signed_blocks_window            |

---

## 3. Monitoring Checklist

### 3.1 Health Check Script

Run `make health-check` or directly:

```bash
./scripts/health-check.sh
```

This produces a JSON health report and exits with:
- **0** -- healthy
- **1** -- degraded (warnings present)
- **2** -- critical (immediate attention needed)

### 3.2 Endpoint Smoke Test

Run `make endpoint-smoke` or directly:

```bash
./scripts/endpoint-smoke.sh
```

Quick post-deploy verification of all endpoints.

### 3.3 Prometheus Metrics

Enable in `config.toml`:

```toml
[instrumentation]
prometheus = true
prometheus_listen_addr = ":26660"
```

Key metrics to scrape:

| Metric                                      | Type      | Description                            |
|---------------------------------------------|-----------|----------------------------------------|
| `cometbft_consensus_height`                 | Gauge     | Current block height                   |
| `cometbft_consensus_rounds`                 | Gauge     | Rounds in current height               |
| `cometbft_consensus_validators`             | Gauge     | Number of active validators            |
| `cometbft_consensus_missing_validators`     | Gauge     | Missing validators in current round    |
| `cometbft_consensus_block_interval_seconds` | Histogram | Time between blocks                    |
| `cometbft_p2p_peers`                        | Gauge     | Number of connected peers              |
| `cometbft_mempool_size`                     | Gauge     | Number of txs in mempool               |
| `cometbft_mempool_failed_txs`               | Counter   | Rejected transactions                  |
| `cosmos_tx_count`                           | Counter   | Total processed transactions           |

### 3.4 Log Monitoring

Monitor `clawchaind` logs (journalctl or stdout) for:

- `ERR` -- any error-level log lines
- `CONSENSUS FAILURE` -- consensus halt
- `panic` -- process crash
- `out of memory` -- OOM condition
- `disk full` / `no space left` -- storage exhaustion

### 3.5 Cron Health Check

Add to crontab for continuous monitoring:

```cron
# Run health check every 60 seconds, log to file
* * * * * /path/to/scripts/health-check.sh QUIET=1 >> /var/log/clawchain-health.json 2>/dev/null
```

---

## 4. Alerting Thresholds

### 4.1 Alert Levels

| Level    | Response Time | Notification Channel | Escalation        |
|----------|---------------|----------------------|--------------------|
| Warning  | 15 minutes    | Slack / email        | On-call engineer   |
| Critical | Immediate     | PagerDuty / SMS      | Incident commander |

### 4.2 Alert Rules

| Alert Name               | Condition                                      | Level    | Action                              |
|--------------------------|-------------------------------------------------|----------|-------------------------------------|
| `NodeDown`               | RPC /status unreachable for > 30 s              | Critical | Restart process, check host         |
| `NodeSyncing`            | `catching_up = true` for > 5 min                | Warning  | Monitor sync progress               |
| `BlockStall`             | No new block for > 30 s                         | Critical | Check consensus, validator status   |
| `SlowBlocks`             | Block interval p95 > 6 s over 5 min             | Warning  | Check network, peer count           |
| `HighQueryLatency`       | REST p99 > 500 ms over 5 min                    | Warning  | Check load, indexer, disk I/O       |
| `TxInclusionSlow`        | Tx inclusion p95 > 12 s over 10 min             | Warning  | Check mempool size, gas prices      |
| `MissedBlocks`           | missed_blocks_counter > 50                      | Warning  | Check validator key, connectivity   |
| `MissedBlocksCritical`   | missed_blocks_counter > 500                     | Critical | Risk of jailing -- immediate action |
| `DiskSpaceWarning`       | Data partition > 80% used                       | Warning  | Plan disk expansion, prune state    |
| `DiskSpaceCritical`      | Data partition > 95% used                       | Critical | Emergency prune or expand           |
| `MemoryWarning`          | clawchaind RSS > 4 GB                           | Warning  | Monitor trend, plan restart window  |
| `MemoryCritical`         | clawchaind RSS > 8 GB                           | Critical | Restart with state-sync if needed   |
| `PeerCountLow`           | Connected peers < 3                             | Warning  | Add seeds, check firewall           |
| `MempoolBacklog`         | Mempool size > 1000 for > 2 min                 | Warning  | Check gas prices, tx throughput     |

### 4.3 Prometheus Alertmanager Rules (Example)

```yaml
groups:
  - name: clawchain
    rules:
      - alert: ClawChainNodeDown
        expr: up{job="clawchain"} == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "ClawChain node is unreachable"

      - alert: ClawChainBlockStall
        expr: rate(cometbft_consensus_height[1m]) == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "No new blocks produced in 30s"

      - alert: ClawChainSlowBlocks
        expr: histogram_quantile(0.95, rate(cometbft_consensus_block_interval_seconds_bucket[5m])) > 6
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Block interval p95 exceeds 6s"

      - alert: ClawChainDiskSpace
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.05
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Disk space below 5% available"
```

---

## 5. Runbook Quick Reference

| Scenario              | Command                                                   |
|-----------------------|-----------------------------------------------------------|
| Full health check     | `make health-check`                                       |
| Smoke test endpoints  | `make endpoint-smoke`                                     |
| Check sync status     | `curl -s localhost:26657/status \| jq .result.sync_info`  |
| Check latest block    | `curl -s localhost:1317/cosmos/base/tendermint/v1beta1/blocks/latest \| jq .block.header.height` |
| Check peer count      | `curl -s localhost:26657/net_info \| jq .result.n_peers`  |
| Check mempool         | `curl -s localhost:26657/num_unconfirmed_txs`             |
| Check validator set   | `curl -s localhost:1317/cosmos/staking/v1beta1/validators` |
| Check missed blocks   | `curl -s localhost:1317/cosmos/slashing/v1beta1/signing_infos` |
| Operator diagnostics  | `make clawd-doctor`                                       |
