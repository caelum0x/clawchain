#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRILL_DOC="docs/incident-rollback-drill-log.md"

if [[ ! -f "$DRILL_DOC" ]]; then
  echo "ERROR: missing drill evidence doc '$DRILL_DOC'." >&2
  exit 1
fi

if ! rg -n '\| .* \| .*rollback.* \| .* \| Success \| .* \|' "$DRILL_DOC" >/dev/null; then
  echo "ERROR: missing successful rollback drill evidence row." >&2
  exit 1
fi

if ! rg -n '\| .* \| .*incident-isolation.* \| .* \| Success \| .* \|' "$DRILL_DOC" >/dev/null; then
  echo "ERROR: missing successful incident-isolation drill evidence row." >&2
  exit 1
fi

if ! rg -n 'Drill Command References|Owner Approval' "$DRILL_DOC" >/dev/null; then
  echo "ERROR: drill log missing command references or owner approval section." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "$DRILL_DOC" >/dev/null; then
  echo "ERROR: drill log missing concrete UTC timestamps." >&2
  exit 1
fi

echo "drill evidence gate passed."
