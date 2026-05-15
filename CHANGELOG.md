# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **oracle module** -- Production-grade oracle forked from Terra Classic v4.0.0 (63 Go files, 18,764 LOC). Replaces hand-written stubs with real prevote/vote commit-reveal cycle, weighted median aggregation, validator slashing, reward distribution, feeder delegation, and Tobin tax.
- **price feeder daemon** -- Off-chain oracle price feeder forked from Ojo (123 files). 19 exchange providers (Binance, Coinbase, Kraken, OKX, Gate, Bitget, MEXC, and more). Configured with 5 CLAW trading pairs (ATOM/USD, USDT/USD, USDC/USD, BTC/USD, ETH/USD).
- **oracle Prometheus metrics** -- 11 custom metrics (vote periods, exchange rates, miss counters, slashes, rewards, ballot power, active feeders) exposed on :26660/metrics.
- **oracle Grafana dashboard** -- 11-panel dashboard for oracle operator visibility (monitoring/grafana/dashboards/oracle.json).
- **oracle alert rules** -- 6 Prometheus alert rules for oracle health (OracleNoVotePeriods, OracleNoActiveRates, OracleHighMissRate, OracleValidatorSlashed, OracleLowVoterParticipation, OracleNoRewards).
- **clawd oracle commands** -- 13 CLI commands for querying oracle state via v1beta1 REST endpoints.
- **SDK oracle methods** -- 13 TypeScript client methods with 14 type interfaces for the oracle module.
- **web Oracle dashboard** -- Exchange rates with 30s auto-refresh, active denoms, vote targets, collapsible parameters, Keplr wallet miss counter.

### Fixed

- **oracle uint64 underflow** -- Fixed consensus-critical bug in slash.go where missCounter > votePeriodsPerWindow caused unsigned wrap-around, silently skipping validator slashing.
- **oracle EndBlocker panics** -- Replaced panic() calls in slash.go and reward.go with error logging + graceful return, preventing potential chain halts.
- **oracle int64 overflow** -- Added guard in tally.go for ballot power exceeding int64 range on large validator sets.
- **IsPeriodLastBlock divide-by-zero** -- Added period==0 guard preventing chain halt if VotePeriod or SlashWindow is zero.
- **UpdateParam validation** -- Added cross-field Validate() call after governance parameter updates.
- **hardcoded localhost URLs** -- Fixed production web code to derive service URLs from environment/config instead of hardcoded localhost.

### Changed

- **oracle whitelist** -- Replaced Terra legacy denoms (ukrw, usdr, umnt) with ClawChain trading pairs (uusd, uatom, uusdt, uusdc, ubtc, ueth).
- **CI/CD** -- Added price feeder build + test job to service-builds.yml workflow.

## [0.1.0] - 2026-03-07

### Added

- **agent module** -- Agent registration, deregistration, heartbeat liveness tracking, and on-chain statistics.
- **agent task delegation** -- Delegate, accept, checkpoint, and complete tasks with assignee tracking.
- **agent coordination** -- Submit, respond, negotiate, and finalize multi-agent coordination intents.
- **agent IBC discovery** -- Cross-chain agent discovery via IBC middleware relay.
- **privacy module** -- ZK private transfers using Groth16 proofs over BN254 with MiMC hashing.
- **privacy shielding/unshielding** -- Shield public tokens into private commitments and unshield back.
- **privacy Merkle tree** -- Depth-32 commitment Merkle tree with nullifier double-spend prevention.
- **privacy batch transfers** -- Batch multiple private transfers in a single transaction.
- **privacy view keys** -- Register view keys for selective disclosure of private balances.
- **privacy IBC** -- Cross-chain private transfers via IBC middleware.
- **marketplace module** -- Skill listing, versioned skill entries, and purchase tracking.
- **marketplace escrow** -- Escrow-based payments with milestones, disputes, and expiration.
- **marketplace GPU compute** -- Register GPU resources, create leases, submit and settle compute jobs.
- **marketplace compute challenges** -- Challenge-response verification for GPU compute results.
- **modelregistry module** -- AI model registration with versioning, access control, and usage tracking.
- **modelregistry inference** -- On-chain inference job marketplace with provider registration and pricing.
- **governance module** -- Proposal creation, stake-weighted voting, and cross-module parameter execution.
- **messaging module** -- Agent-to-agent messaging with nonce deduplication and TTL-based expiration.
- **reputation module** -- Reputation scores, ratings, endorsements, heartbeat SLA enforcement, and decay.
- **clawchain base module** -- Core chain parameters and base module wiring.
- **TypeScript SDK** -- @clawchain/sdk with client, proof helpers, agent ECDH, and WalletConnect support.
- **clawd CLI** -- TypeScript CLI with 70+ commands covering all chain operations.
- **web dashboard** -- React + Vite dashboard with 14 pages, Keplr wallet integration, and error boundaries.
- **GPU provider daemon** -- claw-gpu-provider with event cursor, reconciler, scheduler, and Docker execution.
- **inference sidecar** -- claw-inference-sidecar with SSE streaming, transaction signing, and model runtime bridging.
- **OpenClaw runtime** -- Sandboxed agent execution environment.
- **monitoring stack** -- Prometheus rules and Grafana dashboard templates.
- **configuration templates** -- Testnet, mainnet, GPU provider, and inference sidecar config templates.
- **CI/CD pipelines** -- Unit tests, integration tests, TypeScript checks, coverage, and release workflows.
