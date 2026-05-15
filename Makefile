BRANCH := $(shell git rev-parse --abbrev-ref HEAD)
COMMIT := $(shell git log -1 --format='%H')
APPNAME := clawchain

# do not override user values
ifeq (,$(VERSION))
  VERSION := $(shell git describe --exact-match 2>/dev/null)
  # if VERSION is empty, then populate it with branch name and raw commit hash
  ifeq (,$(VERSION))
    VERSION := $(BRANCH)-$(COMMIT)
  endif
endif

# Update the ldflags with the app, client & server names
ldflags = -X github.com/cosmos/cosmos-sdk/version.Name=$(APPNAME) \
	-X github.com/cosmos/cosmos-sdk/version.AppName=$(APPNAME)d \
	-X github.com/cosmos/cosmos-sdk/version.Version=$(VERSION) \
	-X github.com/cosmos/cosmos-sdk/version.Commit=$(COMMIT)

BUILD_FLAGS := -ldflags '$(ldflags)'

##############
###  Test  ###
##############

test-unit:
	@echo Running unit tests...
	@go test -mod=readonly -v -timeout 30m ./...

test-race:
	@echo Running unit tests with race condition reporting...
	@go test -mod=readonly -v -race -timeout 30m ./...

test-cover:
	@echo Running unit tests and creating coverage report...
	@go test -mod=readonly -v -timeout 30m -coverprofile=$(COVER_FILE) -covermode=atomic ./...
	@go tool cover -html=$(COVER_FILE) -o $(COVER_HTML_FILE)
	@rm $(COVER_FILE)

bench:
	@echo Running unit tests with benchmarking...
	@go test -mod=readonly -v -timeout 30m -bench=. ./...

test: govet govulncheck test-unit

test-integration:
	@echo Running integration tests...
	@go test -tags=integration -timeout 30m ./x/...

test-e2e:
	@echo Running e2e tests...
	@go test -tags=e2e -timeout 30m ./tests/e2e/...

test-e2e-full: test-integration test-e2e

coverage-report:
	@echo Generating coverage report...
	@go test -tags=integration -coverprofile=coverage.out -timeout 10m ./x/...
	@go tool cover -func=coverage.out | grep -E "total:|keeper/"

.PHONY: test test-unit test-race test-cover bench test-integration test-e2e test-e2e-full coverage-report

#################
###  Install  ###
#################

all: install

install:
	@echo "--> ensure dependencies have not been modified"
	@go mod verify
	@echo "--> installing $(APPNAME)d"
	@go install $(BUILD_FLAGS) -mod=readonly ./cmd/$(APPNAME)d

.PHONY: all install

#####################
###  Quick Start  ###
#####################

quickstart:
	@bash ./scripts/quickstart.sh

local-testnet-init:
	@bash ./scripts/testnet/init-testnet.sh

local-testnet-start:
	@echo "--> Starting local testnet"
	@clawchaind start --home "$${CLAWCHAIN_HOME:-$$HOME/.clawchain-testnet}"

.PHONY: quickstart local-testnet-init local-testnet-start

##############
###  Help  ###
##############

help:
	@echo "ClawChain Make Targets"
	@echo ""
	@echo "Quick Start:"
	@echo "  make build                    Build clawchaind binary to build/"
	@echo "  make install                  Install clawchaind to GOPATH/bin"
	@echo "  make quickstart               One-command build + init + start local testnet"
	@echo "  make local-testnet-init       Initialize single-validator local testnet"
	@echo "  make local-testnet-start      Start the local testnet"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build             Build all Docker images"
	@echo "  make docker-up                Start full stack (chain + web + clawd)"
	@echo "  make docker-up-gpu            Start full stack with GPU provider"
	@echo "  make docker-up-tools          Start full stack with developer tools"
	@echo "  make docker-up-all            Start full stack with all profiles"
	@echo "  make docker-down              Stop the Docker stack"
	@echo "  make docker-logs              Follow Docker compose logs"
	@echo ""
	@echo "Validation:"
	@echo "  make protocol-contract-pack   Fast OpenClaw protocol/WS contract checks"
	@echo "  make protocol-sanity          Contract pack + README/literal guards"
	@echo "  make protocol-surface-lock-check   Verify frozen proto/SDK surface hashes"
	@echo "  make protocol-surface-lock-refresh Refresh proto/SDK surface lock file"
	@echo "  make protocol-surface-changelog    Generate lock-to-lock protocol surface changelog"
	@echo "  make prd-verify               Fast PRD claim+semantic verification checks"
	@echo "  make branch-protection-verify Check branch-protection doc/workflow/check-name coherence"
	@echo "  make prd-build                Full build gate (contracts + Go + SDK + scripts)"
	@echo "  make prd-e2e                  Live E2E gate (testnet + scenarios + demo)"
	@echo "  make fresh-machine-acceptance-gate   Prime acceptance flow gate (one-command startup)"
	@echo "  make fresh-machine-acceptance        Run fresh-machine bootstrap acceptance command flow"
	@echo "  make one-command-agent-gate         DoD proof: one command -> functioning agent+participant"
	@echo "  make release-ready-gate             Canonical release-readiness command path"
	@echo "  make slice-a-operatorization-gate    Identity/capabilities/liveness operator gate"
	@echo "  make capability-determinism-gate     Capability metadata determinism/validation gate"
	@echo "  make security-economic-policy-gate   Anti-spam + economic policy hooks gate"
	@echo "  make sla-reputation-coupling-gate    Task-SLA to reputation coupling gate"
	@echo "  make pre-upgrade-compatibility-gate  Pre-upgrade state compatibility + rollback/cadence policy gate"
	@echo "  make upgrade-readiness-gate          Upgrade checklist/rollback/readiness gate"
	@echo "  make validate-upgrade               Validate upgrade handlers + state export (Phase 13)"
	@echo "  make mainnet-capacity-gate           Mainnet load/capacity acceptance criteria gate"
	@echo "  make mainnet-launch-program-gate     Mainnet launch program artifacts gate"
	@echo "  make launch-artifact-completeness-gate Strict no-placeholder launch artifact gate"
	@echo "  make production-infrastructure-gate  Endpoints+DR+hosting production infrastructure gate"
	@echo "  make chain-hardening-gate            Upgrade/load/observability chain hardening gate"
	@echo "  make runtime-hardening-gate          Runtime soak/update/non-expert recovery hardening gate"
	@echo "  make ecosystem-integrator-gate       SDK versioning/reference integrations/onboarding gate"
	@echo "  make governance-operations-gate      Governance ownership/incident drill/public comms gate"
	@echo "  make drill-evidence-gate             Enforce rollback/incident drill evidence completeness"
	@echo "  make growth-user-layer-gate          Value prop/incentive/support pipeline gate"
	@echo "  make capacity-slo-evidence-gate      Capacity/load/SLO evidence proof gate"
	@echo "  make production-data-replacement-gate Production evidence data + artifact index gate"
	@echo "  make real-world-external-validation-gate Independent integrator + npm publish + launch-week shifts gate"
	@echo "  make mainnet-cutover-rehearsal-gate   Fresh-machine cutover + rollback rehearsal evidence gate"
	@echo "  make launch-day-operations-gate       Launch-day command/status/incident bridge evidence gate"
	@echo "  make first-week-stabilization-gate    First-week health/incident/retrospective evidence gate"
	@echo "  make phase16-automation-evidence-capture-gate Phase 16 Track A automation + integrity gate"
	@echo "  make phase16-reliability-alerting-gate Phase 16 Track B reliability + alerting gate"
	@echo "  make phase16-operator-ux-gate         Phase 16 Track C operator UX hardening gate"
	@echo "  make security-compliance-closure-evidence-gate Security/compliance closure evidence gate"
	@echo "  make ecosystem-readiness-proof-gate  Ecosystem onboarding/SDK/support evidence gate"
	@echo "  make launch-decision-packet-gate     Go/no-go packet and public status workflow evidence gate"
	@echo "  make security-review-gate            Mainnet security review artifact gate"
	@echo "  make go-live-decision-gate           Launch/no-launch ownership and criteria gate"
	@echo "  make mainnet-readiness-gate          Aggregate Track E mainnet readiness gate"
	@echo "  make phase17-operator-bootstrap-gate Phase 17 Track A operator bootstrap parity gate"
	@echo "  make phase17-public-testnet-stability-gate Phase 17 Track B public testnet stability gate"
	@echo "  make phase18-real-endpoint-cutover-gate Phase 18 Track B signed lifecycle cutover gate"
	@echo "  make phase18-continuous-ops-gate     Phase 18 Track C continuous operations gate"
	@echo "  make launch-execution-pack            Phase 19 Track A launch control bundle"
	@echo "  make phase19-launch-execution-gate    Phase 19 Track A launch execution gate"
	@echo "  make phase19-evidence-drift-gate      Phase 19 Track B evidence drift + lifecycle monotonicity gate"
	@echo "  make post-launch-weekly-executive-summary WEEK_ID=<YYYY-Www> Generate Phase 19 Track C weekly executive summary artifact"
	@echo "  make post-launch-weekly-executive-summary-gate Validate weekly executive summary freshness/schema/status logic"
	@echo "  make post-launch-executive-trend-7d Generate 7-day executive signal trend artifact"
	@echo "  make phase20-ops-signal-gate Aggregate Phase 20 Track A weekly summary + trend integrity checks"
	@echo "  make post-launch-remediation-checklist Generate machine-readable remediation checklist from latest executive summary"
	@echo "  make post-launch-remediation-bundle Package failing signal artifacts for operator handoff"
	@echo "  make phase20-recovery-loop-gate Enforce remediation artifact closure when attention-required persists"
	@echo "  make ops-maturity-packet Generate reproducible weekly ops maturity packet artifact"
	@echo "  make phase20-product-complete-gate Enforce prior gates + Phase 20 gates + release-evidence alignment"
	@echo "  make ops-artifact-index Generate weekly artifact index manifest with deterministic hashes"
	@echo "  make phase21-artifact-index-gate Verify artifact index freshness + hash integrity"
	@echo "  make weekly-publication-packet Generate reproducible weekly publication packet artifact"
	@echo "  make phase21-publication-packet-gate Validate weekly publication packet integrity"
	@echo "  make weekly-handoff-note Generate machine-readable operator handoff markdown"
	@echo "  make phase21-handoff-gate Validate handoff markdown sections + artifact references"
	@echo "  make weekly-handoff-pack One-command index + publication + handoff generation flow"
	@echo "  make weekly-closure-bundle Generate reproducible weekly closure bundle artifact"
	@echo "  make phase21-program-closure-gate Aggregate Phase 20 and Phase 21 closure gates"
	@echo "  make weekly-closure-digest-pack Generate deterministic digest pack for weekly closure artifacts"
	@echo "  make phase22-closure-digest-gate Verify weekly closure digest freshness + integrity"
	@echo "  make operator-status-snapshot Generate operator status snapshot (JSON+MD)"
	@echo "  make phase22-operator-status-gate Validate operator status snapshot outputs"
	@echo "  make phase22-weekly-closeout One-command Phase 22 weekly closeout flow"
	@echo "  make phase22-program-closeout-gate Aggregate Phase 21 closeout + Phase 22 gates"
	@echo "  make weekly-closeout-attestation Generate weekly closeout attestation artifact"
	@echo "  make phase23-attestation-gate Verify weekly closeout attestation integrity"
	@echo "  make weekly-history-rollup Generate rolling weekly history artifact"
	@echo "  make phase23-history-rollup-gate Verify weekly history rollup completeness"
	@echo "  make phase23-weekly-finalize One-command Phase 23 weekly finalization flow"
	@echo "  make phase23-program-finalize-gate Aggregate Phase 22 closeout + Phase 23 gates"
	@echo "  make weekly-audit-log Generate weekly governance/audit log artifact"
	@echo "  make phase24-audit-log-gate Verify weekly audit log integrity"
	@echo "  make weekly-signoff-manifest Generate weekly signoff manifest (JSON+MD)"
	@echo "  make phase24-signoff-manifest-gate Validate weekly signoff manifest outputs"
	@echo "  make phase24-weekly-certify One-command Phase 24 weekly certification flow"
	@echo "  make phase24-program-certify-gate Aggregate Phase 23 finalize + Phase 24 gates"
	@echo "  make weekly-notarization-ledger Generate weekly notarization ledger artifact"
	@echo "  make phase25-notarization-ledger-gate Verify weekly notarization ledger integrity"
	@echo "  make weekly-immutable-snapshot Generate weekly immutable snapshot (JSON+receipt)"
	@echo "  make phase25-immutable-snapshot-gate Validate immutable snapshot outputs"
	@echo "  make phase25-weekly-notarize One-command Phase 25 weekly notarization flow"
	@echo "  make phase25-program-notarize-gate Aggregate Phase 24 certify + Phase 25 gates"
	@echo "  make capture-lifecycle-revision-snapshot Capture current lifecycle revision snapshot"
	@echo "  make launch-freeze-snapshot DECISION_TIMESTAMP_UTC=<RFC3339 UTC> [DECISION_OUTCOME=launch|no-launch] Generate machine-readable launch freeze snapshot"
	@echo "  make slice-c-privacy-operatorization-gate   Privacy lifecycle operator gate"
	@echo "  make slice-d-marketplace-operatorization-gate Marketplace/escrow/reputation gate"
	@echo "  make public-testnet-reproducibility-proof-path Public testnet reproducibility gate"
	@echo "  make product-complete-gate          Final whole-product completion gate"
	@echo "  make go-live-packet                 Generate one-command go-live packet artifact"
	@echo "  make support-handoff-snapshot       Generate support handoff runtime/release snapshot"
	@echo "  make release-evidence-pack           Generate artifacts/release-evidence.json"
	@echo "  make release-artifact-provenance-pack Generate provenance JSON for node/runtime artifacts"
	@echo "  make release-artifact-provenance-gate Validate provenance checklist artifacts"
	@echo ""
	@echo "Developer Utilities:"
	@echo "  make lint                     Run Go linter (golangci-lint)"
	@echo "  make format                   Auto-format all Go and TypeScript code"
	@echo "  make proto-gen                Regenerate Go protobufs + SDK proto contracts"
	@echo "  make proto-lint               Lint protobuf files"
	@echo "  make build                    Build clawchaind binary to build/"
	@echo "  make build-all                Build all Go binaries + tools + clawd + TS tools"
	@echo "  make build-services           Build all Go backend services"
	@echo "  make build-tools              Build CLI tools (clawproof)"
	@echo "  make build-clawd              Build clawd CLI"
	@echo "  make build-ts-tools           Build TypeScript tool services (artemis, cryo, flood, flux, data-portal, rivet)"
	@echo "  make test-ts-tools            Test TypeScript tool services"
	@echo "  make build-frontend           Build all frontend apps (web, explorer, dex, docs, landing)"
	@echo "  make build-web                Build web dashboard"
	@echo "  make build-explorer           Build block explorer"
	@echo "  make build-dex                Build ClawDEX app"
	@echo "  make build-docs               Build documentation site"
	@echo "  make build-landing            Build landing page"
	@echo "  make health                   Run full health check (all 12 services)"
	@echo "  make docker-health            Health check via Docker containers"
	@echo "  make clean                    Clean build artifacts and coverage files"
	@echo "  make docs                     List available documentation"
	@echo "  make check                    Run all checks (lint + test + build)"
	@echo ""
	@echo "Proto:"
	@echo "  make proto-gen                Regenerate Go protobufs + SDK proto contracts"
	@echo "  make proto-gen-ts             Regenerate TypeScript protobuf artifacts"
	@echo "  make proto-refresh-local      Sync local cosmos-sdk protos + regenerate"
	@echo ""
	@echo "Operator:"
	@echo "  make clawd-build              Build clawd CLI"
	@echo "  make openclaw-up              Run unified runtime via openclaw up"
	@echo "  make openclaw-up-json         Run unified runtime via openclaw up (JSON output)"
	@echo "  make openclaw-up-ready        Run openclaw up with strict readiness gate"
	@echo "  make openclaw-up-ready-json   Run openclaw up with strict readiness gate (JSON output)"
	@echo "  make openclaw-up-ready-assert Run openclaw up strict gate and assert JSON readiness report"
	@echo "  make openclaw-agent-flow      Run core agent lifecycle via openclaw delegate"
	@echo "  make openclaw-agent-flow-json Run core agent lifecycle via openclaw delegate (JSON output)"
	@echo "  make openclaw-product-flow      Run end-to-end product lifecycle via openclaw delegate"
	@echo "  make openclaw-product-flow-json Run end-to-end product lifecycle via openclaw delegate (JSON output)"
	@echo "  make openclaw-product-flow-assert Run openclaw product flow and assert JSON success report"
	@echo "  make openclaw-up-profile-vps      Reproducible VPS startup profile"
	@echo "  make openclaw-up-profile-macmini  Reproducible Mac mini startup profile"
	@echo "  make openclaw-up-profile-local    Reproducible local-dev startup profile"
	@echo "  make clawd-up                 One-command init/join/start runtime"
	@echo "  make clawd-up-json            One-command init/join/start runtime (JSON output)"
	@echo "  make clawd-up-ready           Run clawd up with strict readiness gate"
	@echo "  make clawd-up-ready-json      Run clawd up with strict readiness gate (JSON output)"
	@echo "  make clawd-up-ready-assert    Run clawd up strict gate and assert JSON readiness report"
	@echo "  make clawd-bootstrap          Bootstrap node from manifest"
	@echo "  make clawd-bootstrap-ready    Bootstrap node with strict readiness gate"
	@echo "  make clawd-doctor             Run operator diagnostics"
	@echo "  make clawd-agent-flow         Run core agent lifecycle (register->heartbeat->delegate)"
	@echo "  make clawd-agent-flow-json    Run core agent lifecycle with machine-readable JSON output"
	@echo "  make clawd-product-flow       Run end-to-end product lifecycle flow"
	@echo "  make clawd-product-flow-json  Run end-to-end product lifecycle flow (JSON output)"
	@echo "  make clawd-product-flow-assert Run clawd product flow and assert JSON success report"
	@echo "  make autonomous-skill-map-gate Strict SKILL.md metadata gate for autonomous executor mapping"
	@echo "  make product-flow-gate        Run openclaw+clawd product flow assert gates (fail-fast)"
	@echo "  make clawd-peers-summary      Show configured seed summary"
	@echo "  make generate-daily-health-summary DAY_UTC=<YYYYMMDD>   Generate daily stabilization health summary"
	@echo "  make generate-weekly-readiness-cadence-report WEEK_ID=<YYYYMMDD>   Generate weekly readiness cadence report"
	@echo "  make weekly-maintenance MANIFEST=<manifest> WEEK_ID=<YYYYMMDD> DAY_UTC=<YYYYMMDD>   Run weekly ops maintenance pack"
	@echo "  make nightly-ops-pack DAY_UTC=<YYYYMMDD> [MANIFEST=<url>] [HOST=<host>]   Generate nightly gate+evidence pack"
	@echo "  make weekly-incident-drill-pack WEEK_ID=<YYYY-Www>   Generate weekly incident drill pack"
	@echo "  make weekly-incident-drill-closure-gate  Check weekly incident drill closure artifact"
	@echo "  make monthly-governance-pack MONTH_ID=<YYYY-MM>      Generate monthly governance pack"
	@echo "  make monthly-governance-closure-gate     Check monthly governance closure artifact"
	@echo "  make capture-launch-day-transcript LABEL=<name> CMD=\"<command>\" Capture launch-day command transcript"
	@echo ""
	@echo "Disaster Recovery:"
	@echo "  make backup                   Create timestamped state backup tarball"
	@echo "  make restore BACKUP=<path>    Restore from backup tarball [GENESIS_RESTORE=1]"
	@echo ""
	@echo "Testnet:"
	@echo "  make testnet-init             Initialize local 4-validator testnet"
	@echo "  make testnet-start            Start testnet services"
	@echo "  make testnet-test             Run testnet scenarios"
	@echo "  make load-test                Agent load test (AGENT_COUNT=10 default)"
	@echo "  make load-test-heavy          Heavy agent load test (AGENT_COUNT=50)"
	@echo "  make testnet-public-stable-endpoints Verify public stable endpoints + probes"
	@echo "  make testnet-public-deployment-gate Strict public DNS/TLS endpoint gate"
	@echo "  make testnet-public-verify-artifacts-only Verify reproducibility from published artifacts only"
	@echo "  make testnet-public-deploy-proof      Generate strict public deploy proof artifact"
	@echo ""
	@echo "Monitoring:"
	@echo "  make health-check             Run full health check (JSON report)"
	@echo "  make endpoint-smoke           Quick smoke test all endpoints"
	@echo "  make monitoring-setup         Set up Prometheus + Grafana monitoring stack"

