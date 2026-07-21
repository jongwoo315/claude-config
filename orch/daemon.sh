#!/usr/bin/env bash
# daemon.sh — sourceable (defines orch_tick / orch_loop) and runnable.
: "${ORCH_HOME:=$HOME/.claude/orch}"
: "${ORCH_MAX:=3}"
: "${ORCH_TICK:=3}"
# Debounce: require idle to have persisted >= ORCH_IDLE_DEBOUNCE seconds.
: "${ORCH_IDLE_DEBOUNCE:=5}"
: "${ORCH_STUCK_SECS:=1200}"   # 20 min
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
    if [ "$ORCH_IDLE_DEBOUNCE" -gt 0 ]; then
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
      # Re-arm the start-gate. @claude_state is NOT self-stamped anymore — the
      # plugin's hooks own it, so @orch_await=working now waits for the session's
      # REAL working (UserPromptSubmit), not our own stamp. submit_step guarantees
      # the step actually submits (resends Enter until it leaves the input box);
      # a bare send-keys lost Enter on a busy TUI and deadlocked the pipeline.
      st_set "$sess" @orch_await working
      submit_step "$sess" "$(task_step "$id" "$cur")"
    fi
  done
}

# Wall-clock now; overridable by tests (t/test_debounce.sh redefines it to a fixed
# FAKE_NOW so the debounce delta can be exercised deterministically).
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

orch_notify() {   # override-able; default tmux message + bell
  $ORCH_TMUX display-message "orch: $1" 2>/dev/null || true
  printf '\a' 2>/dev/null || true
}

orch_watch_failures() {
  local id sess state now seen
  now=$(orch_now)
  for id in $(task_list_by_status running); do
    sess=$(task_get "$id" session)
    if ! $ORCH_TMUX has-session -t "$sess" 2>/dev/null; then
      task_set "$id" status failed
      orch_notify "task $id session died"
      continue
    fi
    state=$(st_get_state "$sess")
    if [ "$state" = "working" ]; then
      # Measure "stuck" against orch's OWN clock (@orch_seen_at), stamped when we
      # first observe working — NOT the hook's @claude_state_at. @claude_state_at
      # is set by the plugin hook and persists across a daemon restart, so keying
      # the stuck timeout off it fails a mid-flight session on the first post-restart
      # tick (its start timestamp is already older than the timeout). @orch_seen_at
      # is cleared on daemon start (orch_reset_watch), giving a full fresh grace.
      seen=$(st_get "$sess" @orch_seen_at)
      if [ -z "$seen" ]; then
        st_set "$sess" @orch_seen_at "$now"
      elif [ $((now - seen)) -ge "$ORCH_STUCK_SECS" ]; then
        task_set "$id" status failed
        orch_notify "task $id stuck ${ORCH_STUCK_SECS}s"
      fi
    else
      # Left working (idle/waiting) -> reset the stuck clock; the next step's
      # working restarts it. Keeps the timeout per-step, not cumulative.
      st_unset "$sess" @orch_seen_at
    fi
  done
}

# Clear orch's stuck-clock for every running session. Called once at daemon start:
# @orch_seen_at is a tmux option that survives a restart, so without this a session
# that was mid-step would carry an old stamp and trip the stuck timeout immediately.
# Cleared here -> re-established fresh on the next observed working.
orch_reset_watch() {
  local id sess
  for id in $(task_list_by_status running); do
    sess=$(task_get "$id" session)
    $ORCH_TMUX has-session -t "$sess" 2>/dev/null && st_unset "$sess" @orch_seen_at
  done
}

orch_tick() { orch_watch_failures; orch_advance; orch_dispatch; }

orch_loop() {
  orch_reset_watch   # fresh stuck-grace for sessions that were mid-flight
  while true; do orch_tick; sleep "$ORCH_TICK"; done
}

# Only run the loop when executed directly, not when sourced.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then orch_loop; fi
