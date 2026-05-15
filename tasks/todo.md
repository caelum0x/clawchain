# Task Plan

## GitHub Publish 2026-05-15

- [x] Inspect repository state, branch, and existing remotes before pushing.
- [x] Check untracked files for obvious secret-bearing artifacts that would be included by `git add -A`.
- [x] Add ignore rules for local validator keys, node keys, local e2e key material, and Kubernetes secret manifests.
- [x] Stage all safe tracked and untracked repository changes.
- [x] Exclude generated local chain database state from the staged publish set.
- [x] Record embedded Git repositories as explicit submodules instead of anonymous gitlinks.
- [x] Commit the staged changes.
- [x] Configure `origin` as `https://github.com/caelum0x/clawchain.git`.
- [ ] Push `main` to GitHub.

### Review

- Repository was already initialized on branch `main`; no `git init` needed.
- No remote was configured before this publish attempt.
- A raw `git add -A` would include local private validator/node keys and secret manifests, so those paths are ignored before staging.
- Staging showed generated local chain data under `testnet/data/`; this should stay local and out of the public source repository.
- Embedded repositories are retained as submodules with their origin URLs in `.gitmodules`.
- Local publish commit created as `2e4f5e5` before the first push retry.
- First push attempt failed with HTTP 408 before the remote `main` ref was created.

- [x] Correct scope: target the full `openclaw/` project, not only `extensions/clawchain/`.
- [x] Inspect current `openclaw/` changes and identify which parts already extend gateway/runtime/core surfaces.
- [x] Build a repo-level implementation plan based on actual integration points.
- [x] Wire chain gateway handlers into the central gateway handler registry.
- [x] Add chain methods to the public gateway method list and authorization scopes.
- [x] Extend focused tests for newly exposed chain wallet and chain agent methods.
- [x] Run focused gateway tests to verify dispatch, contracts, and handler behavior.
- [x] Expose the shared provider lifecycle contract through a dedicated machine-facing `clawd provider status` command.
- [x] Restore a clean `cmd/clawd` TypeScript baseline for the gateway/provider integration work.
- [x] Expose the shared provider lifecycle through the `clawd dashboard` pretty and JSON surfaces.

# Review

