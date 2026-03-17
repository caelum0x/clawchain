#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/sdk-versioning-policy.md
  docs/reference-integrations.md
  docs/partner-onboarding-flow.md
  docs/integrator-quickstart.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing ecosystem/integrator doc '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Versioning Rules|Required Release Artifacts|Compatibility Promise' docs/sdk-versioning-policy.md >/dev/null; then
  echo "ERROR: docs/sdk-versioning-policy.md missing required policy sections." >&2
  exit 1
fi

if ! rg -n 'Canonical SDK Templates|Minimal Integrator Path|Expected Deliverables' docs/reference-integrations.md >/dev/null; then
  echo "ERROR: docs/reference-integrations.md missing required integration sections." >&2
  exit 1
fi

if ! rg -n 'Ownership|Onboarding Steps|Support SLA' docs/partner-onboarding-flow.md >/dev/null; then
  echo "ERROR: docs/partner-onboarding-flow.md missing required onboarding/support sections." >&2
  exit 1
fi

required_examples=(
  sdk/examples/privacy.ts
  sdk/examples/agent.ts
  sdk/examples/messaging.ts
  sdk/examples/marketplace.ts
  sdk/examples/reputation.ts
  sdk/examples/task.ts
)

for example in "${required_examples[@]}"; do
  if [[ ! -f "$example" ]]; then
    echo "ERROR: missing SDK example '$example'." >&2
    exit 1
  fi
done

if ! rg -n '^protocol-surface-changelog:|^runtime-readiness-gate:|^clawd-up-ready:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing ecosystem/integrator gate dependency targets." >&2
  exit 1
fi

echo "ecosystem/integrator gate passed."