.PHONY: help

##################
###  Protobuf  ###
##################

# Use this target if you do not want to use Ignite for generating proto files

proto-deps:
	@echo "Installing proto deps"
	@echo "Proto deps present, run 'go tool' to see them"

proto-gen:
	@echo "Generating protobuf files..."
	@if [ -d third_party/proto/cosmos-sdk/cosmos ]; then \
		echo "Using local Cosmos SDK proto deps via buf.local.yaml"; \
		RESTORE_LOCK=0; \
		if [ -f buf.lock ]; then \
			mkdir -p .tmp; \
			mv buf.lock .tmp/buf.lock.remote.bak; \
			RESTORE_LOCK=1; \
		fi; \
		if ! ( \
			go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.local.yaml --template proto/buf.gen.gogo.yaml --path proto/clawchain && \
			go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.local.yaml --template proto/buf.gen.sta.yaml --path proto/clawchain && \
			go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.local.yaml --template proto/buf.gen.swagger.yaml --path proto/clawchain \
		); then \
			if [ "$$RESTORE_LOCK" -eq 1 ] && [ -f .tmp/buf.lock.remote.bak ]; then mv .tmp/buf.lock.remote.bak buf.lock; fi; \
			echo "Local buf config failed; falling back to remote buf.yaml"; \
			go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template proto/buf.gen.gogo.yaml --path proto/clawchain; \
			go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template proto/buf.gen.sta.yaml --path proto/clawchain; \
			go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template proto/buf.gen.swagger.yaml --path proto/clawchain; \
		else \
			if [ "$$RESTORE_LOCK" -eq 1 ] && [ -f .tmp/buf.lock.remote.bak ]; then mv .tmp/buf.lock.remote.bak buf.lock; fi; \
		fi; \
	else \
		echo "Using remote Buf deps via buf.yaml"; \
		go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template proto/buf.gen.gogo.yaml --path proto/clawchain; \
		go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template proto/buf.gen.sta.yaml --path proto/clawchain; \
		go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template proto/buf.gen.swagger.yaml --path proto/clawchain; \
	fi
	@echo "Syncing generated Go protobufs into x/..."
	@bash ./scripts/sync-generated-go-pb.sh
	@echo "Generating SDK proto contracts..."
	@node ./sdk/scripts/gen-proto-contracts.mjs

proto-gen-ts:
	@echo "Generating TypeScript types from proto..."
	@if ! curl -fsS --max-time 2 https://buf.build >/dev/null 2>&1; then \
		echo "Skipping TypeScript proto generation (buf remote unavailable)."; \
	else \
		if [ -d third_party/proto/cosmos-sdk/cosmos ]; then \
			echo "Using local Cosmos SDK proto deps via buf.local.yaml"; \
			RESTORE_LOCK=0; \
			if [ -f buf.lock ]; then \
				mkdir -p .tmp; \
				mv buf.lock .tmp/buf.lock.remote.bak; \
				RESTORE_LOCK=1; \
			fi; \
			if ! go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.local.yaml --template buf.gen.yaml --path proto/clawchain; then \
				if [ "$$RESTORE_LOCK" -eq 1 ] && [ -f .tmp/buf.lock.remote.bak ]; then mv .tmp/buf.lock.remote.bak buf.lock; fi; \
				echo "Local buf config failed; falling back to remote buf.yaml"; \
				if ! go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template buf.gen.yaml --path proto/clawchain; then \
					echo "WARN: TypeScript proto generation skipped (buf remote/plugin unavailable)."; \
				fi; \
			else \
				if [ "$$RESTORE_LOCK" -eq 1 ] && [ -f .tmp/buf.lock.remote.bak ]; then mv .tmp/buf.lock.remote.bak buf.lock; fi; \
			fi; \
		else \
			echo "Using remote Buf deps via buf.yaml"; \
			if ! go tool github.com/bufbuild/buf/cmd/buf generate proto --config buf.yaml --template buf.gen.yaml --path proto/clawchain; then \
				echo "WARN: TypeScript proto generation skipped (buf remote/plugin unavailable)."; \
			fi; \
		fi; \
	fi

proto-gen-all: proto-gen proto-gen-ts

proto-sync-cosmos-sdk:
	@echo "Syncing local Cosmos SDK protos into project deps..."
	@bash ./openclaw/scripts/sync-cosmos-sdk-protos.sh

proto-source-report:
	@if [ -f third_party/proto/cosmos-sdk/CLAWCHAIN_COSMOS_SDK_EXPORT.json ]; then \
		echo "Proto source: local-cosmos-sdk-export"; \
		echo "Metadata: third_party/proto/cosmos-sdk/CLAWCHAIN_COSMOS_SDK_EXPORT.json"; \
		cat third_party/proto/cosmos-sdk/CLAWCHAIN_COSMOS_SDK_EXPORT.json; \
	else \
		echo "Proto source: remote-buf-deps (no local SDK export metadata found)"; \
	fi

proto-refresh-local: proto-sync-cosmos-sdk proto-gen-all
	@echo "Local Cosmos SDK proto refresh complete."

cosmos-sdk-local-dev: cosmos-sdk-link-local-safe proto-refresh-local proto-source-report
	@echo "Cosmos SDK local dev bootstrap complete."

cosmos-sdk-status:
	@bash ./scripts/cosmos-sdk-local.sh status

cosmos-sdk-link-local:
	@bash ./scripts/cosmos-sdk-local.sh link

cosmos-sdk-link-local-safe:
	@bash ./scripts/cosmos-sdk-local.sh link-safe

cosmos-sdk-unlink-local:
	@bash ./scripts/cosmos-sdk-local.sh unlink

proto-ts-check:
	@echo "Checking SDK proto contract sync..."
	@cd sdk && npm run proto:check

.PHONY: proto-gen proto-gen-ts proto-gen-all proto-sync-cosmos-sdk proto-source-report proto-refresh-local cosmos-sdk-local-dev cosmos-sdk-status cosmos-sdk-link-local cosmos-sdk-link-local-safe cosmos-sdk-unlink-local proto-ts-check

#################
###  Linting  ###
#################

lint:
	@echo "--> Running linter"
	@go tool github.com/golangci/golangci-lint/cmd/golangci-lint run ./... --timeout 15m

lint-fix:
	@echo "--> Running linter and fixing issues"
	@go tool github.com/golangci/golangci-lint/cmd/golangci-lint run ./... --fix --timeout 15m

.PHONY: lint lint-fix

###################
### Development ###
###################

govet:
	@echo Running go vet...
	@go vet ./...

govulncheck:
	@echo Running govulncheck...
	@command -v govulncheck >/dev/null 2>&1 || go install golang.org/x/vuln/cmd/govulncheck@latest
	@GOVULNCHECK_BIN="$$(command -v govulncheck || echo "$$(go env GOPATH)/bin/govulncheck")"; \
	"$$GOVULNCHECK_BIN" ./...

.PHONY: govet govulncheck

###########################
###  Extended Testing   ###
###########################

