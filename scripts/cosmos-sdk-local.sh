#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_SDK_DIR="${COSMOS_SDK_DIR:-$ROOT_DIR/cosmos-sdk}"
CMD="${1:-status}"

require_local_sdk() {
  if [[ ! -f "$LOCAL_SDK_DIR/go.mod" ]]; then
    echo "local cosmos-sdk not found at: $LOCAL_SDK_DIR" >&2
    exit 1
  fi
  if ! grep -q "^module github.com/cosmos/cosmos-sdk$" "$LOCAL_SDK_DIR/go.mod"; then
    echo "unexpected module path in $LOCAL_SDK_DIR/go.mod (expected github.com/cosmos/cosmos-sdk)" >&2
    exit 1
  fi
}

required_version() {
  awk '
    /^require \(/ { in_block=1; next }
    in_block && /^\)/ { in_block=0 }
    in_block && $1 == "github.com/cosmos/cosmos-sdk" { print $2; exit }
    !in_block && $1 == "require" && $2 == "github.com/cosmos/cosmos-sdk" { print $3; exit }
  ' "$ROOT_DIR/go.mod"
}

required_series() {
  local v
  v="$(required_version)"
  echo "$v" | sed -E 's/^v([0-9]+)\.([0-9]+).*/\1.\2/'
}

infer_local_series() {
  local tag exact latest
  if [[ -d "$LOCAL_SDK_DIR/.git" ]]; then
    exact="$(git -C "$LOCAL_SDK_DIR" describe --tags --exact-match 2>/dev/null || true)"
    if [[ -n "$exact" ]] && [[ "$exact" =~ ^v([0-9]+)\.([0-9]+)\.[0-9]+ ]]; then
      echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
      return
    fi

    latest="$(git -C "$LOCAL_SDK_DIR" describe --tags --abbrev=0 2>/dev/null || true)"
    if [[ -n "$latest" ]] && [[ "$latest" =~ ^v([0-9]+)\.([0-9]+)\.[0-9]+ ]]; then
      echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
      return
    fi
  fi

  if [[ -f "$LOCAL_SDK_DIR/RELEASE_NOTES.md" ]]; then
    tag="$(grep -m1 -E '^# Cosmos SDK v[0-9]+\.[0-9]+\.[0-9]+' "$LOCAL_SDK_DIR/RELEASE_NOTES.md" || true)"
    if [[ "$tag" =~ v([0-9]+)\.([0-9]+)\.[0-9]+ ]]; then
      echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
      return
    fi
  fi

  echo ""
}

check_series_compat_or_die() {
  local req local_series
  req="$(required_series)"
  local_series="$(infer_local_series)"

  if [[ -z "$local_series" ]]; then
    if [[ "${FORCE:-0}" == "1" ]]; then
      echo "Could not infer local SDK series; proceeding because FORCE=1"
      return
    fi
    echo "Could not infer local Cosmos SDK version series (expected ${req}.x)." >&2
    echo "Set FORCE=1 to bypass safety check." >&2
    exit 1
  fi

  if [[ "$req" != "$local_series" ]]; then
    if [[ "${FORCE:-0}" == "1" ]]; then
      echo "Version series mismatch (${req}.x required, local inferred ${local_series}.x); proceeding because FORCE=1"
      return
    fi
    echo "Refusing local link: required series is ${req}.x but local SDK appears to be ${local_series}.x" >&2
    echo "Use FORCE=1 to override if you intentionally want this mismatch." >&2
    exit 1
  fi
}

print_status() {
  echo "Required in go.mod: github.com/cosmos/cosmos-sdk $(required_version)"
  local_series="$(infer_local_series)"
  if [[ -n "$local_series" ]]; then
    echo "Local inferred series: ${local_series}.x"
  else
    echo "Local inferred series: unknown"
  fi
  echo "Resolved by go toolchain:"
  (cd "$ROOT_DIR" && go list -m -f '  - path={{.Path}} version={{.Version}} dir={{.Dir}}' github.com/cosmos/cosmos-sdk)

  if (cd "$ROOT_DIR" && go mod edit -json | grep -q '"Old":{"Path":"github.com/cosmos/cosmos-sdk"'); then
    echo "Replace directive: enabled (local override active)"
  else
    echo "Replace directive: disabled (using module proxy version)"
  fi

  if [[ -d "$LOCAL_SDK_DIR/.git" ]]; then
    local_commit="$(git -C "$LOCAL_SDK_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    local_branch="$(git -C "$LOCAL_SDK_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    echo "Local checkout: $LOCAL_SDK_DIR (branch=$local_branch, commit=$local_commit)"
  else
    echo "Local checkout: $LOCAL_SDK_DIR"
  fi
}

case "$CMD" in
  status)
    print_status
    ;;
  link)
    require_local_sdk
    echo "Enabling local cosmos-sdk replace -> ./cosmos-sdk"
    (cd "$ROOT_DIR" && go mod edit -replace github.com/cosmos/cosmos-sdk=./cosmos-sdk)
    print_status
    ;;
  link-safe)
    require_local_sdk
    check_series_compat_or_die
    echo "Enabling local cosmos-sdk replace -> ./cosmos-sdk (safe mode)"
    (cd "$ROOT_DIR" && go mod edit -replace github.com/cosmos/cosmos-sdk=./cosmos-sdk)
    print_status
    ;;
  unlink)
    echo "Removing local cosmos-sdk replace"
    (cd "$ROOT_DIR" && go mod edit -dropreplace github.com/cosmos/cosmos-sdk)
    print_status
    ;;
  *)
    echo "usage: $0 {status|link|link-safe|unlink}" >&2
    exit 1
    ;;
esac