- Scope correction captured from user feedback on 2026-03-08.
- Current ClawChain work already spans `openclaw/src/gateway/server-methods/` and is not limited to `extensions/clawchain/`.
- `chain-agents.ts` and `chain-wallet.ts` exist as gateway handlers, but `openclaw/src/gateway/server-methods.ts` currently mounts only `chain-status`.
- `openclaw/src/gateway/server-methods-list.ts` and gateway authorization sets currently expose only `chain.status` and `runtime.status`; `chain.wallet.*` and `chain.agents.*` are missing from the formal gateway surface.
- Protocol schemas currently cover chain status/runtime status only; there is no equivalent formal contract coverage yet for the new wallet/agent gateway methods.
- Integrated `chain.agents.*` and `chain.wallet.*` into the main gateway dispatcher and public method list.
- Added gateway-level dispatch/auth coverage in `openclaw/src/gateway/server-methods/chain-gateway.integration.test.ts`.
- Updated fetch mocking in `openclaw/src/gateway/server-methods/chain-agents.test.ts` so focused handler tests reliably stub LCD requests in the current Vitest environment.
- Verified with `pnpm exec vitest run src/gateway/server-methods/chain-agents.test.ts src/gateway/server-methods/chain-status.test.ts src/gateway/server-methods/chain-gateway.integration.test.ts` from `openclaw/` with 26/26 tests passing.
- Added formal protocol schemas for `chain.agents.*` and `chain.wallet.*` params/results in `openclaw/src/gateway/protocol/schema/chain.ts`.
- Registered the new chain schemas in `openclaw/src/gateway/protocol/schema/protocol-schemas.ts` and exported their static types from `openclaw/src/gateway/protocol/schema/types.ts`.
- Extended `openclaw/src/gateway/protocol/schema/protocol-contract-registry.test.ts` to assert registry exposure and representative payload validation for the new chain contracts.
- Verified with `pnpm exec vitest run src/gateway/protocol/schema/protocol-contract-registry.test.ts src/gateway/server-methods/chain-agents.test.ts src/gateway/server-methods/chain-status.test.ts src/gateway/server-methods/chain-gateway.integration.test.ts` from `openclaw/` with 28/28 tests passing.
- Added WebSocket contract coverage for the non-status chain gateway surface in `openclaw/src/gateway/server-methods/chain-methods.ws-contract.test.ts`.
- Verified advertised method exposure and schema-valid dispatch for representative `chain.agents.*` and `chain.wallet.*` requests through `handleGatewayRequest`.
- Verified with `pnpm exec vitest run src/gateway/protocol/schema/protocol-contract-registry.test.ts src/gateway/server-methods/chain-status.ws-contract.test.ts src/gateway/server-methods/chain-methods.ws-contract.test.ts` from `openclaw/` with 7/7 tests passing.
- Added typed client-side chain helpers on `openclaw/src/gateway/client.ts` for `chain.status`, `runtime.status`, `chain.agents.*`, and `chain.wallet.*`, all backed by the existing `request()` transport.
- Added focused wrapper coverage in `openclaw/src/gateway/client.test.ts` to assert each helper maps to the correct gateway method name and params payload.
- Verified with `pnpm exec vitest run src/gateway/client.test.ts src/gateway/server-methods/chain-gateway.integration.test.ts src/gateway/server-methods/chain-methods.ws-contract.test.ts src/gateway/protocol/schema/protocol-contract-registry.test.ts` from `openclaw/` with 12/12 tests passing.
- Added typed one-shot chain call wrappers in `openclaw/src/gateway/call.ts` via `callGatewayChain`, covering `chain.status`, `runtime.status`, `chain.agents.*`, and `chain.wallet.*`.
- Extended `openclaw/src/gateway/call.test.ts` so the wrapper layer is verified against the exact underlying gateway method names and params payloads.
- Verified with `pnpm exec vitest run src/gateway/call.test.ts src/gateway/client.test.ts src/gateway/server-methods/chain-gateway.integration.test.ts src/gateway/server-methods/chain-methods.ws-contract.test.ts src/gateway/protocol/schema/protocol-contract-registry.test.ts` from `openclaw/` with 34/34 tests passing.

## OpenClaw -> clawd Analysis

- `openclaw/` is still structurally an upstream personal-assistant runtime: branding, onboarding, docs, command examples, and state-directory defaults are centered on `openclaw`, not the `clawd` operator product.
- `clawd` already acts as the real product orchestrator: `cmd/clawd/src/commands/up.ts` owns init/join/start/readiness, and `openclaw/src/cli/up-cli.ts` delegates back to `clawd up`.
- `cmd/clawd/src/commands/start.ts` productizes OpenClaw mainly by env injection (`BLOCKCHAIN_*`) plus sidecars (faucet, messaging, autonomous loop, task recovery), but it still launches a generic `openclaw gateway run` process rather than a dedicated ClawChain runtime profile.
- The strongest current integration seam is the gateway contract surface in `openclaw/src/gateway/`; chain status/wallet/agent methods now exist and are typed end to end, which is the right foundation for moving operator UX out of ad hoc REST fetches.
- The highest-value remaining work is not “add OpenClaw,” but “replace generic OpenClaw product assumptions with ClawChain operator assumptions” in startup, profile/config generation, readiness/doctor, and selected user-facing workflows.

## Recommended Next Development Order

