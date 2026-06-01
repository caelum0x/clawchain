# Task Plan

## AI Model Token Real OpenRouter Models 2026-06-01

- [x] Verify current OpenRouter model IDs for Claude Opus 4.8 and Qwen3.7 Max.
- [x] Add real `clawd model-token catalog` presets for `anthropic/claude-opus-4.8` and `qwen/qwen3.7-max`.
- [x] Let `clawd model-token issue --preset <id>` register modelregistry metadata with `openrouter:<model-id>` storage URIs.
- [x] Add a reusable testnet workflow that verifies OpenRouter's public model list and issues both real model tokens on-chain.
- [x] Live-verify both real model tokens on a fresh 4-validator local testnet.

### Review

- OpenRouter public models endpoint returned both `anthropic/claude-opus-4.8` and `qwen/qwen3.7-max` as present.
- Added `MODEL_TOKEN_PRESETS` for Claude Opus 4.8 and Qwen3.7 Max with real OpenRouter IDs, token symbols, tags, context size, release metadata, and price metadata.
- Added `clawd model-token catalog` and `clawd model-token issue --preset <id>` so operators can issue real model-backed tokenfactory denoms without manually copying metadata.
- Added `scripts/testnet/model-token-real-models.sh` to verify OpenRouter's public model list, fund an issuer, issue both presets, and assert modelregistry contains `openrouter:anthropic/claude-opus-4.8` and `openrouter:qwen/qwen3.7-max`.
- Live workflow passed on local 4-validator testnet. Claude denom: `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/claude_opus_4_8`; Qwen denom: `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/qwen3_7_max`.
- Live tx evidence: fund `1BE6FDD52191755BEA747118339A9CCBBE6597ED7410C190CB3F5521E9447BD4`, Claude issue `91F431355034EF63DE51CFA9A65115A3184BE08DA2FE86146A23D7E97E07E733`, Qwen issue `F168F2398AC3EB58F78F5AE6F8A246ABC2351F7D4FA773F9F236C99F127C4F78`.
- `OPENROUTER_API_KEY` was not present locally, so paid completion smoke testing through OpenRouter was skipped; the public model-list verification and on-chain model registrations were completed.

## AI Model Token Provider Serve Loop 2026-06-01

- [x] Inspect the current `serve-once` provider automation and live holder workflow.
- [x] Add `clawd model-token serve-loop` for repeated provider job serving.
- [x] Support bounded loop controls for workflows/tests and unbounded operator mode for long-running providers.
- [x] Update the holder-redemption workflow to exercise `serve-loop --max-cycles 1`.
- [x] Verify focused tests, CLI build/help, shell syntax, and live 4-validator workflow.

### Review

- Added `runModelTokenServeLoop`, reusing the proven `serve-once` path with `--interval-ms` and `--max-cycles`; `--max-cycles 0` runs until stopped.
- Wired `clawd model-token serve-loop` with the same model/status/output/OpenRouter controls as `serve-once`, plus loop controls.
- Added tests for two bounded loop cycles and invalid loop controls.
- Updated `scripts/testnet/model-token-holder-redeem.sh` to use `serve-loop --max-cycles 1 --interval-ms 0`, so the live workflow proves the supervised loop entry point.
- Live workflow passed on local 4-validator testnet with model `holder-redeem-1780272590`, model ID `1`, denom `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/holder_redeem_1780272590`, job `1`, and final status `completed`.
- Live tx evidence: issue `783864C479AEA32DDB8DEA7088C0BF6E8AF2FD0833D038E0FC451C2E4B86D91F`, setup `57C45282EA5AE7E57A31E0BA1466818F1522E623EF52AB7347D6432F9C7DCA9F`, transfer `F1A5BE7DC86E65912FE8D10EB68532A8B9D23F207406182F3B292BBBBEF2E73D`, redeem `08780A8AB017CC6B7F0581E2F758C366126AD630B7C81A95E9B9460B9F401740`, start `8EBAC54E6A42B920E26637F9117328FBA1A73DF57827C4452E9084162127D9C3`, complete `CAB3F55D61C06A7D00A763E1BF10D95F80687206ADAC5154583099E3E90B2F06`.
- Verified `cd cmd/clawd && npm test -- --run src/commands/__tests__/model-token.test.ts` (22 passed / 0 failed), `cd cmd/clawd && npm run build`, `node cmd/clawd/dist/main.js model-token serve-loop --help`, and `bash -n scripts/testnet/model-token-holder-redeem.sh`.

