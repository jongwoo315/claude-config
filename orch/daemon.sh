#!/usr/bin/env bash
# daemon.sh — sourceable (defines orch_tick / orch_loop) and runnable.
: "${ORCH_HOME:=$HOME/.claude/orch}"
: "${ORCH_MAX:=3}"
: "${ORCH_TICK:=3}"
. "$ORCH_HOME/lib/task.sh"
. "$ORCH_HOME/lib/state.sh"
. "$ORCH_HOME/lib/spawn.sh"

orch_advance() { : ; }   # filled in Task 6

orch_dispatch() {
  local running; running=$(task_list_by_status running | wc -l | tr -d ' ')
  local id
  for id in $(task_list_by_status queued); do
    [ "$running" -ge "$ORCH_MAX" ] && break
    local dir step0 skip sess
    dir=$(task_get "$id" target)
    step0=$(task_step "$id" 0)
    skip=$(task_get "$id" skip_perms)
    sess=$(spawn_session "$id" "$dir" "$step0" "$skip")
    task_set "$id" session "$sess"
    task_set "$id" status running
    running=$((running+1))
  done
}

orch_tick() { orch_advance; orch_dispatch; }

orch_loop() {
  while true; do orch_tick; sleep "$ORCH_TICK"; done
}

# Only run the loop when executed directly, not when sourced.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then orch_loop; fi
