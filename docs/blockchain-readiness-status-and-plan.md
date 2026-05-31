# ClawChain Readiness: Status & Remediation Plan

_Last updated: 2026-05-31 • Branch: `fix/security-blockers-and-landing-3d`_

## Bottom line

The question was: "do we have a full working real blockchain?" The honest answer
was **no — it could not even start.** After fixing four startup bugs it now boots,
produces blocks, reaches consensus, and processes real transactions through the
core SDK and the custom modules. This document records what was wrong, what is now
proven, and a concrete plan to close the remaining gaps.

## What was actually wrong

The binary **panicked on startup** with four separate bugs, all in the oracle
module. None were caught by the ~2,450 unit/integration tests, because:

1. Unit tests construct keepers directly, bypassing depinject wiring, store
   mounting, and full app construction.
2. `app/test_helpers.go::newTestApp` wraps `app.New` in `recover()` and calls
   `t.Skip("app.New panicked during depinject wiring (pre-existing module config
   issue)")`. So **every app-construction test silently skipped itself** while the
   suite reported green.

"Tests pass" never meant "the chain works." Fixed in commit `dedef5b2`:

| # | Bug | File | Panic |
|---|-----|------|-------|
| 1 | Module proto descriptor missing `cosmos.app.v1alpha1.module` option | `x/oracle/types/module.pb.go` | depinject rejected the module |
| 2 | Params subspace never registered | `x/oracle/module/module.go` | `ProvideModule` panic |
| 3 | Module account missing from auth permissions | `app/app_config.go` | `NewKeeper` panic |
| 4 | Requested both `KVStoreService` + `KVStoreKey` → two "oracle" stores | `x/oracle/module/module.go` | duplicate store key |

## What is now proven (live, `chain-id clawchain-local`)

| Layer | Evidence |
|---|---|
| Block production | height 4 → 252+, finalized/committed, app_hash advancing |
| Bank | sent 12,345 uclaw dev→bob (tx `9729CECF`), balance moved |
| Staking | delegated 5M, delegation 100M → 105M (tx `EF91B11F`) |
| Distribution | withdrew validator commission (tx `14424B45`) |
| Governance | proposal created + voted; dev's vote weighted 105M (its stake) |
| Fail-closed voting | bob (no stake) rejected, **code 1413** "only stakers may vote" |
| Marketplace | listed a skill (`list_skill` event); self-purchase rejected, **code 1205** |
| Messaging | reused nonce rejected, **code 1105** "duplicate nonce" (replay protection) |

Every rejection is correct business logic. Full reproduction steps are in
[blockchain-liveness-evidence.md](blockchain-liveness-evidence.md).

## Remaining gaps & remediation plan

Four known gaps remain. None break block production; the chain runs without them.
Ordered by leverage.

### Gap A — Privacy ZK verifying keys not available in local dev

- **Problem:** the node logs `privacy module: verifying keys not loaded` because
  `.local-node/keys/transfer_vk.bin` / `unshield_vk.bin` are missing. Shield /
  unshield / private-transfer cannot be exercised until the keys exist.
- **Root cause:** `x/privacy/keeper/keeper.go::LoadVerifyingKeys` reads the VKs
  from a keys dir, but nothing generates them for a dev node. Generation logic
  exists in `x/privacy/circuit/setup.go` (`SetupTransfer`, `SetupUnshield`) and
  `x/privacy/circuit/mpc_setup.go` (the production MPC ceremony).
- **Plan:**
  1. Add a `clawchaind privacy gen-dev-keys <dir>` CLI subcommand (or a
     `scripts/gen-privacy-keys.sh`) that calls `SetupTransfer`/`SetupUnshield`,
     serializes the verifying keys, and writes `transfer_vk.bin` /
     `unshield_vk.bin`.
  2. Have `scripts/local-dev.sh` call it during init so dev nodes load VKs.
  3. Document clearly that dev keys are NOT secure — mainnet must use the MPC
     ceremony output (`artifacts/ceremony-transcript.json`, currently `pending`).
- **Acceptance:** `clawd privacy shield` succeeds on the local node; the
  shield→private-transfer→unshield round-trip works end-to-end.
- **Effort:** ~half a day. **Risk:** low (dev-only); keep prod ceremony separate.

### Gap B — Oracle `Msg` service missing `cosmos.msg.v1.service` annotation

- **Problem:** startup warning `service terra.oracle.v1beta1.Msg does not have
  cosmos.msg.v1.service proto annotation`; oracle msg routing/signing validation
  is not enforced.
- **Root cause:** `proto/clawchain/oracle/v1beta1/tx.proto` declares
  `service Msg { ... }` (line 11) with per-method `cosmos.msg.v1.signer` options
  but is **missing the service-level** `option (cosmos.msg.v1.service) = true;`.
  Sibling modules (`privacy`, `clawchain`, `modelregistry`) all have it.
- **Plan:**
  1. Add `option (cosmos.msg.v1.service) = true;` inside the oracle `Msg` service.
  2. Regenerate the oracle tx descriptor (the repo uses buf via `make proto-gen`;
     buf is not installed locally — install it, or hand-patch the generated
     `tx.pb.go` descriptor the same way the boot fix patched `module.pb.go`).
  3. Re-run the node; confirm the warning is gone and oracle vote txs validate.
- **Acceptance:** no annotation warning at startup; an oracle exchange-rate vote
  from the feeder account is accepted.
- **Effort:** ~half a day (mostly proto toolchain). **Risk:** low.

### Gap C — Tokenfactory has no CLI tx commands