## AI Model Token Provider Serve Once 2026-06-01

- [x] Inspect modelregistry inference-job query filters and current `clawd` provider lifecycle commands.
- [x] Add `clawd model-token serve-once` to query assigned jobs and automatically start/complete them.
- [x] Add optional OpenRouter-backed execution path behind `--openrouter-model` and `OPENROUTER_API_KEY`.
- [x] Update the holder-redemption workflow to use `serve-once` instead of separate manual start/complete commands.
- [x] Verify focused tests, TypeScript build, help output, shell syntax, and live 4-validator workflow.

### Review

- `serve-once` queries `/clawchain/modelregistry/v1/inference/jobs`, filters jobs assigned to the provider wallet, and serves `pending`/`running` jobs by default.
- Pending jobs are started with `MsgStartInferenceJob`; pending or running jobs are completed with `MsgCompleteInferenceJob`.
- The command supports `--model-id`, `--status`, `--max-jobs`, `--output` templates, `--dry-run`, JSON output, and `--openrouter-model` for real OpenRouter execution when `OPENROUTER_API_KEY` is present.
- Updated `scripts/testnet/model-token-holder-redeem.sh` so the live workflow now proves the automated provider path: holder redeem creates a job, owner/provider runs `serve-once`, and the final queried job status must be `completed`.
- Live workflow passed on local 4-validator testnet with model `holder-redeem-1780272325`, model ID `1`, denom `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/holder_redeem_1780272325`, job `1`, and final status `completed`.
- Live tx evidence: issue `C0126559852D43898171AE8636A6293148737CE74244C61B806BA8CB9141E3FE`, setup `57C45282EA5AE7E57A31E0BA1466818F1522E623EF52AB7347D6432F9C7DCA9F`, transfer `F4DC527CF6AA550CD3E20F9D47B62CCE06179AE0C15B917069BF9536F231ED45`, redeem `69C0BA484F224721D70B127F214A05B281D392D92E8C6ACEC6F311B80B7DEC25`, start `8EBAC54E6A42B920E26637F9117328FBA1A73DF57827C4452E9084162127D9C3`, complete `CAB3F55D61C06A7D00A763E1BF10D95F80687206ADAC5154583099E3E90B2F06`.
- Verified `cd cmd/clawd && npm test -- --run src/commands/__tests__/model-token.test.ts` (20 passed / 0 failed), `cd cmd/clawd && npm run build`, `node cmd/clawd/dist/main.js model-token serve-once --help`, and `bash -n scripts/testnet/model-token-holder-redeem.sh`.

## AI Model Token P1 Provider Completion 2026-06-01

- [x] Inspect modelregistry provider job lifecycle message shapes.
- [x] Add `clawd model-token start-job` and `clawd model-token complete-job`.
- [x] Cover provider lifecycle builders, transaction sequencing, JSON output, and explicit fee handling in CLI tests.
- [x] Extend the holder-redemption workflow through provider start/complete and final completed job status.
- [x] Live-verify the completed holder redemption workflow on a fresh 4-validator local testnet.

### Review

- Added `/clawchain.modelregistry.v1.MsgStartInferenceJob` and `/clawchain.modelregistry.v1.MsgCompleteInferenceJob` builders plus CLI runners.
- Provider lifecycle transactions now use an explicit 200,000 gas fee calculated from configured gas price after live acceptance exposed CosmJS auto-gas under-estimation for `start-job`.
- Extended `scripts/testnet/model-token-holder-redeem.sh` so the owner/provider starts and completes the holder-created job, queries final job state, and fails unless `job.status == completed`.
- Live workflow passed on local 4-validator testnet with model `holder-redeem-1780271955`, model ID `1`, denom `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/holder_redeem_1780271955`, holder `claw19rl4cm2hmr8afy4kldpxz3fka4jguq0akhr68a`, job `1`, and final status `completed`.
- Live tx evidence: issue `B7E5BB90EF4929089A8E8DE52F0DF69B682AA2EA9A0913F073D60360E2B6BDD7`, setup `57C45282EA5AE7E57A31E0BA1466818F1522E623EF52AB7347D6432F9C7DCA9F`, transfer `C778E6A53294EAA04132C499D8F2813C6B68E6BAC908E467451DC595F181FB57`, redeem `656CA5A305396250D26E0F6BC8804D1BA505526E6BDE09404A81DB3F701E624C`, start `8EBAC54E6A42B920E26637F9117328FBA1A73DF57827C4452E9084162127D9C3`, complete `60BA192A1CE5297657BD53B3D999D88C68C16A49FD90786D33C66606A9F8F352`.
- Verified `cd cmd/clawd && npm test -- --run src/commands/__tests__/model-token.test.ts` (18 passed / 0 failed), `cd cmd/clawd && npm run build`, `cd cmd/clawd && npm test` (655 passed / 0 failed), `go test -count=1 ./x/modelregistry/... ./x/tokenfactory/...`, `go build -o build/clawchaind ./cmd/clawchaind/`, `bash -n scripts/testnet/model-token-holder-redeem.sh`, `node cmd/clawd/dist/main.js model-token start-job --help`, and `node cmd/clawd/dist/main.js model-token complete-job --help`.

