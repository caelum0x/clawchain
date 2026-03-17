#!/usr/bin/env bash
# release.sh — Binary release packaging script for ClawChain
#
# Usage:
#   ./scripts/release.sh [--version <ver>] [--platforms <list>] [--publish] [--dry-run] [--skip-ts]
#
# Examples:
#   ./scripts/release.sh                              # build all platforms, version from git
#   ./scripts/release.sh --version v0.2.0             # explicit version
#   ./scripts/release.sh --platforms linux/amd64       # single platform
#   ./scripts/release.sh --publish                     # build + create GitHub release draft
#   ./scripts/release.sh --dry-run                     # show plan without building
#   ./scripts/release.sh --skip-ts                     # skip TypeScript builds

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APPNAME="clawchain"
MODULE_PATH="github.com/cosmos/cosmos-sdk/version"

GO_BINARIES=(
  "clawchaind:cmd/clawchaind"
  "clawproof:cmd/clawproof"
  "claw-gpu-provider:cmd/claw-gpu-provider"
  "claw-inference-sidecar:cmd/claw-inference-sidecar"
  "claw-faucet:cmd/claw-faucet"
  "claw-eventsd:cmd/claw-eventsd"
  "claw-notifyd:cmd/claw-notifyd"
  "claw-txhistoryd:cmd/claw-txhistoryd"
)

DEFAULT_PLATFORMS="linux/amd64 linux/arm64 darwin/amd64 darwin/arm64"

# ---------------------------------------------------------------------------
# Globals (set by parse_flags)
# ---------------------------------------------------------------------------

VERSION=""
PLATFORMS=""
PUBLISH=false
DRY_RUN=false
SKIP_TS=false

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly RESET='\033[0m'

log()   { echo -e "${GREEN}==>${RESET} $*"; }
warn()  { echo -e "${YELLOW}WARNING:${RESET} $*" >&2; }
err()   { echo -e "${RED}ERROR:${RESET} $*" >&2; exit 1; }
info()  { echo -e "${CYAN}   $*${RESET}"; }

# Format bytes into human-readable form
format_bytes() {
  local bytes=$1
  if (( bytes >= 1073741824 )); then
    echo "$(awk "BEGIN {printf \"%.1f GB\", $bytes/1073741824}")"
  elif (( bytes >= 1048576 )); then
    echo "$(awk "BEGIN {printf \"%.1f MB\", $bytes/1048576}")"
  elif (( bytes >= 1024 )); then
    echo "$(awk "BEGIN {printf \"%.1f KB\", $bytes/1024}")"
  else
    echo "${bytes} B"
  fi
}

# ---------------------------------------------------------------------------
# Project root detection
# ---------------------------------------------------------------------------

find_project_root() {
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [[ -f "$dir/go.mod" ]]; then
    echo "$dir"
  else
    err "Cannot find project root (no go.mod found at $dir)"
  fi
}

PROJECT_ROOT="$(find_project_root)"

# ---------------------------------------------------------------------------
# Flag parsing
# ---------------------------------------------------------------------------

parse_flags() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        [[ -n "${2:-}" ]] || err "--version requires an argument"
        VERSION="$2"; shift 2 ;;
      --platforms)
        [[ -n "${2:-}" ]] || err "--platforms requires an argument"
        PLATFORMS="$2"; shift 2 ;;
      --publish)
        PUBLISH=true; shift ;;
      --dry-run)
        DRY_RUN=true; shift ;;
      --skip-ts)
        SKIP_TS=true; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        err "Unknown flag: $1" ;;
    esac
  done
}

usage() {
  cat <<'USAGE'
ClawChain Release Packaging Script

Usage:
  ./scripts/release.sh [FLAGS]

Flags:
  --version <ver>       Set release version (default: git describe)
  --platforms <list>    Space-separated OS/ARCH pairs (default: all 4)
                        Example: --platforms "linux/amd64 darwin/arm64"
  --publish             Create a GitHub release draft after packaging
  --dry-run             Show what would be built without building
  --skip-ts             Skip TypeScript builds (clawd CLI and SDK)
  -h, --help            Show this help message

Platforms (default):
  linux/amd64  linux/arm64  darwin/amd64  darwin/arm64

Output:
  build/release/<version>/
    clawchain-<version>-<os>-<arch>.tar.gz   (one per platform)
    checksums.sha256                          (SHA-256 for all tarballs)
    changelog.md                              (extracted from CHANGELOG.md)
USAGE
}

