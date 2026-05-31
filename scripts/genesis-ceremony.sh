#!/usr/bin/env bash
#
# genesis-ceremony.sh — Coordinator tooling for the ClawChain mainnet genesis
# ceremony. Builds a base genesis from a reviewed allocation table, then collects
# independently-submitted validator gentxs into a final, validated genesis.
#
# This replaces the single-node dev flow (which produces a single-validator stub)
# with a real multi-party ceremony. See mainnet/README.md for the full runbook.
#
# Subcommands:
#   build-base  --accounts <csv> --genesis-time <RFC3339> [--output <file>]
#               Initialize a validator-less base genesis with module params and
#               the reviewed token allocations. Publish this to all validators.
#
#   collect     --gentx-dir <dir> [--base <file>] [--output <file>]
#               Collect submitted validator gentxs, validate, enforce the minimum
#               validator count, and emit the final genesis + SHA256.
#
# Environment:
#   CLAWCHAIN_BIN   Path to clawchaind binary (default: clawchaind)
#   CHAIN_ID        Chain ID (default: clawchain-1)
#   MIN_VALIDATORS  Minimum genesis validators required by `collect` (default: 4)
#
# Accounts CSV format (one allocation per line, '#' comments allowed):
#   claw1realaddress...,400000000000000   # amount in uclaw
#
set -euo pipefail

CLAWCHAIN_BIN="${CLAWCHAIN_BIN:-clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-1}"
MIN_VALIDATORS="${MIN_VALIDATORS:-4}"
DENOM="uclaw"

log()  { echo "[ceremony] $*"; }
fail() { echo "[ceremony] ERROR: $*" >&2; exit 1; }

require_bin() {
    command -v "${CLAWCHAIN_BIN}" &>/dev/null || fail "${CLAWCHAIN_BIN} not found; build/install clawchaind first."
}

usage() {
    sed -n '2,40p' "$0"
    exit "${1:-1}"
}

# ---------------------------------------------------------------------------
# build-base: produce a validator-less base genesis with reviewed allocations
# ---------------------------------------------------------------------------
cmd_build_base() {
    local accounts="" genesis_time="" output="mainnet/genesis.base.json"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --accounts)     accounts="$2"; shift 2 ;;
            --genesis-time) genesis_time="$2"; shift 2 ;;
            --output)       output="$2"; shift 2 ;;
            *) fail "unknown build-base arg: $1" ;;
        esac
    done
    [[ -n "${accounts}" ]]     || fail "--accounts <csv> is required"
    [[ -f "${accounts}" ]]     || fail "accounts file not found: ${accounts}"
    [[ -n "${genesis_time}" ]] || fail "--genesis-time <RFC3339> is required"
    require_bin
    command -v jq &>/dev/null || fail "jq is required for build-base"

    local tmp home genesis
    tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' RETURN
    home="${tmp}/home"
    "${CLAWCHAIN_BIN}" init genesis-node --chain-id "${CHAIN_ID}" --home "${home}" --default-denom "${DENOM}" >/dev/null 2>&1
    genesis="${home}/config/genesis.json"

    # Core module params for a production chain.
    jq --arg t "${genesis_time}" '
        .genesis_time = $t
        | .app_state.staking.params.bond_denom = "uclaw"
        | .app_state.staking.params.max_validators = 100
        | .app_state.staking.params.unbonding_time = "1814400s"
        | .app_state.gov.params.min_deposit[0].denom = "uclaw"
    ' "${genesis}" > "${genesis}.tmp" && mv "${genesis}.tmp" "${genesis}"

    # Add reviewed allocations. Each address is validated by add-genesis-account
    # (invalid bech32 fails loudly here — no silent skipping).
    local n=0 addr amount
    while IFS=',' read -r addr amount || [[ -n "${addr}" ]]; do
        addr="$(echo "${addr}" | sed 's/#.*//' | xargs)"   # strip comments/space
        amount="$(echo "${amount}" | sed 's/#.*//' | xargs)"
        [[ -z "${addr}" ]] && continue
        [[ -n "${amount}" ]] || fail "missing amount for account ${addr}"
        "${CLAWCHAIN_BIN}" genesis add-genesis-account "${addr}" "${amount}${DENOM}" --home "${home}" \
            || fail "failed to add genesis account ${addr} (invalid address or duplicate?)"
        n=$((n+1))
    done < "${accounts}"
    [[ "${n}" -gt 0 ]] || fail "no accounts added from ${accounts}"

    "${CLAWCHAIN_BIN}" genesis validate --home "${home}" >/dev/null 2>&1 \
        || log "WARNING: base genesis validate reported issues (expected: no validators yet)"

    mkdir -p "$(dirname "${output}")"
    cp "${genesis}" "${output}"
    log "Base genesis written to ${output} (${n} accounts, chain_id ${CHAIN_ID}, genesis_time ${genesis_time})."
    log "SHA256: $(_sha256 "${output}")"
    log "Publish this file + hash to all validators. Validators submit gentxs, then run: $0 collect"
}

