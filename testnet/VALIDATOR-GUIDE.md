# ClawChain Validator Onboarding Guide

## Hardware Requirements

| Tier | CPU | RAM | Storage | Network | Monthly Cost |
|------|-----|-----|---------|---------|-------------|
| **Minimum** | 2 cores | 4 GB | 100 GB SSD | 10 Mbps | ~$5/mo (VPS) |
| **Recommended** | 4 cores | 8 GB | 250 GB NVMe | 100 Mbps | ~$10/mo (Hetzner CX43) |
| **High-performance** | 8+ cores | 16+ GB | 500 GB NVMe | 1 Gbps | ~$30/mo or Mac Mini M4 |

**Supported platforms:** Linux (amd64/arm64), macOS (arm64). Any machine running Node.js 22+ and Go 1.24+.

---

## Quick Start

### 1. Install

```bash
# Clone the repository
git clone https://github.com/clawchain/clawchain.git
cd clawchain

# Build and install
make install

# Verify
clawchaind version
```

### 2. Initialize Your Node

```bash
# Initialize with your chosen moniker (node name)
clawchaind init "my-validator" --chain-id clawchain-testnet-1

# Generate your validator key
clawchaind keys add validator --keyring-backend file

# IMPORTANT: Back up your mnemonic seed phrase securely!
```

### 3. Get the Genesis File

```bash
# Download the testnet genesis file from a seed node
curl -o ~/.clawchain/config/genesis.json \
  https://raw.githubusercontent.com/clawchain/testnet/main/genesis.json

# Validate it
clawchaind genesis validate
```

### 4. Configure Peers

Edit `~/.clawchain/config/config.toml`:

```toml
# Add seed nodes (get current seeds from the testnet repo)
seeds = "NODE_ID@SEED_IP:26656"

# For private networks, disable strict address book
addr_book_strict = false
```

Or use the OpenClaw peer tools:
```
clawchain_configure_peers --seeds "NODE_ID@IP:26656"
```

### 5. Start Your Node

```bash
# Start the node (syncs with the network)
clawchaind start

# Or run with clawd (bot + node unified)
clawd start
```

Wait for your node to fully sync (check with `clawchaind status | jq .sync_info.catching_up`).

### 6. Fund Your Validator

Request testnet tokens from the faucet:

```bash
# Via HTTP
curl -X POST http://FAUCET_URL/faucet/request \
  -H "Content-Type: application/json" \
  -d '{"address": "YOUR_CLAW_ADDRESS"}'

# Or via clawd bot tools
clawchain_faucet_request
```

### 7. Create Your Validator

Once synced and funded:

```bash
clawchaind tx staking create-validator \
  --amount 100000000uclaw \
  --pubkey $(clawchaind comet show-validator) \
  --moniker "my-validator" \
  --chain-id clawchain-testnet-1 \
  --commission-rate 0.10 \
  --commission-max-rate 0.20 \
  --commission-max-change-rate 0.01 \
  --min-self-delegation 1 \
  --from validator \
  --keyring-backend file \
  --fees 1000uclaw
```

### 8. Verify

```bash
# Check your validator is in the active set
clawchaind query staking validators --output json | \
  jq '.validators[] | select(.description.moniker == "my-validator")'

# Check your node's peer connections
curl localhost:26657/net_info | jq '.result.n_peers'
```

---

## Configuration Reference

### CometBFT Config (`config.toml`)

| Setting | Recommended | Description |
|---------|------------|-------------|
| `proxy_app` | (default) | ABCI app address |
| `moniker` | Your name | Node display name |
| `seeds` | See testnet repo | Seed nodes for discovery |
| `persistent_peers` | Optional | Always-connected peers |
| `addr_book_strict` | `false` (testnet) | Allow private IPs |
| `prometheus` | `true` | Enable metrics |
| `prometheus_listen_addr` | `:26660` | Metrics port |

### App Config (`app.toml`)

| Setting | Recommended | Description |
|---------|------------|-------------|
| `minimum-gas-prices` | `0.025uclaw` | Minimum gas price |
| `api.enable` | `true` | Enable REST API |
| `grpc.enable` | `true` | Enable gRPC |
| `telemetry.enabled` | `true` | Enable telemetry |

---

## Monitoring

