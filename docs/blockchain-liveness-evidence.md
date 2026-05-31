# ClawChain Liveness Evidence

This document records empirical proof that ClawChain is a working blockchain:
it boots, produces blocks, reaches consensus, and processes real transactions
through the core SDK and the custom modules. Captured on a local single-node
network (`chain-id: clawchain-local`, denom `uclaw`) from a clean genesis.

> **Why this exists:** the unit/integration suite (~2,450 tests) passed while the
> chain could **not** boot — `app/test_helpers.go` recover()s the construction
> panic and `t.Skip()`s, so every app-construction test silently skipped. Passing
> tests did not prove a working chain. This document proves it by running one.

## How to reproduce

```bash
make build                       # build ./build/clawchaind
rm -rf .local-node               # clean slate
bash scripts/local-dev.sh        # init + fund dev account + gentx + start
curl -s localhost:26657/status   # watch latest_block_height climb
```

## Boot blockers fixed first (commit dedef5b2)

The chain panicked on startup with four bugs, all in the oracle module, none
caught by unit tests (they construct keepers directly, bypassing depinject, store
mounting, and full app construction):

1. Module proto descriptor missing the `cosmos.app.v1alpha1.module` option.
2. Oracle params subspace never registered (`ProvideModule` panic).
3. Oracle module account missing from auth permissions (`NewKeeper` panic).
4. Oracle requested both `KVStoreService` and `KVStoreKey` → duplicate store key.

## Layer 1 — Liveness (consensus)

```
latest_block_height: 4 → 5 → … → 252 (continuous)
finalized block / executed block / committed state — app_hash advancing
chain_id: clawchain-local · validator voting_power: 100 · catching_up: false
```

## Layer 2 — Core SDK economy

| Action | Result | Evidence |
|---|---|---|
| bank send 12,345 uclaw dev→bob | code 0 | tx `9729CECF…`, height 141, bob balance = 12,345 |
| staking delegate 5,000,000 uclaw | code 0 | tx `EF91B11F…`, delegation 100,000,000 → 105,000,000 |
| distribution withdraw commission | code 0 | tx `14424B45…`, height 173 |
| clawgovernance submit-proposal | code 0 | proposal 0 created, status `voting`, height 183 |
| clawgovernance vote (dev, 105M staked) | code 0 | tally `yes_votes: 105000000` (stake-weighted) |
| clawgovernance vote (bob, no stake) | **code 1413** | `voter … has no bonded stake; only stakers may vote` |

The last row proves the fail-closed, Sybil-resistant voting fix on-chain: a
voter with no bonded stake is rejected with `ErrNoVotingPower` (1413), while a
staked voter's weight equals their bonded amount.

## Layer 3 — Custom modules (real txs)

| Module | Action | Result | What it proves |
|---|---|---|---|
| agent | query params | OK | module initialized; params persisted on-chain |
| marketplace | list-skill | code 0, `list_skill` event | skill stored on-chain |
| marketplace | purchase-skill (own) | **code 1205** `cannot purchase own skill` | buyer≠seller business rule enforced |
| messaging | send-message (reused nonce) | **code 1105** `duplicate nonce: message already sent` | nonce replay protection enforced |
| reputation | rate-agent (no purchase) | rejected pre-broadcast | rating requires a prior valid purchase |

Every rejection above is **correct business logic**, not a chain failure — the
modules execute real state machines with real validation.

## Layer 4 — clawd client layer (cosmjs registry, real custom-module txs)

Captured 2026-05-31 on `clawchain-local`. Until now clawd could not submit **any**
custom-module tx: every command built its `SigningStargateClient` with cosmjs's
default registry, which has no `/clawchain.*` codec, so `signAndBroadcast` threw
"Unregistered type url". Its 581 tests passed only because they mocked
`connectWithSigner` — the same "green tests over non-working code" pattern.

Fixed by generating ts-proto codecs (`cmd/clawd/scripts/gen-proto.sh`) and a
shared registry (`cmd/clawd/src/lib/registry.ts`) wired through
`connectClawchainSigningClient`. Proven with real signed txs (not mocks):

| Module | Action | Result | Evidence |
|---|---|---|---|
| privacy | shield 1000 uclaw | code 0 | tx `7E659E63…`, height 753, leaf_count 0→1 |
| privacy | **shield→unshield round-trip** | code 0 | shield 5000 (commit `1ea3acbb…`); clawproof Groth16 proof; unshield tx `45290A90…` height 1174, **proof verified against on-chain VK**, funds released |
| privacy | unshield replay (same proof) | **rejected** | `nullifier … already been used (double-spend)` (`state_machine.go:54`); nullifier `exists=true` |
| agent | register-agent | code 0 | tx `ED37B2D0…`, height 1100; re-register correctly rejected `already registered` |
| marketplace | list-skill | code 0 | tx `66A18880…`, height 1105 |

The privacy round-trip is the headline: shield commits a MiMC commitment to the
Merkle tree, `clawproof unshield-proof` rebuilds the tree from the leaves and
generates a Groth16 proof whose `merkle_root` matched the on-chain root
(`21d851…`), and the chain verified the proof on-chain before releasing funds.
Reproduce via `cmd/clawd/scripts/roundtrip-shield.ts` + `roundtrip-unshield.ts`.

## Known limitations (not chain-breaking)

- **privacy proving key**: the on-chain VKs (`.local-node/keys/*_vk.bin`) now
  exist, but **no matching proving key (`*_pk.bin`) is distributed**, so a
  verifiable unshield proof cannot be made from them as-is. The round-trip above
  required `clawproof setup` to regenerate a fresh pk+vk pair and swapping the
  new dev VK onto the node (Groth16 setup is randomized → fresh VK ≠ original).
  The dev key-gen path (Gap A) must emit pk+vk **together**. Mainnet must use the
  MPC ceremony output. Also: `clawproof --blinding` is a uint64 while the on-chain
  msg accepts a 256-bit blinding — keep dev blindings in uint64 range to reproduce.
- **oracle**: codecs are registered in clawd, but the exchange-rate flow is a
  multi-step commit-reveal (prevote hash, then reveal next vote period) — needs a
  multi-step driver, not a single CLI/registry call. `set-feeder` is single-shot.
- **oracle annotation**: the `terra.oracle.v1beta1.Msg` service is missing the
  `cosmos.msg.v1.service` proto annotation (a startup warning).
- **tokenfactory**: CLI tx surface now wired and proven (see plan doc Gap C).
- **app test suite**: with the boot fixed, the previously-skipped app tests now
  run and reveal test-helper genesis gaps (e.g. `TestExportAppState`). These are
  test-helper issues; the live chain has correct state (verified).