## AI Model Token P1 Redeem CLI 2026-06-01

- [x] Inspect modelregistry inference-job and tokenfactory burn message shapes.
- [x] Add `clawd model-token redeem` to burn model tokens and submit an inference job.
- [x] Add focused tests for redeem message construction, sequencing, JSON output, and validation.
- [x] Verify TypeScript build/tests and update the AI model-token plan with P1 slice status.
- [x] Add tokenfactory holder self-burn support so non-admin holders can redeem their own model tokens.
- [x] Verify tokenfactory holder self-burn with focused Go tests and update docs.
- [x] Add inference setup CLI support for model pricing/provider readiness.
- [x] Add and live-verify a reusable holder-redemption testnet workflow.

### Review

- `MsgSubmitInferenceJob` uses `requester`, `model_id`, `model_version`, `input`, `max_tokens`, `temperature`, and `payment`.
- `MsgBurn` uses `sender`, `amount`, and `burn_from_address`; updated tokenfactory semantics now preserve admin burn behavior while also allowing a holder to burn from their own address.
- Added `clawd model-token redeem --model-id <id> --amount <n> --input <prompt>`, deriving the model token denom from `--model/--symbol` or accepting a full `--denom`.
- Added builders for `/osmosis.tokenfactory.v1beta1.MsgBurn` and `/clawchain.modelregistry.v1.MsgSubmitInferenceJob`, then submit them atomically in one signed transaction.
- Extended `cmd/clawd/src/commands/__tests__/model-token.test.ts` to cover burn/job message shapes, transaction ordering, JSON output, and missing-denom validation.
- Verified `cd cmd/clawd && npm test -- --run src/commands/__tests__/model-token.test.ts` (12 passed / 0 failed), `cd cmd/clawd && npm run build`, `cd cmd/clawd && npm test` (649 passed / 0 failed), `cd cmd/clawd && node dist/main.js model-token redeem --help`, and `git diff --check`.
- Updated `x/tokenfactory/keeper.BurnFrom` with holder self-burn authorization and kept unauthorized third-party burns rejected.
- Added focused keeper tests for non-admin self-burn and unauthorized third-party burn.
- Verified `go test -count=1 ./x/tokenfactory/...`, `go test -count=1 ./x/modelregistry/... ./x/tokenfactory/...`, and `go build -o build/clawchaind ./cmd/clawchaind/`.
- Added `clawd model-token inference-setup --model-id <id>` to set `MsgSetInferencePricing` and optionally register the owner as an online inference provider with `MsgRegisterInferenceProvider`.
- Added `scripts/testnet/model-token-holder-redeem.sh`, a reusable live workflow that funds owner/holder wallets, issues a model token, configures inference, transfers tokens to a non-admin holder, redeems by holder self-burn, and verifies the created inference job.
- Live workflow passed on local 4-validator testnet with model `holder-redeem-1780271343`, model ID `2`, denom `factory/claw15yk64u7zc9g9k2yr2wmzeva5qgwxps6yv9pgpk/holder_redeem_1780271343`, holder `claw19rl4cm2hmr8afy4kldpxz3fka4jguq0akhr68a`, and inference job `2`.
- Live workflow tx evidence: issue `FC8107BE7DB6AD2DAB69A9CD8CD64936BEAFB53907FE5903CEF529BE225A4693`, setup `55D4DE81D17DB2761D2C830D9AA7CDB9B68CE03BCC991E1B046CF15EC296B417`, transfer `E74D604032A95CA6D2DBC4191ADC5AF6F93BF14494D86E27AD205B2961F707D7`, redeem `78D810CB44FF1D29AA3C0203D5C2FD8516EAB019487C8E1B6B16BA57E4FDED5A`.