coverage:
	@echo Running test coverage...
	@go test -tags=integration -coverprofile=coverage.out -covermode=atomic -timeout 20m ./x/...
	@echo "Total coverage:"
	@go tool cover -func=coverage.out | grep total

test-phase-c: test-e2e

test-load:
	@echo Running load tests...
	@go test -mod=readonly -v -timeout 10m -tags=load -run TestLoad ./tests/e2e/...

integration-coverage-gate:
	@echo "--> Running integration coverage gate"
	@MIN_COVERAGE=$(or $(MIN_COVERAGE),80) bash ./scripts/check-integration-coverage.sh

security-scan: govulncheck
	@echo Running security scan...
	@which gosec > /dev/null 2>&1 && gosec -exclude-generated ./... || echo "gosec not installed, skipping"

.PHONY: coverage test-phase-c test-load integration-coverage-gate security-scan

################
###  Docker  ###
################

build:
	@echo "--> Building clawchaind"
	@go build $(BUILD_FLAGS) -mod=readonly -o build/clawchaind ./cmd/clawchaind

build-all: build build-services build-tools build-price-feeder build-clawd build-ts-tools
	@echo "--> All binaries built"

build-services:
	@echo "--> Building all Go services"
	@go build $(BUILD_FLAGS) -mod=readonly -o build/claw-faucet ./cmd/claw-faucet
	@go build $(BUILD_FLAGS) -mod=readonly -o build/claw-eventsd ./cmd/claw-eventsd
	@go build $(BUILD_FLAGS) -mod=readonly -o build/claw-notifyd ./cmd/claw-notifyd
	@go build $(BUILD_FLAGS) -mod=readonly -o build/claw-inference-sidecar ./cmd/claw-inference-sidecar
	@go build $(BUILD_FLAGS) -mod=readonly -o build/claw-gpu-provider ./cmd/claw-gpu-provider
	@go build $(BUILD_FLAGS) -mod=readonly -o build/claw-txhistoryd ./cmd/claw-txhistoryd

build-price-feeder:
	@echo "--> Building oracle price feeder"
	@cd cmd/claw-price-feeder && go build -o ../../build/claw-price-feeder .

build-tools:
	@echo "--> Building CLI tools"
	@go build $(BUILD_FLAGS) -mod=readonly -o build/clawproof ./cmd/clawproof

build-clawd:
	@echo "--> Building clawd CLI"
	@cd cmd/clawd && npm run build

build-web:
	@echo "--> Building web dashboard"
	@cd web && npx vite build

build-explorer:
	@echo "--> Building block explorer"
	@cd claw-explorer && yarn build

build-dex:
	@echo "--> Building ClawDEX app"
	@cd dex-app && npx next build

build-docs:
	@echo "--> Building documentation site"
	@cd docs-site && npm run build

build-landing:
	@echo "--> Building landing page"
	@cd landing && npx vite build

build-ts-tools:
	@echo "--> Building TypeScript tool services"
	@cd cmd/claw-artemis && npm install && npx tsc
	@cd cmd/claw-cryo && npm install && npx tsc
	@cd cmd/claw-data-portal && npm install && npx tsc
	@cd cmd/claw-flood && npm install && npx tsc
	@cd cmd/claw-flux && npm install && npx tsc
	@cd cmd/claw-rivet && npm install && npx tsc

test-ts-tools:
	@echo "--> Testing TypeScript tool services"
	@cd cmd/claw-artemis && npm test
	@cd cmd/claw-cryo && npm test
	@cd cmd/claw-data-portal && npm test
	@cd cmd/claw-flood && npm test
	@cd cmd/claw-flux && npm test
	@cd cmd/claw-rivet && npm test

build-frontend: build-web build-explorer build-dex build-docs build-landing
	@echo "--> All frontend apps built"

docker-build:
	@echo "--> Building Docker image"
	@docker build -t clawchain:latest .

docker-build-all:
	@echo "--> Building all Docker images"
	@docker compose build

docker-up:
	@echo "--> Starting ClawChain full stack (docker compose)"
	@docker compose up -d

docker-up-gpu:
	@echo "--> Starting ClawChain full stack with GPU provider"
	@docker compose --profile gpu up -d

docker-up-tools:
	@echo "--> Starting ClawChain full stack with developer tools"
	@docker compose --profile tools up -d

docker-up-all:
	@echo "--> Starting ClawChain full stack with all profiles"
	@docker compose --profile gpu --profile tools up -d

docker-down:
	@echo "--> Stopping ClawChain stack"
	@docker compose down

docker-logs:
	@echo "--> Following Docker compose logs"
	@docker compose logs -f

docker-health:
	@echo "--> Checking Docker service health"
	@bash scripts/health-check-all.sh --docker

health:
	@echo "--> Running full health check"
	@bash scripts/health-check-all.sh

.PHONY: build build-all build-services build-tools build-clawd build-ts-tools test-ts-tools build-web build-explorer build-dex build-docs build-landing build-frontend docker-build docker-build-all docker-up docker-up-gpu docker-up-tools docker-up-all docker-down docker-logs docker-health health

#############################
###  Backup  &  Restore  ###
#############################

backup:
	@echo "--> Creating ClawChain state backup"
	@bash ./scripts/backup-state.sh

restore:
	@echo "--> Restoring ClawChain state from backup"
	@test -n "$(BACKUP)" || (echo "Usage: make restore BACKUP=<path-to-tar.gz> [GENESIS_RESTORE=1]" && exit 1)
	@GENESIS_RESTORE="$(GENESIS_RESTORE)" bash ./scripts/restore-state.sh "$(BACKUP)"

.PHONY: backup restore

####################
###  Monitoring  ###
####################

monitoring-setup:
	@echo "--> Setting up monitoring stack"
	@bash ./scripts/monitoring-setup.sh

.PHONY: monitoring-setup

##################
###  Testnet   ###
##################

testnet-init: install
	@echo "--> Initializing 4-validator testnet"
	@cd testnet && ./setup-testnet.sh 4

testnet-start:
	@echo "--> Starting testnet (docker compose)"
	@cd testnet && docker compose up -d

testnet-stop:
	@echo "--> Stopping testnet"
	@cd testnet && docker compose down

testnet-logs:
	@cd testnet && docker compose logs -f

testnet-test:
	@echo "--> Running testnet scenarios"
	@cd testnet && ./test-scenarios.sh

testnet-clean:
	@echo "--> Cleaning testnet data"
	@rm -rf testnet/data

testnet-restart: testnet-stop testnet-clean testnet-init testnet-start

testnet-stress:
	@echo "--> Running stress test (default: 500 txs, 10 workers)"
	@cd testnet && ./stress-test.sh

testnet-stress-heavy:
	@echo "--> Running heavy stress test (2000 txs, 20 workers)"
	@cd testnet && ./stress-test.sh 2000 20

load-test:
	@echo "--> Running agent load test (default: 10 agents)"
	@AGENT_COUNT=$(or $(AGENT_COUNT),10) bash ./scripts/load-test.sh

load-test-heavy:
	@echo "--> Running heavy agent load test (50 agents)"
	@AGENT_COUNT=$(or $(AGENT_COUNT),50) bash ./scripts/load-test.sh

incident-drill:
	@echo "--> Running incident response drill (all scenarios)"
	@bash ./scripts/incident-drill.sh all

incident-drill-halt:
	@echo "--> Running halt drill"
	@bash ./scripts/incident-drill.sh halt

incident-drill-rollback:
	@echo "--> Running rollback drill"
	@bash ./scripts/incident-drill.sh rollback

incident-drill-backup:
	@echo "--> Running backup round-trip drill"
	@bash ./scripts/incident-drill.sh backup

gate-summary:
	@echo "--> Running release gate summary"
	@bash ./scripts/gate-summary.sh

gate-summary-json:
	@bash ./scripts/gate-summary.sh --json

monthly-report-gate:
	@echo "--> Checking monthly report gate"
	@bash ./scripts/check-monthly-report-gate.sh

nightly-ops-pack:
	@echo "--> Generating nightly operations pack"
	@DAY_UTC="$(if $(DAY_UTC),$(DAY_UTC),$(shell date -u +%Y%m%d))" MANIFEST="$(MANIFEST)" HOST="$(HOST)" OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/operations)" bash ./scripts/generate-nightly-ops-pack.sh

weekly-incident-drill-pack:
	@echo "--> Generating weekly incident drill pack"
	@WEEK_ID="$(if $(WEEK_ID),$(WEEK_ID),$(shell date -u +%G-W%V))" OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/operations)" FAIL_ON_DRILL_ERROR="$(if $(FAIL_ON_DRILL_ERROR),$(FAIL_ON_DRILL_ERROR),0)" bash ./scripts/generate-weekly-incident-drill-pack.sh

weekly-incident-drill-closure-gate:
	@echo "--> Checking weekly incident drill closure"
	@bash ./scripts/check-weekly-incident-drill-pack.sh "$(if $(ARTIFACT),$(ARTIFACT),artifacts/operations/weekly-incident-drill-pack-latest.json)"

monthly-governance-pack:
	@echo "--> Generating monthly governance pack"
	@MONTH_ID="$(if $(MONTH_ID),$(MONTH_ID),$(shell date -u +%Y-%m))" OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/governance)" bash ./scripts/generate-monthly-governance-pack.sh

monthly-governance-closure-gate:
	@echo "--> Checking monthly governance closure"
	@bash ./scripts/check-monthly-governance-pack-gate.sh "$(if $(ARTIFACT),$(ARTIFACT),artifacts/governance/monthly-governance-pack-latest.json)"

nightly-cron:
	@echo "--> Running nightly gate summary + evidence refresh"
	@mkdir -p artifacts/evidence
	@./scripts/gate-summary.sh --json > artifacts/evidence/nightly-$$(date -u +%Y%m%dT%H%M%SZ).json
	@echo "Nightly gate summary + evidence refresh complete."

monthly-report-pack:
	@echo "--> Running monthly governance report gate"
	@./scripts/check-monthly-report-gate.sh
	@echo "Monthly governance report gate passed."

testnet-benchmark:
	@echo "--> Running hardware benchmarks"
	@cd testnet && ./benchmark.sh

testnet-backup:
	@echo "--> Creating testnet backup"
	@cd testnet && ./backup.sh

testnet-backup-live:
	@echo "--> Creating live testnet backup"
	@cd testnet && ./backup.sh --live

testnet-restore:
	@echo "--> Restoring testnet from backup"
	@test -n "$(BACKUP)" || (echo "Usage: make testnet-restore BACKUP=<path-to-tar.gz>" && exit 1)
	@cd testnet && ./restore.sh "$(BACKUP)"

demo:
	@echo "--> Running E2E demo"
	@cd demo && ./demo.sh

##############################
###  PRD Full Build Gate   ###
##############################

protocol-contract-pack:
	@echo "--> Protocol contract pack (fast coherence checks)"
	@cd openclaw && pnpm run gateway:contract:check

protocol-sanity: protocol-contract-pack
	@echo "--> Protocol sanity guards"
	@bash scripts/check-readme-sync.sh
	@node scripts/check-prd-claims.mjs
	@node scripts/check-prd-semantic.mjs
	@bash scripts/check-protocol-surface-lock.sh
	@bash scripts/check-openclaw-contract-literals.sh
	@bash scripts/check-capability-determinism.sh
	@bash scripts/check-security-economic-policy.sh
	@bash scripts/check-sla-reputation-coupling.sh
	@bash scripts/check-upgrade-readiness.sh

protocol-surface-lock-check:
	@echo "--> Checking frozen protocol surface lock"
	@bash scripts/check-protocol-surface-lock.sh

protocol-surface-lock-refresh:
	@echo "--> Refreshing frozen protocol surface lock"
	@mkdir -p contracts
	@{ \
		find proto/clawchain/agent proto/clawchain/messaging proto/clawchain/privacy proto/clawchain/marketplace proto/clawchain/reputation -type f -name '*.proto' | sort; \
		printf '%s\n' sdk/src/constants.ts sdk/src/types.ts sdk/src/client.ts sdk/src/generated/proto-contracts.ts; \
	} | while read -r f; do \
		if command -v sha256sum >/dev/null 2>&1; then \
			sha256sum "$$f" | awk '{print $$1 "  " $$2}'; \
		else \
			shasum -a 256 "$$f" | awk '{print $$1 "  " $$2}'; \
		fi; \
	done | sort -k2,2 > contracts/protocol-surface.lock
	@echo "Updated contracts/protocol-surface.lock"

protocol-surface-changelog:
	@echo "--> Generating protocol surface changelog"
	@bash scripts/generate-protocol-surface-changelog.sh

prd-verify:
	@echo "--> PRD verification checks"
	@node scripts/check-prd-claims.mjs
	@node scripts/check-prd-semantic.mjs
	@node scripts/check-branch-protection-policy.mjs

branch-protection-verify:
	@echo "--> Branch protection policy verification"
	@node scripts/check-branch-protection-policy.mjs

