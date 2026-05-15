# Phase 5 Execution Checklist

**Phase:** Agent Economy & Trust  
**Status Date:** February 23, 2026

This checklist assumes the clawd-first model: users run clawd agents (built on OpenClaw), and those agents participate natively in the clawd chain.

## Epics

| Epic | Scope | Primary Paths | Owner | Depends On |
|------|-------|---------------|-------|------------|
| E1: Reputation Module | New `x/reputation` module (types, keeper, queries, genesis, module wiring) | `x/reputation/`, `app/app_config.go`, `app/app.go` | Chain Core | None |
| E2: Escrow Lifecycle | Escrow agreements, milestones, disputes, expiry, module-account transfers | `x/marketplace/`, `app/app_config.go` | Marketplace Core | E1 (for trust integration signals, optional hard dep) |
| E3: Skill Versioning & Analytics | Skill updates, search, category/owner filters, analytics aggregation | `x/marketplace/` | Marketplace Core | E2 (shared marketplace touchpoints) |
| E4: Agent Activity Feed | Agent activity queries and aggregate stats | `x/agent/` | Agent Core | None |
| E5: SDK + clawd Chain Tools | New methods/types + new tool sets for reputation, escrow, activity | `sdk/src/`, `openclaw/extensions/clawchain/src/` | SDK/Agent Runtime | E1, E2, E3, E4 |
| E6: Integration Hardening | Integration tests, demo updates, testnet scenarios, PRD sync | `x/*/keeper/*_integration_test.go`, `demo/demo.sh`, `testnet/test-scenarios.sh`, `prd.md` | QA + Core | E1-E5 |

## Detailed Checklist

### E1: Reputation Module

- [ ] Create `x/reputation/types/*` (keys, params, errors, expected keepers, tx/query/genesis definitions)
- [ ] Create `x/reputation/keeper/*` (keeper, msg servers, queries, genesis)
- [ ] Create `x/reputation/module/*` (module wiring + depinject + autocli)
- [ ] Wire module in `app/app_config.go` and keeper field in `app/app.go`
- [ ] Add cross-module purchase + registered-agent checks
- [ ] Add anti-gaming guards (no self-rate/endorse)
- [ ] Add reputation integration tests

Acceptance criteria:

- [ ] Rating requires prior purchase from rated seller
- [ ] Endorsement requires registered endorser and non-self target
- [ ] Leaderboard query deterministic and paginated
- [ ] `go test ./x/reputation/...` passes

### E2: Escrow Lifecycle

- [ ] Add escrow and dispute types + keys/errors
- [ ] Add escrow/dispute keeper collections + sequence counters
- [ ] Implement create/complete/milestone/dispute/resolve messages
- [ ] Add EndBlock escrow expiration/refund logic
- [ ] Add marketplace module account perms and bank transfer paths
- [ ] Add escrow query endpoints and REST gateway routes

Acceptance criteria:

- [ ] Buyer funds are locked in module account during active escrow
- [ ] Completion/milestone release funds correctly and atomically
- [ ] Expired escrows auto-refund buyer
- [ ] Dispute resolution path updates final balances/status correctly

### E3: Skill Versioning & Analytics

- [ ] Extend `SkillRecord` with version/category/tags/dependencies/revenue fields
- [ ] Add `SkillVersionEntry` collection keyed by skill/version
- [ ] Implement `MsgUpdateSkill` with version auto-increment
- [ ] Add queries: by category, by owner, search, analytics
- [ ] Update purchase flow to maintain aggregate revenue fields

Acceptance criteria:

- [ ] Updating a skill creates an immutable version entry
- [ ] Analytics returns consistent revenue + counts
- [ ] Search works across name/description/tags
- [ ] Existing marketplace purchase/list/delist flows remain non-regressed

### E4: Agent Activity Feed

- [ ] Add `AgentStats` type and keeper collection
- [ ] Add queries: `AgentActivity`, `AgentStats`, `RecentActivity`
- [ ] Update intent lifecycle handlers to maintain aggregate counters

Acceptance criteria:

- [ ] Activity feed paginates predictably
- [ ] Stats counters reconcile against recorded actions in tests
- [ ] Query endpoints handle unknown agent address gracefully

### E5: SDK + clawd Chain Tools

- [ ] Add constants/type URLs and REST paths for Phase 5 messages/queries
- [ ] Add SDK types and client methods for reputation/escrow/analytics/activity
- [ ] Add high-level agent helpers in `sdk/src/agent.ts`
- [ ] Add tools: `reputation-tools.ts`, `escrow-tools.ts`, `activity-tools.ts`
- [ ] Extend `marketplace-tools.ts` and register in `tools.ts`

Acceptance criteria:

- [ ] `cd sdk && npm run build` passes
- [ ] New tools are registered and callable through extension index
- [ ] SDK tx/query method signatures align with on-chain proto definitions

### E6: Integration Hardening

- [ ] Add new reputation integration suite (target 25+ tests)
- [ ] Expand marketplace integration suite (target +20 tests)
- [ ] Expand agent integration suite (target +10 tests)
- [ ] Extend `demo/demo.sh` with Phase 5 flows
- [ ] Extend `testnet/test-scenarios.sh` with Phase 5 scenarios
- [ ] Keep PRD and status docs aligned

Acceptance criteria:

- [ ] `go build ./...` passes
- [ ] All relevant module test suites pass
- [ ] Demo flow exercises at least one full escrow + rating path
- [ ] Test scenario script includes pass/fail checks for new features

## Critical Dependencies

- E5 is blocked until E1-E4 protobuf/type URLs and endpoints are stable.
- Escrow module-account behavior depends on app-level permission wiring.
- Marketplace escrow and versioning should be merged in small PRs to reduce conflict risk.

## Cross-Cutting Cosmos SDK Checks

- [ ] New cross-module logic uses `expected_keepers.go` interfaces (no tight keeper imports).
- [ ] New/updated params are controlled via authority and validated in `MsgUpdateParams`.
- [ ] Module-account permissions are declared before escrow bank transfer paths are merged.
- [ ] EndBlock logic added for escrow expiry is deterministic and covered by integration tests.
- [ ] SDK/OpenClaw contract updates happen only after message/query proto contracts stabilize.

## Suggested Delivery Cadence

1. Week 1: E1 + scaffolding tests
2. Week 2: E2 + escrow integration tests
3. Week 3: E3 + E4 in parallel
4. Week 4: E5 + E6 + demo/testnet updates