- 1. Runtime profile ownership: make `clawd` generate/manage a dedicated OpenClaw runtime profile/state layout instead of relying on generic `openclaw` defaults and upstream copy.
- 2. Product-specific gateway API adoption: migrate `clawd` readiness/status/doctor/dashboard codepaths to consume the typed gateway chain methods where possible, reducing split-brain logic between direct REST probing and gateway state.
- 3. Branding and operator UX: replace upstream `openclaw`-specific help text, docs links, state-dir assumptions, and onboarding wording in the delegated `clawd` path.
- 4. Autonomous operator flow hardening: connect the autonomous loop, task recovery, skill execution mapping, and agent bootstrap into one observable runtime contract with evidence in `doctor`/`readiness`.
- 5. Real caller migration: update one or two actual CLI/TUI/operator flows to use the new typed gateway client and `callGatewayChain` wrappers so the new surface is exercised in production code paths.

## First Productization Step Completed

- `clawd start` now takes ownership of the OpenClaw runtime profile and mutable state dir by exporting `OPENCLAW_PROFILE`, `OPENCLAW_STATE_DIR`, and `OPENCLAW_HOME` from `cmd/clawd/src/commands/start.ts`.
- The owned runtime location is defined centrally in `cmd/clawd/src/lib/paths.ts` under `~/.clawd/openclaw` by default, instead of implicitly falling back to upstream `~/.openclaw`.
- SOUL/workspace bootstrap in `cmd/clawd/src/commands/start.ts` now uses the same clawd-owned OpenClaw state location for consistency.
- Verified with `pnpm exec vitest run src/commands/__tests__/start.test.ts` from `cmd/clawd/` with 5/5 tests passing.

## Gateway Contract Adoption Step Completed

- Added `cmd/clawd/src/lib/openclaw-gateway.ts` as a pragmatic bridge that queries `openclaw gateway call runtime.status --json`, giving `clawd` access to the gateway runtime contract without re-implementing auth/WS transport.
- `cmd/clawd/src/commands/status.ts` now prefers gateway `runtime.status` for runtime/operator visibility and falls back to legacy HTTP probing only when the gateway RPC bridge is unavailable.
- `cmd/clawd/src/commands/doctor.ts` now prefers gateway `runtime.status` for the Gateway check, which reduces split-brain diagnostics between direct HTTP health checks and the gateway’s own readiness model.
- Added/updated focused coverage in `cmd/clawd/src/commands/__tests__/status.test.ts` and `cmd/clawd/src/commands/__tests__/doctor.test.ts` for the runtime-status path.
- Verified with `pnpm exec vitest run src/commands/__tests__/status.test.ts src/commands/__tests__/doctor.test.ts src/commands/__tests__/start.test.ts` from `cmd/clawd/` with 20/20 tests passing.

## Ecosystem Plan

### Product Thesis

- `openclaw` is the user-facing runtime people install first, locally or on a server.
- `clawd` is the operator/product shell that turns an `openclaw` install into a ClawChain node provider.
- ClawChain is the economic/network substrate where those operators register, discover work, execute tasks, and earn.
- The simple user story is: install OpenClaw, connect your channels/models/devices, opt into ClawChain provider mode, then earn through uptime, tasks, skills, compute, and staking.

### Product Architecture

- Distribution layer: `openclaw` remains the easiest install surface and daily runtime.
- Operator layer: `clawd` owns bootstrap, node lifecycle, readiness, diagnostics, chain CLI, and provider economics.
- Runtime layer: `openclaw` gateway + agent runtime + channel integrations + device apps.
- Network layer: ClawChain modules (`x/agent`, `x/marketplace`, `x/reputation`, `x/privacy`, `x/messaging`, `x/modelregistry`, `x/governance`).
- Ecosystem layer: web dashboard, wallets, SDK, GPU providers, model hosts, skills marketplace, nodecards/manifests.

### Core User Journeys

- Personal assistant only:
  Install `openclaw`, run locally, use channels/tools/models, no chain participation required.
- Operator/provider:
  Install `openclaw`, run `clawd up`, automatically provision chain identity + runtime profile + provider services, register on-chain, become discoverable, start heartbeating and earning.
- Remote/server operator:
  Install `openclaw` on VPS/mac mini/home server, expose gateway safely, run `clawd up --require-ready`, monitor via `clawd status/readiness/doctor/dashboard`.