# ---------------------------------------------------------------------------
# Version detection
# ---------------------------------------------------------------------------

detect_version() {
  if [[ -n "$VERSION" ]]; then
    return
  fi

  # Try exact git tag first
  VERSION="$(git -C "$PROJECT_ROOT" describe --exact-match 2>/dev/null || true)"

  if [[ -z "$VERSION" ]]; then
    # Fall back to git describe with distance
    VERSION="$(git -C "$PROJECT_ROOT" describe --tags --always 2>/dev/null || true)"
  fi

  if [[ -z "$VERSION" ]]; then
    local branch commit
    branch="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
    commit="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "0000000")"
    VERSION="${branch}-${commit}"
  fi
}

# ---------------------------------------------------------------------------
# Changelog extraction
# ---------------------------------------------------------------------------

extract_changelog() {
  local version_tag="${VERSION#v}"  # strip leading v if present
  local changelog_file="$PROJECT_ROOT/CHANGELOG.md"
  local output_file="$1"

  if [[ ! -f "$changelog_file" ]]; then
    echo "No CHANGELOG.md found." > "$output_file"
    return
  fi

  # Extract section between ## [version] and the next ## [
  # Try both with and without the v prefix
  local found=false
  for tag in "$VERSION" "$version_tag" "v${version_tag}"; do
    local content
    content="$(awk -v ver="$tag" '
      BEGIN { found=0; printing=0 }
      /^## \[/ {
        if (printing) exit
        # Match ## [version] or ## [version] - date
        idx = index($0, "[")
        rest = substr($0, idx+1)
        idx2 = index(rest, "]")
        entry_ver = substr(rest, 1, idx2-1)
        if (entry_ver == ver) {
          printing = 1
          found = 1
          print $0
          next
        }
      }
      printing { print }
    ' "$changelog_file" 2>/dev/null || true)"

    if [[ -n "$content" ]]; then
      echo "$content" > "$output_file"
      found=true
      break
    fi
  done

  if [[ "$found" == false ]]; then
    echo "No changelog entry found for ${VERSION}." > "$output_file"
  fi
}

# ---------------------------------------------------------------------------
# Go binary cross-compilation
# ---------------------------------------------------------------------------

build_go_binary() {
  local name="$1" src_path="$2" target_os="$3" target_arch="$4" out_dir="$5"

  local commit
  commit="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")"

  local ldflags="-X ${MODULE_PATH}.Name=${APPNAME}"
  ldflags+=" -X ${MODULE_PATH}.AppName=${APPNAME}d"
  ldflags+=" -X ${MODULE_PATH}.Version=${VERSION}"
  ldflags+=" -X ${MODULE_PATH}.Commit=${commit}"
  ldflags+=" -s -w"  # strip debug info for smaller binaries

  local output="${out_dir}/${name}"

  GOOS="$target_os" GOARCH="$target_arch" CGO_ENABLED=0 \
    go build \
      -ldflags "$ldflags" \
      -mod=readonly \
      -trimpath \
      -o "$output" \
      "./${src_path}" \
  && info "  Built ${name} (${target_os}/${target_arch})" \
  || { warn "Failed to build ${name} for ${target_os}/${target_arch}"; return 1; }
}

build_platform() {
  local target_os="$1" target_arch="$2"
  local platform_dir="${RELEASE_DIR}/${target_os}-${target_arch}"
  mkdir -p "$platform_dir"

  log "Building Go binaries for ${target_os}/${target_arch}..."

  local pids=()
  local failed=0

  for entry in "${GO_BINARIES[@]}"; do
    local name="${entry%%:*}"
    local src="${entry#*:}"
    build_go_binary "$name" "$src" "$target_os" "$target_arch" "$platform_dir" &
    pids+=($!)
  done

  # Wait for all parallel builds
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done

  if (( failed )); then
    err "One or more builds failed for ${target_os}/${target_arch}"
  fi
}

