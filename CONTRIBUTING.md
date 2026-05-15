# Contributing to ClawChain

Thank you for your interest in contributing to ClawChain. This guide covers the
workflow, code style, and testing requirements for submitting changes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Layout](#project-layout)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Module Overview](#module-overview)

---

## Prerequisites

Ensure you have the following installed before building:

| Tool       | Version  | Purpose                              |
|------------|----------|--------------------------------------|
| Go         | 1.24+    | Chain binary, keeper tests           |
| Node.js    | 18+      | TypeScript SDK, clawd CLI, web dashboard |
| npm        | 9+       | Package management for TS projects   |
| protoc     | 3.21+    | Protobuf code generation             |
| buf        | latest   | Protobuf linting and breaking-change detection |
| golangci-lint | 1.55+ | Go linting (optional but recommended) |

## Getting Started

1. **Fork** the repository on GitHub.

2. **Clone** your fork locally:

   ```bash
   git clone https://github.com/<your-username>/new-blokchain.git
   cd new-blokchain
   ```

3. **Add the upstream remote:**

   ```bash
   git remote add upstream https://github.com/clawchain/new-blokchain.git
   ```

4. **Create a feature branch** from `main`:

   ```bash
   git checkout -b feat/my-feature main
   ```

5. **Build everything** to confirm your environment works:

   ```bash
   # Build all Go binaries + TypeScript tools
   make build-all

   # Build all frontend apps (web, explorer, dex, docs, landing)
   make build-frontend

   # Or build individual components:
   make build              # Chain binary only
   make build-services     # Go backend services
   make build-price-feeder # Oracle price feeder (separate Go module)
   make build-clawd        # clawd CLI
   make build-ts-tools     # TypeScript tool services
   make build-web          # Web dashboard
   ```

## Project Layout

Understanding where things live makes it easier to find and modify code.

```
new-blokchain/
  app/                       # Cosmos SDK application wiring (app.go, modules, IBC)
  cmd/
    clawchaind/              # Chain node binary (entry point)
    clawd/                   # TypeScript CLI (Commander.js, 317 commands)
    claw-artemis/            # DEX arbitrage bot (TypeScript)
    claw-cryo/               # Blockchain data extractor (TypeScript)
    claw-data-portal/        # Dataset download service (TypeScript)
    claw-eventsd/            # WebSocket event proxy (Go)
    claw-faucet/             # Token faucet service (Go)
    claw-flood/              # RPC load tester (TypeScript)
    claw-flux/               # Parallel LLM explorer (TypeScript)
    claw-gpu-provider/       # GPU provider daemon (Go)
    claw-inference-sidecar/  # Inference sidecar (Go)
    claw-price-feeder/       # Oracle price feeder (Go, Ojo fork — 19 exchange providers)
    claw-notifyd/            # Notification service (Go)
    claw-rivet/              # Chain inspector (TypeScript)
    claw-txhistoryd/         # Transaction history indexer (Go)
    clawproof/               # ZK proof utility (Go)
  claw-explorer/             # Block explorer (Vue 3, ping.pub fork)
  config/                    # Configuration templates (testnet, mainnet, GPU provider)
  contracts/dex/             # DEX smart contracts (Rust, Astroport fork)
  dantegpu-core/             # DanteGPU billing/metering integration
  dex-app/                   # ClawDEX frontend (Next.js, Astroport Classic fork)
  demo/                      # End-to-end demo scripts
  deploy/                    # Deployment manifests (Docker, Kubernetes, systemd, Nginx)
  docs/                      # Operator guides, architecture docs, plans
  docs-site/                 # Developer docs site (Docusaurus)
  landing/                   # Landing page (Vite static)
  monitoring/                # Prometheus rules, Grafana dashboards, AlertManager
  openclaw/                  # OpenClaw AI agent runtime (50+ tools)
  proto/                     # Protobuf definitions for all custom modules
  scripts/                   # Build, deploy, and utility scripts
  sdk/                       # @clawchain/sdk TypeScript SDK (176+ tests)
  tests/
    e2e/                     # End-to-end integration tests (49 tests)
  web/                       # React + Vite web dashboard (40 pages)
  x/                         # Cosmos SDK modules (see Module Overview below)
    agent/                   # Agent registry, tasks, coordination, mining
    clawchain/               # Core chain parameters
    governance/              # On-chain governance proposals and voting
    marketplace/             # Skill marketplace, escrow, GPU compute
    messaging/               # Inter-agent encrypted messaging
    modelregistry/           # AI model registry and inference jobs
    privacy/                 # ZK private transfers (Groth16, MiMC, Merkle tree)
    reputation/              # Agent reputation, ratings, endorsements, SLA
```

## Code Style

### Go

- Run `gofmt` on all Go files. CI will reject unformatted code.
- Run `golangci-lint run ./...` to check for common issues.
- Follow the [Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md)
  for naming, error handling, and package layout.
- Keeper methods should return `(result, error)` and never panic in
  message handlers.
- Use `cosmossdk.io/collections` for new state management (not raw KV store).
- Protobuf definitions live in `proto/clawchain/<module>/v1/`. After editing
  `.proto` files, regenerate Go code with `buf generate`.

### TypeScript

- Run `npx prettier --write .` in the relevant project directory (`sdk/`,
  `cmd/clawd/`, `web/`).
- Prefer strict TypeScript (`"strict": true` in `tsconfig.json`).
- Use named exports. Avoid default exports.
- Keep React components in `web/src/components/` or `web/src/pages/`.

### General

- Keep functions short and focused. Prefer small, testable units.
- Add comments for non-obvious logic. Document exported types and functions.
- Avoid introducing new dependencies without discussion in an issue first.

## Testing

All contributions must pass existing tests. New features should include tests.

### Running Tests

```bash
# Go unit tests (all modules)
make test-unit

# Integration tests (requires build tag)
make test-integration

# End-to-end tests
make test-e2e

# TypeScript SDK tests
cd sdk && npm test

# Web dashboard tests
cd web && npx vitest run

# clawd CLI tests
cd cmd/clawd && npm test

# TypeScript tool service tests
make test-ts-tools

# Full coverage report
make coverage-report
```

### Test Requirements

- **Unit tests**: Every new keeper method or message handler must have
  corresponding unit tests. Use the `initFixture(t)` pattern established in
  existing tests.
- **Integration tests**: Use the `//go:build integration` build tag. These
  tests exercise cross-module interactions.
- **Coverage**: All module keepers maintain at least 80% coverage. Do not
  submit changes that reduce coverage below this threshold.
- **TypeScript tests**: Web uses vitest + @testing-library/react. SDK uses
  Node.js built-in test runner. clawd and tool services use vitest.

### Docker

Run the full stack locally with Docker Compose:

```bash
make docker-up           # Core stack (chain + web + backend services)
make docker-up-gpu       # With GPU provider
make docker-up-tools     # With developer tools (artemis, cryo, flood, etc.)
make docker-up-all       # Everything
make docker-down         # Stop
make docker-health       # Health check all services
```

## Commit Messages

Follow the conventional commit format:

```
type: short description

Optional longer description explaining the motivation and context.
```

### Types

| Type       | When to use                                   |
|------------|-----------------------------------------------|
| `feat`     | A new feature                                 |
| `fix`      | A bug fix                                     |
| `refactor` | Code restructuring without behavior change    |
| `test`     | Adding or updating tests                      |
| `docs`     | Documentation changes                         |
| `chore`    | Build scripts, CI config, dependency updates  |
| `perf`     | Performance improvements                      |

### Examples

```
feat: add batch private transfer message to privacy module
fix: prevent double-spend when nullifier check races with commit
test: add integration tests for escrow expiration
docs: update operator quickstart for GPU providers
```

## Pull Request Process

1. **Ensure your branch is up to date** with `main`:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all tests locally** before pushing. CI will run them again, but
   catching failures early saves review cycles.

3. **Push your branch** and open a pull request against `main`.

4. **Fill in the PR template:**
   - Summary of what changed and why.
   - Link to the related issue (if any).
   - How to test the changes.

5. **Address review feedback.** Maintainers may request changes. Push
   additional commits to your branch; do not force-push during review unless
   asked.

6. **Merge requirements:**
   - All CI checks pass (unit tests, integration tests, linting).
   - At least one maintainer approval.
   - No unresolved review threads.

## Module Overview

ClawChain has 8 custom Cosmos SDK modules under `x/`. Understanding their
responsibilities helps you determine where a change belongs.

| Module          | Purpose                                                   |
|-----------------|-----------------------------------------------------------|
| `agent`         | Agent registration, heartbeat liveness, task delegation, coordination intents, IBC agent discovery |
| `clawchain`     | Core chain parameters and base module                     |
| `governance`    | On-chain proposals, voting (stake-weighted), parameter change execution across modules |
| `marketplace`   | Skill listings, escrow payments, milestones, GPU compute resources, leases, jobs, challenges |
| `messaging`     | Agent-to-agent messaging with nonce-based deduplication and TTL expiration |
| `modelregistry` | AI model registration, versioning, access control, inference job marketplace |
| `privacy`       | ZK private transfers (Groth16/BN254), shielding/unshielding, Merkle commitment tree, nullifier tracking, IBC privacy |
| `reputation`    | Agent reputation scores, ratings, endorsements, heartbeat SLA enforcement, decay |

Each module follows the standard Cosmos SDK layout:

```
x/<module>/
  keeper/       # State management, message handlers, queries
  module/       # AppModule registration, autocli, depinject
  types/        # Protobuf types, codec, errors, keys, params
  simulation/   # Simulation message generators
  ibc/          # IBC middleware (agent, privacy modules only)
```

---

If you have questions about contributing, open a GitHub issue or reach out in
the project's discussion channels.