- Advanced provider:
  Add GPU/model hosting/skills, publish marketplace inventory, run autonomous task loop, earn from multiple revenue streams.

### Program Structure

- Track A: Unified install and onboarding
  Goal: one coherent install story where `openclaw` onboarding can graduate a user into `clawd` provider mode.
  Deliverables:
  `openclaw` onboarding copy/flows for ClawChain provider opt-in
  `clawd up` first-run bootstrap with owned runtime profile/state
  provider-mode config templates and operator docs

- Track B: Runtime specialization
  Goal: make `openclaw` run in a ClawChain-native operator profile instead of as a generic personal assistant.
  Deliverables:
  clawd-owned OpenClaw profile/state/config
  ClawChain-specific gateway/runtime defaults
  unified branding/help/docs in delegated `openclaw -> clawd` flows

- Track C: Gateway contract as system boundary
  Goal: use the `openclaw` gateway as the canonical runtime control plane for `clawd`, web, apps, and operators.
  Deliverables:
  typed `chain.*` gateway methods
  `clawd` adoption of gateway runtime/chain contracts in status/readiness/doctor/dashboard
  stable protocol docs and compatibility policy

- Track D: Provider economics and automation
  Goal: convert a running OpenClaw node into an economically useful chain participant.
  Deliverables:
  auto register + heartbeat + recovery
  autonomous task accept/complete loop
  skill execution mapping and profitability policy
  marketplace/GPU/model-hosting hooks

- Track E: Operator trust and reliability
  Goal: make provider mode safe enough for real operators.
  Deliverables:
  readiness gates, doctor remediation, incident mode, recovery logs
  runtime evidence and auditability
  reproducible local/VPS/mac mini deployment profiles

- Track F: Ecosystem surfaces
  Goal: make the broader ClawChain ecosystem visible and usable around the runtime.
  Deliverables:
  web dashboard tied to runtime and chain state
  wallet integration
  SDK examples
  nodecard/manifest/discovery flows

### Recommended Build Order

- Phase 1: Identity and ownership
  Make `clawd` own OpenClaw profile/state/config/layout everywhere.
- Phase 2: Operator truth model
  Migrate `clawd` status/readiness/doctor/dashboard to gateway runtime + chain contracts.
- Phase 3: Onboarding convergence
  Add provider-mode onboarding from `openclaw` into `clawd up`.
- Phase 4: Autonomous provider loop
  Harden task recovery, auto-register, auto-heartbeat, auto-accept/complete, skill execution, profitability controls.
- Phase 5: Marketplace/provider monetization
  Tie skills, GPU, model hosting, and reputation into one operator flow.
- Phase 6: Ecosystem polish
  Web/wallet/docs/operator guides/release packaging around the unified story.

### Near-Term Execution Plan

- 1. Finish gateway-contract adoption inside `clawd`
  Migrate `readiness.ts` and then `dashboard.ts` to gateway runtime/chain contracts.
- 2. Define provider-mode OpenClaw config generation
  Have `clawd up` materialize a dedicated OpenClaw config/profile with ClawChain defaults.
- 3. Replace upstream-facing UX in delegated flows
  Remove generic OpenClaw docs/help assumptions from `clawd`-owned operator paths.
- 4. Build provider onboarding path
  Add an explicit “become a node provider” flow from the OpenClaw side.
- 5. Exercise real callers
  Move selected CLI/TUI/web codepaths onto the typed chain gateway wrappers already added.

## Execution Roadmap

### P0 Foundation: Product Boundary and Runtime Ownership

- Goal:
  Make `clawd` the clear operator shell and make `openclaw` the installable runtime inside the ClawChain ecosystem.
- Repos:
  `openclaw/`, `cmd/clawd/`, `sdk/`, top-level docs/release scripts.
- Deliverables:
  `clawd`-owned OpenClaw profile, state, and config generation everywhere
  delegated `openclaw` flows that point to provider activation through `clawd`
  canonical gateway contract for runtime and chain control paths
  one install story in docs and packaging
