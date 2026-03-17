#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIN_COVERAGE="${MIN_COVERAGE:-80}"
COVER_PROFILE="${COVER_PROFILE:-coverage-integration.out}"
GO_TEST_TIMEOUT="${GO_TEST_TIMEOUT:-30m}"
KEEPER_PACKAGES="${KEEPER_PACKAGES:-}"

echo "--> Running integration coverage check"
echo "    Minimum: ${MIN_COVERAGE}%"
echo "    Profile: ${COVER_PROFILE}"

if [[ -z "${KEEPER_PACKAGES}" ]]; then
  KEEPER_PACKAGES="$(go list ./x/... | grep '/keeper$' | tr '\n' ' ')"
fi

if [[ -z "${KEEPER_PACKAGES// }" ]]; then
  echo "ERROR: no keeper packages discovered under ./x/..." >&2
  exit 1
fi

go test -tags=integration -coverprofile="${COVER_PROFILE}" -covermode=atomic -timeout "${GO_TEST_TIMEOUT}" ${KEEPER_PACKAGES}

total_line="$(go tool cover -func="${COVER_PROFILE}" | grep '^total:')"
if [[ -z "${total_line}" ]]; then
  echo "ERROR: unable to parse total coverage from ${COVER_PROFILE}" >&2
  exit 1
fi

total_pct="$(awk '{gsub("%","",$3); print $3}' <<<"${total_line}")"

echo "    Total coverage: ${total_pct}%"

if awk -v got="${total_pct}" -v min="${MIN_COVERAGE}" 'BEGIN { exit (got+0 >= min+0 ? 0 : 1) }'; then
  echo "integration coverage gate passed."
else
  echo "ERROR: integration coverage ${total_pct}% is below required ${MIN_COVERAGE}%." >&2
  exit 1
fi