# ---------------------------------------------------------------------------
# TypeScript builds
# ---------------------------------------------------------------------------

build_typescript() {
  if [[ "$SKIP_TS" == true ]]; then
    log "Skipping TypeScript builds (--skip-ts)"
    return
  fi

  log "Building clawd CLI..."
  (cd "$PROJECT_ROOT/cmd/clawd" && npm run build) \
    || err "clawd CLI build failed"
  info "  clawd CLI built"

  log "Building SDK..."
  (cd "$PROJECT_ROOT/sdk" && npm run build) \
    || err "SDK build failed"
  info "  SDK built"
}

# ---------------------------------------------------------------------------
# Packaging
# ---------------------------------------------------------------------------

package_platform() {
  local target_os="$1" target_arch="$2"
  local platform_dir="${RELEASE_DIR}/${target_os}-${target_arch}"
  local tarball_name="clawchain-${VERSION}-${target_os}-${target_arch}.tar.gz"
  local tarball_path="${RELEASE_DIR}/${tarball_name}"

  log "Packaging ${tarball_name}..."

  tar -czf "$tarball_path" \
    -C "$platform_dir" \
    .

  info "  Created ${tarball_name}"

  # Clean up platform staging directory
  rm -rf "$platform_dir"
}

# ---------------------------------------------------------------------------
# Checksums
# ---------------------------------------------------------------------------