- Exit criteria:
  a user can install `openclaw`, then activate provider mode without manually wiring state dirs, env vars, or chain endpoints
  `clawd status`, `doctor`, and `readiness` report against the same runtime truth source
  docs describe one coherent `Install -> Run -> Earn` story
- Dependencies:
  existing gateway work in `openclaw/src/gateway/`
  current `clawd start/up/status/doctor/readiness` command surfaces
- Risks:
  split-brain state between generic OpenClaw defaults and `clawd`-owned config
  duplicated health logic across direct HTTP and gateway RPC

### P1 Provider Activation: Install to Registered Node Provider

- Goal:
  Turn provider activation into a reliable first-run flow instead of a collection of operator steps.
- Repos:
  `cmd/clawd/`, `openclaw/`, `cosmos-sdk/`, `sdk/`.
- Deliverables:
  `clawd up` bootstrap that creates identity, wallet linkage, OpenClaw provider profile, and on-chain agent/provider registration
  automatic heartbeat/liveness wiring against `x/agent`
  remediation paths for missing funds, unreachable RPC, invalid config, and partial setup
  provider-mode onboarding entry points inside `openclaw`
- Exit criteria:
  a fresh machine can move from install to registered provider with one primary command
  partial failures are resumable rather than requiring manual cleanup
  provider state is inspectable through CLI and gateway methods
- Dependencies:
  gateway chain methods
  chain registration/heartbeat semantics in `x/agent`
  wallet/key management conventions
- Risks:
  brittle first-run bootstrap
  unclear separation between local-only users and provider-mode users

### P2 Earnings Loop: Autonomous Work, Rewards, and Recovery

- Goal:
  Make a running provider economically useful without constant operator intervention.
- Repos:
  `cmd/clawd/`, `openclaw/extensions/clawchain/`, `sdk/`, `cosmos-sdk/x/agent`, `cosmos-sdk/x/reputation`.
- Deliverables:
  autonomous task discovery, accept, execute, and completion loop
  reward visibility for mining, task income, and staking
  profitability controls, wallet guardrails, and task checkpoint recovery
  runtime evidence for completed work, uptime, and failures
- Exit criteria:
  providers can leave the node running and reliably participate in tasks
  operator can see why income was or was not earned
  crash/restart paths recover active work safely
- Dependencies:
  provider activation flow
  gateway and extension task APIs
  reputation and reward accounting from chain modules
- Risks:
  unsafe autonomous spend behavior
  hidden failure modes in task execution and recovery

### P3 Supply-Side Expansion: Skills, GPU, and Model Hosting

- Goal:
  Expand provider revenue beyond basic task execution into marketplace inventory.
- Repos:
  `openclaw/`, `dantegpu-core/`, `sdk/`, `cosmos-sdk/x/marketplace`, `cosmos-sdk/x/modelregistry`, `web/`.
- Deliverables:
  skill publishing and pricing flows
  GPU provider registration and lease visibility tied to chain identity
  model-host registration and paid access flows
  unified provider inventory view across tasks, skills, GPU, and models
- Exit criteria:
  one provider identity can expose multiple earning surfaces
  marketplace inventory is visible on-chain and in operator tools
  operators can understand utilization and revenue by surface
- Dependencies:
  working provider identity and gateway/runtime control plane
  marketplace and model registry module maturity
  DanteGPU payment and provider integration points
- Risks:
  fragmented operator UX across multiple monetization systems
  off-chain/on-chain state drift for GPU and hosted models

### P4 Ecosystem Surfaces: Dashboard, Wallets, SDK, Discovery

- Goal:
  Make the broader ecosystem usable for operators, developers, and buyers.
- Repos:
  `web/`, `sdk/`, `keplr-wallet/`, `claw-wallet-mobile/`, `keplr-chain-registry/`, `openclaw/`.