# ---------------------------------------------------------------------------
# collect: assemble the final genesis from submitted validator gentxs
# ---------------------------------------------------------------------------
cmd_collect() {
    local gentx_dir="mainnet/gentxs" base="mainnet/genesis.base.json" output="mainnet/genesis.json"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --gentx-dir) gentx_dir="$2"; shift 2 ;;
            --base)      base="$2"; shift 2 ;;
            --output)    output="$2"; shift 2 ;;
            *) fail "unknown collect arg: $1" ;;
        esac
    done
    require_bin
    [[ -f "${base}" ]] || fail "base genesis not found: ${base} (run build-base first)"
    [[ -d "${gentx_dir}" ]] || fail "gentx dir not found: ${gentx_dir}"

    local count
    count="$(find "${gentx_dir}" -name '*.json' -type f | wc -l | xargs)"
    [[ "${count}" -ge "${MIN_VALIDATORS}" ]] \
        || fail "only ${count} gentx(s) in ${gentx_dir}; need >= ${MIN_VALIDATORS} for a launchable validator set"

    local tmp home genesis
    tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' RETURN
    home="${tmp}/home"
    "${CLAWCHAIN_BIN}" init genesis-node --chain-id "${CHAIN_ID}" --home "${home}" --default-denom "${DENOM}" >/dev/null 2>&1
    genesis="${home}/config/genesis.json"
    cp "${base}" "${genesis}"

    mkdir -p "${home}/config/gentx"
    cp "${gentx_dir}"/*.json "${home}/config/gentx/"
    "${CLAWCHAIN_BIN}" genesis collect-gentxs --home "${home}" >/dev/null 2>&1 \
        || fail "collect-gentxs failed; check that every gentx was built against this base genesis"
    "${CLAWCHAIN_BIN}" genesis validate --home "${home}" >/dev/null 2>&1 \
        || fail "final genesis validation failed"

    mkdir -p "$(dirname "${output}")"
    cp "${genesis}" "${output}"
    log "Final genesis written to ${output} (${count} validators)."
    log "SHA256: $(_sha256 "${output}")"
    log "Record this hash + role sign-offs in docs/genesis-ceremony-ownership-log.md and publish to all validators."
}

_sha256() {
    if command -v sha256sum &>/dev/null; then sha256sum "$1" | awk '{print $1}';
    else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# --- Dispatch ---------------------------------------------------------------
[[ $# -ge 1 ]] || usage 1
sub="$1"; shift
case "${sub}" in
    build-base) cmd_build_base "$@" ;;
    collect)    cmd_collect "$@" ;;
    -h|--help|help) usage 0 ;;
    *) fail "unknown subcommand '${sub}' (expected build-base|collect)" ;;
esac
