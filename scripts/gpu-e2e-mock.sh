#!/usr/bin/env bash
# gpu-e2e-mock.sh — GPU E2E mock pipeline integration test.
#
# Boots mock inference sidecar + mock GPU provider, submits jobs via
# their HTTP APIs, and validates the full lifecycle without requiring
# a running chain, GPU hardware, or Docker infrastructure.
#
# Usage: ./scripts/gpu-e2e-mock.sh
#
# Environment variables:
#   SIDECAR_ADDR   Mock sidecar listen address (default: :18090)
#   PROVIDER_ADDR  Mock provider listen address (default: :19095)
#   FAILURE_RATE   Simulated failure rate (default: 0.0)
#   VERBOSE        Set to "true" for detailed output

set -euo pipefail

SIDECAR_ADDR="${SIDECAR_ADDR:-:18090}"
PROVIDER_ADDR="${PROVIDER_ADDR:-:19095}"
FAILURE_RATE="${FAILURE_RATE:-0.0}"
VERBOSE="${VERBOSE:-false}"

# Resolve script directory and project root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

SIDECAR_PID=""
PROVIDER_PID=""
PASS_COUNT=0
FAIL_COUNT=0

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

cleanup() {
  echo ""
  echo "=== Cleaning up ==="
  if [ -n "$SIDECAR_PID" ] && kill -0 "$SIDECAR_PID" 2>/dev/null; then
    kill "$SIDECAR_PID" 2>/dev/null || true
    wait "$SIDECAR_PID" 2>/dev/null || true
    echo "  Stopped mock sidecar (PID $SIDECAR_PID)"
  fi
  if [ -n "$PROVIDER_PID" ] && kill -0 "$PROVIDER_PID" 2>/dev/null; then
    kill "$PROVIDER_PID" 2>/dev/null || true
    wait "$PROVIDER_PID" 2>/dev/null || true
    echo "  Stopped mock provider (PID $PROVIDER_PID)"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "[gpu-e2e] $*"
}

verbose() {
  if [ "$VERBOSE" = "true" ]; then
    echo "  [debug] $*"
  fi
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "  [PASS] $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "  [FAIL] $1"
}

# Extract port from address string (e.g., ":18090" -> "18090").
port_from_addr() {
  echo "$1" | sed 's/.*://'
}

SIDECAR_PORT=$(port_from_addr "$SIDECAR_ADDR")
PROVIDER_PORT=$(port_from_addr "$PROVIDER_ADDR")
SIDECAR_URL="http://localhost:$SIDECAR_PORT"
PROVIDER_URL="http://localhost:$PROVIDER_PORT"

# ---------------------------------------------------------------------------
# Phase 0: Build binaries
# ---------------------------------------------------------------------------

echo "=== GPU E2E Mock Pipeline Test ==="
echo ""
log "Building binaries..."

cd "$PROJECT_ROOT"
go build -o /tmp/claw-inference-sidecar-mock ./cmd/claw-inference-sidecar/
go build -o /tmp/claw-gpu-provider-mock ./cmd/claw-gpu-provider/

pass "Binaries built"

# ---------------------------------------------------------------------------
# Phase 1: Start mock services
# ---------------------------------------------------------------------------

log "Starting mock inference sidecar on $SIDECAR_ADDR..."
MOCK_MODE=true \
  LISTEN_ADDR="$SIDECAR_ADDR" \
  MOCK_FAILURE_RATE="$FAILURE_RATE" \
  MOCK_LATENCY_MS=200 \
  /tmp/claw-inference-sidecar-mock &
SIDECAR_PID=$!

log "Starting mock GPU provider on $PROVIDER_ADDR..."
MOCK_MODE=true \
  LISTEN_ADDR="$PROVIDER_ADDR" \
  MOCK_FAILURE_RATE="$FAILURE_RATE" \
  JOB_LATENCY_SEC=1 \
  GPU_MODEL=A100 \
  VRAM_GB=80 \
  /tmp/claw-gpu-provider-mock &
PROVIDER_PID=$!

# Wait for services to start.
sleep 2

# ---------------------------------------------------------------------------
# Phase 2: Health checks
# ---------------------------------------------------------------------------

log "Phase 2: Health checks"

SIDECAR_HEALTH=$(curl -sf "$SIDECAR_URL/health" 2>&1 || echo "FAIL")
verbose "Sidecar health: $SIDECAR_HEALTH"

if echo "$SIDECAR_HEALTH" | grep -q '"ok"'; then
  pass "Mock sidecar health check"
else
  fail "Mock sidecar health check: $SIDECAR_HEALTH"
fi

PROVIDER_HEALTH=$(curl -sf "$PROVIDER_URL/health" 2>&1 || echo "FAIL")
verbose "Provider health: $PROVIDER_HEALTH"

if echo "$PROVIDER_HEALTH" | grep -q '"healthy"'; then
  pass "Mock provider health check"
else
  fail "Mock provider health check: $PROVIDER_HEALTH"
fi

# ---------------------------------------------------------------------------
# Phase 3: Provider info
# ---------------------------------------------------------------------------

log "Phase 3: Provider info"

PROVIDER_INFO=$(curl -sf "$PROVIDER_URL/v1/provider" 2>&1 || echo "FAIL")
verbose "Provider info: $PROVIDER_INFO"

if echo "$PROVIDER_INFO" | grep -q '"A100"'; then
  pass "Provider GPU model reported correctly"
else
  fail "Provider info check"
fi

# ---------------------------------------------------------------------------
# Phase 4: Submit inference job (non-streaming)
# ---------------------------------------------------------------------------

log "Phase 4: Inference job (non-streaming)"