## AI Model Token P0 CLI 2026-06-01

- [x] Inspect the AI model token, devnet, DEX, explorer, testnet, mainnet, and vendored integration plans.
- [x] Check the current `clawd` model, DEX, signing registry, and tokenfactory generated-code surfaces.
- [x] Add `clawd model-token issue` to register a model, create and mint its tokenfactory denom, and optionally seed a DEX pool.
- [x] Add focused command/unit coverage for message construction, event extraction, and CLI output.
- [x] Fix live chain/client blockers found during acceptance.
- [x] Verify TypeScript/Go build/tests, live issue/liquidity/swap, and update the plan docs with implementation status.

### Review

- Added `cmd/clawd/src/commands/model-token.ts` with `runModelTokenIssue`, composing `MsgRegisterModel`, `MsgCreateDenom`, `MsgMint`, and optional Astroport `create_pair` / `provide_liquidity` CosmWasm executes.
- Wired the top-level `clawd model-token issue` command with model metadata, token supply, DEX factory, and initial liquidity options.
- Updated `cmd/clawd/src/commands/model.ts` to use the shared custom-module signing registry and current modelregistry message shapes for register/inference paths.
- Fixed `x/modelregistry` service registration so `MsgRegisterModel` is actually mounted in the app gRPC message router, and registered all current modelregistry msg types in Amino/interface codec setup.
- Extended the shared `clawd` registry with tokenfactory and CosmWasm execute codecs, and moved DEX transaction signing onto that shared registry.
- Tightened model-token subdenom normalization to tokenfactory's accepted `[A-Za-z0-9/_]` shape.
- Added `cmd/clawd/src/commands/__tests__/model-token.test.ts` covering subdenom normalization, message construction, event extraction, issue sequencing, optional DEX seeding, JSON output, and validation.
- Live-verified on a fresh 4-validator local testnet with deployed DEX contracts: issued `factory/claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h/opus_4_6_live_1780270277`, created pair `claw1fzm6gzyccl8jvdv3qq6hp9vs6ylaruervs4m06c7k0ntzn2f8faqmw95md`, seeded 10,000 `uclaw` + 10,000 model token liquidity, and swapped 1,000 `uclaw` for 907 model tokens.
- Live tx evidence: issue `B7A03A62DDB1878A1D4539740360390E22FE16C7A72427A6B0D037B30A70038E`, pair `4ABA3D5728F0433649456C37BA98D5861B206445AFF1E08521C1D22652BAF333`, liquidity `C5CF37C27635F7E8E58392A46BD9D46082EA3A2571F260D0A6CDCA5DC0392E53`, swap `DBA0DB4DBAB998524CA2D95779D5BC3EA21DB717F2981D94AEFC36FF99763DCB` at height 208 with code 0.
- Verified `cd cmd/clawd && npm test -- --run src/commands/__tests__/model-token.test.ts src/lib/registry.test.ts src/commands/__tests__/model.test.ts` (25 passed / 0 failed), `cd cmd/clawd && npm test` (645 passed / 0 failed), `cd cmd/clawd && npm run build`, `go test -count=1 ./x/modelregistry/... ./x/tokenfactory/...`, `go build -o build/clawchaind ./cmd/clawchaind/`, and `cd cmd/clawd && node dist/main.js model-token issue --help`.

## Vendored Integration V1 Events 2026-06-01

- [x] Inspect the existing SDK WebSocket subscription APIs and viem adapter surface.
- [x] Add viem-style event watch methods for transaction and chain events.
- [x] Add focused unit tests and update exports/docs.
- [x] Verify build/tests/whitespace checks.
- [x] Commit the finished local work.

### Review

- Added `watchTransactions` and `watchEvent` to `createClawViemClient`, backed by the existing `ClawChainClient.subscribeTx` and `ClawChainClient.subscribeEvent` WebSocket paths.
- Exported the new request types from `sdk/src/index.ts`.
- Added adapter tests for transaction and event subscription mapping, including unsubscribe propagation.
- Updated `sdk/README.md` and `docs/plans/2026-05-31-vendored-integration.md` so the Tendermint event acceptance criterion is no longer stale.
- Verified `cd sdk && npm run build`, `cd sdk && npm test -- --test-reporter=spec dist/viem.test.js` (296 passed / 0 failed), and `git diff --check`.