- Deliverables:
  dashboard for runtime health, provider status, tasks, rewards, and inventory
  wallet flows for provider identity, rewards, staking, and marketplace payments
  SDK examples for provider automation and third-party integrations
  provider/nodecard/discovery flows for finding agents and capabilities
- Exit criteria:
  operator can manage the business from web + wallet + CLI without raw chain tooling
  developers can integrate through stable SDK and gateway contracts
  discovery surfaces expose trustworthy provider metadata
- Dependencies:
  stable provider and earnings loop
  typed contracts already established in `openclaw`
  chain registry and wallet support for target networks
- Risks:
  UI surfaces diverge from actual gateway/runtime truth
  SDK examples fall behind protocol changes

### P5 Mainnet-Grade Operations: Trust, Safety, and Release Discipline

- Goal:
  Make the ecosystem safe and operable at real network scale.
- Repos:
  `cmd/clawd/`, `openclaw/`, `testnet/`, `cosmos-sdk/`, CI/release tooling, infra docs.
- Deliverables:
  release channels and compatibility rules between `openclaw`, `clawd`, SDK, and chain versions
  incident-oriented `doctor` and recovery tooling
  observability pack for local, VPS, and validator deployments
  testnet/mainnet deployment guides and upgrade playbooks
- Exit criteria:
  operators can upgrade and recover without guesswork
  compatibility expectations are explicit across the stack
  testnet reproduces the real provider lifecycle closely enough to catch regressions early
- Dependencies:
  all earlier phases
  monitoring/alerting baseline in `testnet/`
- Risks:
  version skew across runtime, CLI, SDK, and chain
  operational burden too high for small operators

### Cross-Repo Ownership Map

- `openclaw/`
  install surface, runtime UX, gateway control plane, skills/tools, provider-mode entry points
- `cmd/clawd/`
  bootstrap, lifecycle, diagnostics, readiness, operator automation, owned runtime profile
- `cosmos-sdk/`
  provider economics, registration, tasks, reputation, marketplace, model hosting, governance
- `sdk/`
  typed client/agent integration layer shared by runtime, web, and third-party developers
- `web/`
  operator dashboard and ecosystem visibility
- `dantegpu-core/`
  GPU monetization path and off-chain provider services
- `keplr-wallet/`, `claw-wallet-mobile/`
  identity, rewards, payments, staking, consumer/operator wallet UX

### Recommended Sequencing for Active Development

- 1. Finish P0
  Complete `clawd` adoption of gateway truth in `readiness` and any remaining diagnostics/dashboard surfaces.
- 2. Start P1 immediately after P0
  Make provider activation resumable and explicit from both `clawd up` and OpenClaw onboarding.
- 3. Build P2 before expanding surfaces
  The earning loop must work before investing heavily in dashboard and marketplace polish.
- 4. Develop P3 and P4 in parallel once P2 is stable
  Monetization and ecosystem UX can then share the same provider/runtime contracts.
- 5. Treat P5 as continuous hardening
  Start the compatibility and observability work early, but complete it only after the provider flow is real.

### Immediate Next Build Tickets

- [x] Migrate `cmd/clawd/src/lib/readiness.ts` onto gateway runtime and chain methods.
- [x] Audit `cmd/clawd` for remaining direct REST probes that should be replaced by typed gateway calls.
- [x] Define the generated provider-mode OpenClaw config/profile shape that `clawd up` materializes on first run.
- [x] Add an explicit OpenClaw-side provider activation UX that routes users into `clawd up`.
- [x] Define the minimum provider lifecycle contract for registration, heartbeat, task recovery, and reward visibility.

## Roadmap Progress Review

- `cmd/clawd/src/lib/readiness.ts` now prefers `openclaw` gateway contracts instead of re-probing everything directly:
  `runtime.status` is now used for gateway availability, messaging readiness, and peer health; `chain.agents.info` is now used for agent registration and heartbeat presence when available.
