#!/usr/bin/env bash
# daemon.sh — sourceable (defines orch_tick / orch_loop) and runnable.
: "${ORCH_HOME:=$HOME/.claude/orch}"
: "${ORCH_MAX:=3}"
: "${ORCH_TICK:=3}"
# Debounce: require idle to have persisted >= ORCH_IDLE_DEBOUNCE seconds.
: "${ORCH_IDLE_DEBOUNCE:=5}"
. "$ORCH_HOME/lib/task.sh"
. "$ORCH_HOME/lib/state.sh"
. "$ORCH_HOME/lib/spawn.sh"

orch_advance() {
  local id sess state await
  for id in $(task_list_by_status running); do
    sess=$(task_get "$id" session)
    # session vanished -> handled by failure watch (Task 7); skip here
    $ORCH_TMUX has-session -t "$sess" 2>/dev/null || continue
    state=$(st_get_state "$sess")
    await=$(st_get "$sess" @orch_await)

    if [ "$await" = "working" ]; then
      # waiting for the step to actually start; flip once we see working
      [ "$state" = "working" ] && st_set "$sess" @orch_await idle
      continue
    fi

    # await == idle: looking for a debounced idle to count as step-complete
    [ "$state" = "idle" ] || continue
    if [ "${ORCH_IDLE_DEBOUNCE:-5}" -gt 0 ]; then
      local now at; now=$(orch_now); at=$(st_get_state_at "$sess"); at=${at:-$now}
      [ $((now - at)) -ge "$ORCH_IDLE_DEBOUNCE" ] || continue
    fi

    # ---- step complete: advance ----
    local cur len; cur=$(task_get "$id" cursor); len=$(task_steps_len "$id")
    cur=$((cur+1))
    if [ "$cur" -ge "$len" ]; then
      task_set "$id" status done
    else
      task_set_num "$id" cursor "$cur"
      st_set "$sess" @orch_await working
      st_set "$sess" @claude_state working
      $ORCH_TMUX send-keys -t "$sess" "$(task_step "$id" "$cur")" C-m
    fi
  done
}

# Wall-clock now, injectable for tests (Date.now is fine in bash; tests set stamps).
orch_now() { date +%s; }

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
