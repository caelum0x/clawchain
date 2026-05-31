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

## Known limitations (not chain-breaking)

- **privacy**: ZK verifying keys are not generated in the local dev setup
  (`.local-node/keys/*_vk.bin` missing) — shield/unshield need a trusted-setup
  ceremony output before use. Non-privacy operations are unaffected.
- **oracle**: the `terra.oracle.v1beta1.Msg` service is missing the
  `cosmos.msg.v1.service` proto annotation (a startup warning). Oracle vote txs
  should be validated once that annotation is added.
- **tokenfactory**: no `tx tokenfactory` CLI command is registered (module is
  wired; CLI surface is missing).
- **app test suite**: with the boot fixed, the previously-skipped app tests now
  run and reveal test-helper genesis gaps (e.g. `TestExportAppState`). These are
  test-helper issues; the live chain has correct state (verified).