## Vendored Integration V1 2026-05-31

- [x] Inspect the vendored integration plan, SDK, clawd registry, and package layout.
- [x] Add a first ClawChain-native TypeScript adapter/example slice without modifying vendored upstream internals.
- [x] Verify the slice locally with unit/smoke checks and, if practical, against devnet.
- [x] Update `docs/plans/2026-05-31-vendored-integration.md` from plan-only to implemented status.
- [x] Commit the finished local work.

### Review

- Added `sdk/src/viem.ts` with `createClawViemClient`, a viem-style ClawChain adapter that uses Tendermint status, Cosmos bank sends, and CosmWasm smart query/execute instead of `eth_*` JSON-RPC.
- Exported the adapter and public types from `sdk/src/index.ts`.
- Added `sdk/examples/viem-adapter.ts` and documented the adapter in `sdk/README.md`.
- Added `sdk/src/viem.test.ts` covering connect/disconnect, chain id, block height, account, balance, bank send, CosmWasm read/write mapping, and transfer amount validation.
- Updated `docs/plans/2026-05-31-vendored-integration.md` so Option B is marked selected for V1 and the remaining live-devnet/event/wagmi/alloy work stays explicit.
- Verified `cd sdk && npm run build`, `cd sdk && npm test -- --test-reporter=spec dist/viem.test.js` (294 passed / 0 failed), and `git diff --check`.

## Devnet Optional Completion 2026-05-31

- [x] Inspect current devnet, IBC, Docker, faucet, explorer, and web hooks.
- [x] Add seeded devnet demo state command and make it idempotent enough for repeated local use.
- [x] Add optional 2-chain IBC devnet command path around the existing IBC drivers.
- [x] Expand Docker devnet support toward full-stack parity where the existing services support it.
- [x] Update devnet plan/docs so optional work is no longer stale.
- [x] Verify live behavior where practical, run syntax/config checks, and commit.

### Review

- Added `scripts/devnet-seed-demo.sh` to seed funded demo accounts, a tokenfactory denom, a demo agent, a marketplace skill, privacy shield state, oracle commit-reveal state, and `artifacts/devnet/demo-state.json`.
- Added `scripts/devnet-seed-dex.sh` and repaired `scripts/deploy-dex.sh` for current Astroport contracts: native coin registry upload/instantiate, factory `coin_registry_address`, post-pair oracle instantiate, fixed-gas devnet deploy, and stdout-safe function returns.
- Added `scripts/devnet-ibc.sh` as the optional two-chain IBC devnet entry point around the existing IBC driver, and made `scripts/ibc-two-chain-test.sh` accept `BINARY`/`CLAWCHAIN_BIN`.
- Added `docker-compose.devnet-stack.yml` to override the root full stack with `clawchain-devnet`, devnet-fast chain params, faucet mnemonic recovery, and browser-local web/explorer/DEX endpoints.
- Updated `scripts/docker-entrypoint.sh` so Docker devnet can fund a supplied faucet mnemonic and generate fast devnet/privacy settings at genesis.
- Added Makefile targets `devnet-seed-demo`, `devnet-ibc`, `devnet-stack-up`, and `devnet-stack-down`.
- Ignored generated local `artifacts/devnet/` and `artifacts/ibc-test/` outputs because they are environment-specific and may contain local validator key material.
- Verified seeded demo state on a running devnet: 9 passed / 0 failed.
- Verified DEX fixture on a running devnet: code upload, coin registry, factory, router, CLAW/ATOM pair, and oracle deployment completed.
- Verified optional two-chain IBC devnet: 6 passed / 0 failed in manual relayer mode.
- Verified shell syntax, Makefile dry-runs, devnet stack compose config, and whitespace checks.

## Devnet Docker/CI Completion 2026-05-31

- [x] Inspect Docker compose, CI, Makefile, and existing devnet scripts for integration points.
- [x] Add a CI-style devnet gate that resets, boots, smokes, and tears down the devnet.
- [x] Add a Docker compose devnet profile that runs the same gate in a disposable tool container.
- [x] Add GitHub Actions devnet smoke workflow.
- [x] Update Makefile targets and the devnet launch plan so completed Docker/CI work is no longer listed as active.
- [x] Run syntax/config/live verification and commit changes.