INFERENCE_RESULT=$(curl -sf -X POST "$SIDECAR_URL/v1/inference" \
  -H "Content-Type: application/json" \
  -d '{"model_id": 1, "input": "What is ClawChain?", "max_tokens": 5, "stream": false}' \
  2>&1 || echo "FAIL")
verbose "Inference result: $INFERENCE_RESULT"

if echo "$INFERENCE_RESULT" | grep -q '"output"'; then
  pass "Non-streaming inference"
else
  fail "Non-streaming inference: $INFERENCE_RESULT"
fi

# ---------------------------------------------------------------------------
# Phase 5: Submit inference job (streaming)
# ---------------------------------------------------------------------------

log "Phase 5: Inference job (streaming)"

STREAM_RESULT=$(curl -sf -X POST "$SIDECAR_URL/v1/inference" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"model_id": 1, "input": "Explain privacy", "max_tokens": 3, "stream": true}' \
  2>&1 || echo "FAIL")
verbose "Stream result: $STREAM_RESULT"

if echo "$STREAM_RESULT" | grep -q '\[DONE\]'; then
  pass "Streaming inference"
else
  fail "Streaming inference: $STREAM_RESULT"
fi

# ---------------------------------------------------------------------------
# Phase 6: Submit GPU compute job
# ---------------------------------------------------------------------------

log "Phase 6: GPU compute job lifecycle"

SUBMIT_RESULT=$(curl -sf -X POST "$PROVIDER_URL/v1/submit" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "e2e-job-1", "name": "training-run", "execution_type": "docker", "estimated_duration_secs": 1}' \
  2>&1 || echo "FAIL")
verbose "Submit result: $SUBMIT_RESULT"

if echo "$SUBMIT_RESULT" | grep -q '"queued"'; then
  pass "GPU job submitted"
else
  fail "GPU job submission: $SUBMIT_RESULT"
fi

# Wait for completion.
sleep 2

JOB_STATUS=$(curl -sf "$PROVIDER_URL/v1/status/e2e-job-1" 2>&1 || echo "FAIL")
verbose "Job status: $JOB_STATUS"

if echo "$JOB_STATUS" | grep -q '"completed"'; then
  pass "GPU job completed"
else
  fail "GPU job completion: $JOB_STATUS"
fi

if echo "$JOB_STATUS" | grep -q '"result_hash"'; then
  pass "GPU job has result hash"
else
  fail "GPU job result hash missing"
fi

# ---------------------------------------------------------------------------
# Phase 7: Cancel test
# ---------------------------------------------------------------------------

log "Phase 7: Job cancellation"

SUBMIT_CANCEL=$(curl -sf -X POST "$PROVIDER_URL/v1/submit" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "cancel-test", "name": "cancel-me", "execution_type": "docker", "estimated_duration_secs": 30}' \
  2>&1 || echo "FAIL")
verbose "Submit cancel job: $SUBMIT_CANCEL"

sleep 1

CANCEL_RESULT=$(curl -sf -X POST "$PROVIDER_URL/v1/cancel/cancel-test" 2>&1 || echo "FAIL")
verbose "Cancel result: $CANCEL_RESULT"

if echo "$CANCEL_RESULT" | grep -q '"cancelled":true'; then
  pass "Job cancellation"
else
  fail "Job cancellation: $CANCEL_RESULT"
fi

# ---------------------------------------------------------------------------
# Phase 8: GPU metrics
# ---------------------------------------------------------------------------

log "Phase 8: GPU metrics"

METRICS=$(curl -sf "$PROVIDER_URL/v1/metrics" 2>&1 || echo "FAIL")
verbose "Metrics: $METRICS"

if echo "$METRICS" | grep -q '"is_healthy":true'; then
  pass "GPU metrics healthy"
else
  fail "GPU metrics: $METRICS"
fi

# ---------------------------------------------------------------------------
# Phase 9: List jobs
# ---------------------------------------------------------------------------

log "Phase 9: List jobs"

JOBS_LIST=$(curl -sf "$PROVIDER_URL/v1/jobs" 2>&1 || echo "FAIL")
verbose "Jobs list: $JOBS_LIST"

if echo "$JOBS_LIST" | grep -q '"total"'; then
  pass "Job listing"
else
  fail "Job listing: $JOBS_LIST"
fi

# ---------------------------------------------------------------------------
# Phase 10: Sidecar job submission
# ---------------------------------------------------------------------------

log "Phase 10: Sidecar async job"

SIDECAR_SUBMIT=$(curl -sf -X POST "$SIDECAR_URL/v1/submit" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "sidecar-job-1", "execution_type": "script", "estimated_duration_secs": 1}' \
  2>&1 || echo "FAIL")
verbose "Sidecar submit: $SIDECAR_SUBMIT"

if echo "$SIDECAR_SUBMIT" | grep -q '"queued"'; then
  pass "Sidecar job submitted"
else
  fail "Sidecar job submission: $SIDECAR_SUBMIT"
fi

sleep 2

SIDECAR_STATUS=$(curl -sf "$SIDECAR_URL/v1/job/sidecar-job-1" 2>&1 || echo "FAIL")
verbose "Sidecar job status: $SIDECAR_STATUS"

if echo "$SIDECAR_STATUS" | grep -q '"completed"'; then
  pass "Sidecar job completed"
else
  fail "Sidecar job completion: $SIDECAR_STATUS"
fi

# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

echo ""
echo "=== GPU E2E Mock Pipeline Results ==="
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "FAILED: $FAIL_COUNT test(s) failed"
  exit 1
fi

echo "All GPU Pipeline E2E Tests Passed"
exit 0