generate_checksums() {
  local checksum_file="${RELEASE_DIR}/checksums.sha256"

  log "Generating SHA-256 checksums..."

  : > "$checksum_file"

  for tarball in "${RELEASE_DIR}"/*.tar.gz; do
    [[ -f "$tarball" ]] || continue
    local basename
    basename="$(basename "$tarball")"
    local hash
    hash="$(shasum -a 256 "$tarball" | awk '{print $1}')"
    echo "${hash}  ${basename}" >> "$checksum_file"
    info "  ${hash}  ${basename}"
  done

  echo ""
  info "Checksums written to checksums.sha256"
}

# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

print_summary() {
  echo ""
  echo -e "${BOLD}Release Summary: ${VERSION}${RESET}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "${BOLD}%-50s  %-12s  %-66s${RESET}\n" "Artifact" "Size" "SHA-256"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local total_size=0
  local artifact_count=0

  for tarball in "${RELEASE_DIR}"/*.tar.gz; do
    [[ -f "$tarball" ]] || continue
    local basename size_bytes size_human hash
    basename="$(basename "$tarball")"
    size_bytes="$(stat -f%z "$tarball" 2>/dev/null || stat -c%s "$tarball" 2>/dev/null || echo 0)"
    size_human="$(format_bytes "$size_bytes")"
    hash="$(shasum -a 256 "$tarball" | awk '{print $1}')"
    printf "%-50s  %-12s  %s\n" "$basename" "$size_human" "$hash"
    total_size=$((total_size + size_bytes))
    artifact_count=$((artifact_count + 1))
  done

  # Include checksums file itself
  if [[ -f "${RELEASE_DIR}/checksums.sha256" ]]; then
    local cs_size
    cs_size="$(stat -f%z "${RELEASE_DIR}/checksums.sha256" 2>/dev/null || stat -c%s "${RELEASE_DIR}/checksums.sha256" 2>/dev/null || echo 0)"
    printf "%-50s  %-12s  %s\n" "checksums.sha256" "$(format_bytes "$cs_size")" "-"
    artifact_count=$((artifact_count + 1))
  fi

  # Include changelog
  if [[ -f "${RELEASE_DIR}/changelog.md" ]]; then
    local cl_size
    cl_size="$(stat -f%z "${RELEASE_DIR}/changelog.md" 2>/dev/null || stat -c%s "${RELEASE_DIR}/changelog.md" 2>/dev/null || echo 0)"
    printf "%-50s  %-12s  %s\n" "changelog.md" "$(format_bytes "$cl_size")" "-"
    artifact_count=$((artifact_count + 1))
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${BOLD}${artifact_count} artifacts${RESET}  |  Total tarball size: ${BOLD}$(format_bytes "$total_size")${RESET}"
  echo -e "Output directory: ${BOLD}${RELEASE_DIR}${RESET}"
  echo ""
}

# ---------------------------------------------------------------------------
# GitHub release
# ---------------------------------------------------------------------------

publish_release() {
  if [[ "$PUBLISH" != true ]]; then
    return
  fi

  log "Creating GitHub release draft for ${VERSION}..."

  # Verify gh CLI is available
  if ! command -v gh &>/dev/null; then
    err "'gh' CLI is required for --publish. Install it: https://cli.github.com/"
  fi

  local notes_file="${RELEASE_DIR}/changelog.md"
  local assets=()

  for tarball in "${RELEASE_DIR}"/*.tar.gz; do
    [[ -f "$tarball" ]] || continue
    assets+=("$tarball")
  done

  if [[ -f "${RELEASE_DIR}/checksums.sha256" ]]; then
    assets+=("${RELEASE_DIR}/checksums.sha256")
  fi

  local asset_flags=()
  for a in "${assets[@]}"; do
    asset_flags+=("$a")
  done

  gh release create "$VERSION" \
    --draft \
    --title "ClawChain ${VERSION}" \
    --notes-file "$notes_file" \
    --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "origin")" \
    "${asset_flags[@]}"

  info "GitHub release draft created: ${VERSION}"
}

# ---------------------------------------------------------------------------
# Dry run
# ---------------------------------------------------------------------------

print_dry_run() {
  echo ""
  echo -e "${BOLD}Dry Run: ClawChain Release ${VERSION}${RESET}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Output directory: build/release/${VERSION}/"
  echo ""

  echo "Go binaries to build:"
  for entry in "${GO_BINARIES[@]}"; do
    local name="${entry%%:*}"
    local src="${entry#*:}"
    echo "  ${name}  (${src})"
  done
  echo ""

  echo "Target platforms:"
  for platform in $PLATFORMS; do
    echo "  ${platform}"
  done
  echo ""

  echo "Tarballs to create:"
  for platform in $PLATFORMS; do
    local os="${platform%%/*}"
    local arch="${platform#*/}"
    echo "  clawchain-${VERSION}-${os}-${arch}.tar.gz"
  done
  echo ""

  if [[ "$SKIP_TS" == true ]]; then
    echo "TypeScript builds: SKIPPED (--skip-ts)"
  else
    echo "TypeScript builds:"
    echo "  clawd CLI  (cmd/clawd)"
    echo "  SDK        (sdk)"
  fi
  echo ""

  echo "Additional artifacts:"
  echo "  checksums.sha256"
  echo "  changelog.md"
  echo ""

  if [[ "$PUBLISH" == true ]]; then
    echo "GitHub release: WILL BE CREATED (draft)"
  else
    echo "GitHub release: NO (use --publish to create)"
  fi
  echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  parse_flags "$@"
  detect_version

  [[ -z "$PLATFORMS" ]] && PLATFORMS="$DEFAULT_PLATFORMS"

  echo ""
  echo -e "${BOLD}ClawChain Release Builder${RESET}"
  echo -e "Version: ${CYAN}${VERSION}${RESET}"
  echo ""

  # Dry run: print plan and exit
  if [[ "$DRY_RUN" == true ]]; then
    print_dry_run
    exit 0
  fi

  # Set up output directory
  RELEASE_DIR="${PROJECT_ROOT}/build/release/${VERSION}"
  mkdir -p "$RELEASE_DIR"

  # 1. TypeScript builds (not platform-specific, run once)
  build_typescript

  # 2. Build Go binaries and package per platform
  cd "$PROJECT_ROOT"

  for platform in $PLATFORMS; do
    local os="${platform%%/*}"
    local arch="${platform#*/}"
    build_platform "$os" "$arch"
    package_platform "$os" "$arch"
  done

  # 3. Generate checksums
  generate_checksums

  # 4. Extract changelog
  log "Extracting changelog for ${VERSION}..."
  extract_changelog "${RELEASE_DIR}/changelog.md"

  # 5. Print summary
  print_summary

  # 6. Optionally publish GitHub release
  publish_release

  log "Release packaging complete."
}

main "$@"