- The previous direct REST/HTTP checks remain as fallback paths, so readiness still works if the gateway bridge is unavailable during bootstrap or recovery.
- Added focused coverage in `cmd/clawd/src/lib/readiness.test.ts` for both the preferred gateway-contract path and the fallback direct-probe path.
- Verified with `pnpm exec vitest run src/lib/readiness.test.ts src/commands/__tests__/readiness.test.ts src/commands/__tests__/status.test.ts src/commands/__tests__/doctor.test.ts` from `cmd/clawd/` with 25/25 tests passing.
- Audited the remaining `cmd/clawd` fetch surfaces and split them into two groups:
  gateway/runtime-control callers that should migrate to typed gateway contracts, and direct chain query surfaces that remain appropriate as raw REST/RPC calls.
- Migrated `cmd/clawd/src/commands/agent.ts` task lookup to prefer `chain.agents.tasks`, with the old REST task endpoints retained as fallback.
- Migrated `cmd/clawd/src/commands/dashboard.ts` to prefer `chain.agents.list` for provider count and `runtime.status` for chain liveness/height fallback, while leaving broader network/economics data on direct REST queries.
- Verified with `pnpm exec vitest run src/commands/__tests__/agent.test.ts src/commands/__tests__/dashboard.test.ts src/lib/readiness.test.ts src/commands/__tests__/readiness.test.ts src/commands/__tests__/status.test.ts src/commands/__tests__/doctor.test.ts` from `cmd/clawd/` with 44/44 tests passing.
- `clawd start` now materializes a provider-mode OpenClaw profile file at the canonical clawd-owned path `~/.clawd/openclaw/openclaw.json` (or the overridden `OPENCLAW_STATE_DIR` equivalent) before launching the gateway.
- Added `cmd/clawd/src/lib/openclaw-provider-profile.ts` to merge provider-owned `gateway` and `blockchain` defaults into any existing OpenClaw config without overwriting unrelated user settings such as channels, auth, or model config.
- The generated profile explicitly owns:
  `gateway.mode=local`, `gateway.bind=loopback`, `gateway.reload.mode=hybrid`, and the `blockchain` provider settings for RPC/REST, denom/prefix/gas price, auto-register, node/faucet/peers, heartbeat, and autonomous-loop defaults.
- `cmd/clawd/src/commands/start.ts` now exports `OPENCLAW_CONFIG_PATH` alongside the existing profile/state env vars and logs whether the provider profile was materialized or reused.
- Added focused coverage in `cmd/clawd/src/lib/openclaw-provider-profile.test.ts` and extended `cmd/clawd/src/commands/__tests__/start.test.ts` to verify profile materialization through the launch path.
- Fixed the `cmd/clawd/src/commands/start.ts` cleanup path so shutdown no longer assumes every sidecar mock exposes a `stop()` method, removing the recurring Vitest unhandled-rejection noise.
- Verified with `pnpm exec vitest run src/lib/openclaw-provider-profile.test.ts src/commands/__tests__/start.test.ts src/lib/readiness.test.ts src/commands/__tests__/status.test.ts src/commands/__tests__/doctor.test.ts src/commands/__tests__/agent.test.ts src/commands/__tests__/dashboard.test.ts` from `cmd/clawd/` with 45/45 tests passing.
- Added an explicit OpenClaw-side provider activation UX in `openclaw/src/cli/provider-cli.ts`:
  `openclaw provider enable` now exists as a dedicated entry point for turning a local OpenClaw runtime into a ClawChain provider.
- The new command reuses the same delegated `clawd up` path as `openclaw up`, but with clearer provider-mode wording, examples, and help text so users do not need to infer that “up” means “become a provider”.
- Registered the new surface in `openclaw/src/cli/program/register.subclis.ts`, so `provider` appears as a normal top-level OpenClaw command in the lazy subcommand registry.
- Added focused coverage in `openclaw/src/cli/provider-cli.test.ts` and `openclaw/src/cli/program/register.subclis.provider.test.ts`.
- Verified with `pnpm exec vitest run src/cli/provider-cli.test.ts src/cli/program/register.subclis.provider.test.ts` from `openclaw/` with 4/4 tests passing.
- Added `cmd/clawd/src/lib/provider-lifecycle.ts` as the shared minimum provider lifecycle contract for the operator surface.
- The contract now evaluates and reports four provider-critical dimensions in one place:
  registration, heartbeat, task recovery, and reward visibility.