### Review

- Added `scripts/devnet-ci.sh` as the reusable host/CI gate around `scripts/devnet-reset.sh`, `scripts/local-dev.sh --devnet`, and `scripts/devnet-smoke.sh`.
- Added `docker-compose.devnet.yml` with a `devnet` profile that runs the same gate inside a disposable Node 22/Debian tool container with Go, make, gcc, git, curl, jq, and cached Go/npm directories.
- Added `.github/workflows/devnet-smoke.yml` to run the ephemeral devnet smoke on `main` pushes and pull requests.
- Added Makefile targets `devnet-ci` and `devnet-compose`.
- Verified the live host gate with 7 passed / 0 failed and validated compose config plus Makefile dry-runs.
- Remaining devnet work is optional seeded demo state, optional 2-chain IBC devnet mode, and expanding Docker from smoke gate to full UI/faucet/explorer stack parity if needed.

## Devnet Launch Implementation 2026-05-31

- [x] Inspect existing local dev, Docker compose, live driver, DEX, IBC, and Makefile hooks.
- [x] Add `scripts/local-dev.sh --devnet` with isolated `.devnet-node/` state and `clawchain-devnet` chain ID.
- [x] Add devnet reset and smoke commands.
- [x] Update `docs/plans/2026-05-31-devnet-launch.md` to separate completed local work from optional Docker/CI work.
- [x] Run verification and commit changes.

### Review

- Existing `scripts/local-dev.sh` already builds, initializes, funds a dev key, creates an oracle feeder, configures genesis, generates privacy dev keys, starts the node, and delegates oracle feeder consent.
- Missing pieces are devnet-specific chain ID/home isolation, one-command reset, a focused devnet smoke wrapper, Docker profile validation, and CI wiring.
- Added `scripts/local-dev.sh --devnet` with `clawchain-devnet`, `.devnet-node/`, fast devnet governance/staking/slashing params, persistent PID file, and indexed feeder-delegation wait.
- Added `scripts/devnet-reset.sh`, `scripts/devnet-smoke.sh`, and Makefile targets `devnet-up`, `devnet-smoke`, and `devnet-reset`.
- Verified fresh devnet boot plus smoke: 7 passed / 0 failed. Docker profile and CI job remain active follow-up work.
- Final verification passed: shell syntax, Makefile dry-run for devnet targets, `git diff --check`, and devnet reset.

## Local-Only Public Testnet Readiness 2026-05-31

- [x] Inspect current public testnet scripts/configs to identify what can be completed without VPS or external validators.
- [x] Add a local external-validator genesis ceremony simulation.
- [x] Add a public testnet readiness gate that separates local pass/fail checks from VPS/DNS/people blockers.
- [x] Update `docs/plans/2026-05-31-testnet-launch.md` so completed rehearsal jobs are not listed as active work.
- [x] Run syntax/config/gate verification and commit the changes.

### Review

- Existing public artifact generation, public env validation, manifest validation, Docker compose stack, nginx static config template, explorer testnet chain config, monitoring configs, and local multinode smoke/upgrade scripts are present.
- Remaining non-local blockers are VPS/host provisioning, public DNS/TLS, external validator/integrator participation, public explorer/faucet/monitoring deployment, public soak, and public upgrade rehearsal.
- Added `scripts/testnet/simulate-genesis-ceremony.sh`, which creates 4 isolated validator homes, generates gentxs, and verifies the coordinator collection flow.
- Added `scripts/testnet/public-readiness-gate.sh`, which reports local pass/fail checks separately from blocked public-infrastructure work.
- Rewrote `docs/plans/2026-05-31-testnet-launch.md` so the active checklist contains only remaining public launch tasks.
- Verification passed: shell syntax checks, direct ceremony simulation, public readiness gate (13 passed / 0 failed / 8 blocked), and `git diff --check`.

## Multi-Validator Testnet Upgrade Rehearsal 2026-05-31

- [x] Confirm the full-module multinode smoke is already committed and the worktree is clean.
- [x] Add a safe no-op upgrade handler for local/testnet upgrade rehearsal that does not replay the existing `v2` oracle store addition.
- [x] Add a governance-driven multinode upgrade rehearsal script.
- [x] Verify the rehearsal on a fresh 4-validator local testnet.
- [x] Document results in the testnet launch plan and commit the changes.

### Review

