# Runtime Update + Signing Policy

Phase 13 Track D secure update channel policy for OpenClaw runtime delivery.

## Policy Goals

- ensure runtime artifacts are traceable to source commit
- require checksum/signature verification before operator rollout
- prevent unsigned update paths for public release candidates

## Requirements

1. Every runtime release includes:
- artifact checksum (`sha256`)
- release provenance metadata
- signing identity reference
2. Operators verify artifact integrity before install.
3. Update announcements include:
- version tag
- commit hash
- upgrade notes and rollback path

## Required Gate Hooks

- `make release-artifact-provenance-pack`
- `make release-artifact-provenance-gate`
- `make release-evidence-pack`

## Blocking Rule

If runtime package provenance or signature evidence is missing, release is blocked.
