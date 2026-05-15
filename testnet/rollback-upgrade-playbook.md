# Testnet Rollback Upgrade Playbook

Use this when an upgrade rollout becomes unhealthy and must be reverted.

## Preconditions

- Access to previous stable binary artifact.
- Access to pre-upgrade state backup/snapshot.
- Last stable public manifest URL/path.

## Command Flow

1. Stop active runtime.

```bash
cd cmd/clawd
node ./dist/main.js stop
```

2. Restore previous binary artifact and restart node service.

```bash
# example placeholder; replace with your binary release flow
cp /opt/clawchain/releases/<stable>/clawchaind /usr/local/bin/clawchaind
```

3. Restore pre-upgrade backup (operator-specific storage path).

```bash
# example placeholder path
# tar -xzf /backups/clawchain-pre-upgrade.tar.gz -C ~/.clawchain
```

4. Re-join using last stable manifest.

```bash
node ./dist/main.js join --from-manifest https://testnet.clawchain.dev/manifest.json
```

5. Validate recovered health.

```bash
node ./dist/main.js doctor --json
node ./dist/main.js readiness --json
node ./dist/main.js peers verify
```

6. Regenerate and retain release evidence.

```bash
cd /path/to/new-blokchain
make release-evidence-pack MANIFEST=https://testnet.clawchain.dev/manifest.json HOST=<public-host>
```
