# Known issue: proto sources drifted from generated `*.pb.go` (blocks new proto-gen features)

_Found 2026-06-02 while attempting P4 `MsgSubmitUsageAttestation` in `x/modelregistry`._

## Symptom

Running the repo's proto generator on an **unchanged** tree produces a large, breaking diff
instead of a no-op:

```bash
make proto-gen        # buf generate + scripts/sync-generated-go-pb.sh
git diff --stat
#  x/governance/types/types.pb.go        | 241 +-
#  x/messaging/types/params.pb.go        |  20 +-
#  x/modelregistry/types/tx.pb.go        | 1602 +-
#  x/modelregistry/types/types.pb.go     |  554 +-
#  x/oracle/types/query.pb.gw.go         |   2 +-
#  x/reputation/types/params.pb.go       |  51 +-
#  sdk/src/generated/proto-contracts.ts  |   2 +
#  (~2,144 insertions / ~328 deletions across 7 files)
```

## Root cause

The committed generated `*.pb.go` contains fields/messages that **do not exist in the
committed `.proto` sources**, and live Go code depends on those fields. Examples:

- `MsgRegisterModel.SubscriptionPeriodBlocks` and `PriceSubscriptionUclaw` exist in
  `x/modelregistry/types/tx.pb.go` (fields up to 17) but the `.proto` `MsgRegisterModel`
  only defines through field 15.
- Consumers: `x/modelregistry/keeper/msg_server.go:152-156,286-300`,
  `x/modelregistry/keeper/grpc_msg_server.go:39-40`.

So a regenerate **removes** those fields and immediately breaks `go build ./...` for reasons
unrelated to whatever new field/message you were adding.

## Impact

- `go build ./...` on the committed tree is **green** — this is a *latent* issue, not an
  active breakage. It only bites when someone runs proto-gen.
- Any new chain-side feature that needs a proto change in these modules (e.g. the P4
  inference-settlement attestation/dispute messages) **cannot be added "the right way"**
  (via proto-gen) until the drift is reconciled — and hand-editing `*.pb.go` is not an
  option (the next regen erases it).

## Recommended fix (prerequisite task, do before P4 attestation)

Reconcile **proto sources up to the committed generated code** (lower risk than the reverse,
since the generated code + keepers already agree):

1. Run `make proto-gen`, inspect the diff.
2. For each removed field/message, **edit the `.proto` source to add it** (matching field
   numbers, names, and options) so regeneration reproduces the committed `*.pb.go`.
3. Re-run `make proto-gen` until `git diff` is **empty** (idempotent generation).
4. Confirm `go build ./...` + `go test ./...` stay green.

This is a focused infra task spanning `modelregistry`, `governance`, `messaging`,
`reputation`, and `oracle` — keep it separate from feature work.
