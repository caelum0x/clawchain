#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

sha256_file() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  else
    shasum -a 256 "$file_path" | awk '{print $1}'
  fi
}

NODE_BINARY_PATH="${CLAWCHAIND_BIN:-}"
if [[ -z "$NODE_BINARY_PATH" ]]; then
  if [[ -f "$ROOT_DIR/bin/clawchaind" ]]; then
    NODE_BINARY_PATH="$ROOT_DIR/bin/clawchaind"
  elif command -v clawchaind >/dev/null 2>&1; then
    NODE_BINARY_PATH="$(command -v clawchaind)"
  fi
fi

if [[ -z "$NODE_BINARY_PATH" || ! -f "$NODE_BINARY_PATH" ]]; then
  echo "ERROR: clawchaind binary not found. Set CLAWCHAIND_BIN=<path> or build bin/clawchaind." >&2
  exit 1
fi

RUNTIME_PACKAGE_PATH="${OPENCLAW_RUNTIME_PACKAGE:-}"
if [[ -z "$RUNTIME_PACKAGE_PATH" ]]; then
  if [[ -f "$ROOT_DIR/openclaw/package.json" ]]; then
    RUNTIME_PACKAGE_PATH="$ROOT_DIR/openclaw/package.json"
  fi
fi

if [[ -z "$RUNTIME_PACKAGE_PATH" || ! -f "$RUNTIME_PACKAGE_PATH" ]]; then
  echo "ERROR: OpenClaw runtime package artifact not found. Set OPENCLAW_RUNTIME_PACKAGE=<path>." >&2
  exit 1
fi

mkdir -p artifacts/provenance

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_commit="$(git rev-parse HEAD)"
git_branch="$(git rev-parse --abbrev-ref HEAD)"

node_sha="$(sha256_file "$NODE_BINARY_PATH")"
runtime_sha="$(sha256_file "$RUNTIME_PACKAGE_PATH")"

cat > artifacts/provenance/clawchaind.provenance.json <<JSON
{
  "artifact": {
    "name": "clawchaind",
    "kind": "node-binary",
    "path": "${NODE_BINARY_PATH}",
    "sha256": "${node_sha}"
  },
  "build": {
    "timestamp_utc": "${timestamp}",
    "git_commit": "${git_commit}",
    "git_branch": "${git_branch}"
  }
}
JSON

cat > artifacts/provenance/openclaw-runtime.provenance.json <<JSON
{
  "artifact": {
    "name": "openclaw-runtime",
    "kind": "runtime-package",
    "path": "${RUNTIME_PACKAGE_PATH}",
    "sha256": "${runtime_sha}"
  },
  "build": {
    "timestamp_utc": "${timestamp}",
    "git_commit": "${git_commit}",
    "git_branch": "${git_branch}"
  }
}
JSON

echo "release provenance artifacts generated:"
echo "  - artifacts/provenance/clawchaind.provenance.json"
echo "  - artifacts/provenance/openclaw-runtime.provenance.json"
