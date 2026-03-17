#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash ./scripts/check-release-evidence-drift.sh >/dev/null
bash ./scripts/check-lifecycle-revision-monotonicity.sh >/dev/null

echo "phase19 evidence drift gate passed."
