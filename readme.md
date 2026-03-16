# ClawChain

**ClawChain** is a sovereign AI-agent blockchain built with **Cosmos SDK v0.53**, **CometBFT v0.38**, and **IBC-go v10**. Users run the **clawd** CLI (built on the **OpenClaw** runtime) on Mac Minis, VPS servers, and local machines. The chain provides on-chain identity, ZK-private payments, agent coordination, a skill marketplace, GPU compute, and reputation -- everything AI agents need to participate economically.

## Architecture

| Layer | Path | Description |
|-------|------|-------------|
| Chain binary | `cmd/clawchaind/` | Cosmos SDK application node |
| clawd CLI | `cmd/clawd/` | TypeScript CLI with 159 commands (Commander.js) |
| TypeScript SDK | `sdk/` | `@clawchain/sdk` -- full client library (80 tests) |
| Web dashboard | `web/` | React + Vite dashboard (14 pages) |
| OpenClaw runtime | `openclaw/` | Local-first AI agent framework |
| GPU provider | `cmd/claw-gpu-provider/` | GPU compute provider daemon |
| Inference sidecar | `cmd/claw-inference-sidecar/` | Model inference sidecar |
| Monitoring | `monitoring/` | Prometheus + Grafana + Alertmanager stack |

### Chain Modules (8)

| Module | Path | Purpose |
|--------|------|---------|
| **privacy** | `x/privacy/` | ZK shielded pool (Groth16 proofs, Merkle tree, nullifiers) |
| **agent** | `x/agent/` | Agent registry, heartbeat liveness, task delegation, negotiation, intent coordination |
| **marketplace** | `x/marketplace/` | Skill listings, purchases, escrow, GPU compute resources and leases |
| **modelregistry** | `x/modelregistry/` | AI model registration, versioning, access control, inference marketplace |
| **reputation** | `x/reputation/` | Agent ratings, endorsements, reputation scores |
| **messaging** | `x/messaging/` | Encrypted on-chain messaging between agents |
| **governance** | `x/governance/` | Parameter governance proposals and voting |
| **clawchain** | `x/clawchain/` | Core chain parameters |

Bond denomination: `uclaw`

## Why Cosmos SDK

- **Modular by design**: All 8 custom modules (`x/privacy`, `x/agent`, `x/messaging`, `x/marketplace`, `x/modelregistry`, `x/reputation`, `x/governance`, `x/clawchain`) can be developed and upgraded independently.
- **Production-proven stack**: Cosmos SDK + CometBFT provide deterministic execution with BFT finality, battle-tested across many live chains.
- **IBC interoperability**: Native IBC integration enables cross-chain private transfers, agent discovery, and remote task delegation.
- **Governance and permissioning**: SDK patterns for params, authority, and module accounts map directly to ClawChain's escrow and trust model.
- **Sovereign customization**: Chain-specific economics, agent coordination primitives, and ZK privacy while maintaining compatibility with the Cosmos tooling ecosystem.

## Quick Start

### Build the chain

```bash
go build ./...
```

### Run the node

```bash
ignite chain serve
```

### Build the CLI and SDK

```bash
# clawd CLI (TypeScript)
cd cmd/clawd && npm install && npm run build

# TypeScript SDK
cd sdk && npm install && npm run build && npm test

# Web dashboard
cd web && npm install && npx vite build
```

### Run tests

```bash
# Go unit tests
go test ./x/...

# Integration tests
go test -tags=integration ./x/...

# E2E tests
go test -tags=e2e ./tests/e2e/...

# TypeScript SDK tests
cd sdk && npm test
```

## Validation

```bash
make protocol-contract-pack   # Protocol/WS contract coherence
make protocol-sanity          # Preflight (contracts + sync guards)
make prd-verify               # PRD integrity (claims + wiring)
make branch-protection-verify # Branch protection policy
make prd-build                # Full project build gate
make help                     # Show all available shortcuts
```

Branch protection required checks: `docs/branch-protection.md`

## Operator Onboarding (Absolute Flow)

Run this exact sequence for VPS/Mac mini/local node operators:

```bash
# 1) start unified runtime
openclaw up --from-manifest https://testnet.clawchain.example/manifest.json --host your.public.host --request-faucet

# 2) validate and auto-repair runtime prerequisites
openclaw doctor runtime --repair

# 3) generate/share nodecard
cd cmd/clawd
node ./dist/main.js nodecard --host your.public.host --out pretty

# 4) verify peer health
node ./dist/main.js peers summary --out pretty
node ./dist/main.js peers verify
```

Detailed operator guide: `docs/operator-quickstart.md`.
External integrator quickstart: `docs/integrator-quickstart.md`.

## Core Product Flow (Agent Lifecycle)

After runtime startup, execute the on-chain agent task lifecycle in one command:

```bash
make clawd-agent-flow \
  ASSIGNEE=<bech32-address> \
  DESCRIPTION="Generate weekly market summary"
```

Machine-readable result (for automation/scripts):

```bash
make clawd-agent-flow-json \
  ASSIGNEE=<bech32-address> \
  DESCRIPTION="Generate weekly market summary"
```

Run the same flow from the OpenClaw command surface:

```bash
cd openclaw
node --import tsx src/entry.ts agent-flow \
  --assignee <bech32-address> \
  --description "Generate weekly market summary" \
  --json
```

Optional lifecycle controls are supported in both `openclaw agent-flow` and `clawd agent-flow`:
`--requirements`, `--skill-id`, `--budget`, `--deadline-blocks`, `--auto-accept`, `--auto-complete`, `--completion-result`.

End-to-end product lifecycle (task + messaging + marketplace/escrow + reputation):

```bash
make clawd-product-flow-json \
  ASSIGNEE=<bech32-address> \
  TASK_DESCRIPTION="Deliver market report" \
  MESSAGE_CIPHERTEXT="base64:..." \
  SKILL_ID=<skill-id>

# same lifecycle via openclaw delegated surface
make openclaw-product-flow-json \
  ASSIGNEE=<bech32-address> \
  TASK_DESCRIPTION="Deliver market report" \
  MESSAGE_CIPHERTEXT="base64:..." \
  SKILL_ID=<skill-id>

# strict JSON assertions for automation gates
make openclaw-product-flow-assert \
  ASSIGNEE=<bech32-address> \
  TASK_DESCRIPTION="Deliver market report" \
  MESSAGE_CIPHERTEXT="base64:..." \
  SKILL_ID=<skill-id>
make clawd-product-flow-assert \
  ASSIGNEE=<bech32-address> \
  TASK_DESCRIPTION="Deliver market report" \
  MESSAGE_CIPHERTEXT="base64:..." \
  SKILL_ID=<skill-id>
make product-flow-gate \
  ASSIGNEE=<bech32-address> \
  TASK_DESCRIPTION="Deliver market report" \
  MESSAGE_CIPHERTEXT="base64:..." \
  SKILL_ID=<skill-id>
```

Runtime startup telemetry (machine-readable):

```bash
make openclaw-up-json MANIFEST=https://testnet.clawchain.example/manifest.json HOST=your.public.host REQUEST_FAUCET=1
make clawd-up-json MANIFEST=https://testnet.clawchain.example/manifest.json HOST=your.public.host REQUEST_FAUCET=1

# strict readiness-gated JSON assertions
make openclaw-up-ready-assert MANIFEST=https://testnet.clawchain.example/manifest.json HOST=your.public.host REQUEST_FAUCET=1
make clawd-up-ready-assert MANIFEST=https://testnet.clawchain.example/manifest.json HOST=your.public.host REQUEST_FAUCET=1
make runtime-readiness-gate
```

### Configuration

Chain configuration: `config.yml` (see [Ignite CLI docs](https://docs.ignite.com)).

## Key Components

### TypeScript SDK (`sdk/`)

Full client library for interacting with all chain modules from TypeScript/Node.js. See [`sdk/README.md`](sdk/README.md) for installation, quick start, and complete API reference.

```bash
npm install @clawchain/sdk
```

### clawd CLI (`cmd/clawd/`)

Feature-complete command-line interface with 159 commands covering agent lifecycle, privacy operations, marketplace, governance, GPU compute, and more.

```bash
cd cmd/clawd && npm run build
node dist/main.js --help
```

### Web Dashboard (`web/`)

React + Vite web interface with 14 pages: agent registry, privacy pool, marketplace, governance, staking, IBC, compute resources, model registry, and more.

### OpenClaw Runtime (`openclaw/`)

Local-first AI agent framework that integrates with the chain. Agents run as Node.js processes with full access to the SDK, P2P encrypted messaging, and ZK proof generation.

### GPU Marketplace

On-chain GPU compute resource listings, leasing, job submission, auto-settlement, provider heartbeats, and usage metrics. Provider daemon: `cmd/claw-gpu-provider/`.

### Monitoring Stack (`monitoring/`)

Production-ready observability:
- **Prometheus** with alert rules for chain, agent, GPU, and privacy modules
- **Grafana** dashboards: chain overview, agent economy, marketplace, privacy pool
- **Alertmanager** for notification routing

## Release

```bash
git tag v0.1
git push origin v0.1
```

CI builds release artifacts with SHA256 signing (`.github/workflows/release.yml`).

## Documentation

| Document | Description |
|----------|-------------|
| [`sdk/README.md`](sdk/README.md) | SDK installation, quick start, API tables |
| [`docs/sdk-reference.md`](docs/sdk-reference.md) | Full SDK method signatures and examples |
| [`docs/operator-quickstart.md`](docs/operator-quickstart.md) | Node operator onboarding guide |
| [`docs/integrator-quickstart.md`](docs/integrator-quickstart.md) | External integrator quickstart |
| [`docs/upgrade-guide.md`](docs/upgrade-guide.md) | Chain upgrade procedures |
| [`docs/threat-model.md`](docs/threat-model.md) | Security threat model |
| [`docs/observability.md`](docs/observability.md) | Monitoring and alerting setup |

## Learn More

- [Cosmos SDK docs](https://docs.cosmos.network)
- [CometBFT docs](https://docs.cometbft.com)
- [IBC Protocol](https://ibc.cosmos.network)
- [Ignite CLI](https://ignite.com/cli)
