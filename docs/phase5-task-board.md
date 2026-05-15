# Phase 5 Task Board

**Phase:** Agent Economy & Trust  
**Date:** February 23, 2026  
**Board Mode:** Live status (`Todo / In Progress / Blocked / Done`)

This board follows the clawd-first model: users self-host clawd agents (built on OpenClaw), and those agents participate natively in the clawd chain.

## Status Summary

| Status | Count |
|--------|-------|
| Todo | 0 |
| In Progress | 0 |
| Blocked | 0 |
| Done | 26 |

## Current Status Board

| ID | Status | Why It Is Marked This Way |
|----|--------|----------------------------|
| P5-S1-01 | Done | `x/reputation/` scaffold now exists and `go test ./x/reputation/...` passes. |
| P5-S1-02 | Done | Reputation module is wired in `app/app_config.go` and `app/app.go`; `go test ./app/...` passes. |
| P5-S1-03 | Done | `MsgRateAgent` type + handler implemented with anti-self, score range, comment length, and purchase-gate checks; `go test ./x/reputation/...` passes. |
| P5-S1-04 | Done | `MsgEndorseAgent` type + handler implemented with anti-self and registered-agent checks; `go test ./x/reputation/...` passes. |
| P5-S1-05 | Done | Added query proto/service entries and keeper handlers for `Reputation`, `Ratings`, `Endorsements`, and `TopAgents`; `go test ./x/reputation/...` and `go test ./app/...` pass. |
| P5-S1-06 | Done | Added reputation fixture + integration tests for rate/endorse and query flows; `go test ./x/reputation/...` passes. |
| P5-S2-01 | Done | Added escrow/dispute data models plus marketplace keys/errors scaffolding; `go test ./x/marketplace/...` passes. |
| P5-S2-02 | Done | Marketplace keeper now includes escrow/dispute collections and sequence counters; `go test ./x/marketplace/...` passes. |
| P5-S2-03 | Done | Added escrow lifecycle tx types + keeper handlers (create/complete/milestone) with module-account fund locking/release; marketplace tests pass. |
| P5-S2-04 | Done | Added dispute/resolve handlers with authority checks and payout/refund paths, plus integration coverage in marketplace tests. |
| P5-S2-05 | Done | Expiration hook now refunds remaining escrow funds to buyer and integration coverage verifies expired-state + refund behavior. |
| P5-S2-06 | Done | Added marketplace module-account permission in app config and expanded bank keeper interface/mocks for account<->module transfers; tests pass. |
| P5-S2-07 | Done | Escrow/dispute query handlers, proto query service entries, and grpc-gateway route patterns are implemented; marketplace/app tests pass. |
| P5-S3-01 | Done | Added `SkillVersionEntry`, `SkillVersions` keeper collection, and extended `SkillRecord` with version/category/tags/dependencies/revenue fields; tests pass. |
| P5-S3-02 | Done | Added `MsgUpdateSkill` tx/service wiring and keeper handler with ownership checks, version bump, and `SkillVersionEntry` persistence; tests pass. |
| P5-S3-03 | Done | Added category/owner/search/analytics query request/response contracts, keeper handlers, grpc-gateway routes, and integration tests in `x/marketplace`; `go test ./x/marketplace/...` passes. |
| P5-S3-04 | Done | Purchase flow now updates `SkillRecord.TotalRevenue` alongside `PurchaseCount`, with integration assertions covering single and repeated purchases. |
| P5-S3-05 | Done | Added `x/agent/types/activity.go`, `AgentStats` model, keeper key/collection wiring, and query request/response types for activity/stat endpoints. |
| P5-S3-06 | Done | Added `query_agent_activity.go`, `query_agent_stats.go`, and `query_recent_activity.go`, with service wiring updates and integration coverage. |
| P5-S3-07 | Done | Intent submit/respond/finalize handlers now update `AgentStats` and append activity entries to the shared action feed; integration tests verify counters and query outputs. |
| P5-S4-01 | Done | SDK constants/types include marketplace, reputation, escrow, activity, and privacy root-history/query contracts. |
| P5-S4-02 | Done | SDK client/agent methods are implemented across Phase 5 query and tx surfaces. |
| P5-S4-03 | Done | `reputation-tools.ts` is implemented and wired in the ClawChain extension tool registry. |
| P5-S4-04 | Done | `escrow-tools.ts` is implemented and wired in the ClawChain extension tool registry. |
| P5-S4-05 | Done | `activity-tools.ts` and marketplace tool expansions (owner/category/search/analytics/update) are implemented and wired. |
| P5-S4-06 | Done | Integration coverage exists in `x/reputation`, `x/marketplace`, and `x/agent` keepers with passing module tests. |
| P5-S4-07 | Done | `demo/demo.sh` and `testnet/test-scenarios.sh` include Phase 5 trust/escrow and query-flow checks. |

## Sprint Mapping

### Sprint 1: Reputation Foundation

