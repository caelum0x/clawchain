#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <label> -- <command...>" >&2
  exit 1
fi

label="$1"
shift

if [[ "$1" != "--" ]]; then
  echo "usage: $0 <label> -- <command...>" >&2
  exit 1
fi
shift

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <label> -- <command...>" >&2
  exit 1
fi

OUT_DIR="artifacts/launch-day"
mkdir -p "$OUT_DIR"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
log_file="${OUT_DIR}/${label}-${timestamp}.log"
meta_file="${OUT_DIR}/${label}-${timestamp}.json"
start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

set +e
"$@" 2>&1 | tee "$log_file"
cmd_status="${PIPESTATUS[0]}"
set -e

end_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

status_label="passed"
if [[ "$cmd_status" -ne 0 ]]; then
  status_label="failed"
fi

cat >"$meta_file" <<JSON
{
  "label": "$label",
  "start_utc": "$start_utc",
  "end_utc": "$end_utc",
  "status": "$status_label",
  "exit_code": $cmd_status,
  "log_artifact": "$log_file"
}
JSON

echo "launch-day transcript log: $log_file"
echo "launch-day transcript metadata: $meta_file"
exit "$cmd_status"