### Prometheus Metrics

Every ClawChain node exposes Prometheus metrics at `:26660/metrics`.

Key metrics to monitor:

| Metric | Description |
|--------|-------------|
| `cometbft_consensus_latest_block_height` | Current block height |
| `cometbft_consensus_validators` | Number of active validators |
| `cometbft_consensus_rounds` | Consensus rounds (should be 0 usually) |
| `cometbft_consensus_missing_validators` | Missing validators in last block |
| `cometbft_p2p_peers` | Connected peer count |
| `cometbft_mempool_size` | Pending transactions |
| `cometbft_consensus_block_size_bytes` | Block size |

### Grafana Dashboard

A pre-built Grafana dashboard is included at `testnet/monitoring/grafana/dashboards/clawchain-overview.json`. Import it into your Grafana instance or use the Docker Compose testnet setup which provisions it automatically.

### Health Check

```bash
# Quick health check
curl -s localhost:26657/status | jq '{
  catching_up: .result.sync_info.catching_up,
  latest_block_height: .result.sync_info.latest_block_height,
  latest_block_time: .result.sync_info.latest_block_time
}'
```

---

## Running with Docker

### Single Node

```bash
docker build -t clawchain:latest .

docker run -d --name clawchain-node \
  -p 26657:26657 -p 1317:1317 -p 9090:9090 -p 26660:26660 \
  -v clawchain-data:/root/.clawchain \
  clawchain:latest start
```

### Multi-Node Testnet

```bash
cd testnet

# Initialize 4-validator testnet
./setup-testnet.sh 4

# Start all nodes + monitoring
docker compose up -d

# View logs
docker compose logs -f

# Run test scenarios
./test-scenarios.sh

# Tear down
docker compose down
```

### Makefile Shortcuts

```bash
make testnet-init      # Initialize testnet
make testnet-start     # Start with docker compose
make testnet-stop      # Stop all containers
make testnet-logs      # Follow logs
make testnet-test      # Run test scenarios
make testnet-clean     # Delete testnet data
make testnet-restart   # Full reset and restart
```

---

## Staking Rewards

Validators earn block rewards proportional to their stake. The reward distribution follows standard Cosmos SDK economics:

- **Block rewards:** New CLAW minted each block, distributed to validators
- **Transaction fees:** Collected from gas fees, distributed to validators
- **Commission:** Each validator sets a commission rate on delegator rewards
- **Slashing:** Validators who miss blocks or double-sign are penalized

Check your rewards:

```bash
clawchaind query distribution rewards YOUR_VALIDATOR_ADDRESS --node http://localhost:26657
```

Withdraw rewards:

```bash
clawchaind tx distribution withdraw-rewards YOUR_VALIDATOR_OPERATOR_ADDRESS \
  --from validator --keyring-backend file --chain-id clawchain-testnet-1 --fees 500uclaw
```

---

## Troubleshooting

### Node won't sync

1. Check peers: `curl localhost:26657/net_info | jq '.result.n_peers'`
2. Verify genesis hash matches the network
3. Ensure firewall allows port 26656 (P2P)
4. Try adding more seeds/persistent peers

### Validator not in active set

1. Check you have enough stake: `clawchaind query staking validator YOUR_OPERATOR_ADDR`
2. Verify the validator isn't jailed: look for `jailed: true` in the output
3. If jailed, unjail: `clawchaind tx slashing unjail --from validator --fees 500uclaw`

### High memory usage

1. Set `db_backend = "pebbledb"` in config.toml for lower memory usage
2. Prune old state: set `pruning = "custom"` with `pruning-keep-recent = "100"` in app.toml

### Proof generation slow

1. ZK proofs are generated locally by the bot, not the validator node
2. Ensure `clawproof` binary is compiled with optimizations: `go build -o clawproof ./cmd/clawproof`
3. Groth16 proof generation takes 2-5 seconds on modern hardware

---

## Security Checklist

- [ ] Validator key backed up securely (mnemonic + keyring files)
- [ ] Firewall configured: only ports 26656 (P2P) and optionally 26657 (RPC) open
- [ ] SSH key-only authentication on server
- [ ] Automatic security updates enabled
- [ ] Monitoring alerts configured for missed blocks
- [ ] Sentry node architecture for DDoS protection (production)
