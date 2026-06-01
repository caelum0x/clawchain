# ClawChain SDK Examples

Canonical TypeScript examples for all chain modules:

- `privacy.ts`
- `agent.ts`
- `messaging.ts`
- `marketplace.ts`
- `reputation.ts`
- `task.ts`
- `model-vault.ts` — tokenized AI-model markets: read a ModelVault's curve pool + dividend
  pool via `ModelVaultClient`, and (with a signer) run a buy → stake → claim demo.

## Quick Run

From `sdk/`:

```bash
npx tsx ./examples/privacy.ts
```

## Environment

Set values before running tx examples:

```bash
export CLAWCHAIN_RPC_URL="http://localhost:26657"
export CLAWCHAIN_MNEMONIC="replace with test mnemonic"
export CLAWCHAIN_AGENT_ADDRESS="claw1..."
export CLAWCHAIN_RECIPIENT="claw1..."
```

The examples intentionally use placeholder values and are safe to read as integration templates.

The `model-vault.ts` example uses its own env vars:

```bash
export CLAW_VAULT="claw1...vault-contract"          # required (read-only)
export CLAW_MNEMONIC="replace with test mnemonic"   # optional — enables the signed demo
export CLAW_MODEL_DENOM="factory/<issuer>/<subdenom>"  # required for the signed demo
npx tsx ./examples/model-vault.ts
```
