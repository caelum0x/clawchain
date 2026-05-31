#!/usr/bin/env bash
#
# Generate TypeScript protobuf codecs for clawchain custom modules into
# cmd/clawd/src/generated/proto, using a local protoc + ts-proto toolchain.
#
# This is the reliable fallback for the buf-based `make proto-gen-ts`, which
# requires the buf remote registry (frequently unavailable offline). The codecs
# it emits are registered in src/lib/registry.ts so clawd can encode and submit
# `/clawchain.*` custom-module transactions.
#
# Requirements: protoc on PATH, ts-proto installed (devDependency of clawd).
# Run from the repo root:  bash cmd/clawd/scripts/gen-proto.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

PLUGIN="cmd/clawd/node_modules/.bin/protoc-gen-ts_proto"
OUT="cmd/clawd/src/generated/proto"

if [ ! -x "$PLUGIN" ]; then
  echo "error: ts-proto not installed. Run 'npm install' in cmd/clawd first." >&2
  exit 1
fi

# forceLong=string keeps uint64 amounts as plain strings (matching CLI argv);
# importSuffix=.js satisfies nodenext module resolution in the clawd build.
TS_PROTO_OPT="esModuleInterop=true,forceLong=string,useExactTypes=false,outputServices=false,outputClientImpl=false,importSuffix=.js"

INCLUDES=(
  -I proto
  -I proto/_deps/cosmos-sdk
  -I proto/_deps/cosmos-proto
  -I proto/_deps/gogoproto
  -I proto/_deps/googleapis
  -I proto/_deps/grpc-gateway
)

# Custom modules to generate. Add more module proto directories here as their
# CLI tx flows are wired up.
MODULE_DIRS=(
  "proto/clawchain/privacy/v1"
  "proto/clawchain/agent/v1"
  "proto/clawchain/marketplace/v1"
  "proto/clawchain/oracle/v1beta1"
)

rm -rf "$OUT"
mkdir -p "$OUT"

PROTO_FILES=()
for dir in "${MODULE_DIRS[@]}"; do
  for f in "$dir"/*.proto; do
    PROTO_FILES+=("$f")
  done
done

echo "Generating TS codecs for ${#PROTO_FILES[@]} proto files -> $OUT"
protoc \
  --plugin=protoc-gen-ts_proto="$PLUGIN" \
  --ts_proto_out="$OUT" \
  --ts_proto_opt="$TS_PROTO_OPT" \
  "${INCLUDES[@]}" \
  "${PROTO_FILES[@]}"

echo "Done. Registered type urls live in cmd/clawd/src/lib/registry.ts"
