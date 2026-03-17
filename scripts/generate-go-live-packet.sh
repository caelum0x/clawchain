#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/go-live}"
RELEASE_EVIDENCE="${RELEASE_EVIDENCE:-artifacts/release-evidence.json}"
MANIFEST_LIFECYCLE="${MANIFEST_LIFECYCLE:-testnet/public/manifest-lifecycle.json}"
REPRO_PROOF="${REPRO_PROOF:-}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$RELEASE_EVIDENCE" ]]; then
  echo "ERROR: missing release evidence '$RELEASE_EVIDENCE'." >&2
  echo "Run: make release-ready-gate MANIFEST=<manifest> HOST=<host>" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST_LIFECYCLE" ]]; then
  echo "ERROR: missing manifest lifecycle '$MANIFEST_LIFECYCLE'." >&2
  echo "Run: make testnet-public-manifest (or deploy flow) to generate lifecycle artifacts." >&2
  exit 1
fi

if [[ -z "$REPRO_PROOF" ]]; then
  latest_proof="$(ls -1t artifacts/testnet/public-reproducibility-proof-*.json 2>/dev/null | head -n1 || true)"
  if [[ -n "$latest_proof" ]]; then
    REPRO_PROOF="$latest_proof"
  fi
fi

if [[ -z "$REPRO_PROOF" || ! -f "$REPRO_PROOF" ]]; then
  echo "ERROR: missing reproducibility proof artifact. Expected artifacts/testnet/public-reproducibility-proof-*.json." >&2
  echo "Run: make testnet-public-verify-artifacts-only MANIFEST_URL=<manifest-url-or-path> STATUS_URL=<status-url-or-path>" >&2
  exit 1
fi

release_overall="$(jq -r '.overall_status // "unknown"' "$RELEASE_EVIDENCE")"
repro_status="$(jq -r '.status // "unknown"' "$REPRO_PROOF")"
lifecycle_signed="$(jq -r '.signedUpdate // false' "$MANIFEST_LIFECYCLE")"

mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/go-live-packet-$ts.json"
latest_file="$OUT_DIR/go-live-packet-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitBranch "$(git rev-parse --abbrev-ref HEAD)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg releaseEvidencePath "$RELEASE_EVIDENCE" \
  --arg manifestLifecyclePath "$MANIFEST_LIFECYCLE" \
  --arg reproducibilityProofPath "$REPRO_PROOF" \
  --arg releaseOverall "$release_overall" \
  --arg reproStatus "$repro_status" \
  --argjson lifecycleSigned "$lifecycle_signed" \
  --argjson releaseEvidence "$(cat "$RELEASE_EVIDENCE")" \
  --argjson manifestLifecycle "$(cat "$MANIFEST_LIFECYCLE")" \
  --argjson reproducibilityProof "$(cat "$REPRO_PROOF")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    git: {
      branch: $gitBranch,
      commit: $gitCommit
    },
    inputs: {
      releaseEvidencePath: $releaseEvidencePath,
      manifestLifecyclePath: $manifestLifecyclePath,
      reproducibilityProofPath: $reproducibilityProofPath
    },
    summary: {
      releaseOverallStatus: $releaseOverall,
      reproducibilityStatus: $reproStatus,
      manifestSignedUpdate: $lifecycleSigned,
      goLiveReady: (
        ($releaseOverall == "passed")
        and ($reproStatus == "passed")
        and ($lifecycleSigned == true)
      )
    },
    artifacts: {
      releaseEvidence: $releaseEvidence,
      manifestLifecycle: $manifestLifecycle,
      reproducibilityProof: $reproducibilityProof
    }
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"

echo "go-live packet written."
echo "  packet: $out_file"
echo "  latest: $latest_file"
