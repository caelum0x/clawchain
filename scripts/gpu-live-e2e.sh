#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
SCHED_DB_CONTAINER="${SCHED_DB_CONTAINER:-dante-postgres}"
SCHED_DB_USER="${SCHED_DB_USER:-dante_user}"
SCHED_DB_NAME="${SCHED_DB_NAME:-dante_scheduler}"
SCHED_CONTAINER="${SCHED_CONTAINER:-dante-scheduler-service}"
PROVIDER_CONTAINER="${PROVIDER_CONTAINER:-dante-provider-daemon}"
JWT_SECRET="${JWT_SECRET:-default-very-secure-jwt-secret-key-change-in-production}"
USER_ID="${USER_ID:-ops-user}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing dependency: $1" >&2
    exit 1
  }
}

require curl
require docker
require python3

make_token() {
  python3 - <<'PY' "$JWT_SECRET" "$USER_ID"
import json, base64, hmac, hashlib, time, sys
secret = sys.argv[1].encode()
user_id = sys.argv[2]
header = {"alg":"HS256","typ":"JWT"}
now = int(time.time())
payload = {
  "user_id": user_id,
  "username": "ops",
  "role": "admin",
  "sub": user_id,
  "iat": now,
  "nbf": now,
  "exp": now + 3600
}
def b64u(x):
  return base64.urlsafe_b64encode(json.dumps(x, separators=(",", ":")).encode()).rstrip(b"=")
msg = b64u(header) + b"." + b64u(payload)
sig = base64.urlsafe_b64encode(hmac.new(secret, msg, hashlib.sha256).digest()).rstrip(b"=")
print((msg + b"." + sig).decode())
PY
}

json_field() {
  python3 - <<'PY' "$1" "$2"
import json, sys
doc = json.loads(sys.argv[1])
field = sys.argv[2]
value = doc.get(field, "")
print(value if value is not None else "")
PY
}

TOKEN="$(make_token)"

echo "== gpu-live-e2e: complete path =="
TASK_ID="task-live-$(date +%s)"
SUBMIT_TASK_RESP="$(curl -sS -X POST "${API_URL}/api/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: ${USER_ID}" \
  -d "{\"id\":\"${TASK_ID}\",\"name\":\"live-task-complete\",\"type\":\"script_execution\",\"image\":\"alpine:3.20\",\"script\":\"echo e2e-complete\"}")"

sleep 6
TASK_STATUS_RESP="$(curl -sS "${API_URL}/api/v1/tasks/${TASK_ID}/status")"
TASK_STATUS="$(json_field "${TASK_STATUS_RESP}" status)"
if [[ "${TASK_STATUS}" != "completed" ]]; then
  echo "task completion check failed: status=${TASK_STATUS} response=${TASK_STATUS_RESP}" >&2
  exit 1
fi
echo "task completed: ${TASK_ID}"

echo "== gpu-live-e2e: cancel path =="
JOB_ID=""
SUBMIT_JOB_RESP="$(curl -sS -X POST "${API_URL}/api/v1/jobs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"script_execution\",\"name\":\"live-cancel\",\"gpu_type\":\"NVIDIA RTX 4090\",\"gpu_count\":1,\"priority\":9,\"params\":{\"script_content\":\"echo start; sleep 30; echo done\",\"script_interpreter\":\"/bin/sh\",\"script_filename\":\"run.sh\"}}")"
JOB_ID="$(json_field "${SUBMIT_JOB_RESP}" job_id)"
if [[ -z "${JOB_ID}" ]]; then
  echo "job submit did not return job_id: ${SUBMIT_JOB_RESP}" >&2
  exit 1
fi

sleep 2
CANCEL_JOB_RESP="$(curl -sS -X DELETE "${API_URL}/api/v1/jobs/${JOB_ID}" \
  -H "Authorization: Bearer ${TOKEN}")"
CANCEL_STATUS="$(json_field "${CANCEL_JOB_RESP}" status)"
if [[ "${CANCEL_STATUS}" != "cancellation_requested" ]]; then
  echo "cancel request check failed: status=${CANCEL_STATUS} response=${CANCEL_JOB_RESP}" >&2
  exit 1
fi

sleep 3
FINAL_JOB_RESP="$(curl -sS -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/v1/jobs/${JOB_ID}")"
FINAL_STATUS="$(json_field "${FINAL_JOB_RESP}" status)"
if [[ "${FINAL_STATUS}" != "cancelled" ]]; then
  echo "final cancel check failed: status=${FINAL_STATUS} response=${FINAL_JOB_RESP}" >&2
  exit 1
fi

DB_ROW="$(docker exec "${SCHED_DB_CONTAINER}" psql -U "${SCHED_DB_USER}" -d "${SCHED_DB_NAME}" -Atc "select job_id,state,provider_id from jobs where job_id='${JOB_ID}'")"
if ! grep -q "|cancelled|" <<<"${DB_ROW}"; then
  echo "scheduler db state mismatch: ${DB_ROW}" >&2
  exit 1
fi

SCHED_LOG_HIT="$(docker logs --since 3m "${SCHED_CONTAINER}" 2>&1 | grep -c "${JOB_ID}" || true)"
PROVIDER_LOG_HIT="$(docker logs --since 3m "${PROVIDER_CONTAINER}" 2>&1 | grep -c "${JOB_ID}" || true)"
if [[ "${SCHED_LOG_HIT}" -eq 0 || "${PROVIDER_LOG_HIT}" -eq 0 ]]; then
  echo "log evidence missing: scheduler_hits=${SCHED_LOG_HIT} provider_hits=${PROVIDER_LOG_HIT}" >&2
  exit 1
fi

echo "cancel verified: ${JOB_ID}"
echo "summary:"
echo "  task_id=${TASK_ID} status=completed"
echo "  job_id=${JOB_ID} status=cancelled db='${DB_ROW}'"
