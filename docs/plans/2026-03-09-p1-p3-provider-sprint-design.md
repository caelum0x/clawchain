# P1-P3 Provider Sprint Design

## Overview

Full sprint across three parallel workstreams to take ClawChain from "built" to "usable operator product." After fixing 3 build failures, parallel agents implement Provider Activation (P1), Earnings Loop (P2), and Supply-Side Expansion (P3).

## P0: Build Fixes (prerequisite)

| Fix | File | Issue |
|-----|------|-------|
| clawd dex.test.ts | `cmd/clawd/src/commands/__tests__/dex.test.ts` | TS2322 mock signature mismatch |
| OpenClaw exports | `openclaw/src/gateway/protocol/index.js` + `arbitrage-bot.ts` + `leaderboard-tools.ts` | Missing type exports, undefined SDK methods |
| Docs site MDX | `docs-site/docs/api/*.mdx` | Undefined template variables in static generation |

## P1: Provider Activation

**Goal:** `clawd up` takes a fresh machine to registered provider with one command.

**Files:**
- `cmd/clawd/src/commands/up.ts` — enhanced bootstrap flow
- `cmd/clawd/src/lib/bootstrap.ts` — new: key generation, wallet setup, faucet funding, on-chain registration
- `cmd/clawd/src/lib/setup-state.ts` — new: resumable setup state tracker
- `cmd/clawd/src/commands/__tests__/up.test.ts` — tests
- `cmd/clawd/src/lib/bootstrap.test.ts` — tests

**Flow:**
1. Check/create operator key (`~/.clawd/keys/`)
2. Derive chain address from key
3. Request testnet funds from faucet (if balance < threshold)
4. Register agent on-chain via `x/agent` MsgRegisterAgent
5. Start heartbeat loop
6. Start OpenClaw gateway with provider profile
7. Report readiness

**Resumability:** Each step writes progress to `~/.clawd/setup-state.json`. On restart, `clawd up` skips completed steps.

**Error handling:** Insufficient funds → retry faucet with backoff. Unreachable RPC → wait + retry. Already registered → skip registration. Partial setup → resume from last checkpoint.

## P2: Earnings Loop

**Goal:** Running providers autonomously discover, accept, execute, and complete tasks.

**Files:**
- `openclaw/extensions/clawchain/src/agent-loop.ts` — enhanced autonomous loop
- `openclaw/extensions/clawchain/src/task-executor.ts` — new: skill-mapped task execution
- `openclaw/extensions/clawchain/src/earnings-tracker.ts` — new: reward aggregation
- `cmd/clawd/src/commands/earnings.ts` — new: `clawd earnings` command
- `cmd/clawd/src/lib/profitability.ts` — new: profitability controls
- Tests for each new file

**Agent Loop Enhancement:**
1. Poll available tasks matching agent capabilities
2. Filter by profitability controls (min budget, capability match)
3. Auto-accept qualifying tasks
4. Execute via skill mapping (task type → OpenClaw skill/tool)
5. Submit checkpoints during execution
6. Complete task and claim reward
7. Update local earnings tracker

**Earnings Command:**
- `clawd earnings` — show mining + task + staking rewards
- `clawd earnings --period 7d` — time-windowed view
- `clawd earnings --json` — machine-readable output

**Profitability Controls:**
- `min_task_budget`: reject tasks below threshold
- `max_concurrent_tasks`: limit parallel execution (default 3)
- `capability_filter`: only accept tasks matching listed capabilities
- `auto_accept`: enable/disable autonomous acceptance

## P3: Supply-Side Expansion

**Goal:** One provider identity exposes multiple earning surfaces.

**Files:**
- `cmd/clawd/src/commands/skills.ts` — new: skill marketplace CLI
- `cmd/clawd/src/commands/gpu.ts` — new: GPU provider management
- `cmd/clawd/src/commands/models.ts` — new: model hosting CLI
- `cmd/clawd/src/commands/inventory.ts` — new: unified provider view
- `sdk/src/marketplace.ts` — new SDK methods for skill publishing
- `sdk/src/gpu.ts` — new SDK methods for GPU registration
- `sdk/src/models.ts` — new SDK methods for model hosting
- Tests for each new file

**Skills CLI:**
- `clawd skills publish --name "..." --price 100uclaw --category ai`
- `clawd skills list` — show published skills
- `clawd skills price --id <id> --price 200uclaw`
- `clawd skills delist --id <id>`
- `clawd skills sales` — show purchase history

**GPU CLI:**
- `clawd gpu register --vram 24 --cuda-cores 16384 --price 50uclaw/gb-hr`
- `clawd gpu status` — show current GPU utilization and leases
- `clawd gpu earnings` — show GPU compute income

**Models CLI:**
- `clawd models host --name "llama-3" --endpoint http://... --pricing per-query --price 10uclaw`
- `clawd models list` — show hosted models
- `clawd models pricing --id <id> --price 15uclaw`

**Inventory:**
- `clawd inventory` — unified view: tasks + skills + GPU + models with earnings per surface

## Architecture Decisions

- All new CLI commands follow existing Commander.js pattern in `cmd/clawd/src/commands/`
- SDK methods follow existing `ClawChainClient` pattern with typed responses
- Agent loop enhancements are additive to existing `agent-loop.ts` (198 LOC)
- Setup state uses JSON file, not database, matching existing `active_tasks.json` pattern
- All commands support `--json` output for automation

## Testing Strategy

- Unit tests for each new module (vitest)
- Integration-style tests using mocked chain responses
- Existing test patterns: mock `fetch`, mock `execSync`, assert CLI output