| ID | Ticket | Paths |
|----|--------|-------|
| P5-S1-01 | Scaffold `x/reputation` module | `x/reputation/types/`, `x/reputation/keeper/`, `x/reputation/module/` |
| P5-S1-02 | Wire app-level module registration | `app/app_config.go`, `app/app.go` |
| P5-S1-03 | Implement `MsgRateAgent` | `x/reputation/keeper/msg_server_rate_agent.go`, `x/reputation/types/errors.go` |
| P5-S1-04 | Implement `MsgEndorseAgent` | `x/reputation/keeper/msg_server_endorse_agent.go`, `x/reputation/types/expected_keepers.go` |
| P5-S1-05 | Add reputation queries | `x/reputation/keeper/query_*.go`, `x/reputation/types/query.pb.go` |
| P5-S1-06 | Reputation integration tests | `x/reputation/keeper/reputation_integration_test.go` |

### Sprint 2: Escrow Lifecycle

| ID | Ticket | Paths |
|----|--------|-------|
| P5-S2-01 | Add escrow/dispute data models | `x/marketplace/types/escrow.go`, `x/marketplace/types/keys.go`, `x/marketplace/types/errors.go`, `x/marketplace/types/codec.go` |
| P5-S2-02 | Extend keeper collections | `x/marketplace/keeper/keeper.go` |
| P5-S2-03 | Implement create/complete/milestone msgs | `x/marketplace/keeper/msg_server_create_escrow.go`, `x/marketplace/keeper/msg_server_complete_escrow.go`, `x/marketplace/keeper/msg_server_complete_milestone.go` |
| P5-S2-04 | Implement dispute and governance resolution | `x/marketplace/keeper/msg_server_dispute_escrow.go`, `x/marketplace/keeper/msg_server_resolve_dispute.go` |
| P5-S2-05 | Add EndBlock expiration/refund | `x/marketplace/keeper/escrow_expire.go`, `x/marketplace/module/module.go` |
| P5-S2-06 | Module-account and bank plumbing | `app/app_config.go`, `x/marketplace/types/expected_keepers.go`, `x/marketplace/keeper/keeper_test.go` |
| P5-S2-07 | Escrow queries + proto wiring | `x/marketplace/keeper/query_escrow.go`, `x/marketplace/types/query.pb.go`, `x/marketplace/types/query.pb.gw.go` |

### Sprint 3: Marketplace Maturity + Agent Activity

| ID | Ticket | Paths |
|----|--------|-------|
| P5-S3-01 | Skill versioning model | `x/marketplace/types/skill_record.go`, `x/marketplace/types/skill_version.go`, `x/marketplace/types/keys.go` |
| P5-S3-02 | Implement `MsgUpdateSkill` | `x/marketplace/keeper/msg_server_update_skill.go`, `x/marketplace/types/tx.pb.go` |
| P5-S3-03 | Marketplace analytics + search queries | `x/marketplace/keeper/query_skills_by_category.go`, `x/marketplace/keeper/query_skills_by_owner.go`, `x/marketplace/keeper/query_skill_analytics.go`, `x/marketplace/keeper/query_skill_search.go`, `x/marketplace/types/query.pb.go` |
| P5-S3-04 | Revenue tracking on purchase | `x/marketplace/keeper/msg_server_purchase_skill.go` |
| P5-S3-05 | Agent stats model and collection | `x/agent/types/activity.go`, `x/agent/types/keys.go`, `x/agent/keeper/keeper.go` |
| P5-S3-06 | Agent activity/stat queries | `x/agent/keeper/query_agent_activity.go`, `x/agent/keeper/query_agent_stats.go`, `x/agent/keeper/query_recent_activity.go`, `x/agent/types/query.pb.go` |
| P5-S3-07 | Intent hooks for stats updates | `x/agent/keeper/msg_server_submit_intent.go`, `x/agent/keeper/msg_server_finalize_intent.go` |

### Sprint 4: SDK, Tools, and System Validation

| ID | Ticket | Paths |
|----|--------|-------|
| P5-S4-01 | SDK constants and types | `sdk/src/constants.ts`, `sdk/src/types.ts` |
| P5-S4-02 | SDK client methods | `sdk/src/client.ts`, `sdk/src/agent.ts` |
| P5-S4-03 | clawd chain reputation tools | `openclaw/extensions/clawchain/src/reputation-tools.ts`, `openclaw/extensions/clawchain/src/tools.ts` |
| P5-S4-04 | clawd chain escrow tools | `openclaw/extensions/clawchain/src/escrow-tools.ts`, `openclaw/extensions/clawchain/src/tools.ts` |
| P5-S4-05 | clawd chain activity + marketplace tool updates | `openclaw/extensions/clawchain/src/activity-tools.ts`, `openclaw/extensions/clawchain/src/marketplace-tools.ts`, `openclaw/extensions/clawchain/src/tools.ts` |
| P5-S4-06 | Integration test expansion | `x/reputation/keeper/reputation_integration_test.go`, `x/marketplace/keeper/marketplace_integration_test.go`, `x/agent/keeper/agent_integration_test.go` |
| P5-S4-07 | Demo + testnet scenario updates | `demo/demo.sh`, `testnet/test-scenarios.sh` |

## Validation Gate

- [x] `go build ./...`
- [x] `go test ./x/reputation/...`
- [x] `go test ./x/marketplace/...`
- [x] `go test ./x/agent/...`
- [x] `cd sdk && npm run build`
- [x] `demo/demo.sh` includes Phase 5 successful run path
- [x] `testnet/test-scenarios.sh` includes Phase 5 scenario checks
