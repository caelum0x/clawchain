#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/integrator-onboarding-evidence.md
  docs/sdk-release-notes-candidate.md
  docs/partner-support-rota.md
  docs/partner-onboarding-flow.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing Track E ecosystem readiness doc '$doc'." >&2
    exit 1
  fi
done

if rg -n '\bTBD\b|\bPending\b' docs/integrator-onboarding-evidence.md docs/sdk-release-notes-candidate.md docs/partner-support-rota.md docs/partner-onboarding-flow.md >/dev/null; then
  echo "ERROR: Track E docs still contain placeholder values." >&2
  exit 1
fi

if ! rg -n 'Canonical Quickstart Execution|End-to-End Integration Validation|Signed Transaction Path|Sign-Off' docs/integrator-onboarding-evidence.md >/dev/null; then
  echo "ERROR: integrator onboarding evidence doc missing required sections." >&2
  exit 1
fi

if ! rg -n 'Release Notes|Migration Notes|Compatibility Statement|Sign-Off' docs/sdk-release-notes-candidate.md >/dev/null; then
  echo "ERROR: SDK release notes doc missing required sections." >&2
  exit 1
fi

if ! rg -n 'Ownership Rota|Escalation Contacts|Escalation Rules|Sign-Off' docs/partner-support-rota.md >/dev/null; then
  echo "ERROR: partner support rota doc missing required sections." >&2
  exit 1
fi

if ! rg -n 'Ownership|Support SLA|Escalation Contacts' docs/partner-onboarding-flow.md >/dev/null; then
  echo "ERROR: partner onboarding flow missing ownership/SLA/escalation sections." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' docs/integrator-onboarding-evidence.md docs/sdk-release-notes-candidate.md docs/partner-support-rota.md >/dev/null; then
  echo "ERROR: Track E evidence docs missing concrete UTC timestamps." >&2
  exit 1
fi

if ! rg -n 'make clawd-up-ready|make runtime-readiness-gate' docs/integrator-onboarding-evidence.md >/dev/null; then
  echo "ERROR: onboarding evidence missing canonical quickstart command execution proof." >&2
  exit 1
fi

if ! rg -n 'delegateTask|acceptTask|completeTask' docs/sdk-release-notes-candidate.md >/dev/null; then
  echo "ERROR: SDK release notes missing task API migration coverage." >&2
  exit 1
fi

echo "ecosystem readiness proof gate passed."
