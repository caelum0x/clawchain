# ClawChain Mainnet Genesis

> ⚠️ **`mainnet/genesis.json` in this directory is a single-validator DEV STUB.
> It is NOT a launchable mainnet genesis. Do not start a public network with it.**

## Why the current file is not launch-ready

The committed `genesis.json` was produced by a single-node dev flow. An honest
audit (May 2026) found:

- **1 genesis validator** with a 500 CLAW self-bond. A single-validator chain has
  no Byzantine fault tolerance and is trivially centralized. A real launch needs
  an independent, geographically distributed validator set (target ≥ 4, ideally
  many more) each contributing their own gentx.
- **7 pre-funded accounts** (~1B CLAW) that need to be reviewed against the
  approved token distribution and bound to real, multi-sig-controlled keys — not
  placeholder addresses.
- **`genesis_time` in the past.** Must be set to a coordinated future launch time.

Note: `docs/genesis-ceremony-ownership-log.md` records "Approved" sign-offs and a
SHA256 for an `artifacts/genesis/clawchain-1/genesis.json` that **does not exist**.
Treat that log as a template to be completed by the real ceremony, not as evidence
that a ceremony happened. The ZK trusted-setup ceremony
(`artifacts/ceremony-transcript.json`) is likewise still `status: "pending"` and
must be completed before the privacy module can be trusted on mainnet.

The automated check `clawd launch-checklist` (item 8) now fails on a
single-validator stub, placeholder allocation addresses, and a past
`genesis_time`, so this gap can no longer pass silently.

## The real genesis ceremony (coordinator runbook)

The genesis is built collaboratively. No single party should hold every key.

### 1. Coordinator — publish the genesis template

Decide and freeze: `chain_id`, `genesis_time` (a coordinated future UTC time),
module params, and the approved token-allocation table (address → amount, each a
real bech32 `claw1...` address controlled by its owner / a multisig).

Generate the base genesis with accounts but no validators:

```bash
CHAIN_ID=clawchain-1 ./scripts/genesis-ceremony.sh build-base \
  --accounts mainnet/allocations.csv \
  --genesis-time 2026-07-01T16:00:00Z
```

Publish the resulting base `genesis.json` (and its SHA256) on ≥ 2 independent
channels so every validator starts from a verified identical file.

### 2. Each validator — submit a gentx (offline, on their own machine)

```bash
clawchaind init <moniker> --chain-id clawchain-1 --home ~/.clawchain
# import the published base genesis into ~/.clawchain/config/genesis.json
clawchaind keys add validator --keyring-backend file   # encrypted; never `test`
clawchaind genesis add-genesis-account validator <self-bond>uclaw --keyring-backend file
clawchaind genesis gentx validator <self-bond>uclaw \
  --chain-id clawchain-1 --keyring-backend file
# send ~/.clawchain/config/gentx/gentx-*.json back to the coordinator
```

Each validator must verify the base genesis SHA256 matches the published value
before generating their gentx.

### 3. Coordinator — collect, validate, publish

Drop every validator's gentx into `mainnet/gentxs/` and run:

```bash
CHAIN_ID=clawchain-1 ./scripts/genesis-ceremony.sh collect \
  --gentx-dir mainnet/gentxs \
  --output mainnet/genesis.json
```

This collects the gentxs, runs `clawchaind genesis validate`, enforces the
minimum validator count, and prints the final SHA256. Record that hash and the
per-role sign-offs in `docs/genesis-ceremony-ownership-log.md`, then publish the
final genesis on ≥ 2 independent channels. Every validator re-verifies the hash
before chain start.

## Pre-launch gates (must all be true)

- [ ] ≥ 4 independent genesis validators collected (`clawd launch-checklist` item 8 passes)
- [ ] Token allocations reviewed and bound to real multisig-controlled keys
- [ ] `genesis_time` set to the coordinated launch time (future)
- [ ] ZK trusted-setup ceremony completed (not `pending`); verifying keys pinned
- [ ] External security audit complete (separate launch blocker)
- [ ] Validators run with `file`/`os` keyring or a remote signer/HSM — never `test`
- [ ] Final genesis SHA256 verified identical across the validator set
