# Testnet Launch Plan

_Status: 2026-05-31. Rehearsal substrate IMPLEMENTED; public deploy pending._

## Implementation status

- ✅ **Local multi-validator rehearsal (Phase T0 genesis + T2 consensus):**
  `scripts/testnet/local-multinode.sh {up [N]|down|status}` stands up an N-validator
  (default 4) testnet via `clawchaind multi-node`, seeds identical privacy ZK pk+vk
  into every node, applies testnet genesis params (fast gov with expedited<voting,
  lenient slashing), enables REST API, boots all validators, and verifies consensus.
  **Verified live:** 4 validators reach lockstep consensus (heights agree, spread 0),
  active validator set = 4, privacy VKs loaded on all nodes, REST API serving, and a
  privacy `shield` via the clawd registry committed (code 0) with the commitment
  landing in state while all 4 validators stayed in lockstep.
- ✅ **Local full-module smoke (Phase T2 flow coverage):**
  `scripts/testnet/smoke-multinode.sh` verifies bank, tokenfactory, privacy
  shield->unshield with a real ZK proof on a fresh tree, oracle commit-reveal,
  agent+marketplace, and governance submit/vote against the 4-validator network.
  **Verified live:** 6 passed / 0 failed on a fresh local multinode run.
- ✅ **Local gov-driven upgrade rehearsal (Phase T2 upgrade path):**
  `scripts/testnet/rehearse-gov-upgrade.sh` drives a real `MsgSoftwareUpgrade`
  proposal for the `testnet-v1-rehearsal` handler, votes all local validators,
  observes the pre-upgrade binary halt, restarts all validators with the
  post-upgrade binary, and verifies `query upgrade applied`.
  **Verified live:** proposal passed, pre-upgrade binary halted at height 134,
  post-upgrade binary applied `testnet-v1-rehearsal` at height 134, and all 4
  validators produced post-upgrade blocks (10 passed / 0 failed).
- ⏳ **Public deploy (Phase T1/T3):** uses the existing `testnet/docker-compose.yml`
  (node0–3 + Prometheus/Grafana/AlertManager + faucet), `testnet/nginx/`,
  `testnet/publish-public-testnet.sh`, `testnet/deploy-hetzner-public.sh`. Remaining:
  provision hosts, point endpoints at real IPs/DNS + TLS, run the genesis ceremony
  with external validators (`scripts/genesis-ceremony.sh`), deploy explorer
  (see explorer plan) — all operational, not local-codeable.

## Goal

A **public, persistent, multi-validator testnet** that external integrators,
validators, and the explorer/wallet can connect to — a faithful mainnet dry run with
real (but valueless) tokens, public endpoints, and a published upgrade cadence.

## Shape

| Property | Testnet |
|---|---|
| Chain ID | `clawchain-testnet-1` (bump suffix per relaunch) |
| Validators | 4–8 (mix of core team + invited external) |
| Persistence | Persistent; state survives; upgrades via gov + `upgrade-runbook.md` |
| Keys | Real per-validator keys (HSM optional, see `hsm-integration-guide.md`) |
| Privacy ZK keys | A **dedicated testnet trusted setup** (NOT dev keys, NOT mainnet MPC) — a small ceremony or a documented single-party setup labelled insecure-for-value |
| Faucet | Rate-limited public faucet (`cmd/claw-faucet`) |
| Endpoints | Public RPC/REST/gRPC behind TLS + load balancer |

## Phases

### Phase T0 — Genesis preparation
1. Pin software version + `go.mod`; tag a release (`vX.Y.Z-testnet`).
2. Decide testnet tokenomics (see `mainnet-tokenomics-validator-policy.md` for the
   mainnet template; testnet uses inflated, faucet-backed supply).
3. Generate the genesis: `clawchaind init`, collect validator gentxs from each
   participant (coordinate via `genesis-ceremony-ownership-log.md` process, lighter
   weight than mainnet), set module params (oracle whitelist, privacy params, gov
   voting/expedited periods — note expedited < voting, see the IBC genesis fix).
4. **Privacy keys decision**: run a testnet trusted setup; publish the vk hashes;
   distribute matching pk to provers. Document clearly these are not the mainnet keys.
5. Validate final genesis: `clawchaind genesis validate genesis.json`.

### Phase T1 — Infrastructure
1. Provision validator + sentry nodes (VPS/cloud) — see `hosting-cost-profile.md`.
2. Public endpoints: RPC `:26657`, REST `:1317`, gRPC `:9090` behind reverse proxy +
   TLS; rate limits. Seeds/persistent-peers published.
3. Monitoring: Prometheus/Grafana/AlertManager (ports per the validated Docker setup:
   Prometheus 9091, Grafana 3010, AlertManager 9093); import existing dashboards.
4. Faucet deployment (port 8889) with per-address rate limiting.
5. Explorer: deploy with `claw-explorer/chains/testnet/clawchain.json` updated to the
   public endpoints (see the explorer plan).

### Phase T2 — Launch & validation
1. Coordinated start across validators; confirm consensus + block production.
2. Smoke the full module set against PUBLIC endpoints using the clawd/SDK drivers
   (privacy round-trip, oracle commit-reveal, CosmWasm, DEX, IBC to a partner testnet).
3. Onboard external validators + integrators (`integrator-onboarding-evidence.md`,
   `integrator-quickstart.md`).
4. Run a soak (≥7 days) + a rehearsed upgrade via gov proposal (`upgrade-runbook.md`)
   to prove the upgrade path before mainnet.

### Phase T3 — Operations
- Upgrade cadence per `testnet-upgrade-cadence.md`.
- Public status page (`public-status-communication.md`), on-call rota.
- IBC connections to partner testnets (Osmosis/Neutron testnet) via `rly`/hermes.

## Acceptance criteria

- ≥4 validators producing blocks; `catching_up: false`; public RPC/REST reachable
  over TLS.
- All Phase 1 flows pass against the public endpoints (not just localhost).
- Faucet + explorer + monitoring live and healthy.
- One full gov-driven chain upgrade rehearsed successfully on the local multinode
  testnet substrate; repeat on public testnet after external validators join.
- ≥1 external validator and ≥1 external integrator onboarded.

## Open decisions

- Testnet privacy trusted-setup: single-party (fast, clearly-insecure) vs a small
  multi-party ceremony (closer to mainnet rehearsal). Recommend small ceremony to
  rehearse the mainnet MPC.
- Validator set size + whether to incentivize external validators (testnet points).

## Dependencies / references

- Devnet plan (rehearsal substrate), `scripts/ibc-relay-rly.sh`
- `docs/{testnet-upgrade-cadence,upgrade-runbook,hsm-integration-guide,observability}.md`
- `docs/{integrator-onboarding-evidence,integrator-quickstart}.md`
- Explorer plan; mainnet plan (this is its dress rehearsal).
