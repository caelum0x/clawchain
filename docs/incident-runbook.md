# Incident Mode Runbook

Use this flow when the operator needs degraded mode with peer isolation and controlled recovery.

## Enter Degraded Mode

1. Enter incident mode and isolate peers.

```bash
cd cmd/clawd
node ./dist/main.js incident enter --reason "peer poisoning investigation"
```

2. Verify state.

```bash
node ./dist/main.js incident status --out pretty
node ./dist/main.js doctor --json
```

Expected behavior:
- incident mode is marked `active`
- local `seeds` and `persistentPeers` are cleared (unless `--no-peer-isolation`)
- previous peer settings are snapshotted for recovery

## Operate While Isolated

- Keep runtime in degraded mode while triaging.
- Validate node health and peer graph before rejoining:

```bash
node ./dist/main.js status
node ./dist/main.js peers verify
```

## Recovery Flow

1. Exit incident mode and restore previous peer settings.

```bash
node ./dist/main.js incident exit
```

2. Verify restoration and connectivity.

```bash
node ./dist/main.js incident status --out pretty
node ./dist/main.js peers summary --out pretty
node ./dist/main.js peers verify
```

3. If peer restoration should be skipped (manual reseed):

```bash
node ./dist/main.js incident exit --no-restore-peers
node ./dist/main.js peers sync-manifest --from-manifest <manifest-url-or-path>
```