- Current `v2` upgrade handler runs normal migrations but also configures an oracle store addition at the upgrade height. That is not safe as a generic rehearsal target for the current local multinode genesis because the oracle store already exists.
- Added `testnet-v1-rehearsal` as a no-op upgrade handler target for local/testnet rehearsal.
- Added `scripts/testnet/rehearse-gov-upgrade.sh` to submit a `MsgSoftwareUpgrade` proposal, vote all local validators, wait for passage, and verify post-upgrade blocks.
- While verifying, `local-multinode.sh up` reached consensus but validator processes exited when the parent shell ended in this non-interactive runner. Updated the launcher to start validators under `nohup` so the testnet survives after `up` returns.
- First same-binary rehearsal attempt halted early with `BINARY UPDATED BEFORE TRIGGER`, which is the correct Cosmos SDK guard. Updated the rehearsal to require a pre-upgrade binary for voting/halt and a post-upgrade binary for restart/apply.
- Verified with a pre-upgrade binary built from `c6049230` and the current post-upgrade binary: proposal `1` passed, the pre-upgrade binary halted at height 134, the post-upgrade binary applied `testnet-v1-rehearsal` at height 134, and all 4 validators produced post-upgrade blocks (10 passed / 0 failed).

## Operator Runtime Gateway Contract 2026-05-17

- [x] Add formal OpenClaw protocol schemas/types for `provider.status`, `provider.help`, and `provider.dashboard`.
- [x] Register provider schemas in the protocol schema registry and add representative contract validation tests.
- [x] Add typed provider helpers in OpenClaw gateway client/call wrappers with method-name mapping tests.
- [x] Update `clawd` gateway bridge helpers to query `provider.status` and `provider.dashboard` directly.
- [x] Update provider lifecycle, readiness, `clawd provider`, and `clawd dashboard` aggregation to prefer gateway provider contracts while retaining existing fallbacks.
- [x] Keep JSON output backward-compatible and add gateway source/phase/evidence fields when provider gateway data is available.
- [x] Run focused OpenClaw, clawd, Go module, and whitespace verification commands.

### Review

- Added provider protocol schemas and static TypeScript aliases for `provider.status`, `provider.help`, and `provider.dashboard`.
- Registered the provider schemas in `ProtocolSchemas` and added representative validation payloads to `protocol-contract-registry.test.ts`.
- Added typed OpenClaw `GatewayClient.provider.*` and `callGatewayProvider.*` helpers with exact method-name mapping tests.
- Added `clawd` bridge helpers for `provider.status` and `provider.dashboard`.
- Updated `clawd` provider lifecycle/readiness to prefer provider gateway contracts, with existing `chain.*`, `runtime.status`, REST, and local fallbacks retained.
- Added gateway source/current phase/evidence fields to `clawd provider --out json` and `clawd dashboard --json`, plus concise pretty-output source/phase lines.
- Verification passed:
  - `cd openclaw && npm test -- --run src/gateway/server-methods/provider-lifecycle.test.ts src/gateway/server-methods/provider-dashboard.test.ts src/gateway/protocol/schema/protocol-contract-registry.test.ts src/gateway/call.test.ts src/gateway/client.test.ts` (46/46 tests)
  - `cd cmd/clawd && npm test -- --run src/commands/__tests__/dashboard.test.ts src/commands/__tests__/provider.test.ts src/commands/__tests__/readiness.test.ts src/lib/provider-lifecycle.test.ts src/lib/readiness.test.ts` (26/26 tests)
  - `go test -timeout 10m ./x/agent/... ./x/marketplace/... ./x/modelregistry/... ./x/privacy/... ./x/reputation/...`
  - `git diff --check`

## README Funding and Vendor Flattening 2026-05-17

- [x] Add the project funding Solana wallet to `readme.md`.
- [x] Expand `readme.md` with a clearer OpenClaw-style project overview, quick start, security, and docs structure.
- [x] Convert existing gitlink/submodule directories, including `wagmi`, into normal project directories.
- [x] Convert `third_party/clawchain-forks/` clones into normal project directories so they do not become nested Git repositories.
- [x] Verify no targeted directories remain as gitlinks or nested Git repositories.
- [x] Add current status notes to `prd.md` and the March superpowers design/plan docs.

### Review

