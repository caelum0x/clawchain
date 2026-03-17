#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p .tmp/go-build
GOCACHE="$ROOT_DIR/.tmp/go-build" go test -mod=readonly ./cmd/claw-txhistoryd -v
