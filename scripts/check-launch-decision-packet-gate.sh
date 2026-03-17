#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f docs/launch-decision-packet.md ]]; then
  echo "ERROR: missing docs/launch-decision-packet.md." >&2
  exit 1
fi

if [[ ! -f docs/post-decision-status-entry.md ]]; then
  echo "ERROR: missing docs/post-decision-status-entry.md." >&2
  exit 1
fi

if [[ ! -f docs/mainnet-launch-checklist.md ]]; then
  echo "ERROR: missing docs/mainnet-launch-checklist.md." >&2
  exit 1
fi

if ! rg -n 'Gate Status Snapshot|Supporting Evidence Links|Explicit Launch Decision|Accountable Owners Sign-Off' docs/launch-decision-packet.md >/dev/null; then
  echo "ERROR: launch decision packet missing required sections." >&2
  exit 1
fi

if ! rg -n 'Decision outcome:\s*`(launch|no-launch)`|Decision timestamp \(UTC\)' docs/launch-decision-packet.md >/dev/null; then
  echo "ERROR: launch decision packet missing explicit launch/no-launch decision fields." >&2
  exit 1
fi

if ! rg -n 'Release Owner|Security Owner|Operations Owner|Chain Owner' docs/launch-decision-packet.md >/dev/null; then
  echo "ERROR: launch decision packet missing accountable owner sign-offs." >&2
  exit 1
fi

if ! rg -n 'release-evidence.json|trusted-setup-attestation.md|capacity-slo-evidence.md|integrator-onboarding-evidence.md' docs/launch-decision-packet.md >/dev/null; then
  echo "ERROR: launch decision packet missing required supporting evidence links." >&2
  exit 1
fi

if ! rg -n 'Publication Metadata|Public Update Body|Workflow Linkage' docs/post-decision-status-entry.md >/dev/null; then
  echo "ERROR: post-decision status entry missing required sections." >&2
  exit 1
fi

if ! rg -n 'decision identifier|decision outcome|current status|next update ETA \(UTC\)' docs/post-decision-status-entry.md >/dev/null; then
  echo "ERROR: post-decision status entry missing required public status fields." >&2
  exit 1
fi

if rg -n '\bTBD\b|\bPending\b' docs/launch-decision-packet.md docs/post-decision-status-entry.md >/dev/null; then
  echo "ERROR: launch decision artifacts contain placeholder values." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' docs/launch-decision-packet.md docs/post-decision-status-entry.md >/dev/null; then
  echo "ERROR: launch decision artifacts missing concrete UTC timestamps." >&2
  exit 1
fi

if rg -n '\|[^|\n]*\|[[:space:]]*Pending[[:space:]]*\|' docs/mainnet-launch-checklist.md >/dev/null || rg -n '\- \[ \]' docs/mainnet-launch-checklist.md >/dev/null; then
  if ! rg -n 'Decision outcome:\s*`no-launch`|Current decision:\s*`hold`|Current effective outcome.*`hold`' docs/launch-decision-packet.md >/dev/null; then
    echo "ERROR: checklist is not fully closed; launch decision packet must enforce no-launch/hold state." >&2
    exit 1
  fi
  if ! rg -n 'decision outcome:\s*`no-launch`|current status:\s*`hold`' docs/post-decision-status-entry.md >/dev/null; then
    echo "ERROR: checklist is not fully closed; public status entry must enforce no-launch/hold state." >&2
    exit 1
  fi
fi

echo "launch decision packet gate passed."
