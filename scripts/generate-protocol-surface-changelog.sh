#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NEW_LOCK="${NEW_LOCK:-contracts/protocol-surface.lock}"
OLD_LOCK="${OLD_LOCK:-}"
BASE_REF="${BASE_REF:-HEAD~1}"
OUT_FILE="${OUT_FILE:-artifacts/protocol-surface-changelog.md}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new-lock)
      NEW_LOCK="$2"
      shift 2
      ;;
    --old-lock)
      OLD_LOCK="$2"
      shift 2
      ;;
    --base-ref)
      BASE_REF="$2"
      shift 2
      ;;
    --out)
      OUT_FILE="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      echo "usage: $0 [--new-lock <path>] [--old-lock <path>] [--base-ref <git-ref>] [--out <path>]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$NEW_LOCK" ]]; then
  echo "ERROR: new protocol lock file not found: $NEW_LOCK" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

old_lock_path="$tmp_dir/old.lock"
source_label="provided-file"

if [[ -n "$OLD_LOCK" ]]; then
  if [[ ! -f "$OLD_LOCK" ]]; then
    echo "ERROR: old protocol lock file not found: $OLD_LOCK" >&2
    exit 1
  fi
  cp "$OLD_LOCK" "$old_lock_path"
  source_label="$OLD_LOCK"
elif git show "${BASE_REF}:contracts/protocol-surface.lock" >"$old_lock_path" 2>/dev/null; then
  source_label="${BASE_REF}:contracts/protocol-surface.lock"
else
  : >"$old_lock_path"
  source_label="none (initial snapshot)"
fi

old_norm="$tmp_dir/old.norm.tsv"
new_norm="$tmp_dir/new.norm.tsv"
old_paths="$tmp_dir/old.paths"
new_paths="$tmp_dir/new.paths"
added="$tmp_dir/added.paths"
removed="$tmp_dir/removed.paths"
changed="$tmp_dir/changed.tsv"

awk '{print $2 "\t" $1}' "$old_lock_path" | sed '/^[[:space:]]*$/d' | sort -t$'\t' -k1,1 >"$old_norm"
awk '{print $2 "\t" $1}' "$NEW_LOCK" | sed '/^[[:space:]]*$/d' | sort -t$'\t' -k1,1 >"$new_norm"

cut -f1 "$old_norm" >"$old_paths"
cut -f1 "$new_norm" >"$new_paths"

comm -13 "$old_paths" "$new_paths" >"$added"
comm -23 "$old_paths" "$new_paths" >"$removed"

join -t$'\t' "$old_norm" "$new_norm" | awk -F'\t' '$2 != $3 {print $1 "\t" $2 "\t" $3}' >"$changed"

added_count="$(wc -l <"$added" | tr -d ' ')"
removed_count="$(wc -l <"$removed" | tr -d ' ')"
changed_count="$(wc -l <"$changed" | tr -d ' ')"

mkdir -p "$(dirname "$OUT_FILE")"

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_commit="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"

{
  echo "# Protocol Surface Changelog"
  echo
  echo "- Generated at (UTC): ${generated_at}"
  echo "- Git commit: ${git_commit}"
  echo "- New lock: ${NEW_LOCK}"
  echo "- Old lock source: ${source_label}"
  echo
  echo "## Summary"
  echo
  echo "- Added files: ${added_count}"
  echo "- Removed files: ${removed_count}"
  echo "- Changed hashes: ${changed_count}"
  echo

  echo "## Added"
  echo
  if [[ "$added_count" -eq 0 ]]; then
    echo "_none_"
  else
    while IFS= read -r path; do
      [[ -n "$path" ]] && echo "- ${path}"
    done <"$added"
  fi
  echo

  echo "## Removed"
  echo
  if [[ "$removed_count" -eq 0 ]]; then
    echo "_none_"
  else
    while IFS= read -r path; do
      [[ -n "$path" ]] && echo "- ${path}"
    done <"$removed"
  fi
  echo

  echo "## Hash Changes"
  echo
  if [[ "$changed_count" -eq 0 ]]; then
    echo "_none_"
  else
    echo "| File | Old Hash | New Hash |"
    echo "| --- | --- | --- |"
    while IFS=$'\t' read -r path old_hash new_hash; do
      [[ -n "$path" ]] && echo "| ${path} | \`${old_hash}\` | \`${new_hash}\` |"
    done <"$changed"
  fi
  echo
} >"$OUT_FILE"

echo "protocol surface changelog written to ${OUT_FILE}"