- **Problem:** there is no `clawchaind tx tokenfactory ...` — create-denom / mint /
  burn / change-admin are unreachable from the CLI even though the keeper works
  and is unit-tested.
- **Root cause:** `x/tokenfactory/module/autocli.go` explicitly does not implement
  `AutoCLIOptions`, and there is no manual `GetTxCmd`, so no tx surface is wired.
- **Plan:**
  1. Implement `AutoCLIOptions` for the tokenfactory `Msg` service (map
     create-denom / mint / burn / set-denom-metadata / change-admin), **or** add a
     manual `GetTxCmd()` returning cobra commands for those msgs.
  2. Add the corresponding query commands if also missing.
- **Acceptance:** `clawchaind tx tokenfactory create-denom <sub>` mints a new
  `factory/<addr>/<sub>` denom, then `mint`/`burn` adjust supply on the live node.
- **Effort:** ~half to one day. **Risk:** low.
- **UPDATE (2026-05-31): partially done + deeper finding.** A manual
  `x/tokenfactory/client/cli/tx.go` (`GetTxCmd` with create-denom/mint/burn) is
  now wired into the root `tx` command, so the subcommands appear. But submitting
  them fails at decode time: `*types.MsgCreateDenom does not have a Descriptor()
  method`. The hand-crafted Osmosis-compatible msg types (`x/tokenfactory/types/
  msgs.go`) implement Marshal/Unmarshal but have **no proto `Descriptor()` and no
  file descriptor**, so they are not tx-submittable by the standard proto codec at
  all — the module is unit-tested but its messages cannot be sent on-chain.
  - **Real remaining work:** generate proper proto descriptors for the
    `osmosis.tokenfactory.v1beta1` Msg types (regenerate `tx.pb.go` with buf, or
    embed a file descriptor and add `Descriptor()` methods like the oracle module
    fix). This is the actual blocker; the CLI is ready once it lands.
  - **Reclassified effort:** ~one day (proto descriptor generation for ~8 msgs).
- **UPDATE 2 (2026-05-31): two more layers fixed; a third, deeper one remains.**
  The hand-crafted types are broken at multiple layers, peeled back in order:
  1. **Decode (fixed):** added a real proto file descriptor + `Descriptor()`
     methods (`x/tokenfactory/types/descriptor.go`, generated from a new
     `proto/osmosis/tokenfactory/v1beta1/tx.proto`, with `cosmos.msg.v1.signer`
     and `cosmos.msg.v1.service` options). Txs now decode.
  2. **Handler registration (fixed):** `AppModule.RegisterServices` type-asserted
     the registrar to `module.Configurator`, which is NOT what the depinject
     runtime passes, so the assertion silently failed and **no** msg handlers were
     registered ("no message handler found"). Now registers directly on the
     `grpc.ServiceRegistrar`. CheckTx now passes (code 0).
  3. **Block inclusion (still broken):** create-denom/mint pass CheckTx but are
     silently excluded from block proposals (PrepareProposal) and never commit —
     a signer/ante incompatibility in the proposal exec path that stems from the
     types being hand-crafted rather than generated. Normal txs (bank, staking,
     gov, marketplace, messaging) commit fine on the same node, so this is
     tokenfactory-specific.
  - **Conclusion:** the clean fix is to **fully regenerate the tokenfactory module
    from real Osmosis protos** (Marshal/Unmarshal, GetSigners, descriptors — not
    just patch the hand-crafted types). Layers 1–2 are correct and committed; the
    module is still not usable on-chain until layer 3 (full regen) lands.

### Gap D — Un-masked app tests reveal test-helper genesis gaps

- **Problem:** with `app.New` fixed, the previously-skipped app tests now run and
  fail in a cascade: `TestExportAppState` first hit agent params, now mint
  (`collections: not found: ... cosmos.mint.v1beta1.Minter`). These are
  test-helper genesis issues — the **live chain has correct state** (verified:
  agent params and mint inflation are present on the running node).
- **Root cause:** `app/test_helpers.go::Setup` builds a synthetic genesis
  (`DefaultGenesis()` + hand-overridden staking/bank) that does not fully
  initialize every module the way `clawchaind init` does, so export round-trips
  fail for modules whose state was never set.
- **Plan:**
  1. Decide the test-genesis strategy: prefer building the test genesis from the
     same default-genesis path the binary uses (so all modules initialize), rather
     than hand-overriding individual module sections.
  2. Remove the `recover()/t.Skip()` masking in `newTestApp` so construction
     failures fail loudly (the chain boots now; masking should not hide future
     regressions). Gate it behind an explicit opt-in if still needed.
  3. Fix each remaining export/init gap until `go test ./app/ -count=1` is
     genuinely green (no skips).
- **Acceptance:** `go test ./app/...` passes with zero skipped app-construction
  tests; a CI check asserts the suite does not skip on construction panic.
- **Effort:** ~one to two days (cascade depth unknown). **Risk:** medium — each
  fixed module may reveal the next; bounded by the module count.

## Recommended sequence

1. **Gap D first** (test honesty): remove the masking and get the app suite truly
   green, so the test suite stops lying and future regressions are caught.
2. **Gap B** (oracle annotation) and **Gap C** (tokenfactory CLI): small, isolated,
   unlock oracle and tokenfactory exercise.
3. **Gap A** (privacy dev keys): unlocks the privacy round-trip demo; keep the
   prod MPC ceremony as a separate launch-gate item.

These are all additive; none reopen the boot fixes. After they land, the chain has
no known functional gaps in local operation, leaving the external security audit
and the multi-validator genesis ceremony as the remaining mainnet launch gates
(tracked in [mainnet/README.md](../mainnet/README.md)).