prd-build:
	@echo "--> PRD full build gate"
	@echo "   0) Protocol sanity preflight"
	@$(MAKE) protocol-sanity
	@echo "   1) Go build"
	@GOCACHE=/tmp/go-build go build ./...
	@echo "   2) Go module tests"
	@GOCACHE=/tmp/go-build go test ./x/privacy/... ./x/agent/... ./x/marketplace/... ./x/reputation/...
	@echo "   3) SDK build + tests"
	@cd sdk && npm run proto:check && npm run build && npm test
	@echo "   4) clawd CLI build"
	@cd cmd/clawd && npm install --silent && npx tsc --noEmit
	@echo "   5) Web dashboard type check"
	@cd web && npm install --silent && npx tsc --noEmit
	@echo "   6) Script syntax validation"
	@bash -n demo/demo.sh
	@bash -n testnet/test-scenarios.sh
	@if [ "$(ENABLE_RUNTIME_READINESS_GATE)" = "1" ]; then \
		echo "   7) Runtime readiness gate"; \
		$(MAKE) runtime-readiness-gate; \
	else \
		echo "   7) Runtime readiness gate skipped (set ENABLE_RUNTIME_READINESS_GATE=1 to enforce)"; \
	fi
	@if [ "$(ENABLE_FRESH_MACHINE_ACCEPTANCE_GATE)" = "1" ]; then \
		echo "   8) Fresh-machine acceptance gate"; \
		$(MAKE) fresh-machine-acceptance-gate MANIFEST="$(MANIFEST)" HOST="$(HOST)" READY_TIMEOUT_SECONDS="$(if $(READY_TIMEOUT_SECONDS),$(READY_TIMEOUT_SECONDS),180)" ACCEPTANCE_TIMEOUT_SECONDS="$(if $(ACCEPTANCE_TIMEOUT_SECONDS),$(ACCEPTANCE_TIMEOUT_SECONDS),300)"; \
	else \
		echo "   8) Fresh-machine acceptance gate skipped (set ENABLE_FRESH_MACHINE_ACCEPTANCE_GATE=1 and pass MANIFEST/HOST to enforce)"; \
	fi
	@echo "--> PRD build gate passed"

##############################
###  Operator Onboarding   ###
##############################

clawd-ensure-build:
	@test -f cmd/clawd/dist/main.js || (echo "Missing cmd/clawd/dist/main.js. Run: make clawd-build" && exit 1)

clawd-build:
	@echo "--> Building clawd CLI"
	@cd cmd/clawd && npm install && npm run build

openclaw-up:
	@echo "--> Running openclaw up (delegates to clawd up)"
	@cd openclaw && node --import tsx src/entry.ts up $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,)

openclaw-up-json:
	@echo "--> Running openclaw up (--json)"
	@cd openclaw && node --import tsx src/entry.ts up --json $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,)

openclaw-up-ready:
	@echo "--> Running openclaw up with strict readiness gate"
	@cd openclaw && node --import tsx src/entry.ts up $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",)

openclaw-up-ready-json:
	@echo "--> Running openclaw up with strict readiness gate (--json)"
	@cd openclaw && node --import tsx src/entry.ts up --json $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",)

openclaw-up-ready-assert:
	@echo "--> Running openclaw up strict readiness with JSON assertion"
	@cd openclaw && node --import tsx src/entry.ts up --json $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",) | node ../scripts/assert-up-report.mjs --require-ready

