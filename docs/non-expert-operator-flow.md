# Non-Expert Operator Install + Repair Flow

Phase 13 Track D operator experience baseline for first-time users.

## One-Command Bring-Up

```bash
make openclaw-up-ready MANIFEST=<manifest> HOST=<host>
```

Alternative native path:

```bash
make clawd-up-ready MANIFEST=<manifest> HOST=<host>
```

## Repair Flow

```bash
openclaw doctor runtime --repair
make runtime-readiness-gate
```

## Recovery Proof Path

Use this canonical flow after machine reset or runtime breakage:

1. `make fresh-machine-acceptance-gate MANIFEST=<manifest> HOST=<host>`
2. `make one-command-agent-gate MANIFEST=<manifest> HOST=<host>`
3. `make release-ready-gate MANIFEST=<manifest> HOST=<host>`

## Success Criteria

- startup succeeds without manual config editing
- doctor repair resolves actionable blockers
- readiness gate returns passing status post-repair
