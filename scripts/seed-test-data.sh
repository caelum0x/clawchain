#!/usr/bin/env bash
# seed-test-data.sh — Alias for seed-testnet.sh
#
# Seeds ClawChain with test data for all 8 modules.
# See seed-testnet.sh for full documentation.
#
# Usage:
#   ./scripts/seed-test-data.sh                  # seed with defaults
#   ./scripts/seed-test-data.sh --dry-run         # show commands only
#   ./scripts/seed-test-data.sh --from my-account # use a specific key

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/seed-testnet.sh" "$@"
