#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/external-integrator-validation.md
  docs/sdk-release-notes-candidate.md
  docs/launch-week-oncall-schedule.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing Track B doc '$doc'." >&2
    exit 1
  fi
done

if rg -n '\bTBD\b|\bPending\b' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track B docs contain placeholder values." >&2
  exit 1
fi

if ! rg -n 'Production Endpoint Validation|Canonical Quickstart Execution|Signed Confirmation|Evidence Artifacts' docs/external-integrator-validation.md >/dev/null; then
  echo "ERROR: external integrator validation doc missing required sections." >&2
  exit 1
fi

if ! rg -n 'mainnet\.clawchain\.dev|delegateTask|0x[0-9a-f]{64}' docs/external-integrator-validation.md >/dev/null; then
  echo "ERROR: external integrator validation doc missing production endpoint or signed tx evidence." >&2
  exit 1
fi

if ! rg -n 'npm Publish Artifact Metadata|dist-tag|Tarball sha256|Migration Confirmation' docs/sdk-release-notes-candidate.md >/dev/null; then
  echo "ERROR: SDK release notes doc missing npm publish metadata or migration confirmation." >&2
  exit 1
fi

if ! rg -n 'Named Shifts|Escalation Path|Acknowledgements' docs/launch-week-oncall-schedule.md >/dev/null; then
  echo "ERROR: launch-week on-call schedule missing required sections." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track B docs missing concrete UTC timestamps." >&2
  exit 1
fi

echo "real-world external validation gate passed."
