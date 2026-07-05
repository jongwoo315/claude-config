#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
export ORCH_CLAUDE_CMD="cat"; export ORCH_MAX=1; export ORCH_IDLE_DEBOUNCE=0
export ORCH_STUCK_SECS=999999      # disable stuck for the death case
. "$ORCH_ROOT/lib/task.sh"; . "$ORCH_ROOT/lib/state.sh"; . "$ORCH_ROOT/daemon.sh"

id=$(task_create /tmp/dead single "x"); orch_tick
sess=$(task_get "$id" session)
$ORCH_TMUX kill-session -t "$sess"     # simulate claude crash
orch_tick
assert_eq "$(task_get "$id" status)" "failed" "dead session -> failed"

finish
