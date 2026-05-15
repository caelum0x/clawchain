# SDK Versioning + Changelog Policy

Phase 13 Track E policy for `@clawchain/sdk`.

## Versioning Rules

- Use semver (`MAJOR.MINOR.PATCH`).
- `MAJOR`: breaking API/protocol-surface changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes.

## Required Release Artifacts

1. Updated changelog entry for each SDK release.
2. Migration notes for any breaking or behavior-changing updates.
3. Protocol surface lock/changelog update when relevant:
- `make protocol-surface-lock-check`
- `make protocol-surface-changelog`

## Compatibility Promise

- SDK query/tx methods remain backward-compatible within the same major version.
- Breaking changes require explicit migration examples in docs.
