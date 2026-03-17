#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required for provenance validation." >&2
  exit 1
fi

node_file="artifacts/provenance/clawchaind.provenance.json"
runtime_file="artifacts/provenance/openclaw-runtime.provenance.json"

for file in "$node_file" "$runtime_file"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing provenance artifact: $file" >&2
    echo "Run: make release-artifact-provenance-pack" >&2
    exit 1
  fi
done

check_non_empty() {
  local file="$1"
  local jq_path="$2"
  local label="$3"
  local value
  value="$(jq -r "$jq_path" "$file")"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "ERROR: $file missing $label ($jq_path)" >&2
    exit 1
  fi
}

check_sha() {
  local file="$1"
  local jq_path="$2"
  local value
  value="$(jq -r "$jq_path" "$file")"
  if [[ ! "$value" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: $file has invalid sha256 at $jq_path" >&2
    exit 1
  fi
}

check_kind() {
  local file="$1"
  local expected="$2"
  local actual
  actual="$(jq -r '.artifact.kind' "$file")"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: $file artifact.kind must be '$expected' (got '$actual')" >&2
    exit 1
  fi
}

validate_file() {
  local file="$1"
  check_non_empty "$file" '.artifact.name' 'artifact.name'
  check_non_empty "$file" '.artifact.path' 'artifact.path'
  check_non_empty "$file" '.artifact.sha256' 'artifact.sha256'
  check_non_empty "$file" '.build.timestamp_utc' 'build.timestamp_utc'
  check_non_empty "$file" '.build.git_commit' 'build.git_commit'
  check_non_empty "$file" '.build.git_branch' 'build.git_branch'
  check_sha "$file" '.artifact.sha256'
}

validate_file "$node_file"
validate_file "$runtime_file"
check_kind "$node_file" 'node-binary'
check_kind "$runtime_file" 'runtime-package'

if ! rg -n 'Release Artifact Provenance Checklist|clawchaind\.provenance\.json|openclaw-runtime\.provenance\.json' docs/upgrade-runbook.md docs/operator-quickstart.md >/dev/null; then
  echo "ERROR: operator docs are missing provenance checklist references." >&2
  exit 1
fi

echo "release artifact provenance gate passed."
