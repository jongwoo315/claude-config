#!/usr/bin/env bash
# spawn.sh — create a detached claude-orch-* session and send its first step.
: "${ORCH_TMUX:=tmux}"
: "${ORCH_CLAUDE_CMD:=claude}"
. "$(dirname "${BASH_SOURCE[0]}")/state.sh"

# spawn_session <task_id> <dir> <step0> <skip_perms:true|false> ; echoes session name
spawn_session() {
  local id="$1" dir="$2" step0="$3" skip="$4"
  local slug; slug=$(basename "$dir" | tr -c 'A-Za-z0-9' '-' | sed 's/-*$//')
  # include task numeric suffix for uniqueness across same-dir tasks
  local suffix="${id##*-}"
  local sess="${ORCH_SESSION_PREFIX}${slug}-${suffix}"

  $ORCH_TMUX new-session -d -s "$sess" -c "$dir"
  st_set "$sess" @orch_task "$id"
  st_set "$sess" @claude_state working
  st_set "$sess" @orch_await working

  local flags=""
  [ "$skip" = "true" ] && flags="--dangerously-skip-permissions"
  # send the launch command; real claude reads step0 as its first prompt arg.
  $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags $(printf %q "$step0")" C-m
  printf '%s\n' "$sess"
}
