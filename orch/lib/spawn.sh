#!/usr/bin/env bash
# spawn.sh — create a detached claude-orch-* session and send its first step.
: "${ORCH_TMUX:=tmux}"
: "${ORCH_CLAUDE_CMD:=claude}"
. "$(dirname "${BASH_SOURCE[0]}")/state.sh"

# submit_step <sess> <text> — type a prompt into a live claude session and make
# sure it actually SUBMITS. Don't trust a fixed delay or the transient "esc to
# interrupt" marker: resend Enter until the prompt LEAVES the input box (the input
# line no longer carries our first token). Only signal that holds across banners,
# slow spawns, and model tiers. Used for both step0 (spawn) and every advance step
# — an advance send without this loses Enter on a busy TUI and the step sits unsent
# at the prompt, deadlocking the pipeline (orch waits for an idle that never comes).
submit_step() {
  local sess="$1" text="$2"
  $ORCH_TMUX send-keys -t "$sess" -- "$text"
  local probe="${text%% *}"      # first token — cheap unsent fingerprint
  local j=0
  while [ $j -lt 30 ]; do
    $ORCH_TMUX send-keys -t "$sess" C-m
    sleep 0.8
    # unsent iff a prompt-marker line ('❯ ' or '> ') still holds our token
    $ORCH_TMUX capture-pane -pt "$sess" \
      | grep -F "$probe" | grep -qE '(❯|>) ' || break
    j=$((j+1))
  done
}

# spawn_session <task_id> <dir> <step0> <skip_perms:true|false> ; echoes session name
spawn_session() {
  local id="$1" dir="$2" step0="$3" skip="$4"
  local slug; slug=$(basename "$dir" | tr -c 'A-Za-z0-9' '-' | sed 's/-*$//')
  # include task numeric suffix for uniqueness across same-dir tasks
  local suffix="${id##*-}"
  local sess="${ORCH_SESSION_PREFIX}${slug}-${suffix}"

  $ORCH_TMUX new-session -d -s "$sess" -c "$dir"
  st_set "$sess" @orch_task "$id"
  # @claude_state is owned by the plugin's Claude Code hooks — do NOT self-stamp it.
  # A self-stamped working masks the session's real state (idle/waiting) in the
  # picker and makes the @orch_await start-gate read our own stamp instead of the
  # session actually starting. @orch_await alone gates start->complete.
  st_set "$sess" @orch_await working

  local flags=""
  [ "$skip" = "true" ] && flags="--dangerously-skip-permissions"
  # 세션 picker에 raw session-id 대신 읽을 수 있는 라벨을 표시. claude- prefix로
  # tmux-claude-session-manager에 claude 세션으로 노출. --name은 명시적 이름
  # (nameSource 없음)이라 picker title 최우선순위를 잡는다.
  flags="$flags --name claude-$id"
  if [ "$ORCH_CLAUDE_CMD" = "claude" ]; then
    # real claude: launch, wait for its TUI to be READY, then send + submit.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags" C-m
    # Readiness: wait for claude's actual status/input UI to render.
    local i=0
    while [ $i -lt 40 ]; do
      $ORCH_TMUX capture-pane -pt "$sess" \
        | grep -qiE 'for shortcuts|bypass permissions|Model:' && break
      sleep 0.5; i=$((i+1))
    done
    # The readiness markers also appear on startup NOTICE screens (usage/model
    # banners), which keep redrawing and swallow Enter keys sent too early. Let
    # the layout settle before typing.
    sleep 1.5
    submit_step "$sess" "$step0"
  else
    # mock command (tests): single-line send keeps things fast/deterministic.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags $(printf %q "$step0")" C-m
  fi
  printf '%s\n' "$sess"
}
