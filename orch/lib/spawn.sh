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
  if [ "$ORCH_CLAUDE_CMD" = "claude" ]; then
    # real claude: launch first, wait for its TUI prompt, then send the step.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags" C-m
    local i=0
    while [ $i -lt 30 ]; do
      $ORCH_TMUX capture-pane -pt "$sess" | grep -qiE 'welcome|>|claude' && break
      sleep 0.5; i=$((i+1))
    done
    # send the prompt text, then Enter as a SEPARATE key event — the claude TUI
    # drops a C-m that arrives in the same send-keys as the text (prompt lands in
    # the box but never submits). A short beat lets the text render first.
    $ORCH_TMUX send-keys -t "$sess" -- "$step0"
    sleep 0.5
    $ORCH_TMUX send-keys -t "$sess" C-m
  else
    # mock command (tests): single-line send keeps things fast/deterministic.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags $(printf %q "$step0")" C-m
  fi
  printf '%s\n' "$sess"
}
