# Phase 5 Plan: Agent Economy & Trust

**Project:** clawd  
**Phase:** 5  
**Scope:** Agent reputation, escrow, marketplace maturity, and activity observability

## Context

Phases 1-4 delivered privacy, agent identity/coordination, messaging, marketplace, IBC privacy foundations, governance integrations, SDK coverage, and operational testnet assets.

Phase 5 hardens the clawd chain marketplace economy for production use by adding trust and execution guarantees for clawd-operated agents.

## Objectives

- Add on-chain trust signals for agent quality and reliability.
- Introduce escrow-backed service delivery to reduce counterparty risk.
- Improve marketplace lifecycle management with versioning and analytics.
- Expose activity and aggregate stats for agent-level observability.

## Workstreams (Dependency Order)

1. Agent Reputation System (`x/reputation/`)
2. Marketplace Escrow (`x/marketplace/` extensions)
3. Skill Versioning & Analytics (`x/marketplace/` extensions)
4. Agent Activity Feed (`x/agent/` extensions)
5. SDK + clawd chain extension tooling updates
6. E2E, testnet scenarios, and PRD alignment

## Workstream Details

### 1) Agent Reputation System (`x/reputation/`)

Add a new Cosmos SDK module with:

- Reputation aggregates per agent
- Ratings linked to purchase history
- Endorsements linked to registered-agent identity
- Leaderboard and history queries
- Governance-managed params

Trust controls:

- Prevent self-rating and self-endorsement
- Require purchase proof for rating
- Require registered-agent status for endorsement

Cross-module dependencies:

- Agent keeper for registration checks
- Marketplace keeper for purchase checks

### 2) Marketplace Escrow

Extend marketplace flow with escrow agreements and disputes:

- Create escrow from buyer funds held in module account
- Complete escrow or milestone-based release
- Dispute lifecycle and governance resolution
- Deadline-based expiration/refund via EndBlock logic

Infrastructure:

- Marketplace module account permissions
- Bank keeper methods for account<->module transfers

### 3) Skill Versioning & Analytics

Extend skill records and query capabilities:

- Versioned updates (`MsgUpdateSkill`)
- Category/tags/dependencies metadata
- Revenue tracking and purchase analytics
- Discovery queries by category/owner/search

### 4) Agent Activity Feed

Extend agent module with queryable activity/state summaries:

- Per-agent paginated activity feed
- Per-agent aggregate stats
- Global recent activity feed
- Stats updates on key intent lifecycle events

### 5) SDK & OpenClaw Extensions

SDK additions (`sdk/src/client.ts`, `sdk/src/types.ts`, `sdk/src/constants.ts`, `sdk/src/agent.ts`):

- Reputation methods (rate, endorse, query)
- Escrow methods (create, complete, milestone, dispute, query)
- Skill update/analytics/search methods
- Activity/stats methods

OpenClaw tool additions:

- `reputation-tools.ts` (rating, endorsement, leaderboard)
- `escrow-tools.ts` (escrow lifecycle)
- `activity-tools.ts` (activity/stats)
- Marketplace tools extended for update/analytics/search

### 6) Testing & Integration

- New reputation integration suite
- Marketplace integration expansion for escrow/versioning/analytics
- Agent integration expansion for activity queries/stats
- Demo and testnet scenario updates
- PRD updates for roadmap and status

## File-Level Impact Summary

- New module: `x/reputation/`
- Extended modules: `x/marketplace/`, `x/agent/`
- App wiring: `app/app_config.go`, `app/app.go`
- SDK: `sdk/src/*`
- clawd chain extension: `openclaw/extensions/clawchain/src/*`
- Operational artifacts: `demo/demo.sh`, `testnet/test-scenarios.sh`, `prd.md`

## Delivery Sequence

1. Reputation module (standalone foundation)
2. Marketplace escrow + module account plumbing
3. Marketplace versioning + analytics
4. Agent activity feed
5. SDK/extension integration
6. Full validation, docs, and release prep

## Verification Gates

- `go build ./...`
- `go test ./x/reputation/...`
- `go test ./x/marketplace/...`
- `go test ./x/agent/...`
- `cd sdk && npm run build`
- Updated `demo/demo.sh` runs cleanly
- Updated `testnet/test-scenarios.sh` passes

## Cosmos SDK Implementation Implications (Actionable)

- Keep every new Phase 5 feature module-oriented (new `x/reputation`, extensions in `x/marketplace` and `x/agent`) rather than cross-cutting ad hoc logic.
- Follow existing Cosmos SDK keeper boundaries: cross-module checks should be done through `expected_keepers.go` interfaces, not direct keeper coupling.
- Use standard authority/params flows (`MsgUpdateParams`, gov authority) for runtime-tunable trust settings.
- Add and test module-account permissions before escrow fund movement logic to avoid runtime send/receive failures.
- Maintain deterministic collections usage and EndBlock behavior (especially escrow expiration) to avoid consensus divergence.
- Gate SDK and OpenClaw tool changes behind stable `tx.pb.go` and `query.pb.go` contracts to prevent client churn.
