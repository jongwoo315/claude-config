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
    # real claude: launch, wait for its TUI to be READY, then send + submit.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags" C-m
    # Readiness: wait for claude's actual status/input UI — not just any '>' char,
    # which matches before claude has rendered and causes the prompt to be sent
    # into a not-yet-ready input.
    local i=0
    while [ $i -lt 40 ]; do
      $ORCH_TMUX capture-pane -pt "$sess" \
        | grep -qiE 'for shortcuts|bypass permissions|Model:' && break
      sleep 0.5; i=$((i+1))
    done
    # Type the prompt, then submit. The claude TUI drops a C-m that arrives too
    # soon after the paste (prompt lands in the box but never submits, and a
    # single fixed delay is unreliable across spawn speeds). Resend Enter until
    # it actually submits — detected by the "esc to interrupt" marker claude
    # shows while working.
    $ORCH_TMUX send-keys -t "$sess" -- "$step0"
    local j=0
    while [ $j -lt 10 ]; do
      sleep 0.7
      $ORCH_TMUX send-keys -t "$sess" C-m
      sleep 0.7
      $ORCH_TMUX capture-pane -pt "$sess" | grep -qiE 'esc to interrupt' && break
      j=$((j+1))
    done
  else
    # mock command (tests): single-line send keeps things fast/deterministic.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags $(printf %q "$step0")" C-m
  fi
  printf '%s\n' "$sess"
}
