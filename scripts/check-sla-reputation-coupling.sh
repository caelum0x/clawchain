#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! rg -n 'WalkCompletedTaskSLAEvents\(' x/reputation/types/expected_keepers.go x/agent/keeper/reputation_adapter.go x/reputation/keeper/endblock.go >/dev/null; then
  echo "ERROR: task SLA coupling interface/path is missing between x/agent and x/reputation." >&2
  exit 1
fi

if ! rg -n 'TaskSLACursorKey|TaskSLACursor' x/reputation/types/keys.go x/reputation/keeper/keeper.go x/reputation/keeper/endblock.go >/dev/null; then
  echo "ERROR: task SLA cursor state is missing (risk of double-applying deltas)." >&2
  exit 1
fi

if ! rg -n 'task_sla_on_time_reward_bps|task_sla_late_penalty_bps|task_sla_lateness_step_blocks' proto/clawchain/reputation/v1/params.proto x/reputation/types/params.go x/reputation/types/params.pb.go >/dev/null; then
  echo "ERROR: reputation SLA policy params are missing in proto/types." >&2
  exit 1
fi

if ! rg -n 'task_sla_on_time_count|task_sla_late_count|task_sla_penalty_bps_total|task_sla_reward_bps_total' proto/clawchain/reputation/v1/query.proto x/reputation/types/query.pb.go sdk/src/types.ts >/dev/null; then
  echo "ERROR: SLA outcome query surfaces are missing in proto/types/sdk." >&2
  exit 1
fi

if ! rg -n 'reputation_task_sla_adjusted' x/reputation/keeper/endblock.go >/dev/null; then
  echo "ERROR: reputation task-SLA adjustment event is missing." >&2
  exit 1
fi

echo "sla/reputation coupling gate passed."
