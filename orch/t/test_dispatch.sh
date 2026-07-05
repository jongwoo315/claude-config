#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
export ORCH_CLAUDE_CMD="cat"
export ORCH_MAX=2
. "$ORCH_ROOT/lib/task.sh"; . "$ORCH_ROOT/lib/state.sh"
. "$ORCH_ROOT/daemon.sh"        # sourcing must NOT start the loop

task_create /tmp/a single "x" >/dev/null
task_create /tmp/b single "y" >/dev/null
task_create /tmp/c single "z" >/dev/null

orch_tick
assert_eq "$(task_list_by_status running | wc -l | tr -d ' ')" "2" "dispatch respects max=2"
assert_eq "$(task_list_by_status queued  | wc -l | tr -d ' ')" "1" "one left queued"

finish