openclaw-agent-flow:
	@echo "--> Running openclaw agent-flow"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make openclaw-agent-flow ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@test -n "$(DESCRIPTION)" || (echo "Usage: make openclaw-agent-flow ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@cd openclaw && node --import tsx src/entry.ts agent-flow --assignee "$(ASSIGNEE)" --description "$(DESCRIPTION)" $(if $(REQUIREMENTS),--requirements "$(REQUIREMENTS)",) $(if $(SKILL_ID),--skill-id "$(SKILL_ID)",) $(if $(BUDGET),--budget "$(BUDGET)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",) $(if $(AUTO_ACCEPT),--auto-accept,) $(if $(AUTO_COMPLETE),--auto-complete,) $(if $(COMPLETION_RESULT),--completion-result "$(COMPLETION_RESULT)",)

openclaw-agent-flow-json:
	@echo "--> Running openclaw agent-flow (--json)"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make openclaw-agent-flow-json ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@test -n "$(DESCRIPTION)" || (echo "Usage: make openclaw-agent-flow-json ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@cd openclaw && node --import tsx src/entry.ts agent-flow --json --assignee "$(ASSIGNEE)" --description "$(DESCRIPTION)" $(if $(REQUIREMENTS),--requirements "$(REQUIREMENTS)",) $(if $(SKILL_ID),--skill-id "$(SKILL_ID)",) $(if $(BUDGET),--budget "$(BUDGET)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",) $(if $(AUTO_ACCEPT),--auto-accept,) $(if $(AUTO_COMPLETE),--auto-complete,) $(if $(COMPLETION_RESULT),--completion-result "$(COMPLETION_RESULT)",)

openclaw-product-flow:
	@echo "--> Running openclaw product-flow"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make openclaw-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(TASK_DESCRIPTION)" || (echo "Usage: make openclaw-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(MESSAGE_CIPHERTEXT)" || (echo "Usage: make openclaw-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(SKILL_ID)" || (echo "Usage: make openclaw-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@cd openclaw && node --import tsx src/entry.ts product-flow --assignee "$(ASSIGNEE)" --task-description "$(TASK_DESCRIPTION)" --message-ciphertext "$(MESSAGE_CIPHERTEXT)" --skill-id "$(SKILL_ID)" $(if $(MESSAGE_RECIPIENT),--message-recipient "$(MESSAGE_RECIPIENT)",) $(if $(MESSAGE_NONCE),--message-nonce "$(MESSAGE_NONCE)",) $(if $(ESCROW_DESCRIPTION),--escrow-description "$(ESCROW_DESCRIPTION)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(MILESTONES),--milestones "$(MILESTONES)",) $(if $(RATING_SCORE),--rating-score "$(RATING_SCORE)",) $(if $(RATING_COMMENT),--rating-comment "$(RATING_COMMENT)",) $(if $(ENDORSEMENT_REASON),--endorsement-reason "$(ENDORSEMENT_REASON)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",)

openclaw-product-flow-json:
	@echo "--> Running openclaw product-flow (--json)"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make openclaw-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(TASK_DESCRIPTION)" || (echo "Usage: make openclaw-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(MESSAGE_CIPHERTEXT)" || (echo "Usage: make openclaw-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(SKILL_ID)" || (echo "Usage: make openclaw-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@cd openclaw && node --import tsx src/entry.ts product-flow --json --assignee "$(ASSIGNEE)" --task-description "$(TASK_DESCRIPTION)" --message-ciphertext "$(MESSAGE_CIPHERTEXT)" --skill-id "$(SKILL_ID)" $(if $(MESSAGE_RECIPIENT),--message-recipient "$(MESSAGE_RECIPIENT)",) $(if $(MESSAGE_NONCE),--message-nonce "$(MESSAGE_NONCE)",) $(if $(ESCROW_DESCRIPTION),--escrow-description "$(ESCROW_DESCRIPTION)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(MILESTONES),--milestones "$(MILESTONES)",) $(if $(RATING_SCORE),--rating-score "$(RATING_SCORE)",) $(if $(RATING_COMMENT),--rating-comment "$(RATING_COMMENT)",) $(if $(ENDORSEMENT_REASON),--endorsement-reason "$(ENDORSEMENT_REASON)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",)

openclaw-product-flow-assert:
	@echo "--> Running openclaw product-flow with JSON assertion"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make openclaw-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(TASK_DESCRIPTION)" || (echo "Usage: make openclaw-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(MESSAGE_CIPHERTEXT)" || (echo "Usage: make openclaw-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(SKILL_ID)" || (echo "Usage: make openclaw-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@cd openclaw && node --import tsx src/entry.ts product-flow --json --assignee "$(ASSIGNEE)" --task-description "$(TASK_DESCRIPTION)" --message-ciphertext "$(MESSAGE_CIPHERTEXT)" --skill-id "$(SKILL_ID)" $(if $(MESSAGE_RECIPIENT),--message-recipient "$(MESSAGE_RECIPIENT)",) $(if $(MESSAGE_NONCE),--message-nonce "$(MESSAGE_NONCE)",) $(if $(ESCROW_DESCRIPTION),--escrow-description "$(ESCROW_DESCRIPTION)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(MILESTONES),--milestones "$(MILESTONES)",) $(if $(RATING_SCORE),--rating-score "$(RATING_SCORE)",) $(if $(RATING_COMMENT),--rating-comment "$(RATING_COMMENT)",) $(if $(ENDORSEMENT_REASON),--endorsement-reason "$(ENDORSEMENT_REASON)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",) | node ../scripts/assert-product-flow-report.mjs

openclaw-up-profile-vps:
	@echo "--> Running reproducible VPS startup profile"
	@test -n "$(MANIFEST)" || (echo "Usage: make openclaw-up-profile-vps MANIFEST=<manifest-url-or-path> HOST=<public-host> [READY_TIMEOUT_SECONDS=180]" && exit 1)
	@test -n "$(HOST)" || (echo "Usage: make openclaw-up-profile-vps MANIFEST=<manifest-url-or-path> HOST=<public-host> [READY_TIMEOUT_SECONDS=180]" && exit 1)
	@$(MAKE) openclaw-up-ready MANIFEST="$(MANIFEST)" HOST="$(HOST)" REQUEST_FAUCET=1 READY_TIMEOUT_SECONDS="$(if $(READY_TIMEOUT_SECONDS),$(READY_TIMEOUT_SECONDS),180)"

openclaw-up-profile-macmini:
	@echo "--> Running reproducible Mac mini startup profile"
	@test -n "$(MANIFEST)" || (echo "Usage: make openclaw-up-profile-macmini MANIFEST=<manifest-url-or-path> [HOST=<public-host>] [READY_TIMEOUT_SECONDS=180]" && exit 1)
	@$(MAKE) openclaw-up-ready MANIFEST="$(MANIFEST)" $(if $(HOST),HOST="$(HOST)",) REQUEST_FAUCET=1 READY_TIMEOUT_SECONDS="$(if $(READY_TIMEOUT_SECONDS),$(READY_TIMEOUT_SECONDS),180)"

openclaw-up-profile-local:
	@echo "--> Running reproducible local-dev startup profile"
	@cd openclaw && node --import tsx src/entry.ts up --skip-ready-gate --skip-join

clawd-up: clawd-ensure-build
	@echo "--> Running clawd up (init-if-needed + optional join + start)"
	@cd cmd/clawd && node ./dist/main.js up $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,)

clawd-up-json: clawd-ensure-build
	@echo "--> Running clawd up (--json)"
	@cd cmd/clawd && node ./dist/main.js up --json $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,)

clawd-up-ready: clawd-ensure-build
	@echo "--> Running clawd up with strict readiness gate"
	@cd cmd/clawd && node ./dist/main.js up $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",)

clawd-up-ready-json: clawd-ensure-build
	@echo "--> Running clawd up with strict readiness gate (--json)"
	@cd cmd/clawd && node ./dist/main.js up --json $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",)

clawd-up-ready-assert: clawd-ensure-build
	@echo "--> Running clawd up strict readiness with JSON assertion"
	@cd cmd/clawd && node ./dist/main.js up --json $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(NODECARD),--from-nodecard "$(NODECARD)",) $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(REQUEST_FAUCET),--request-faucet,) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",) | node ../../scripts/assert-up-report.mjs --require-ready

clawd-bootstrap: clawd-ensure-build
	@echo "--> Running clawd bootstrap"
	@test -n "$(MANIFEST)" || (echo "Usage: make clawd-bootstrap MANIFEST=<manifest-url-or-path> [HOST=<public-host>] [MESSAGING_ENDPOINT=<url>] [NO_SYNC_GENESIS=1]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js bootstrap --from-manifest "$(MANIFEST)" $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --request-faucet

clawd-bootstrap-ready: clawd-ensure-build
	@echo "--> Running clawd bootstrap with strict readiness gate"
	@test -n "$(MANIFEST)" || (echo "Usage: make clawd-bootstrap-ready MANIFEST=<manifest-url-or-path> [HOST=<public-host>] [MESSAGING_ENDPOINT=<url>] [NO_SYNC_GENESIS=1] [READY_TIMEOUT_SECONDS=180]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js bootstrap --from-manifest "$(MANIFEST)" $(if $(HOST),--host "$(HOST)",) $(if $(MESSAGING_ENDPOINT),--messaging-endpoint "$(MESSAGING_ENDPOINT)",) $(if $(NO_SYNC_GENESIS),--no-sync-genesis,) --request-faucet --require-ready $(if $(READY_TIMEOUT_SECONDS),--ready-timeout-seconds "$(READY_TIMEOUT_SECONDS)",)

clawd-doctor: clawd-ensure-build
	@echo "--> Running clawd doctor"
	@cd cmd/clawd && node ./dist/main.js doctor

clawd-agent-flow: clawd-ensure-build
	@echo "--> Running clawd agent-flow"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make clawd-agent-flow ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@test -n "$(DESCRIPTION)" || (echo "Usage: make clawd-agent-flow ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js agent-flow --assignee "$(ASSIGNEE)" --description "$(DESCRIPTION)" $(if $(REQUIREMENTS),--requirements "$(REQUIREMENTS)",) $(if $(SKILL_ID),--skill-id "$(SKILL_ID)",) $(if $(BUDGET),--budget "$(BUDGET)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",) $(if $(AUTO_ACCEPT),--auto-accept,) $(if $(AUTO_COMPLETE),--auto-complete,) $(if $(COMPLETION_RESULT),--completion-result "$(COMPLETION_RESULT)",)

clawd-agent-flow-json: clawd-ensure-build
	@echo "--> Running clawd agent-flow (--json)"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make clawd-agent-flow-json ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@test -n "$(DESCRIPTION)" || (echo "Usage: make clawd-agent-flow-json ASSIGNEE=<bech32-address> DESCRIPTION=\"<task description>\" [REQUIREMENTS=<text>] [SKILL_ID=0] [BUDGET=1000uclaw] [DEADLINE_BLOCKS=100] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>] [AUTO_ACCEPT=1] [AUTO_COMPLETE=1] [COMPLETION_RESULT=<text>]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js agent-flow --json --assignee "$(ASSIGNEE)" --description "$(DESCRIPTION)" $(if $(REQUIREMENTS),--requirements "$(REQUIREMENTS)",) $(if $(SKILL_ID),--skill-id "$(SKILL_ID)",) $(if $(BUDGET),--budget "$(BUDGET)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",) $(if $(AUTO_ACCEPT),--auto-accept,) $(if $(AUTO_COMPLETE),--auto-complete,) $(if $(COMPLETION_RESULT),--completion-result "$(COMPLETION_RESULT)",)

clawd-product-flow: clawd-ensure-build
	@echo "--> Running clawd product-flow"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make clawd-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(TASK_DESCRIPTION)" || (echo "Usage: make clawd-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(MESSAGE_CIPHERTEXT)" || (echo "Usage: make clawd-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(SKILL_ID)" || (echo "Usage: make clawd-product-flow ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js product-flow --assignee "$(ASSIGNEE)" --task-description "$(TASK_DESCRIPTION)" --message-ciphertext "$(MESSAGE_CIPHERTEXT)" --skill-id "$(SKILL_ID)" $(if $(MESSAGE_RECIPIENT),--message-recipient "$(MESSAGE_RECIPIENT)",) $(if $(MESSAGE_NONCE),--message-nonce "$(MESSAGE_NONCE)",) $(if $(ESCROW_DESCRIPTION),--escrow-description "$(ESCROW_DESCRIPTION)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(MILESTONES),--milestones "$(MILESTONES)",) $(if $(RATING_SCORE),--rating-score "$(RATING_SCORE)",) $(if $(RATING_COMMENT),--rating-comment "$(RATING_COMMENT)",) $(if $(ENDORSEMENT_REASON),--endorsement-reason "$(ENDORSEMENT_REASON)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",)

clawd-product-flow-json: clawd-ensure-build
	@echo "--> Running clawd product-flow (--json)"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make clawd-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(TASK_DESCRIPTION)" || (echo "Usage: make clawd-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(MESSAGE_CIPHERTEXT)" || (echo "Usage: make clawd-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(SKILL_ID)" || (echo "Usage: make clawd-product-flow-json ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js product-flow --json --assignee "$(ASSIGNEE)" --task-description "$(TASK_DESCRIPTION)" --message-ciphertext "$(MESSAGE_CIPHERTEXT)" --skill-id "$(SKILL_ID)" $(if $(MESSAGE_RECIPIENT),--message-recipient "$(MESSAGE_RECIPIENT)",) $(if $(MESSAGE_NONCE),--message-nonce "$(MESSAGE_NONCE)",) $(if $(ESCROW_DESCRIPTION),--escrow-description "$(ESCROW_DESCRIPTION)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(MILESTONES),--milestones "$(MILESTONES)",) $(if $(RATING_SCORE),--rating-score "$(RATING_SCORE)",) $(if $(RATING_COMMENT),--rating-comment "$(RATING_COMMENT)",) $(if $(ENDORSEMENT_REASON),--endorsement-reason "$(ENDORSEMENT_REASON)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",)

clawd-product-flow-assert: clawd-ensure-build
	@echo "--> Running clawd product-flow with JSON assertion"
	@test -n "$(ASSIGNEE)" || (echo "Usage: make clawd-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(TASK_DESCRIPTION)" || (echo "Usage: make clawd-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(MESSAGE_CIPHERTEXT)" || (echo "Usage: make clawd-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@test -n "$(SKILL_ID)" || (echo "Usage: make clawd-product-flow-assert ASSIGNEE=<bech32-address> TASK_DESCRIPTION=\"<task description>\" MESSAGE_CIPHERTEXT=\"<ciphertext>\" SKILL_ID=<id> [MESSAGE_RECIPIENT=<bech32>] [MESSAGE_NONCE=<text>] [ESCROW_DESCRIPTION=<text>] [DEADLINE_BLOCKS=100] [MILESTONES=1] [RATING_SCORE=5] [RATING_COMMENT=<text>] [ENDORSEMENT_REASON=<text>] [ENDPOINT=<url>] [METADATA=<text>] [NAME=<agent-name>]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js product-flow --json --assignee "$(ASSIGNEE)" --task-description "$(TASK_DESCRIPTION)" --message-ciphertext "$(MESSAGE_CIPHERTEXT)" --skill-id "$(SKILL_ID)" $(if $(MESSAGE_RECIPIENT),--message-recipient "$(MESSAGE_RECIPIENT)",) $(if $(MESSAGE_NONCE),--message-nonce "$(MESSAGE_NONCE)",) $(if $(ESCROW_DESCRIPTION),--escrow-description "$(ESCROW_DESCRIPTION)",) $(if $(DEADLINE_BLOCKS),--deadline-blocks "$(DEADLINE_BLOCKS)",) $(if $(MILESTONES),--milestones "$(MILESTONES)",) $(if $(RATING_SCORE),--rating-score "$(RATING_SCORE)",) $(if $(RATING_COMMENT),--rating-comment "$(RATING_COMMENT)",) $(if $(ENDORSEMENT_REASON),--endorsement-reason "$(ENDORSEMENT_REASON)",) $(if $(ENDPOINT),--endpoint "$(ENDPOINT)",) $(if $(METADATA),--metadata "$(METADATA)",) $(if $(NAME),--name "$(NAME)",) | node ../../scripts/assert-product-flow-report.mjs

autonomous-skill-map-gate: clawd-ensure-build
	@echo "--> Running autonomous skill-map strict gate"
	@bash ./scripts/check-autonomous-skill-map-gate.sh

product-flow-gate:
	@echo "--> Running aggregate product-flow gate"
	@$(MAKE) openclaw-product-flow-assert ASSIGNEE="$(ASSIGNEE)" TASK_DESCRIPTION="$(TASK_DESCRIPTION)" MESSAGE_CIPHERTEXT="$(MESSAGE_CIPHERTEXT)" SKILL_ID="$(SKILL_ID)" MESSAGE_RECIPIENT="$(MESSAGE_RECIPIENT)" MESSAGE_NONCE="$(MESSAGE_NONCE)" ESCROW_DESCRIPTION="$(ESCROW_DESCRIPTION)" DEADLINE_BLOCKS="$(DEADLINE_BLOCKS)" MILESTONES="$(MILESTONES)" RATING_SCORE="$(RATING_SCORE)" RATING_COMMENT="$(RATING_COMMENT)" ENDORSEMENT_REASON="$(ENDORSEMENT_REASON)" ENDPOINT="$(ENDPOINT)" METADATA="$(METADATA)" NAME="$(NAME)"
	@$(MAKE) clawd-product-flow-assert ASSIGNEE="$(ASSIGNEE)" TASK_DESCRIPTION="$(TASK_DESCRIPTION)" MESSAGE_CIPHERTEXT="$(MESSAGE_CIPHERTEXT)" SKILL_ID="$(SKILL_ID)" MESSAGE_RECIPIENT="$(MESSAGE_RECIPIENT)" MESSAGE_NONCE="$(MESSAGE_NONCE)" ESCROW_DESCRIPTION="$(ESCROW_DESCRIPTION)" DEADLINE_BLOCKS="$(DEADLINE_BLOCKS)" MILESTONES="$(MILESTONES)" RATING_SCORE="$(RATING_SCORE)" RATING_COMMENT="$(RATING_COMMENT)" ENDORSEMENT_REASON="$(ENDORSEMENT_REASON)" ENDPOINT="$(ENDPOINT)" METADATA="$(METADATA)" NAME="$(NAME)"

runtime-readiness-gate: clawd-ensure-build
	@echo "--> Running runtime readiness gate (clawd readiness --json)"
	@cd cmd/clawd && node ./dist/main.js readiness --json | node ../../scripts/assert-readiness-report.mjs

slice-a-operatorization-gate: clawd-ensure-build
	@echo "--> Running Slice A operatorization gate"
	@bash ./scripts/check-slice-a-operatorization.sh

capability-determinism-gate:
	@echo "--> Running capability metadata determinism gate"
	@bash ./scripts/check-capability-determinism.sh

security-economic-policy-gate:
	@echo "--> Running security/economic policy gate"
	@bash ./scripts/check-security-economic-policy.sh

sla-reputation-coupling-gate:
	@echo "--> Running SLA/reputation coupling gate"
	@bash ./scripts/check-sla-reputation-coupling.sh

pre-upgrade-compatibility-gate:
	@echo "--> Running pre-upgrade compatibility gate"
	@bash ./scripts/check-pre-upgrade-compatibility.sh

upgrade-readiness-gate:
	@echo "--> Running upgrade-readiness gate"
	@bash ./scripts/check-upgrade-readiness.sh

validate-upgrade:
	@echo "--> Running upgrade handler validation"
	@bash ./scripts/validate-upgrade.sh $(if $(HEIGHT),--height "$(HEIGHT)",) $(if $(BINARY),--binary "$(BINARY)",) $(if $(CHAIN_ID),--chain-id "$(CHAIN_ID)",)

mainnet-capacity-gate:
	@echo "--> Running mainnet capacity gate"
	@bash ./scripts/check-mainnet-capacity-gate.sh

mainnet-launch-program-gate:
	@echo "--> Running mainnet launch program gate"
	@bash ./scripts/check-mainnet-launch-program-gate.sh

launch-artifact-completeness-gate:
	@echo "--> Running launch artifact completeness gate"
	@bash ./scripts/check-launch-artifact-completeness.sh

production-infrastructure-gate:
	@echo "--> Running production infrastructure gate"
	@bash ./scripts/check-production-infrastructure-gate.sh

chain-hardening-gate:
	@echo "--> Running chain hardening gate"
	@bash ./scripts/check-chain-hardening-gate.sh

runtime-hardening-gate:
	@echo "--> Running runtime hardening gate"
	@bash ./scripts/check-runtime-hardening-gate.sh

ecosystem-integrator-gate:
	@echo "--> Running ecosystem/integrator gate"
	@bash ./scripts/check-ecosystem-integrator-gate.sh

governance-operations-gate:
	@echo "--> Running governance/operations gate"
	@bash ./scripts/check-governance-operations-gate.sh

drill-evidence-gate:
	@echo "--> Running drill evidence gate"
	@bash ./scripts/check-drill-evidence-gate.sh

growth-user-layer-gate:
	@echo "--> Running growth/user-layer gate"
	@bash ./scripts/check-growth-user-layer-gate.sh

capacity-slo-evidence-gate:
	@echo "--> Running capacity/SLO evidence gate"
	@bash ./scripts/check-capacity-slo-evidence-gate.sh

production-data-replacement-gate:
	@echo "--> Running production data replacement gate"
	@bash ./scripts/check-production-data-replacement-gate.sh

real-world-external-validation-gate:
	@echo "--> Running real-world external validation gate"
	@bash ./scripts/check-real-world-external-validation-gate.sh

mainnet-cutover-rehearsal-gate:
	@echo "--> Running mainnet cutover rehearsal gate"
	@bash ./scripts/check-mainnet-cutover-rehearsal-gate.sh

launch-day-operations-gate:
	@echo "--> Running launch-day operations gate"
	@bash ./scripts/check-launch-day-operations-gate.sh

first-week-stabilization-gate:
	@echo "--> Running first-week stabilization gate"
	@bash ./scripts/check-first-week-stabilization-gate.sh

phase16-automation-evidence-capture-gate:
	@echo "--> Running Phase 16 automation evidence capture gate"
	@bash ./scripts/check-phase16-automation-evidence-capture-gate.sh

phase16-reliability-alerting-gate:
	@echo "--> Running Phase 16 reliability and alerting gate"
	@bash ./scripts/check-phase16-reliability-alerting-gate.sh

phase16-operator-ux-gate:
	@echo "--> Running Phase 16 operator UX gate"
	@bash ./scripts/check-phase16-operator-ux-gate.sh

security-compliance-closure-evidence-gate:
	@echo "--> Running security/compliance closure evidence gate"
	@bash ./scripts/check-security-compliance-closure-evidence-gate.sh

ecosystem-readiness-proof-gate:
	@echo "--> Running ecosystem readiness proof gate"
	@bash ./scripts/check-ecosystem-readiness-proof-gate.sh

launch-decision-packet-gate:
	@echo "--> Running launch decision packet gate"
	@bash ./scripts/check-launch-decision-packet-gate.sh

security-review-gate:
	@echo "--> Running security review gate"
	@bash ./scripts/check-security-review-gate.sh

go-live-decision-gate:
	@echo "--> Running go-live decision gate"
	@bash ./scripts/check-go-live-decision-gate.sh

mainnet-readiness-gate:
	@echo "--> Running aggregate mainnet readiness gate"
	@bash ./scripts/check-mainnet-readiness-gate.sh

phase17-operator-bootstrap-gate:
	@echo "--> Running Phase 17 operator bootstrap gate"
	@bash ./scripts/check-phase17-operator-bootstrap-gate.sh

slice-c-privacy-operatorization-gate:
	@echo "--> Running Slice C privacy operatorization gate"
	@bash ./scripts/check-slice-c-privacy-operatorization.sh

slice-d-marketplace-operatorization-gate:
	@echo "--> Running Slice D marketplace/escrow/reputation operatorization gate"
	@bash ./scripts/check-slice-d-marketplace-operatorization.sh

fresh-machine-acceptance-gate: clawd-ensure-build
	@echo "--> Running fresh-machine prime acceptance gate"
	@test -n "$(MANIFEST)" || (echo "Usage: make fresh-machine-acceptance-gate MANIFEST=<manifest-url-or-path> HOST=<public-host> [READY_TIMEOUT_SECONDS=180] [ACCEPTANCE_TIMEOUT_SECONDS=300] [REQUEST_FAUCET=1]" && exit 1)
	@test -n "$(HOST)" || (echo "Usage: make fresh-machine-acceptance-gate MANIFEST=<manifest-url-or-path> HOST=<public-host> [READY_TIMEOUT_SECONDS=180] [ACCEPTANCE_TIMEOUT_SECONDS=300] [REQUEST_FAUCET=1]" && exit 1)
	@READY_TIMEOUT_SECONDS="$(if $(READY_TIMEOUT_SECONDS),$(READY_TIMEOUT_SECONDS),180)" ACCEPTANCE_TIMEOUT_SECONDS="$(if $(ACCEPTANCE_TIMEOUT_SECONDS),$(ACCEPTANCE_TIMEOUT_SECONDS),300)" REQUEST_FAUCET="$(if $(REQUEST_FAUCET),$(REQUEST_FAUCET),1)" bash ./scripts/fresh-machine-acceptance.sh "$(MANIFEST)" "$(HOST)"

fresh-machine-acceptance: fresh-machine-acceptance-gate
	@echo "--> Fresh-machine acceptance command flow passed"

one-command-agent-gate: fresh-machine-acceptance-gate
	@echo "--> One-command agent gate passed"

release-ready-gate:
	@echo "--> Running release-ready gate (no CI/test suite)"
	@MANIFEST="$(MANIFEST)" HOST="$(HOST)" bash ./scripts/check-release-ready-inputs.sh
	@$(MAKE) protocol-sanity
	@$(MAKE) mainnet-launch-program-gate
	@$(MAKE) launch-artifact-completeness-gate
	@$(MAKE) production-infrastructure-gate
	@$(MAKE) chain-hardening-gate
	@$(MAKE) runtime-hardening-gate
	@$(MAKE) ecosystem-integrator-gate
	@$(MAKE) governance-operations-gate
	@$(MAKE) drill-evidence-gate
	@$(MAKE) growth-user-layer-gate
	@$(MAKE) capacity-slo-evidence-gate
	@$(MAKE) production-data-replacement-gate
	@$(MAKE) real-world-external-validation-gate
	@$(MAKE) mainnet-cutover-rehearsal-gate
	@$(MAKE) launch-day-operations-gate
	@$(MAKE) first-week-stabilization-gate
	@$(MAKE) phase16-automation-evidence-capture-gate
	@$(MAKE) phase16-reliability-alerting-gate
	@$(MAKE) phase16-operator-ux-gate
	@$(MAKE) security-compliance-closure-evidence-gate
	@$(MAKE) ecosystem-readiness-proof-gate
	@$(MAKE) launch-decision-packet-gate
	@$(MAKE) mainnet-readiness-gate
	@$(MAKE) release-artifact-provenance-gate
	@$(MAKE) one-command-agent-gate MANIFEST="$(MANIFEST)" HOST="$(HOST)" READY_TIMEOUT_SECONDS="$(if $(READY_TIMEOUT_SECONDS),$(READY_TIMEOUT_SECONDS),180)" ACCEPTANCE_TIMEOUT_SECONDS="$(if $(ACCEPTANCE_TIMEOUT_SECONDS),$(ACCEPTANCE_TIMEOUT_SECONDS),300)"
	@$(MAKE) phase17-public-testnet-stability-gate
	@$(MAKE) phase18-real-endpoint-cutover-gate
	@$(MAKE) phase18-continuous-ops-gate
	@$(MAKE) public-testnet-reproducibility-proof-path
	@MANIFEST="$(MANIFEST)" HOST="$(HOST)" bash ./scripts/generate-release-evidence.sh
	@$(MAKE) phase19-evidence-drift-gate
	@echo "--> Release-ready gate passed"

release-evidence-pack:
	@echo "--> Generating release evidence pack"
	@MANIFEST="$(MANIFEST)" HOST="$(HOST)" bash ./scripts/generate-release-evidence.sh

release-artifact-provenance-pack:
	@echo "--> Generating release artifact provenance pack"
	@bash ./scripts/generate-release-artifact-provenance.sh

release-artifact-provenance-gate:
	@echo "--> Running release artifact provenance gate"
	@bash ./scripts/check-release-artifact-provenance.sh

clawd-nodecard: clawd-ensure-build
	@echo "--> Printing clawd nodecard"
	@cd cmd/clawd && node ./dist/main.js nodecard $(if $(HOST),--host "$(HOST)",) $(if $(P2P_PORT),--p2p-port "$(P2P_PORT)",) $(if $(WRITE),--write "$(WRITE)",) --out pretty

clawd-peers-verify: clawd-ensure-build
	@echo "--> Verifying configured seed peers"
	@cd cmd/clawd && node ./dist/main.js peers verify

clawd-peers-prune: clawd-ensure-build
	@echo "--> Pruning unreachable seed peers"
	@cd cmd/clawd && node ./dist/main.js peers prune-unreachable

clawd-peers-sync-manifest: clawd-ensure-build
	@echo "--> Syncing seeds from manifest"
	@test -n "$(MANIFEST)" || (echo "Usage: make clawd-peers-sync-manifest MANIFEST=<manifest-url-or-path> [REPLACE=1]" && exit 1)
	@cd cmd/clawd && node ./dist/main.js peers sync-manifest --from-manifest "$(MANIFEST)" $(if $(REPLACE),--replace,)

clawd-peers-auto-maintain: clawd-ensure-build
	@echo "--> Running peer auto-maintenance"
	@cd cmd/clawd && node ./dist/main.js peers auto-maintain $(if $(MANIFEST),--from-manifest "$(MANIFEST)",) $(if $(REPLACE),--replace-on-sync,) $(if $(DRY_RUN),--dry-run,)

clawd-peers-summary: clawd-ensure-build
	@echo "--> Printing peer summary"
	@cd cmd/clawd && node ./dist/main.js peers summary --out pretty

generate-daily-health-summary:
	@echo "--> Generating daily health summary artifact"
	@bash ./scripts/generate-daily-health-summary.sh "$(if $(DAY_UTC),$(DAY_UTC),$(shell date -u +%Y%m%d))"

generate-weekly-readiness-cadence-report:
	@echo "--> Generating weekly readiness cadence report"
	@bash ./scripts/generate-weekly-readiness-cadence-report.sh "$(if $(WEEK_ID),$(WEEK_ID),$(shell date -u +%Y%m%d))"

weekly-maintenance:
	@echo "--> Running weekly maintenance bundle"
	@MANIFEST="$(MANIFEST)" WEEK_ID="$(if $(WEEK_ID),$(WEEK_ID),$(shell date -u +%Y%m%d))" DAY_UTC="$(if $(DAY_UTC),$(DAY_UTC),$(shell date -u +%Y%m%d))" bash ./scripts/weekly-maintenance.sh

capture-launch-day-transcript:
	@echo "--> Capturing launch-day transcript"
	@test -n "$(LABEL)" || (echo "Usage: make capture-launch-day-transcript LABEL=<name> CMD=\"<command>\"" && exit 1)
	@test -n "$(CMD)" || (echo "Usage: make capture-launch-day-transcript LABEL=<name> CMD=\"<command>\"" && exit 1)
	@bash -lc "bash ./scripts/capture-launch-day-transcript.sh '$(LABEL)' -- $(CMD)"

prd-e2e:
	@echo "--> PRD live E2E gate (testnet + scenarios + demo)"
	@bash -lc 'set -euo pipefail; \
		ROOT="$$(pwd)"; \
		PRD_E2E_BUILD="$${PRD_E2E_BUILD:-1}"; \
		DOCKER_UP_FLAGS="-d"; \
		if [ "$$PRD_E2E_BUILD" = "1" ]; then DOCKER_UP_FLAGS="$$DOCKER_UP_FLAGS --build"; fi; \
		echo "--> docker compose up $$DOCKER_UP_FLAGS"; \
		GOBIN="$$(pwd)/bin" GOCACHE=/tmp/go-build go install ./cmd/clawchaind; \
		export PATH="$$(pwd)/bin:$$PATH"; \
		(cd "$$ROOT/testnet" && docker compose down --remove-orphans || true); \
		rm -rf "$$ROOT/testnet/data"; \
		(cd "$$ROOT/testnet" && ./setup-testnet.sh 4); \
		(cd "$$ROOT/testnet" && docker compose up $$DOCKER_UP_FLAGS); \
		trap "(cd \"$$ROOT/testnet\" && docker compose down)" EXIT; \
		(cd "$$ROOT/testnet" && ./test-scenarios.sh); \
		(cd "$$ROOT/demo" && ./demo.sh); \
		echo "--> PRD live E2E gate passed"'

prd-e2e-fast:
	@echo "--> PRD live E2E gate (fast path: no image rebuild)"
	@PRD_E2E_BUILD=0 $(MAKE) prd-e2e

testnet-public-manifest:
	@echo "--> Publishing public testnet manifest artifacts"
	@bash ./testnet/publish-public-testnet.sh

testnet-public-deploy:
	@echo "--> Publishing public testnet artifacts to static endpoint"
	@bash ./testnet/validate-public-env.sh ./testnet/public.env
	@bash ./testnet/publish-static-endpoint.sh
	@bash ./testnet/validate-public-manifest.sh ./testnet/public/manifest.json
	@bash ./testnet/validate-public-status.sh ./testnet/public/status.json
	@bash ./testnet/verify-stable-endpoints.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json
	@bash ./testnet/generate-public-deploy-proof.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json ./testnet/public/manifest-lifecycle.json

testnet-public-env:
	@echo "--> Writing testnet/public.env from template (if missing)"
	@if [ ! -f ./testnet/public.env ]; then cp ./testnet/public.env.example ./testnet/public.env; fi
	@echo "Edit ./testnet/public.env with real endpoint + target values."

testnet-public-validate:
	@echo "--> Validating testnet/public.env"
	@bash ./testnet/validate-public-env.sh ./testnet/public.env
	@echo "--> Validating stable endpoint contract"
	@bash ./testnet/verify-stable-endpoints.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json

testnet-public-validate-manifest:
	@echo "--> Validating generated public manifest"
	@bash ./testnet/validate-public-manifest.sh ./testnet/public/manifest.json

testnet-public-validate-status:
	@echo "--> Validating generated public status artifact"
	@bash ./testnet/validate-public-status.sh ./testnet/public/status.json

testnet-public-nginx:
	@echo "--> Rendering nginx config for public testnet artifacts"
	@bash ./testnet/render-nginx-public-site.sh ./testnet/public.env ./testnet/nginx/testnet-public.conf

testnet-public-deploy-hetzner:
	@echo "--> Deploying public testnet artifacts with Hetzner preset"
	@STRICT_PUBLIC=1 bash ./testnet/validate-public-env.sh ./testnet/public.env
	@bash ./testnet/render-nginx-public-site.sh ./testnet/public.env ./testnet/nginx/testnet-public.conf
	@bash ./testnet/deploy-hetzner-public.sh ./testnet/public.env
	@STRICT_PUBLIC=1 bash ./testnet/validate-public-manifest.sh ./testnet/public/manifest.json
	@STRICT_PUBLIC=1 bash ./testnet/validate-public-status.sh ./testnet/public/status.json
	@STRICT_PUBLIC=1 bash ./testnet/verify-stable-endpoints.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json
	@bash ./testnet/generate-public-deploy-proof.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json ./testnet/public/manifest-lifecycle.json

testnet-public-stable-endpoints:
	@echo "--> Verifying public testnet stable endpoints"
	@bash ./testnet/verify-stable-endpoints.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json

testnet-public-deployment-gate:
	@echo "--> Running strict public testnet deployment gate"
	@bash ./scripts/check-public-testnet-deployment-gate.sh

testnet-public-verify-artifacts-only:
	@echo "--> Verifying reproducibility from published artifacts only"
	@bash ./testnet/verify-public-artifacts-only.sh "$(if $(MANIFEST_URL),$(MANIFEST_URL),./testnet/public/manifest.json)" "$(if $(STATUS_URL),$(STATUS_URL),./testnet/public/status.json)"

testnet-public-deploy-proof:
	@echo "--> Generating strict public deploy proof artifact"
	@bash ./testnet/generate-public-deploy-proof.sh ./testnet/public.env ./testnet/public/manifest.json ./testnet/public/status.json ./testnet/public/manifest-lifecycle.json

public-testnet-reproducibility-proof-path:
	@echo "--> Verifying public testnet reproducibility proof path"
	@bash ./scripts/check-public-testnet-reproducibility.sh

phase17-public-testnet-stability-gate:
	@echo "--> Running Phase 17 public testnet stability gate"
	@bash ./scripts/check-phase17-public-testnet-stability-gate.sh

phase18-real-endpoint-cutover-gate:
	@echo "--> Running Phase 18 real endpoint cutover gate"
	@bash ./scripts/check-phase18-real-endpoint-cutover-gate.sh

phase18-continuous-ops-gate:
	@echo "--> Running Phase 18 continuous operations gate"
	@bash ./scripts/check-phase18-continuous-ops-gate.sh

product-complete-gate:
	@echo "--> Running final product completion gate"
	@bash ./scripts/check-product-complete-gate.sh "$(if $(EVIDENCE),$(EVIDENCE),artifacts/release-evidence.json)"

go-live-packet:
	@echo "--> Generating go-live packet"
	@RELEASE_EVIDENCE="$(if $(RELEASE_EVIDENCE),$(RELEASE_EVIDENCE),artifacts/release-evidence.json)" MANIFEST_LIFECYCLE="$(if $(MANIFEST_LIFECYCLE),$(MANIFEST_LIFECYCLE),testnet/public/manifest-lifecycle.json)" REPRO_PROOF="$(REPRO_PROOF)" OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/go-live)" bash ./scripts/generate-go-live-packet.sh

support-handoff-snapshot:
	@echo "--> Generating support handoff snapshot"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/support)" bash ./scripts/generate-support-handoff-snapshot.sh

launch-execution-pack:
	@echo "--> Generating launch execution pack"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" bash ./scripts/generate-launch-execution-pack.sh

phase19-launch-execution-gate:
	@echo "--> Running Phase 19 launch execution gate"
	@bash ./scripts/check-phase19-launch-execution-gate.sh "$(if $(ARTIFACT),$(ARTIFACT),artifacts/launch-control/launch-execution-pack-latest.json)"

phase19-evidence-drift-gate:
	@echo "--> Running Phase 19 evidence drift gate"
	@bash ./scripts/check-phase19-evidence-drift-gate.sh

post-launch-weekly-executive-summary:
	@echo "--> Generating post-launch weekly executive summary"
	@WEEK_ID="$(if $(WEEK_ID),$(WEEK_ID),$(shell date -u +%G-W%V))" OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" NIGHTLY_OPS_PACK="$(if $(NIGHTLY_OPS_PACK),$(NIGHTLY_OPS_PACK),artifacts/operations/nightly-ops-pack-latest.json)" WEEKLY_DRILL_PACK="$(if $(WEEKLY_DRILL_PACK),$(WEEKLY_DRILL_PACK),artifacts/operations/weekly-incident-drill-pack-latest.json)" MONTHLY_GOVERNANCE_PACK="$(if $(MONTHLY_GOVERNANCE_PACK),$(MONTHLY_GOVERNANCE_PACK),artifacts/governance/monthly-governance-pack-latest.json)" RELEASE_EVIDENCE="$(if $(RELEASE_EVIDENCE),$(RELEASE_EVIDENCE),artifacts/release-evidence.json)" bash ./scripts/generate-post-launch-weekly-executive-summary.sh

post-launch-weekly-executive-summary-gate:
	@echo "--> Checking post-launch weekly executive summary"
	@bash ./scripts/check-post-launch-weekly-executive-summary.sh "$(if $(ARTIFACT),$(ARTIFACT),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)"

post-launch-executive-trend-7d:
	@echo "--> Generating post-launch 7-day executive trend"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" NIGHTLY_DIR="$(if $(NIGHTLY_DIR),$(NIGHTLY_DIR),artifacts/operations)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" bash ./scripts/generate-executive-trend-7d.sh

phase20-ops-signal-gate:
	@echo "--> Running Phase 20 ops signal gate"
	@bash ./scripts/check-phase20-ops-signal-gate.sh "$(if $(ARTIFACT),$(ARTIFACT),artifacts/launch-control/executive-trend-7d-latest.json)"

post-launch-remediation-checklist:
	@echo "--> Generating post-launch remediation checklist"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" bash ./scripts/generate-ops-remediation-checklist.sh

post-launch-remediation-bundle:
	@echo "--> Generating post-launch remediation bundle"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" CHECKLIST_FILE="$(if $(CHECKLIST_FILE),$(CHECKLIST_FILE),artifacts/launch-control/ops-remediation-checklist-latest.json)" bash ./scripts/generate-ops-remediation-bundle.sh

phase20-recovery-loop-gate:
	@echo "--> Running Phase 20 recovery loop gate"
	@bash ./scripts/check-phase20-recovery-loop-gate.sh "$(if $(SUMMARY),$(SUMMARY),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" "$(if $(CHECKLIST),$(CHECKLIST),artifacts/launch-control/ops-remediation-checklist-latest.json)" "$(if $(BUNDLE),$(BUNDLE),artifacts/launch-control/ops-remediation-bundle-latest.json)"

ops-maturity-packet:
	@echo "--> Generating ops maturity packet"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" TREND_FILE="$(if $(TREND_FILE),$(TREND_FILE),artifacts/launch-control/executive-trend-7d-latest.json)" CHECKLIST_FILE="$(if $(CHECKLIST_FILE),$(CHECKLIST_FILE),artifacts/launch-control/ops-remediation-checklist-latest.json)" BUNDLE_FILE="$(if $(BUNDLE_FILE),$(BUNDLE_FILE),artifacts/launch-control/ops-remediation-bundle-latest.json)" RELEASE_EVIDENCE_FILE="$(if $(RELEASE_EVIDENCE_FILE),$(RELEASE_EVIDENCE_FILE),artifacts/release-evidence.json)" bash ./scripts/generate-ops-maturity-packet.sh

phase20-product-complete-gate:
	@echo "--> Running Phase 20 product complete gate"
	@bash ./scripts/check-phase20-product-complete-gate.sh "$(if $(EVIDENCE),$(EVIDENCE),artifacts/release-evidence.json)" "$(if $(PACKET),$(PACKET),artifacts/launch-control/ops-maturity-packet-latest.json)"

ops-artifact-index:
	@echo "--> Generating ops artifact index"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" bash ./scripts/generate-ops-artifact-index.sh

phase21-artifact-index-gate:
	@echo "--> Running Phase 21 artifact index gate"
	@bash ./scripts/check-phase21-artifact-index-gate.sh "$(if $(ARTIFACT),$(ARTIFACT),artifacts/launch-control/ops-artifact-index-latest.json)"

weekly-publication-packet:
	@echo "--> Generating weekly publication packet"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" INDEX_FILE="$(if $(INDEX_FILE),$(INDEX_FILE),artifacts/launch-control/ops-artifact-index-latest.json)" OPS_MATURITY_PACKET="$(if $(OPS_MATURITY_PACKET),$(OPS_MATURITY_PACKET),artifacts/launch-control/ops-maturity-packet-latest.json)" bash ./scripts/generate-weekly-publication-packet.sh

phase21-publication-packet-gate:
	@echo "--> Running Phase 21 publication packet gate"
	@bash ./scripts/check-phase21-publication-packet-gate.sh "$(if $(PACKET),$(PACKET),artifacts/launch-control/weekly-publication-packet-latest.json)"

weekly-handoff-note:
	@echo "--> Generating weekly handoff note"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" PUBLICATION_PACKET="$(if $(PUBLICATION_PACKET),$(PUBLICATION_PACKET),artifacts/launch-control/weekly-publication-packet-latest.json)" CHECKLIST_FILE="$(if $(CHECKLIST_FILE),$(CHECKLIST_FILE),artifacts/launch-control/ops-remediation-checklist-latest.json)" bash ./scripts/generate-weekly-handoff-note.sh

phase21-handoff-gate:
	@echo "--> Running Phase 21 handoff gate"
	@bash ./scripts/check-phase21-handoff-gate.sh "$(if $(NOTE),$(NOTE),artifacts/launch-control/weekly-handoff-note-latest.md)"

weekly-handoff-pack:
	@echo "--> Running one-command weekly handoff pack"
	@$(MAKE) ops-artifact-index
	@$(MAKE) phase21-artifact-index-gate
	@$(MAKE) weekly-publication-packet
	@$(MAKE) phase21-publication-packet-gate
	@$(MAKE) weekly-handoff-note
	@$(MAKE) phase21-handoff-gate
	@echo "--> Weekly handoff pack completed"

weekly-closure-bundle:
	@echo "--> Generating weekly closure bundle"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" PUBLICATION_PACKET="$(if $(PUBLICATION_PACKET),$(PUBLICATION_PACKET),artifacts/launch-control/weekly-publication-packet-latest.json)" HANDOFF_NOTE="$(if $(HANDOFF_NOTE),$(HANDOFF_NOTE),artifacts/launch-control/weekly-handoff-note-latest.md)" OPS_MATURITY_PACKET="$(if $(OPS_MATURITY_PACKET),$(OPS_MATURITY_PACKET),artifacts/launch-control/ops-maturity-packet-latest.json)" bash ./scripts/generate-weekly-closure-bundle.sh

phase21-program-closure-gate:
	@echo "--> Running Phase 21 program closure gate"
	@bash ./scripts/check-phase21-program-closure-gate.sh "$(if $(PACKET),$(PACKET),artifacts/launch-control/weekly-publication-packet-latest.json)" "$(if $(NOTE),$(NOTE),artifacts/launch-control/weekly-handoff-note-latest.md)" "$(if $(BUNDLE),$(BUNDLE),artifacts/launch-control/weekly-closure-bundle-latest.json)"

weekly-closure-digest-pack:
	@echo "--> Generating weekly closure digest pack"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" PUBLICATION_PACKET="$(if $(PUBLICATION_PACKET),$(PUBLICATION_PACKET),artifacts/launch-control/weekly-publication-packet-latest.json)" HANDOFF_NOTE="$(if $(HANDOFF_NOTE),$(HANDOFF_NOTE),artifacts/launch-control/weekly-handoff-note-latest.md)" CLOSURE_BUNDLE="$(if $(CLOSURE_BUNDLE),$(CLOSURE_BUNDLE),artifacts/launch-control/weekly-closure-bundle-latest.json)" ARTIFACT_INDEX="$(if $(ARTIFACT_INDEX),$(ARTIFACT_INDEX),artifacts/launch-control/ops-artifact-index-latest.json)" OPS_MATURITY_PACKET="$(if $(OPS_MATURITY_PACKET),$(OPS_MATURITY_PACKET),artifacts/launch-control/ops-maturity-packet-latest.json)" bash ./scripts/generate-weekly-closure-digest-pack.sh

phase22-closure-digest-gate:
	@echo "--> Running Phase 22 closure digest gate"
	@bash ./scripts/check-phase22-closure-digest-gate.sh "$(if $(PACK),$(PACK),artifacts/launch-control/weekly-closure-digest-pack-latest.json)"

operator-status-snapshot:
	@echo "--> Generating operator status snapshot"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" SUMMARY_FILE="$(if $(SUMMARY_FILE),$(SUMMARY_FILE),artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)" PUBLICATION_PACKET="$(if $(PUBLICATION_PACKET),$(PUBLICATION_PACKET),artifacts/launch-control/weekly-publication-packet-latest.json)" DIGEST_PACK="$(if $(DIGEST_PACK),$(DIGEST_PACK),artifacts/launch-control/weekly-closure-digest-pack-latest.json)" bash ./scripts/generate-operator-status-snapshot.sh

phase22-operator-status-gate:
	@echo "--> Running Phase 22 operator status gate"
	@bash ./scripts/check-phase22-operator-status-gate.sh "$(if $(JSON),$(JSON),artifacts/launch-control/operator-status-snapshot-latest.json)" "$(if $(MD),$(MD),artifacts/launch-control/operator-status-snapshot-latest.md)"

phase22-weekly-closeout:
	@echo "--> Running Phase 22 weekly closeout flow"
	@$(MAKE) weekly-handoff-pack
	@$(MAKE) weekly-closure-bundle
	@$(MAKE) phase21-program-closure-gate
	@$(MAKE) weekly-closure-digest-pack
	@$(MAKE) phase22-closure-digest-gate
	@$(MAKE) operator-status-snapshot
	@$(MAKE) phase22-operator-status-gate
	@echo "--> Phase 22 weekly closeout flow completed"

phase22-program-closeout-gate:
	@echo "--> Running Phase 22 program closeout gate"
	@bash ./scripts/check-phase22-program-closeout-gate.sh "$(if $(DIGEST),$(DIGEST),artifacts/launch-control/weekly-closure-digest-pack-latest.json)" "$(if $(STATUS_JSON),$(STATUS_JSON),artifacts/launch-control/operator-status-snapshot-latest.json)" "$(if $(STATUS_MD),$(STATUS_MD),artifacts/launch-control/operator-status-snapshot-latest.md)"

weekly-closeout-attestation:
	@echo "--> Generating weekly closeout attestation"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" DIGEST_PACK="$(if $(DIGEST_PACK),$(DIGEST_PACK),artifacts/launch-control/weekly-closure-digest-pack-latest.json)" STATUS_JSON="$(if $(STATUS_JSON),$(STATUS_JSON),artifacts/launch-control/operator-status-snapshot-latest.json)" CLOSURE_BUNDLE="$(if $(CLOSURE_BUNDLE),$(CLOSURE_BUNDLE),artifacts/launch-control/weekly-closure-bundle-latest.json)" bash ./scripts/generate-weekly-closeout-attestation.sh

phase23-attestation-gate:
	@echo "--> Running Phase 23 attestation gate"
	@bash ./scripts/check-phase23-attestation-gate.sh "$(if $(ATTESTATION),$(ATTESTATION),artifacts/launch-control/weekly-closeout-attestation-latest.json)"

weekly-history-rollup:
	@echo "--> Generating weekly history rollup"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" WINDOW_WEEKS="$(if $(WINDOW_WEEKS),$(WINDOW_WEEKS),4)" bash ./scripts/generate-weekly-history-rollup.sh

phase23-history-rollup-gate:
	@echo "--> Running Phase 23 history rollup gate"
	@bash ./scripts/check-phase23-history-rollup-gate.sh "$(if $(ROLLUP),$(ROLLUP),artifacts/launch-control/weekly-history-rollup-latest.json)"

phase23-weekly-finalize:
	@echo "--> Running Phase 23 weekly finalization flow"
	@$(MAKE) phase22-weekly-closeout
	@$(MAKE) phase22-program-closeout-gate
	@$(MAKE) weekly-closeout-attestation
	@$(MAKE) phase23-attestation-gate
	@$(MAKE) weekly-history-rollup
	@$(MAKE) phase23-history-rollup-gate
	@echo "--> Phase 23 weekly finalization flow completed"

phase23-program-finalize-gate:
	@echo "--> Running Phase 23 program finalize gate"
	@bash ./scripts/check-phase23-program-finalize-gate.sh "$(if $(ATTESTATION),$(ATTESTATION),artifacts/launch-control/weekly-closeout-attestation-latest.json)" "$(if $(ROLLUP),$(ROLLUP),artifacts/launch-control/weekly-history-rollup-latest.json)"

weekly-audit-log:
	@echo "--> Generating weekly audit log"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" ATTESTATION_FILE="$(if $(ATTESTATION_FILE),$(ATTESTATION_FILE),artifacts/launch-control/weekly-closeout-attestation-latest.json)" HISTORY_ROLLUP_FILE="$(if $(HISTORY_ROLLUP_FILE),$(HISTORY_ROLLUP_FILE),artifacts/launch-control/weekly-history-rollup-latest.json)" STATUS_SNAPSHOT_FILE="$(if $(STATUS_SNAPSHOT_FILE),$(STATUS_SNAPSHOT_FILE),artifacts/launch-control/operator-status-snapshot-latest.json)" bash ./scripts/generate-weekly-audit-log.sh

phase24-audit-log-gate:
	@echo "--> Running Phase 24 audit log gate"
	@bash ./scripts/check-phase24-audit-log-gate.sh "$(if $(AUDIT),$(AUDIT),artifacts/launch-control/weekly-audit-log-latest.json)"

weekly-signoff-manifest:
	@echo "--> Generating weekly signoff manifest"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" AUDIT_LOG_FILE="$(if $(AUDIT_LOG_FILE),$(AUDIT_LOG_FILE),artifacts/launch-control/weekly-audit-log-latest.json)" ATTESTATION_FILE="$(if $(ATTESTATION_FILE),$(ATTESTATION_FILE),artifacts/launch-control/weekly-closeout-attestation-latest.json)" bash ./scripts/generate-weekly-signoff-manifest.sh

phase24-signoff-manifest-gate:
	@echo "--> Running Phase 24 signoff manifest gate"
	@bash ./scripts/check-phase24-signoff-manifest-gate.sh "$(if $(JSON),$(JSON),artifacts/launch-control/weekly-signoff-manifest-latest.json)" "$(if $(MD),$(MD),artifacts/launch-control/weekly-signoff-manifest-latest.md)"

phase24-weekly-certify:
	@echo "--> Running Phase 24 weekly certification flow"
	@$(MAKE) phase23-weekly-finalize
	@$(MAKE) phase23-program-finalize-gate
	@$(MAKE) weekly-audit-log
	@$(MAKE) phase24-audit-log-gate
	@$(MAKE) weekly-signoff-manifest
	@$(MAKE) phase24-signoff-manifest-gate
	@echo "--> Phase 24 weekly certification flow completed"

phase24-program-certify-gate:
	@echo "--> Running Phase 24 program certify gate"
	@bash ./scripts/check-phase24-program-certify-gate.sh "$(if $(AUDIT),$(AUDIT),artifacts/launch-control/weekly-audit-log-latest.json)" "$(if $(SIGNOFF_JSON),$(SIGNOFF_JSON),artifacts/launch-control/weekly-signoff-manifest-latest.json)" "$(if $(SIGNOFF_MD),$(SIGNOFF_MD),artifacts/launch-control/weekly-signoff-manifest-latest.md)"

weekly-notarization-ledger:
	@echo "--> Generating weekly notarization ledger"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" AUDIT_LOG_FILE="$(if $(AUDIT_LOG_FILE),$(AUDIT_LOG_FILE),artifacts/launch-control/weekly-audit-log-latest.json)" SIGNOFF_JSON="$(if $(SIGNOFF_JSON),$(SIGNOFF_JSON),artifacts/launch-control/weekly-signoff-manifest-latest.json)" SIGNOFF_MD="$(if $(SIGNOFF_MD),$(SIGNOFF_MD),artifacts/launch-control/weekly-signoff-manifest-latest.md)" bash ./scripts/generate-weekly-notarization-ledger.sh

phase25-notarization-ledger-gate:
	@echo "--> Running Phase 25 notarization ledger gate"
	@bash ./scripts/check-phase25-notarization-ledger-gate.sh "$(if $(LEDGER),$(LEDGER),artifacts/launch-control/weekly-notarization-ledger-latest.json)"

weekly-immutable-snapshot:
	@echo "--> Generating weekly immutable snapshot"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" LEDGER_FILE="$(if $(LEDGER_FILE),$(LEDGER_FILE),artifacts/launch-control/weekly-notarization-ledger-latest.json)" AUDIT_LOG_FILE="$(if $(AUDIT_LOG_FILE),$(AUDIT_LOG_FILE),artifacts/launch-control/weekly-audit-log-latest.json)" SIGNOFF_JSON="$(if $(SIGNOFF_JSON),$(SIGNOFF_JSON),artifacts/launch-control/weekly-signoff-manifest-latest.json)" bash ./scripts/generate-weekly-immutable-snapshot.sh

phase25-immutable-snapshot-gate:
	@echo "--> Running Phase 25 immutable snapshot gate"
	@bash ./scripts/check-phase25-immutable-snapshot-gate.sh "$(if $(JSON),$(JSON),artifacts/launch-control/weekly-immutable-snapshot-latest.json)" "$(if $(MD),$(MD),artifacts/launch-control/weekly-notarization-receipt-latest.md)"

phase25-weekly-notarize:
	@echo "--> Running Phase 25 weekly notarization flow"
	@$(MAKE) phase24-weekly-certify
	@$(MAKE) phase24-program-certify-gate
	@$(MAKE) weekly-notarization-ledger
	@$(MAKE) phase25-notarization-ledger-gate
	@$(MAKE) weekly-immutable-snapshot
	@$(MAKE) phase25-immutable-snapshot-gate
	@echo "--> Phase 25 weekly notarization flow completed"

phase25-program-notarize-gate:
	@echo "--> Running Phase 25 program notarize gate"
	@bash ./scripts/check-phase25-program-notarize-gate.sh "$(if $(LEDGER),$(LEDGER),artifacts/launch-control/weekly-notarization-ledger-latest.json)" "$(if $(SNAPSHOT_JSON),$(SNAPSHOT_JSON),artifacts/launch-control/weekly-immutable-snapshot-latest.json)" "$(if $(SNAPSHOT_MD),$(SNAPSHOT_MD),artifacts/launch-control/weekly-notarization-receipt-latest.md)"

capture-lifecycle-revision-snapshot:
	@echo "--> Capturing lifecycle revision snapshot"
	@OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" bash ./scripts/capture-lifecycle-revision-snapshot.sh "$(if $(LIFECYCLE_FILE),$(LIFECYCLE_FILE),testnet/public/manifest-lifecycle.json)"

launch-freeze-snapshot:
	@echo "--> Generating launch freeze snapshot"
	@test -n "$(DECISION_TIMESTAMP_UTC)" || (echo "Usage: make launch-freeze-snapshot DECISION_TIMESTAMP_UTC=<YYYY-MM-DDTHH:MM:SSZ> [DECISION_OUTCOME=launch|no-launch] [OUT_DIR=artifacts/launch-control]" && exit 1)
	@DECISION_TIMESTAMP_UTC="$(DECISION_TIMESTAMP_UTC)" DECISION_OUTCOME="$(if $(DECISION_OUTCOME),$(DECISION_OUTCOME),launch)" OUT_DIR="$(if $(OUT_DIR),$(OUT_DIR),artifacts/launch-control)" RELEASE_EVIDENCE="$(if $(RELEASE_EVIDENCE),$(RELEASE_EVIDENCE),artifacts/release-evidence.json)" LAUNCH_EXECUTION_PACK="$(if $(LAUNCH_EXECUTION_PACK),$(LAUNCH_EXECUTION_PACK),artifacts/launch-control/launch-execution-pack-latest.json)" LIFECYCLE_SNAPSHOT="$(if $(LIFECYCLE_SNAPSHOT),$(LIFECYCLE_SNAPSHOT),artifacts/launch-control/lifecycle-revision-snapshot.json)" bash ./scripts/generate-launch-freeze-snapshot.sh

######################
###  Monitoring    ###
######################

health-check:
	@echo "--> Running ClawChain health check"
	@bash ./scripts/health-check.sh

endpoint-smoke:
	@echo "--> Running endpoint smoke test"
	@bash ./scripts/endpoint-smoke.sh

verify-endpoints:
	@echo "--> Verifying endpoints from manifest"
	@bash ./scripts/verify-endpoints.sh

gpu-e2e-smoke:
	@echo "--> Running claw-gpu-provider Dante bridge smoke tests"
	@GOCACHE=$$(pwd)/.tmp/go-build go test -v ./cmd/claw-gpu-provider/... -run 'TestFetchAndExecuteJobs_DanteBridgeE2E|TestFetchAndExecuteJobs_DanteSubmitFails_FallsBackToLocal|TestChainJobToDanteTask|TestSubmitTask|TestGetTaskStatus'

gpu-live-e2e:
	@echo "--> Running live GPU submit/complete/cancel verifier"
	@bash ./scripts/gpu-live-e2e.sh

wallet-chain-sync-check:
	@echo "--> Verifying ClawChain network config sync across wallets and chain registry"
	@node ./scripts/verify-wallet-chain-sync.mjs

wallet-chain-sync-live-check:
	@echo "--> Verifying ClawChain wallet/registry sync with live RPC/REST endpoint probes"
	@WALLET_SYNC_LIVE=1 node ./scripts/verify-wallet-chain-sync.mjs

.PHONY: health-check endpoint-smoke verify-endpoints gpu-e2e-smoke gpu-live-e2e wallet-chain-sync-check wallet-chain-sync-live-check

#################################
###  Developer Utility Targets ###
#################################

format:
	@echo "--> Formatting Go code..."
	@gofmt -w -s .
	@echo "--> Formatting TypeScript..."
	@cd web && npx prettier --write "src/**/*.{ts,tsx}" 2>/dev/null || true
	@cd sdk && npx prettier --write "src/**/*.ts" 2>/dev/null || true
	@cd cmd/clawd && npx prettier --write "src/**/*.ts" 2>/dev/null || true

proto-lint:
	@echo "--> Linting protobuf files..."
	@buf lint

# build-all, build-clawd, build-services etc. are defined in the Docker section above

clean:
	@echo "--> Cleaning build artifacts..."
	@rm -rf build/
	@rm -f coverage*.out

docs:
	@echo "--> Docs available at docs/"
	@ls docs/*.md | head -20

check: lint test-unit build
	@echo "--> All checks passed!"

.PHONY: format proto-lint build-all build-clawd build-gpu-provider build-inference-sidecar clean docs check

.PHONY: testnet-init testnet-start testnet-stop testnet-logs testnet-test testnet-clean testnet-restart testnet-stress testnet-stress-heavy load-test load-test-heavy testnet-benchmark testnet-backup testnet-backup-live testnet-restore demo protocol-contract-pack protocol-sanity protocol-surface-lock-check protocol-surface-lock-refresh protocol-surface-changelog prd-verify branch-protection-verify prd-build prd-e2e clawd-ensure-build clawd-build openclaw-up openclaw-up-json openclaw-up-ready openclaw-up-ready-json openclaw-up-ready-assert openclaw-agent-flow openclaw-agent-flow-json openclaw-product-flow openclaw-product-flow-json openclaw-product-flow-assert openclaw-up-profile-vps openclaw-up-profile-macmini openclaw-up-profile-local clawd-up clawd-up-json clawd-up-ready clawd-up-ready-json clawd-up-ready-assert clawd-bootstrap clawd-bootstrap-ready clawd-doctor clawd-agent-flow clawd-agent-flow-json clawd-product-flow clawd-product-flow-json clawd-product-flow-assert autonomous-skill-map-gate product-flow-gate runtime-readiness-gate slice-a-operatorization-gate capability-determinism-gate security-economic-policy-gate sla-reputation-coupling-gate pre-upgrade-compatibility-gate upgrade-readiness-gate validate-upgrade mainnet-capacity-gate mainnet-launch-program-gate launch-artifact-completeness-gate production-infrastructure-gate chain-hardening-gate runtime-hardening-gate ecosystem-integrator-gate governance-operations-gate drill-evidence-gate growth-user-layer-gate capacity-slo-evidence-gate production-data-replacement-gate real-world-external-validation-gate mainnet-cutover-rehearsal-gate launch-day-operations-gate first-week-stabilization-gate phase16-automation-evidence-capture-gate phase16-reliability-alerting-gate phase16-operator-ux-gate security-compliance-closure-evidence-gate ecosystem-readiness-proof-gate launch-decision-packet-gate security-review-gate go-live-decision-gate mainnet-readiness-gate phase17-operator-bootstrap-gate phase17-public-testnet-stability-gate phase18-real-endpoint-cutover-gate phase18-continuous-ops-gate phase19-launch-execution-gate phase19-evidence-drift-gate launch-execution-pack post-launch-weekly-executive-summary post-launch-weekly-executive-summary-gate post-launch-executive-trend-7d phase20-ops-signal-gate post-launch-remediation-checklist post-launch-remediation-bundle phase20-recovery-loop-gate ops-maturity-packet phase20-product-complete-gate ops-artifact-index phase21-artifact-index-gate weekly-publication-packet phase21-publication-packet-gate weekly-handoff-note phase21-handoff-gate weekly-handoff-pack weekly-closure-bundle phase21-program-closure-gate weekly-closure-digest-pack phase22-closure-digest-gate operator-status-snapshot phase22-operator-status-gate phase22-weekly-closeout phase22-program-closeout-gate weekly-closeout-attestation phase23-attestation-gate weekly-history-rollup phase23-history-rollup-gate phase23-weekly-finalize phase23-program-finalize-gate weekly-audit-log phase24-audit-log-gate weekly-signoff-manifest phase24-signoff-manifest-gate phase24-weekly-certify phase24-program-certify-gate weekly-notarization-ledger phase25-notarization-ledger-gate weekly-immutable-snapshot phase25-immutable-snapshot-gate phase25-weekly-notarize phase25-program-notarize-gate capture-lifecycle-revision-snapshot launch-freeze-snapshot product-complete-gate go-live-packet support-handoff-snapshot slice-c-privacy-operatorization-gate slice-d-marketplace-operatorization-gate fresh-machine-acceptance-gate fresh-machine-acceptance one-command-agent-gate release-ready-gate release-evidence-pack release-artifact-provenance-pack release-artifact-provenance-gate clawd-nodecard clawd-peers-verify clawd-peers-prune clawd-peers-sync-manifest clawd-peers-auto-maintain clawd-peers-summary generate-daily-health-summary generate-weekly-readiness-cadence-report weekly-maintenance nightly-ops-pack weekly-incident-drill-pack weekly-incident-drill-closure-gate monthly-governance-pack monthly-governance-closure-gate capture-launch-day-transcript testnet-public-manifest testnet-public-deploy testnet-public-env testnet-public-validate testnet-public-validate-manifest testnet-public-validate-status testnet-public-stable-endpoints testnet-public-deployment-gate testnet-public-verify-artifacts-only testnet-public-deploy-proof public-testnet-reproducibility-proof-path testnet-public-nginx testnet-public-deploy-hetzner