- Registration and heartbeat prefer gateway contracts (`chain.agents.info`, `runtime.status`) and fall back to REST only when the gateway path is unavailable.
- Task recovery uses the existing local crash-recovery tracker and reconciliation logic (`active_tasks.json` + `determineRecoveryAction`) to surface whether tracked tasks would resume or be cleaned up.
- Reward visibility currently combines agent rewards from the chain REST surface with staking rewards from `chain.wallet.staking.rewards` when available.
- `cmd/clawd/src/commands/status.ts` now prints a dedicated `Provider Lifecycle` section so operators can see the minimum provider contract state in a single command instead of piecing it together across `agent`, `staking`, `readiness`, and startup logs.
- `cmd/clawd/src/commands/doctor.ts` now includes the same shared provider lifecycle contract in both JSON and terminal output, so `status` and `doctor` no longer describe provider health using different models.
- Added focused coverage in `cmd/clawd/src/lib/provider-lifecycle.test.ts` and extended `cmd/clawd/src/commands/__tests__/status.test.ts`.
- Extended `cmd/clawd/src/commands/__tests__/doctor.test.ts` to assert the shared provider lifecycle section and JSON field.
- Verified with `pnpm exec vitest run src/lib/provider-lifecycle.test.ts src/commands/__tests__/status.test.ts src/commands/__tests__/doctor.test.ts src/lib/readiness.test.ts src/commands/__tests__/agent.test.ts src/commands/__tests__/dashboard.test.ts src/commands/__tests__/start.test.ts` from `cmd/clawd/` with 46/46 tests passing.
- Added a dedicated provider-machine surface in `cmd/clawd/src/commands/provider.ts`, exposed as `clawd provider status --out pretty|json`.
- The new command reuses `evaluateProviderLifecycle()` directly, so automation and future dashboard/API callers can consume the same provider truth model without scraping `status` or `doctor`.
- Added focused coverage in `cmd/clawd/src/commands/__tests__/provider.test.ts` for pretty output, JSON output, and degraded/blocker rendering.
- Verified with `pnpm exec vitest run src/commands/__tests__/provider.test.ts src/commands/__tests__/status.test.ts src/commands/__tests__/doctor.test.ts` from `cmd/clawd/` with 20/20 tests passing.
- Fixed the pre-existing `cmd/clawd` compile failures around gateway/provider integration by widening overly narrow Vitest mock signatures in the affected tests and correcting boolean narrowing in `cmd/clawd/src/lib/readiness.ts`.
- Verified with `pnpm exec vitest run src/commands/__tests__/agent.test.ts src/commands/__tests__/dashboard.test.ts src/commands/__tests__/doctor.test.ts src/commands/__tests__/status.test.ts src/commands/__tests__/start.test.ts src/lib/provider-lifecycle.test.ts src/lib/readiness.test.ts` from `cmd/clawd/` with 46/46 tests passing.
- Verified with `pnpm exec tsc -p tsconfig.json --noEmit` from `cmd/clawd/`, now passing cleanly.
- Extended `cmd/clawd/src/commands/dashboard.ts` so the dashboard now includes the shared local provider lifecycle contract in both terminal and JSON output.
- Added dashboard coverage for provider lifecycle rendering, JSON exposure, and degraded/blocker display in `cmd/clawd/src/commands/__tests__/dashboard.test.ts`.
- Verified with `pnpm exec vitest run src/commands/__tests__/dashboard.test.ts` from `cmd/clawd/` with 11/11 tests passing.
- Re-verified with `pnpm exec tsc -p tsconfig.json --noEmit` from `cmd/clawd/`, still passing cleanly.
