#!/bin/sh
# Remove stale lock files that prevent clawd from starting after a container crash.
# In Docker, PID 1 is always alive, so the PID-based stale check never triggers.
CLAWD_HOME="${CLAWD_HOME:-/root/.clawd}"
rm -f "${CLAWD_HOME}/runtime-up.lock" 2>/dev/null || true
exec node dist/main.js "$@"
