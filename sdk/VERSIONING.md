# SDK Versioning Policy

## Semantic Versioning

`@clawchain/sdk` follows [Semantic Versioning 2.0.0](https://semver.org/):

| Bump  | When |
|-------|------|
| MAJOR | Removal or rename of any public type, method, or constant; change to method signatures; breaking proto contract updates |
| MINOR | New methods, new query helpers, new message types, additive proto fields |
| PATCH | Bug fixes, documentation updates, internal refactors with no public API change |

## Chain Compatibility Matrix

| SDK version | Chain binary version | Cosmos SDK | CometBFT | Notes |
|-------------|---------------------|------------|-----------|-------|
| 1.0.x       | v1.0.x              | v0.53.x    | v1.x      | Current stable |
| 0.1.x       | v0.1.x (dev)        | v0.53.x    | v1.x      | Pre-release, API unstable |

## Proto Contract Guard

The SDK embeds generated proto contract literals (`sdk/src/generated/proto-contracts.ts`). These are validated at build time:

```bash
# Regenerate from chain protos
npm run proto:gen

# Verify current contracts match chain protos (CI gate)
npm run proto:check
```

If the chain's proto definitions change (new messages, renamed fields, updated HTTP annotations), the SDK's contract file must be regenerated and the SDK version bumped accordingly:

- Additive changes (new RPCs, new fields) → MINOR bump
- Breaking changes (removed RPCs, renamed fields) → MAJOR bump

## Release Process

1. Update `CHANGELOG.md` with the new version entry
2. Bump version in `package.json`
3. Run `npm run proto:gen` to regenerate contracts
4. Run `npm run proto:check` to validate
5. Run `npm run build` to compile TypeScript
6. Run `npm test` to verify
7. Tag: `git tag sdk/v1.x.x`
8. Publish: `npm publish`

## Deprecation Policy

- Deprecated APIs are marked with `@deprecated` JSDoc tags
- Deprecated APIs remain functional for at least one MINOR release cycle
- Removal happens only in MAJOR bumps with migration notes in CHANGELOG.md

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Latest stable SDK + chain code |
| `sdk/v1.x` | Maintenance branch for SDK v1 after v2 ships |
| `sdk/next` | Pre-release development for the next major version |