- Existing submodule/gitlink directories were flattened in commit `37a813f9`; VS Code should no longer show those folders as deleted after refreshing Git status.
- Added the ClawChain logo to `readme.md` via `docs/static/clawchain-logo.png`.
- Added the project Solana funding wallet to `readme.md`: `A4QepUcLpwqZMsxu72FLsLDs5rLNThW7RHLXJWoLDm7r`.
- Expanded `readme.md` with OpenClaw-style centered intro links and a protocol stack covering A2A, OpenACP, OpenClaw, mem0, Beads, OpenZiti, Context7, agentgateway, and x402-style experiments.
- Replaced stale submodule clone instructions with normal `git clone` guidance.
- Added a May 17, 2026 repository-packaging and funding update to `prd.md`.
- Added May 17, 2026 status amendments to the March 16 and March 21 superpowers specs/plans so stale unchecked work is marked historical or superseded.
- Verified Markdown whitespace with `git diff --check` across the touched docs.

## ClawChain Fork and Clone 2026-05-17

- [x] Confirm the ClawChain fork set from the user-provided list and avoid unrelated workspace changes.
- [x] Create a dedicated clone directory at `third_party/clawchain-forks/`.
- [x] Fork the selected upstream repositories with GitHub CLI.
- [x] Clone each fork locally under `third_party/clawchain-forks/`.
- [x] Verify each clone has a usable `origin` remote and document results.

### Review

- Forked or confirmed existing forks under `caelum0x` for 17 concrete repositories: `a2a-js`, `A2A`, `OpenACP`, `openclaw`, `mem0`, `beads`, `ziti`, `context7`, `agentgateway`, `x402`, `x402-gated-api`, `hyper402`, `nofx`, `agents`, `uniswap-ai`, `solana-agent-kit`, and `z402`.
- Resolved ambiguous list entries as `Jnix2007/hyper402`, `sendaifun/solana-agent-kit`, and `chickstudi0/z402`; treated `flash-loan / trading repos` as a risk category because no exact repository was provided.
- Cloned every fork into `third_party/clawchain-forks/`.
- Added `upstream` remotes for all clones so each fork can sync from its source repository.
- Verified all 17 clones have `origin` pointing at `https://github.com/caelum0x/<repo>.git` and `upstream` pointing at the selected source repo.
- The first clone attempt hit sandbox DNS restrictions; the escalated retry completed successfully.

## README Professionalization 2026-05-15

- [x] Review the current public README and repo structure.
- [x] Rewrite `readme.md` as a professional blockchain project README.
- [x] Verify Markdown/link-sensitive formatting.
- [x] Commit and push the README update.

### Review

- Current README has useful technical coverage, but the tone and structure are closer to an internal implementation summary than a public blockchain repository introduction.
- Rewrote the README around product overview, technology stack, repository layout, chain modules, quick start, operator workflow, SDK, dashboard, GPU providers, validation, security, and documentation.
- Verified referenced local documentation files exist and `git diff --check -- readme.md tasks/todo.md` passed.
- Committed and pushed the README update as `e14881a` on `main`.

## GitHub Publish 2026-05-15

- [x] Inspect repository state, branch, and existing remotes before pushing.
- [x] Check untracked files for obvious secret-bearing artifacts that would be included by `git add -A`.
- [x] Add ignore rules for local validator keys, node keys, local e2e key material, and Kubernetes secret manifests.
- [x] Stage all safe tracked and untracked repository changes.
- [x] Exclude generated local chain database state from the staged publish set.
- [x] Record embedded Git repositories as explicit submodules instead of anonymous gitlinks.
- [x] Commit the staged changes.
- [x] Configure `origin` as `https://github.com/caelum0x/clawchain.git`.
- [x] Push `main` to GitHub.

### Review

- Repository was already initialized on branch `main`; no `git init` needed.
- No remote was configured before this publish attempt.
- A raw `git add -A` would include local private validator/node keys and secret manifests, so those paths are ignored before staging.
- Staging showed generated local chain data under `testnet/data/`; this should stay local and out of the public source repository.
- Embedded repositories are retained as submodules with their origin URLs in `.gitmodules`.
- Local publish commit created as `2e4f5e5` before the first push retry.
- First push attempt failed with HTTP 408 before the remote `main` ref was created.
- Amended publish commit `26c6b97` was pushed to `https://github.com/caelum0x/clawchain.git` on branch `main`.
- Verified remote `refs/heads/main` matched local `26c6b976737c29ce5733354dd2c42cdf1be1b5e7` after the push.

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
