# Next Development Phase — Design Spec

> **Date**: 2026-03-21
> **Goal**: Harden the OpenClaw clawchain extension with missing tests, add inference intents, create live integration tests, and plan deployment + new features.

## Status Amendment — 2026-05-17

This March 21 design has been executed and is retained for traceability. The PRD records the agent hardening, inference intents, live OpenRouter tests, agent economy demo, ClawHub hardening, and GPU provider setup wizard as done. Future work should start from the current PRD and repository state rather than from the original task counts in this file.

Repository packaging has changed since this design: `openclaw/` and the protocol research forks are normal vendored directories, not submodules. The project funding wallet and logo are now documented in `readme.md`.

## Validation Results (March 21, 2026)

All test suites pass with 0 failures:

| Suite | Tests | Files |
|-------|-------|-------|
| OpenClaw clawchain extension | 526 | 32 |
| Go chain + modules | 19 packages | 19 |
| SDK | 274 | 62 suites |
| Web dashboard | 769 | 75 |
| clawd CLI | 581 | 54 |
| OpenRouter API | 1 live call | HTTP 200 |
| **Total** | **2,150+** | **0 failures** |

## Phase B: Agent Hardening

### B1: agent-loop.ts Tests

File: `openclaw/extensions/clawchain/src/agent-loop.test.ts`

The `AgentLoop` class (197 LOC) has zero test coverage. Tests needed:

- **Constructor**: merges config defaults, stores deps
- **start()**: sets running flag, starts interval, calls tick immediately, no-ops if disabled or already running
- **stop()**: clears interval, sets running=false
- **triggerTick()**: calls tick if running, no-ops if stopped
- **tick()**: queries tasks, respects concurrency limit, skips already-active tasks, auto-accepts pending tasks, executes accepted tasks
- **Auto-accept**: calls client.acceptTask, updates status, continues on failure
- **executeAndComplete**: calls executor.execute, calls completeTask, removes from activeTasks on completion
- **queryAssignedTasks**: fetches from REST, filters pending/accepted, returns empty on error
- **Error handling**: tick catches errors, accept failures skip task, execute failures logged

Target: ~18 tests.

### B2: intent-classifier.ts Tests

File: `openclaw/extensions/clawchain/src/intent-classifier.test.ts`

The `classifyIntent()` and `getRoutingHint()` functions (364 LOC) have zero test coverage. Tests needed:

- **Each intent type** (19 types): at least one phrase per type correctly classified
- **Parameter extraction**: amounts, addresses, skill names, descriptions
- **Unknown intent**: unrelated input returns type=unknown, confidence=0
- **Case insensitivity**: "SHIELD 100" same as "shield 100"
- **getRoutingHint()**: returns correct hint per type, empty for unknown

Target: ~28 tests.

### B3: Inference Intents

Add 4 new intent types to `intent-classifier.ts`:

| Intent | Patterns | Tool |
|--------|----------|------|
| `inference_submit` | "run inference", "query model", "ask model" | `clawchain_submit_inference` |
| `inference_status` | "inference status", "check inference", "job status" | `clawchain_inference_status` |
| `inference_providers` | "list providers", "who provides", "inference providers" | `clawchain_list_inference_providers` |
| `inference_register` | "register as provider", "become provider" | `clawchain_register_inference_provider` |

### B4: Live Integration Test

File: `openclaw/extensions/clawchain/src/clawchain.live.test.ts`

Tests the OpenRouter API key with a real completion call. Guards behind `OPENCLAW_LIVE_TEST=1` env var. Validates:
- OpenRouter connectivity and response parsing
- Model listing via OpenRouter API
- Streaming completion

## Phase A: Deployment Plan

The 9-step launch checklist from the PRD is the execution plan. All code is complete. Steps in order:

1. **Buy VPS** (Hetzner CPX41, 8 vCPU, 16GB RAM, ~€15/mo)
2. **Point DNS** (12 A records for clawchain.io subdomains)
3. **Deploy DEX contracts** on public chain
4. **Multi-validator testnet** (4 nodes)
5. **7-day soak test** completion (started March 11, should be done)
6. **Security audit** (external firm — Trail of Bits, Halborn, or Oak Security)
7. **MPC trusted setup ceremony** (3-5 participants)
8. **Mainnet genesis ceremony** (5-10 validators)
9. **Post-launch monitoring** (Grafana dashboards, AlertManager)

## Phase C: New Feature Candidates

Ranked by impact:

1. **OpenRouter inference bridge** — Register OpenRouter as an on-chain inference provider, allowing agents to buy/sell AI compute through the chain marketplace. Connects the agent LLM (OpenRouter) to the inference marketplace module.

2. **Agent-to-agent live demo** — Two agents on the same chain: Agent A delegates a task to Agent B, B executes it using OpenRouter inference, A verifies and pays. Full Install → Run → Earn loop.

3. **ClawHub production readiness** — Harden the skill marketplace for community publishing: validation, sandboxing, versioning, rating system.

4. **GPU provider onboarding automation** — `clawd gpu-provider setup` wizard that detects GPU hardware, configures the provider daemon, registers on-chain, and starts serving inference.

## Implementation Order

1. B1 + B2 (tests) — can run in parallel
2. B3 (inference intents) — depends on B2 for test patterns
3. B4 (live test) — independent
4. Phase A planning doc — independent
5. Phase C feature specs — after B completes

## Files Modified/Created

| Action | File |
|--------|------|
| CREATE | `openclaw/extensions/clawchain/src/agent-loop.test.ts` |
| CREATE | `openclaw/extensions/clawchain/src/intent-classifier.test.ts` |
| MODIFY | `openclaw/extensions/clawchain/src/intent-classifier.ts` |
| CREATE | `openclaw/extensions/clawchain/src/clawchain.live.test.ts` |
