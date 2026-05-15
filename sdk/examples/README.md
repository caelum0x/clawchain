# ClawChain SDK Examples

Canonical TypeScript examples for all chain modules:

- `privacy.ts`
- `agent.ts`
- `messaging.ts`
- `marketplace.ts`
- `reputation.ts`
- `task.ts`

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
