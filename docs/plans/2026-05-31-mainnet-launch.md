# Mainnet Launch Plan

_Plan only — no code yet. Status: 2026-05-31. Owner: TBD._

> This plan is the **sequencing/coordination layer**. It does NOT duplicate the
> detailed checklists already in the repo — it points to them and adds the launch
> ordering + the two hard gates. Primary references:
> `docs/mainnet-launch-checklist.md`, `docs/final-cutover-runbook.md`,
> `docs/mainnet-capacity-criteria.md`, `docs/mainnet-tokenomics-validator-policy.md`,
> `docs/launch-decision-packet.md`, `docs/go-live-decision-policy.md`,
> `mainnet/README.md`.

## Goal

Launch `clawchain-1` as a **value-bearing, decentralized, multi-validator mainnet**
only after the two external gates are cleared, with a rehearsed, reversible cutover.

## Hard gates (must clear before genesis)

1. **External security audit — CLOSED.** Scope in `docs/security-audit-scope.md`;
   closure tracked in `docs/external-audit-closure.md`. No mainnet genesis until
   findings are remediated and signed off (`docs/security-review-gate.md`).
2. **Privacy MPC trusted-setup ceremony — COMPLETE.** The dev `gen-dev-keys` pk/vk
   are INSECURE and must never touch mainnet. Run the production MPC ceremony
   (`x/privacy/circuit/mpc_setup.go`), publish `artifacts/ceremony-transcript.json`
   (currently `pending`) + `docs/trusted-setup-attestation.md`, and seed the resulting
   `*_vk.bin` into genesis-node key dirs. Multiple independent participants; transcript
   verifiable.

## Phases

### Phase M0 — Pre-genesis (gates + decision)
1. Confirm both hard gates cleared. Assemble `docs/launch-decision-packet.md`; run the
   go/no-go per `docs/go-live-decision-policy.md`.
2. Finalize tokenomics + validator policy (`docs/mainnet-tokenomics-validator-policy.md`):
   genesis allocations, vesting, validator caps, min self-bond, gas/fee params.
3. Legal/compliance sign-off (`docs/legal-compliance-launch-review.md`).

### Phase M1 — Genesis ceremony
1. Multi-party genesis ceremony (`docs/genesis-ceremony-ownership-log.md`): each
   genesis validator submits a gentx; coordinator collects + validates.
2. Set final module params (oracle whitelist + reward params, privacy params with the
   MPC vks, gov periods with expedited < voting, IBC/wasm capability set =
   `BuiltInCapabilities()` + `token_factory`).
3. `clawchaind genesis validate`; publish genesis hash + binary checksum; all
   validators verify the same hash.

### Phase M2 — Infrastructure & rehearsal
1. Validator/sentry topology, HSM-backed keys (`docs/hsm-integration-guide.md`,
   `docs/key-custody-policy.md`, `docs/key-rotation-failover-runbook.md`).
2. Capacity meets `docs/mainnet-capacity-criteria.md` (load tested, e.g. via the
   `claw-flood` RPC tester from the forks design).
3. **Cutover rehearsal** on a mainnet-shaped staging net
   (`docs/mainnet-cutover-rehearsal.md`, `docs/cutover-rollback-rehearsal.md`) —
   including a rehearsed rollback (`docs/incident-rollback-drill-log.md`).
4. Disaster recovery + backups verified (`docs/disaster-recovery.md`,
   `scripts/backup-validator-state.sh`, `scripts/verify-backup-restore.sh`).

### Phase M3 — Launch day
1. Execute `docs/final-cutover-runbook.md` with the coordinated genesis start time.
2. Launch-day ops: on-call rota, incident bridge, status workflow
   (`docs/launch-day-{operations-log,incident-bridge-ack,status-workflow-log}.md`).
3. Deploy public endpoints + explorer (`claw-explorer/chains/mainnet/clawchain.json`,
   see explorer plan), faucet OFF for mainnet, monitoring on.
4. Verify: consensus across genesis validators, IBC clients to partner mainnets
   (Osmosis/Neutron), CosmWasm + DEX + privacy live with the MPC keys.

### Phase M4 — Post-launch
- First-week health summaries, retro (`docs/week-one-retrospective.md`,
  `docs/first-week-health-summaries.md`), monthly network report
  (`docs/monthly-network-report-template.md`).
- Governance operations (`docs/governance-operations-policy.md`); scheduled upgrades
  via `docs/upgrade-runbook.md`.

## Acceptance criteria

- Both hard gates (audit closed, MPC ceremony complete + attested) documented.
- Genesis hash + binary checksum verified identically by all genesis validators.
- Cutover AND rollback both rehearsed on staging.
- Mainnet produces blocks across ≥ the genesis validator quorum; privacy verifies
  against the MPC vks (not dev keys); IBC/DEX/CosmWasm live.
- Launch-day runbook, on-call, and DR all exercised.

## Out of scope / external

- Exchange listings, market making, marketing — tracked separately.
- Domain/hosting (`FIX #7`, deferred): requires VPS + DNS procurement.

## Dependencies / references

- Testnet launch (the dress rehearsal — must be green first).
- All `docs/*launch*`, `docs/*cutover*`, `docs/*genesis*`, `docs/mainnet-*` files.
- `mainnet/README.md`, `x/privacy/circuit/mpc_setup.go`.
